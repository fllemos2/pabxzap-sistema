// Handlers das Edge Functions do portal (ticket wf-pabxzap-23), testáveis no Node.
//   relogio  — chamado pelo pg_cron a cada minuto, com um segredo; dispara alertas e "não concluído".
//   resgatar — botão do portal; só para usuário logado (o token é conferido no Auth do Supabase).

import { carregarContexto, executarEvento } from './executar.ts';
import type { Db } from './db.ts';
import type { Enviador } from './meta.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Compara sem vazar o tempo de comparação. */
function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function criarRelogio(db: Db, enviador: Enviador, segredo: string, agora: () => number = Date.now) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ erro: 'method not allowed' }, 405);
    if (!iguais(req.headers.get('x-pabx-cron') ?? '', segredo)) return json({ erro: 'forbidden' }, 403);
    const ctx = await carregarContexto(db);
    const r = await executarEvento(db, enviador, ctx, { tipo: 'relogio', t: agora() }, () => db.encaminhados());
    return json({ efeitos: r.efeitos.map((e) => e.tipo), falhas: r.falhas });
  };
}

/** Confere o token do usuário no Auth do Supabase; devolve o id do usuário ou null. */
export type VerificarUsuario = (authorization: string | null) => Promise<string | null>;

export function verificadorSupabase(supabaseUrl: string, chavePublica: string, f: typeof fetch = fetch): VerificarUsuario {
  return async (authorization) => {
    if (!authorization?.startsWith('Bearer ')) return null;
    const r = await f(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: { Authorization: authorization, apikey: chavePublica } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u?.id ?? null;
  };
}

export function criarResgatar(db: Db, enviador: Enviador, verificar: VerificarUsuario, agora: () => number = Date.now) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ erro: 'method not allowed' }, 405);
    if (!(await verificar(req.headers.get('authorization')))) return json({ erro: 'não autorizado' }, 401);
    const corpo = await req.json().catch(() => ({}));
    const id = Number(corpo?.atendimentoId);
    if (!Number.isInteger(id) || id <= 0) return json({ erro: 'atendimentoId inválido' }, 400);

    const ctx = await carregarContexto(db);
    const r = await executarEvento(db, enviador, ctx, { tipo: 'resgatar', atendimentoId: id, t: agora() },
      async () => { const a = await db.atendimento(id); return a ? [a] : []; });
    const resgate = r.efeitos.find((e) => e.tipo === 'resgate');
    if (!resgate) return json({ ok: false, motivo: 'Resgate não permitido: o cliente já chegou, o atendimento foi fechado ou os 2 resgates já foram usados.' }, 409);
    return json({ ok: r.falhas.length === 0, resgate, falhas: r.falhas });
  };
}
