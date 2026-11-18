import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRelogio, criarResgatar, verificadorSupabase } from './funcoes.ts';
import { carregarContexto, executarEvento } from './executar.ts';
import { bancoEmMemoria, enviadorFalso } from './teste-memoria.ts';

const C = '5521912345678';
const T0 = Date.UTC(2026, 10, 17, 12); // terça, 9h em Brasília
const MIN = 60_000;

async function encaminhado() {
  const b = bancoEmMemoria();
  const e = enviadorFalso();
  const ctx = await carregarContexto(b.db);
  for (const [texto, t] of [['Oi', T0], ['5', T0 + MIN]] as const) {
    await executarEvento(b.db, e.enviador, ctx, { tipo: 'cliente_mensagem', numero: 'rec', cliente: C, texto, t }, () => b.db.abertosDoCliente(C));
  }
  return { ...b, ...e };
}
const req = (headers: Record<string, string> = {}, corpo?: unknown) =>
  new Request('https://x/f', { method: 'POST', headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });

test('relógio: sem o segredo certo, recusa', async () => {
  const m = await encaminhado();
  const h = criarRelogio(m.db, m.enviador, 'segredo', () => T0 + 20 * MIN);
  assert.equal((await h(req({ 'x-pabx-cron': 'errado' }))).status, 403);
  assert.equal((await h(req())).status, 403);
  assert.equal(m.alertas.length, 0);
});

test('relógio: com o segredo, dispara o alerta de 15 minutos úteis', async () => {
  const m = await encaminhado();
  const r = await criarRelogio(m.db, m.enviador, 'segredo', () => T0 + 20 * MIN)(req({ 'x-pabx-cron': 'segredo' }));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).efeitos, ['alerta']);
  assert.equal(m.alertas.length, 1);
});

test('resgatar: exige usuário logado', async () => {
  const m = await encaminhado();
  const h = criarResgatar(m.db, m.enviador, async () => null);
  assert.equal((await h(req({}, { atendimentoId: 101 }))).status, 401);
  assert.equal(m.resgates.length, 0);
});

test('resgatar: logado, reenvia o link; o 3º resgate é recusado', async () => {
  const m = await encaminhado();
  let t = T0 + 20 * MIN;
  const h = criarResgatar(m.db, m.enviador, async () => 'usuario-1', () => (t += MIN));
  const auth = { authorization: 'Bearer x' };
  assert.equal((await h(req(auth, { atendimentoId: 101 }))).status, 200);
  assert.equal((await h(req(auth, { atendimentoId: 101 }))).status, 200);
  assert.equal((await h(req(auth, { atendimentoId: 101 }))).status, 409);
  assert.equal(m.resgates.length, 2);
  assert.equal(m.enviados.filter((x) => x.tipo === 'link').length, 3); // o encaminhamento + 2 resgates
});

test('resgatar: id inválido e preflight do navegador', async () => {
  const m = await encaminhado();
  const h = criarResgatar(m.db, m.enviador, async () => 'u');
  assert.equal((await h(req({ authorization: 'Bearer x' }, { atendimentoId: 'abc' }))).status, 400);
  const pre = await h(new Request('https://x/f', { method: 'OPTIONS' }));
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
});

test('verificador: só aceita Bearer válido no Auth', async () => {
  const f = (async (_u: string, init: any) => init.headers.Authorization === 'Bearer bom'
    ? new Response(JSON.stringify({ id: 'u1' }), { status: 200 })
    : new Response('{}', { status: 401 })) as typeof fetch;
  const v = verificadorSupabase('https://x.supabase.co', 'pub', f);
  assert.equal(await v('Bearer bom'), 'u1');
  assert.equal(await v('Bearer ruim'), null);
  assert.equal(await v(null), null);
});
