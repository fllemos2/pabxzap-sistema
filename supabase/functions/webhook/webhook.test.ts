import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assinaturaValida, comNonoDigito, desafioDaVerificacao, extrairMensagens } from './logica.ts';
import { criarHandler } from './servico.ts';

const SECRET = 'segredo-de-teste';
const assinar = (corpo: string) => 'sha256=' + createHmac('sha256', SECRET).update(corpo).digest('hex');

function payloadTexto(id = 'wamid.A1', de = '556199991234', texto = 'Oi') {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID' },
      contacts: [{ wa_id: de, profile: { name: 'Cliente' } }],
      messages: [{ from: de, id, timestamp: '1763200000', type: 'text', text: { body: texto } }],
    } }] }],
  };
}

test('verificação: devolve o challenge só com o token certo', () => {
  const p = (t: string) => new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': t, 'hub.challenge': '42' });
  assert.equal(desafioDaVerificacao(p('certo'), 'certo'), '42');
  assert.equal(desafioDaVerificacao(p('errado'), 'certo'), null);
  assert.equal(desafioDaVerificacao(p(''), ''), null);
});

test('assinatura: aceita a certa e recusa a errada ou ausente', async () => {
  const corpo = '{"a":1}';
  assert.equal(await assinaturaValida(corpo, assinar(corpo), SECRET), true);
  assert.equal(await assinaturaValida(corpo + ' ', assinar(corpo), SECRET), false);
  assert.equal(await assinaturaValida(corpo, null, SECRET), false);
});

test('extração: pega texto, opção de lista e ignora status', () => {
  const [m] = extrairMensagens(payloadTexto());
  assert.equal(m.phoneNumberId, 'PNID');
  assert.equal(m.de, '556199991234');
  assert.equal(m.texto, 'Oi');
  assert.equal(m.nome, 'Cliente');

  const lista = payloadTexto();
  lista.entry[0].changes[0].value.messages = [{ from: '1', id: 'w2', timestamp: '1', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'fin', title: 'Financeiro' } } } as any];
  assert.equal(extrairMensagens(lista)[0].texto, 'Financeiro');

  const status = payloadTexto();
  delete (status.entry[0].changes[0].value as any).messages;
  (status.entry[0].changes[0].value as any).statuses = [{ id: 'x', status: 'delivered' }];
  assert.deepEqual(extrairMensagens(status), []);
});

test('nono dígito: só para celular do Brasil sem o 9', () => {
  assert.equal(comNonoDigito('556199991234'), '5561999991234');
  assert.equal(comNonoDigito('5561999991234'), null); // já tem
  assert.equal(comNonoDigito('556133331234'), null);  // fixo
  assert.equal(comNonoDigito('15550000000'), null);
});

// ---- fluxo completo com banco e Meta falsos ----
function falsos({ recusarSem9 = false } = {}) {
  const gravadas: any[] = [];
  const enviados: any[] = [];
  const f = (async (url: string, init: any = {}) => {
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
    if (url.includes('/rest/v1/numeros')) return json(url.includes('PNID') ? [{ id: 'teste' }] : []);
    if (url.includes('/rest/v1/mensagens')) {
      const linha = JSON.parse(init.body);
      if (linha.wa_message_id && gravadas.some((g) => g.wa_message_id === linha.wa_message_id)) return json([], 201);
      gravadas.push(linha);
      return json([linha], 201);
    }
    if (url.includes('graph.facebook.com')) {
      const corpo = JSON.parse(init.body);
      enviados.push(corpo);
      if (recusarSem9 && corpo.to.length === 12) return json({ error: { code: 131030, message: 'Recipient not in allowed list' } }, 400);
      return json({ messages: [{ id: `wamid.S${enviados.length}` }] });
    }
    throw new Error('url inesperada ' + url);
  }) as typeof fetch;
  return { f, gravadas, enviados };
}

const cfg = { verifyToken: 'v', appSecret: SECRET, accessToken: 't', supabaseUrl: 'https://x.supabase.co', dbKey: 'k', responder: true };
const post = (corpo: string, assinatura = assinar(corpo)) =>
  new Request('https://x/functions/v1/webhook', { method: 'POST', body: corpo, headers: { 'x-hub-signature-256': assinatura } });

test('fluxo: grava a mensagem, responde e grava a resposta', async () => {
  const { f, gravadas, enviados } = falsos();
  const h = criarHandler(cfg, f);
  const r = await h(post(JSON.stringify(payloadTexto())));
  assert.equal(r.status, 200);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, '556199991234');
  assert.deepEqual(gravadas.map((g) => g.origem), ['cliente', 'sistema']);
  assert.equal(gravadas[0].numero_id, 'teste');
});

test('fluxo: webhook repetido não responde duas vezes', async () => {
  const { f, enviados } = falsos();
  const h = criarHandler(cfg, f);
  const corpo = JSON.stringify(payloadTexto());
  await h(post(corpo));
  await h(post(corpo));
  assert.equal(enviados.length, 1);
});

test('fluxo: assinatura errada é recusada sem gravar nada', async () => {
  const { f, gravadas } = falsos();
  const r = await criarHandler(cfg, f)(post(JSON.stringify(payloadTexto()), 'sha256=00'));
  assert.equal(r.status, 401);
  assert.equal(gravadas.length, 0);
});

test('fluxo: se a Meta recusa o número sem o 9, tenta com o 9', async () => {
  const { f, enviados, gravadas } = falsos({ recusarSem9: true });
  await criarHandler(cfg, f)(post(JSON.stringify(payloadTexto())));
  assert.deepEqual(enviados.map((e) => e.to), ['556199991234', '5561999991234']);
  assert.equal(gravadas.length, 2);
});

test('fluxo: número desconhecido não grava nem responde', async () => {
  const { f, gravadas, enviados } = falsos();
  const p = payloadTexto();
  p.entry[0].changes[0].value.metadata.phone_number_id = 'OUTRO';
  const r = await criarHandler(cfg, f)(post(JSON.stringify(p)));
  assert.equal(r.status, 200);
  assert.equal(gravadas.length + enviados.length, 0);
});

test('verificação GET pelo handler', async () => {
  const h = criarHandler(cfg, falsos().f);
  const ok = await h(new Request('https://x/w?hub.mode=subscribe&hub.verify_token=v&hub.challenge=123'));
  assert.equal(await ok.text(), '123');
  assert.equal((await h(new Request('https://x/w?hub.mode=subscribe&hub.verify_token=n&hub.challenge=1'))).status, 403);
});
