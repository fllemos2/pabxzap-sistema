// Executa um evento do núcleo contra o banco e a Meta (ticket wf-pabxzap-22).
// 1. carrega os atendimentos que o evento pode tocar e o último protocolo do dia;
// 2. roda o núcleo (puro);
// 3. reserva o avanço do protocolo de forma atômica; se outro evento passou na frente, refaz tudo;
// 4. grava os atendimentos novos e alterados;
// 5. executa os efeitos: envia mensagens, registra alertas e resgates.

import { processar } from '../../../nucleo/motor.ts';
import { configLaboratorio } from '../../../nucleo/config-laboratorio.ts';
import { diaLocal } from '../../../nucleo/calendario.ts';
import type { Atendimento, Config, Efeito, Evento, Numero, NumeroId } from '../../../nucleo/tipos.ts';
import type { Db } from './db.ts';
import type { Enviador } from './meta.ts';

export interface Contexto {
  cfg: Config;
  /** phone_number_id da Cloud API de cada número (só os já conectados). */
  pnidDe: Map<NumeroId, string>;
  numeroDePnid: Map<string, NumeroId>;
}

const log = (...a: unknown[]) => console.log('[executar]', ...a);

/** Monta a configuração a partir do banco: os números de ordem 1 a 8 (o 1 é a Recepção) e os feriados. */
export async function carregarContexto(db: Db, linkPolitica: string | null = null): Promise<Contexto> {
  const linhas = (await db.numeros()).filter((l) => l.ordem >= 1 && l.ordem <= 8).sort((a, b) => a.ordem - b.ordem);
  const numeros: Numero[] = linhas.map((l) => ({
    id: l.id, nome: l.nome, descricao: l.descricao ?? '', telefone: l.telefone, atalho: l.atalho, expediente: l.expediente,
  }));
  const base = configLaboratorio(numeros, await db.feriados());
  const cfg: Config = {
    ...base,
    linkPolitica,
    semContatoDireto: linhas.filter((l) => l.sem_contato_direto).map((l) => l.id),
    encerraAoResponder: linhas.filter((l) => l.encerra_ao_responder).map((l) => l.id),
  };
  const pnidDe = new Map<NumeroId, string>();
  const numeroDePnid = new Map<string, NumeroId>();
  for (const l of linhas) if (l.phone_number_id) { pnidDe.set(l.id, l.phone_number_id); numeroDePnid.set(l.phone_number_id, l.id); }
  return { cfg, pnidDe, numeroDePnid };
}

export interface Execucao { efeitos: Efeito[]; atendimentoId: number | null; falhas: string[] }

/** Ids temporários do núcleo para atendimentos novos: negativos, para não colidir com os do banco. */
const BASE_ID_NOVO = -1_000_000;

export async function executarEvento(
  db: Db, enviador: Enviador, ctx: Contexto, ev: Evento, carregar: () => Promise<Atendimento[]>,
): Promise<Execucao> {
  const { cfg } = ctx;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lista = await carregar();
    const dia = diaLocal(ev.t, cfg.calendario).replaceAll('-', '');
    const ultimo = await db.ultimoProtocolo(dia);
    const r = processar(cfg, { atendimentos: lista, seqId: BASE_ID_NOVO, seqProtocolo: ultimo, diaProtocolo: dia }, ev);

    if (r.estado.seqProtocolo !== ultimo && !(await db.reservarProtocolo(dia, ultimo, r.estado.seqProtocolo))) {
      log('protocolo: outro evento reservou antes; refazendo');
      continue;
    }

    const antes = new Map(lista.map((a) => [a.id, JSON.stringify(a)]));
    const novos = new Map<number, number>();
    for (const a of r.estado.atendimentos) {
      if (a.id < 0) novos.set(a.id, await db.inserirAtendimento(a));
      else if (antes.get(a.id) !== JSON.stringify(a)) await db.atualizarAtendimento(a);
    }
    const real = (id: number) => novos.get(id) ?? id;
    const atendimentoId = r.atendimento ? real(r.atendimento.id) : null;
    const falhas = await aplicarEfeitos(db, enviador, ctx, r.efeitos, real, atendimentoId);
    return { efeitos: r.efeitos, atendimentoId, falhas };
  }
  throw new Error('protocolo: conflito repetido em 3 tentativas');
}

async function aplicarEfeitos(
  db: Db, enviador: Enviador, ctx: Contexto, efeitos: Efeito[], real: (id: number) => number, atendimentoId: number | null,
): Promise<string[]> {
  const falhas: string[] = [];
  const nome = (id: NumeroId) => ctx.cfg.numeros.find((n) => n.id === id)?.nome ?? id;

  for (const ef of efeitos) {
    try {
      switch (ef.tipo) {
        case 'enviar_texto':
        case 'enviar_menu':
        case 'enviar_link': {
          const pnid = ctx.pnidDe.get(ef.de);
          if (!pnid) { falhas.push(`${ef.tipo}: o número ${ef.de} ainda não está conectado`); break; }
          let wamid: string | null;
          let texto = ef.texto;
          if (ef.tipo === 'enviar_texto') wamid = await enviador.texto(pnid, ef.para, ef.texto);
          else if (ef.tipo === 'enviar_menu') wamid = await enviador.menu(pnid, ef.para, ef.texto, ef.opcoes);
          else if (ef.porTemplate) {
            texto = `[template de resgate] protocolo ${ef.protocolo}, ${nome(ef.destino)}`;
            wamid = await enviador.templateResgate(pnid, ef.para, ef.protocolo, nome(ef.destino));
          } else wamid = await enviador.link(pnid, ef.para, ef.texto, ef.url);
          await db.gravarMensagem({ numero_id: ef.de, cliente: ef.para, origem: 'sistema', texto, wa_message_id: wamid, atendimento_id: atendimentoId });
          break;
        }
        case 'alerta':
          await db.inserirAlerta({ atendimento_id: real(ef.atendimentoId), para: ef.para, destino: ef.destino });
          break;
        case 'alerta_resolvido':
          await db.mudarAlertas(real(ef.atendimentoId), 'resolvido');
          break;
        case 'resgate':
          await db.inserirResgate({ atendimento_id: real(ef.atendimentoId), canal: ef.canal, por_template: ef.porTemplate });
          await db.mudarAlertas(real(ef.atendimentoId), 'resgate_enviado');
          break;
        case 'nao_concluido':
          log(`atendimento ${real(ef.atendimentoId)} encerrado como não concluído`);
          break;
      }
    } catch (e) {
      falhas.push(`${ef.tipo}: ${(e as Error).message}`);
    }
  }
  for (const f of falhas) log('falha:', f);
  return falhas;
}
