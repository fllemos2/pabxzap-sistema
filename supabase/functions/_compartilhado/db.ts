// Acesso ao banco usado pelas Edge Functions. A interface Db permite testar o fluxo com um banco em memória.
// A implementação real fala com o PostgREST do Supabase usando a chave secret (ignora RLS).

import type { Atendimento, Expediente } from '../../../nucleo/tipos.ts';

export interface LinhaNumero {
  id: string; ordem: number; nome: string; descricao: string | null; telefone: string; atalho: string;
  phone_number_id: string | null; sem_contato_direto: boolean; encerra_ao_responder: boolean; expediente: Expediente;
}

export interface Db {
  numeros(): Promise<LinhaNumero[]>;
  feriados(): Promise<string[]>;
  abertosDoCliente(cliente: string): Promise<Atendimento[]>;
  encaminhados(): Promise<Atendimento[]>;
  atendimento(id: number): Promise<Atendimento | null>;
  /** Insere e devolve o id gerado pelo banco. */
  inserirAtendimento(a: Atendimento): Promise<number>;
  atualizarAtendimento(a: Atendimento): Promise<void>;
  ultimoProtocolo(dia: string): Promise<number>;
  reservarProtocolo(dia: string, de: number, para: number): Promise<boolean>;
  /** Grava a mensagem; false se o wa_message_id já existia (evento repetido). */
  gravarMensagem(m: { numero_id: string; cliente: string; origem: 'cliente' | 'sistema' | 'atendente'; texto: string | null; wa_message_id: string | null; atendimento_id?: number | null }): Promise<boolean>;
  mensagemExiste(waMessageId: string): Promise<boolean>;
  inserirAlerta(a: { atendimento_id: number; para: string; destino: string }): Promise<void>;
  /** Muda o estado dos alertas ainda não resolvidos do atendimento. */
  mudarAlertas(atendimentoId: number, estado: 'resgate_enviado' | 'resolvido'): Promise<void>;
  inserirResgate(r: { atendimento_id: number; canal: 'app' | 'portal'; por_template: boolean }): Promise<void>;
}

// ---- conversão entre a linha do banco e o Atendimento do núcleo (datas em ms ↔ ISO) ----
const ms = (v: string | null) => (v ? Date.parse(v) : null);
const iso = (v: number | null) => (v === null ? null : new Date(v).toISOString());

export function deLinha(l: any): Atendimento {
  return {
    id: Number(l.id), protocolo: l.protocolo, cliente: l.cliente, assunto: l.assunto, entrada: l.entrada,
    estado: l.estado, onde: l.onde, origem: l.origem, criadoEm: ms(l.criado_em)!, desde: ms(l.desde)!,
    encaminhadoEm: ms(l.encaminhado_em), alertado: l.alertado, resgates: l.resgates, ultimoResgateEm: ms(l.ultimo_resgate_em),
    ultimaMsgClienteEm: ms(l.ultima_msg_cliente_em), respondidoEm: ms(l.respondido_em), encerradoEm: ms(l.encerrado_em),
    percurso: l.percurso ?? [],
  };
}

export function paraLinha(a: Atendimento) {
  return {
    protocolo: a.protocolo, cliente: a.cliente, assunto: a.assunto, entrada: a.entrada, estado: a.estado, onde: a.onde,
    origem: a.origem, criado_em: iso(a.criadoEm), desde: iso(a.desde), encaminhado_em: iso(a.encaminhadoEm),
    alertado: a.alertado, resgates: a.resgates, ultimo_resgate_em: iso(a.ultimoResgateEm),
    ultima_msg_cliente_em: iso(a.ultimaMsgClienteEm), respondido_em: iso(a.respondidoEm), encerrado_em: iso(a.encerradoEm),
    percurso: a.percurso,
  };
}

// ---- implementação real (PostgREST) ----
export function dbSupabase(supabaseUrl: string, chave: string, f: typeof fetch = fetch): Db {
  const rest = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const cab = { apikey: chave, 'Content-Type': 'application/json' };

  async function req(caminho: string, init: RequestInit = {}, prefer?: string) {
    const r = await f(`${rest}${caminho}`, { ...init, headers: { ...cab, ...(prefer ? { Prefer: prefer } : {}) } });
    if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${caminho.split('?')[0]}: HTTP ${r.status} ${await r.text()}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const FECHADOS = '(encerrado,nao_concluido)';

  return {
    numeros: () => req('/numeros?select=*&order=ordem'),
    feriados: async () => (await req('/feriados?select=dia')).map((l: any) => String(l.dia)),
    abertosDoCliente: async (c) => (await req(`/atendimentos?select=*&cliente=eq.${encodeURIComponent(c)}&estado=not.in.${FECHADOS}&order=id`)).map(deLinha),
    encaminhados: async () => (await req('/atendimentos?select=*&estado=eq.encaminhado&order=id')).map(deLinha),
    atendimento: async (id) => { const l = await req(`/atendimentos?select=*&id=eq.${id}`); return l[0] ? deLinha(l[0]) : null; },
    inserirAtendimento: async (a) => Number((await req('/atendimentos', { method: 'POST', body: JSON.stringify(paraLinha(a)) }, 'return=representation'))[0].id),
    atualizarAtendimento: async (a) => { await req(`/atendimentos?id=eq.${a.id}`, { method: 'PATCH', body: JSON.stringify(paraLinha(a)) }); },
    ultimoProtocolo: async (dia) => Number((await req(`/protocolo_dia?select=ultimo&dia=eq.${dia}`))[0]?.ultimo ?? 0),
    reservarProtocolo: async (dia, de, para) => Boolean(await req('/rpc/reservar_protocolo', { method: 'POST', body: JSON.stringify({ p_dia: dia, p_de: de, p_para: para }) })),
    gravarMensagem: async (m) => {
      const l = await req('/mensagens?on_conflict=wa_message_id', { method: 'POST', body: JSON.stringify(m) }, 'resolution=ignore-duplicates,return=representation');
      return Array.isArray(l) && l.length > 0;
    },
    mensagemExiste: async (id) => (await req(`/mensagens?select=id&wa_message_id=eq.${encodeURIComponent(id)}`)).length > 0,
    inserirAlerta: async (a) => { await req('/alertas', { method: 'POST', body: JSON.stringify(a) }); },
    mudarAlertas: async (id, estado) => {
      const corpo = estado === 'resolvido' ? { estado, resolvido_em: new Date().toISOString() } : { estado };
      await req(`/alertas?atendimento_id=eq.${id}&estado=in.(ativo,resgate_enviado)`, { method: 'PATCH', body: JSON.stringify(corpo) });
    },
    inserirResgate: async (r) => { await req('/resgates', { method: 'POST', body: JSON.stringify(r) }); },
  };
}
