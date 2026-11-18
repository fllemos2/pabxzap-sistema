// Núcleo de regras do PabxZap, portado de prototipo/motor.js (vault 53-PabxZap).
// Regras e onde estão decididas (wiki do vault):
//   fluxo, menu e encaminhamento ...... conceitos/central-de-distribuicao, decisoes/2026-10-19-menu-completo-sem-filtro
//   contato direto ..................... decisoes/2026-09-11-contato-direto
//   RH e Dono .......................... decisoes/2026-10-19-regras-rh-e-dono
//   responsável ........................ conceitos/responsavel-pelo-atendimento
//   respostas rápidas .................. conceitos/respostas-rapidas
//   chegada e alerta de 15 min ......... decisoes/2026-09-11-regras-de-resolucao-e-alerta, decisoes/2026-11-02-alerta-so-no-portal
//   resgates e "não concluído" ......... decisoes/2026-11-02-pendencia-e-resgate, decisoes/2026-11-17-regras-do-nucleo
//   horário, feriados, fora do horário . decisoes/2026-11-14-horario-padrao-dos-setores, decisoes/2026-11-17-regras-do-nucleo
//   protocolo AAAAMMDD-NNNN ............ decisoes/2026-11-17-regras-do-nucleo
// Encerrar não apaga o atendimento: ele fica 'encerrado' ou 'nao_concluido', e a retenção (1 ano) é aplicada pelo banco.

import { dentroDoExpediente, diaLocal, duracaoDoDia, msUteis, textoDoExpediente } from './calendario.ts';
import type {
  Atendimento, CanalResgate, Config, Efeito, Estado, Evento, Numero, NumeroId, RespostaRapida, Resultado,
} from './tipos.ts';

const FECHADOS = ['encerrado', 'nao_concluido'];
const COM_ATENDENTE = ['recepcao', 'em_atendimento', 'pendente'];

export function estadoInicial(): Estado {
  return { atendimentos: [], seqId: 0, seqProtocolo: 0, diaProtocolo: '' };
}

export function recepcao(cfg: Config): Numero { return cfg.numeros[0]; }

export function numero(cfg: Config, id: NumeroId): Numero {
  const n = cfg.numeros.find(x => x.id === id);
  if (!n) throw new Error('número desconhecido: ' + id);
  return n;
}

/** O primeiro número contactado é o responsável; a responsabilidade só passa quando o cliente chega. */
export function responsavel(a: Atendimento): NumeroId {
  return a.estado === 'encaminhado' && a.origem ? a.origem : a.onde;
}

export function abertos(e: Estado, cliente: string): Atendimento[] {
  return e.atendimentos.filter(a => a.cliente === cliente && !FECHADOS.includes(a.estado));
}

/** Pendência com mais de 1 dia útil: o portal destaca (decisão de 02/11). */
export function pendenciaAtrasada(cfg: Config, a: Atendimento, t: number): boolean {
  if (a.estado !== 'pendente') return false;
  const exp = numero(cfg, a.onde).expediente;
  return msUteis(exp, cfg.calendario, a.desde, t) >= duracaoDoDia(exp);
}

/** Respostas rápidas cadastradas no WhatsApp Business de cada número. O Dono não usa. */
export function respostasRapidas(cfg: Config, id: NumeroId): RespostaRapida[] {
  if (cfg.encerraAoResponder.includes(id)) return [];
  const t = cfg.textos;
  return [
    { atalho: '/encerrar', acao: 'encerrar' as const, texto: t.respostaEncerrar },
    { atalho: '/pendente', acao: 'pendente' as const, texto: t.respostaPendente },
    ...cfg.numeros.filter(n => n.id !== id).map(n => ({
      atalho: n.atalho, acao: 'encaminhar' as const, destino: n.id, texto: t.respostaEncaminhar(n),
    })),
  ];
}

export function linkWhatsApp(destino: Numero, texto: string): string {
  return 'https://wa.me/' + destino.telefone + '?text=' + encodeURIComponent(texto);
}

function ultimo<T>(l: T[]): T | null { return l.length ? l[l.length - 1] : null; }
function minutos(ms: number): number { return Math.max(0, Math.round(ms / 60000)); }

/** Processa um evento. Não altera o estado recebido. */
export function processar(cfg: Config, estadoAtual: Estado, ev: Evento): Resultado {
  const e: Estado = structuredClone(estadoAtual);
  const efeitos: Efeito[] = [];
  const t = ev.t;
  const cal = cfg.calendario;

  const nome = (id: NumeroId) => numero(cfg, id).nome;
  const rec = recepcao(cfg).id;
  const aberto = (id: NumeroId) => dentroDoExpediente(numero(cfg, id).expediente, cal, t);

  /** AAAAMMDD-NNNN, com a sequência recomeçando a cada dia (horário de Brasília). */
  function protocolo(): string {
    const dia = diaLocal(t, cal).replaceAll('-', '');
    if (e.diaProtocolo !== dia) { e.diaProtocolo = dia; e.seqProtocolo = 0; }
    e.seqProtocolo += 1;
    return dia + '-' + String(e.seqProtocolo).padStart(4, '0');
  }

  function foraDoHorario(de: NumeroId, para: string, setor: NumeroId, prot: string) {
    const n = numero(cfg, setor);
    efeitos.push({ tipo: 'enviar_texto', de, para, texto: cfg.textos.foraDoHorario(n, prot, textoDoExpediente(n.expediente)) });
  }

  function novo(cliente: string, assunto: string, entrada: NumeroId): Atendimento {
    const a: Atendimento = {
      id: ++e.seqId, protocolo: null, cliente, assunto, entrada, estado: 'menu', onde: entrada, origem: null,
      criadoEm: t, desde: t, encaminhadoEm: null, alertado: false, resgates: 0, ultimoResgateEm: null,
      ultimaMsgClienteEm: t, respondidoEm: null, encerradoEm: null, percurso: [],
    };
    e.atendimentos.push(a);
    return a;
  }

  function link(a: Atendimento, de: NumeroId, texto: string, porTemplate?: boolean) {
    const destino = numero(cfg, a.onde);
    const pronto = cfg.textos.apresentacao(numero(cfg, de), destino, a.protocolo!, a.assunto);
    efeitos.push({
      tipo: 'enviar_link', de, para: a.cliente, destino: a.onde, protocolo: a.protocolo!, texto, url: linkWhatsApp(destino, pronto),
      ...(porTemplate === undefined ? {} : { porTemplate }),
    });
  }

  function encaminhar(a: Atendimento, de: NumeroId, para: NumeroId) {
    a.origem = de; a.onde = para; a.estado = 'encaminhado'; a.encaminhadoEm = t; a.desde = t;
    a.alertado = false; a.resgates = 0; a.ultimoResgateEm = null;
    a.percurso.push({ t, texto: nome(de) + ' → ' + nome(para) });
    link(a, de, cfg.textos.link(numero(cfg, para), a.protocolo!));
  }

  function encerrar(a: Atendimento, por: NumeroId) {
    a.estado = 'encerrado'; a.encerradoEm = t; a.desde = t;
    a.percurso.push({ t, texto: 'Encerrado por ' + nome(por) });
  }

  /** Resgate: o responsável reenvia o link a quem não chegou. Cada resgate reinicia a contagem do alerta. */
  function resgatar(a: Atendimento, canal: CanalResgate): boolean {
    if (a.estado !== 'encaminhado' || !a.origem || a.resgates >= cfg.maxResgates) return false;
    const porTemplate = canal === 'portal' && (a.ultimaMsgClienteEm === null || t - a.ultimaMsgClienteEm >= cfg.janelaMs);
    a.resgates += 1; a.ultimoResgateEm = t; a.desde = t; a.alertado = false;
    a.percurso.push({ t, texto: `Resgate ${a.resgates} (${canal === 'app' ? 'pelo app' : 'pelo portal'}): ${nome(a.origem)} reenviou o link` });
    efeitos.push({ tipo: 'resgate', atendimentoId: a.id, canal, numero: a.resgates, porTemplate });
    if (canal === 'portal') link(a, a.origem, cfg.textos.resgate(numero(cfg, a.onde), a.protocolo!), porTemplate);
    return true;
  }

  if (ev.tipo === 'cliente_mensagem') {
    const texto = ev.texto.trim();
    if (!texto) return { estado: e, efeitos, atendimento: null };
    const lista = abertos(e, ev.cliente);

    // 1. Chegada: o cliente estava a caminho deste número.
    const chegando = ultimo(lista.filter(a => a.onde === ev.numero && a.estado === 'encaminhado'));
    if (chegando) {
      const espera = t - (chegando.encaminhadoEm ?? t);
      chegando.estado = chegando.onde === rec ? 'recepcao' : 'em_atendimento';
      chegando.desde = t; chegando.ultimaMsgClienteEm = t;
      chegando.percurso.push({ t, texto: 'Chegou em ' + nome(chegando.onde) + ' (' + minutos(espera) + ' min)' });
      if (chegando.alertado) { chegando.alertado = false; efeitos.push({ tipo: 'alerta_resolvido', atendimentoId: chegando.id }); }
      return { estado: e, efeitos, atendimento: chegando };
    }

    // 2. Conversa em andamento com o responsável.
    const atual = ultimo(lista.filter(a => responsavel(a) === ev.numero));
    if (atual) {
      atual.ultimaMsgClienteEm = t;
      if (atual.estado === 'menu') {
        const n = /^\d+$/.test(texto) ? parseInt(texto, 10) : NaN;
        if (n >= 1 && n <= cfg.numeros.length) {
          atual.protocolo = protocolo();
          if (n === 1) {
            atual.estado = 'recepcao'; atual.desde = t;
            atual.percurso.push({ t, texto: 'Ficou com a Recepção' });
            if (aberto(rec)) efeitos.push({ tipo: 'enviar_texto', de: rec, para: ev.cliente, texto: cfg.textos.ficouNaRecepcao(atual.protocolo) });
            else foraDoHorario(rec, ev.cliente, rec, atual.protocolo);
          } else {
            const destino = cfg.numeros[n - 1];
            encaminhar(atual, rec, destino.id);
            // Fora do horário: o link vai do mesmo jeito, seguido do aviso com o horário do setor.
            if (!aberto(destino.id)) foraDoHorario(rec, ev.cliente, destino.id, atual.protocolo);
          }
        } else {
          efeitos.push({ tipo: 'enviar_texto', de: rec, para: ev.cliente, texto: cfg.textos.menuInvalido(cfg.numeros.length) });
        }
      }
      return { estado: e, efeitos, atendimento: atual };
    }

    // 3. Novo atendimento.
    if (cfg.semContatoDireto.includes(ev.numero)) return { estado: e, efeitos, atendimento: null };   // RH e Dono
    if (ev.numero === rec) {
      const a = novo(ev.cliente, texto, rec);
      a.percurso.push({ t, texto: 'Entrou pela Recepção' });
      efeitos.push({
        tipo: 'enviar_menu', de: rec, para: ev.cliente, texto: cfg.textos.menu(cfg.numeros, cfg.linkPolitica),
        opcoes: cfg.numeros.map((x, i) => ({ n: i + 1, numero: x.id, nome: x.nome, descricao: x.descricao })),
      });
      return { estado: e, efeitos, atendimento: a };
    }
    const a = novo(ev.cliente, texto, ev.numero);
    a.protocolo = protocolo();
    a.estado = 'em_atendimento';
    a.percurso.push({ t, texto: 'Contato direto em ' + nome(ev.numero) });
    // Fora do horário, o aviso (que também traz o protocolo) substitui a confirmação.
    if (aberto(ev.numero)) efeitos.push({ tipo: 'enviar_texto', de: ev.numero, para: ev.cliente, texto: cfg.textos.mensagemCurta(numero(cfg, ev.numero), a.protocolo) });
    else foraDoHorario(ev.numero, ev.cliente, ev.numero, a.protocolo);
    return { estado: e, efeitos, atendimento: a };
  }

  if (ev.tipo === 'atendente_mensagem') {
    const texto = ev.texto.trim();
    if (!texto) return { estado: e, efeitos, atendimento: null };
    const lista = abertos(e, ev.cliente);

    // Resgate pelo app: o responsável reenvia ao cliente o link wa.me do destino.
    // (A camada de fora não deve passar aqui os ecos das mensagens que o próprio sistema enviou.)
    const aCaminho = ultimo(lista.filter(x => x.estado === 'encaminhado' && x.origem === ev.numero &&
      texto.includes('wa.me/' + numero(cfg, x.onde).telefone)));
    if (aCaminho) {
      resgatar(aCaminho, 'app');
      return { estado: e, efeitos, atendimento: aCaminho };
    }

    const a = ultimo(lista.filter(x => x.onde === ev.numero && COM_ATENDENTE.includes(x.estado)));
    if (!a) return { estado: e, efeitos, atendimento: null };
    if (a.respondidoEm === null && a.estado !== 'pendente') {
      a.respondidoEm = t;
      a.percurso.push({ t, texto: nome(ev.numero) + ' respondeu' });
    }
    if (cfg.encerraAoResponder.includes(ev.numero)) { encerrar(a, ev.numero); return { estado: e, efeitos, atendimento: a }; }
    const rr = respostasRapidas(cfg, ev.numero).find(r => r.texto === texto);
    if (!rr) return { estado: e, efeitos, atendimento: a };
    if (rr.acao === 'encerrar') encerrar(a, ev.numero);
    else if (rr.acao === 'pendente') {
      a.estado = 'pendente'; a.desde = t;
      a.percurso.push({ t, texto: nome(ev.numero) + ' deixou como pendência' });
    } else {
      if (!a.protocolo) a.protocolo = protocolo();
      encaminhar(a, ev.numero, rr.destino!);
    }
    return { estado: e, efeitos, atendimento: a };
  }

  if (ev.tipo === 'relogio') {
    for (const a of e.atendimentos) {
      if (a.estado !== 'encaminhado' || a.encaminhadoEm === null) continue;
      // Depois do último resgate permitido, 24 h sem chegada encerram como "não concluído".
      if (a.resgates >= cfg.maxResgates && a.ultimoResgateEm !== null && t - a.ultimoResgateEm >= cfg.naoConcluidoMs) {
        a.estado = 'nao_concluido'; a.encerradoEm = t; a.desde = t;
        a.percurso.push({ t, texto: `Não concluído: não chegou em ${nome(a.onde)} depois de ${a.resgates} resgates` });
        if (a.alertado) { a.alertado = false; efeitos.push({ tipo: 'alerta_resolvido', atendimentoId: a.id }); }
        efeitos.push({ tipo: 'nao_concluido', atendimentoId: a.id });
        continue;
      }
      // Alerta: 15 minutos úteis desde o encaminhamento ou desde o último resgate.
      if (a.alertado) continue;
      const base = a.ultimoResgateEm ?? a.encaminhadoEm;
      if (msUteis(numero(cfg, a.onde).expediente, cal, base, t) >= cfg.alertaMs) {
        a.alertado = true; a.desde = t;
        a.percurso.push({ t, texto: 'Não chegou em ' + nome(a.onde) + ' — alerta no portal' });
        efeitos.push({ tipo: 'alerta', para: a.origem!, atendimentoId: a.id, protocolo: a.protocolo!, destino: a.onde, cliente: a.cliente, assunto: a.assunto });
      }
    }
    return { estado: e, efeitos, atendimento: null };
  }

  // resgatar: botão do portal.
  const a = e.atendimentos.find(x => x.id === ev.atendimentoId);
  if (!a || !resgatar(a, 'portal')) return { estado: e, efeitos, atendimento: null };
  return { estado: e, efeitos, atendimento: a };
}
