// Banco em memória e enviador falso, só para os testes (não é importado pelas Edge Functions).

import { EXPEDIENTE_PADRAO } from '../../../nucleo/calendario.ts';
import { NUMEROS_EXEMPLO } from '../../../nucleo/config-laboratorio.ts';
import type { Atendimento } from '../../../nucleo/tipos.ts';
import type { Db, LinhaNumero } from './db.ts';
import type { Enviador } from './meta.ts';

export const PNID_REC = 'PNID-REC';
export const PNID_FIN = 'PNID-FIN';

export function bancoEmMemoria() {
  const numeros: LinhaNumero[] = NUMEROS_EXEMPLO.map((n, i) => ({
    id: n.id, ordem: i + 1, nome: n.nome, descricao: n.descricao, telefone: n.telefone, atalho: n.atalho,
    phone_number_id: n.id === 'rec' ? PNID_REC : n.id === 's4' ? PNID_FIN : null,
    sem_contato_direto: ['s5', 's7'].includes(n.id), encerra_ao_responder: n.id === 's7', expediente: EXPEDIENTE_PADRAO,
  }));
  numeros.push({ ...numeros[0], id: 'teste', ordem: 99, atalho: '#teste', phone_number_id: 'PNID-OUTRO' });
  const atendimentos: Atendimento[] = [];
  const mensagens: any[] = [];
  const alertas: any[] = [];
  const resgates: any[] = [];
  const protocolos = new Map<string, number>();
  let seq = 100;
  /** Simula outro evento reservando o protocolo antes (uma vez). */
  let roubarProximaReserva = false;
  const copia = <T>(x: T): T => structuredClone(x);

  const db: Db = {
    numeros: async () => copia(numeros),
    feriados: async () => [],
    abertosDoCliente: async (c) => copia(atendimentos.filter((a) => a.cliente === c && !['encerrado', 'nao_concluido'].includes(a.estado))),
    encaminhados: async () => copia(atendimentos.filter((a) => a.estado === 'encaminhado')),
    atendimento: async (id) => copia(atendimentos.find((a) => a.id === id) ?? null),
    inserirAtendimento: async (a) => { const id = ++seq; atendimentos.push({ ...copia(a), id }); return id; },
    atualizarAtendimento: async (a) => { const i = atendimentos.findIndex((x) => x.id === a.id); atendimentos[i] = copia(a); },
    ultimoProtocolo: async (dia) => protocolos.get(dia) ?? 0,
    reservarProtocolo: async (dia, de, para) => {
      if (roubarProximaReserva) { roubarProximaReserva = false; protocolos.set(dia, (protocolos.get(dia) ?? 0) + 1); return false; }
      if ((protocolos.get(dia) ?? 0) !== de) return false;
      protocolos.set(dia, para); return true;
    },
    gravarMensagem: async (m) => {
      if (m.wa_message_id && mensagens.some((x) => x.wa_message_id === m.wa_message_id)) return false;
      mensagens.push(copia(m)); return true;
    },
    mensagemExiste: async (id) => mensagens.some((x) => x.wa_message_id === id),
    inserirAlerta: async (a) => { alertas.push({ ...a, estado: 'ativo' }); },
    mudarAlertas: async (id, estado) => { for (const a of alertas) if (a.atendimento_id === id && a.estado !== 'resolvido') a.estado = estado; },
    inserirResgate: async (r) => { resgates.push(copia(r)); },
  };
  return { db, numeros, atendimentos, mensagens, alertas, resgates, protocolos, roubar: () => { roubarProximaReserva = true; } };
}

export function enviadorFalso() {
  const enviados: { tipo: string; pnid: string; para: string; corpo: string; extra?: unknown }[] = [];
  let n = 0;
  const id = () => `wamid.SIS${++n}`;
  const enviador: Enviador = {
    texto: async (pnid, para, corpo) => { enviados.push({ tipo: 'texto', pnid, para, corpo }); return id(); },
    menu: async (pnid, para, corpo, opcoes) => { enviados.push({ tipo: 'menu', pnid, para, corpo, extra: opcoes }); return id(); },
    link: async (pnid, para, corpo, url) => { enviados.push({ tipo: 'link', pnid, para, corpo, extra: url }); return id(); },
    templateResgate: async (pnid, para, protocolo, setor) => { enviados.push({ tipo: 'template', pnid, para, corpo: `${protocolo}|${setor}` }); return id(); },
  };
  return { enviador, enviados };
}
