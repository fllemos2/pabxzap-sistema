import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assinaturaValida, desafioDaVerificacao, extrairEcos, extrairMensagens } from './logica.ts';
import { criarHandler } from './servico.ts';
import { bancoEmMemoria, enviadorFalso, PNID_REC } from '../_compartilhado/teste-memoria.ts';

const SECRET = 'segredo-de-teste';
const assinar = (corpo: string) => 'sha256=' + createHmac('sha256', SECRET).update(corpo).digest('hex');
const C = '5521912345678';
const TS = String(Math.floor(Date.UTC(2026, 10, 17, 12) / 1000)); // terça, 9h em Brasília

function payload(mensagem: Record<string, unknown>, pnid = PNID_REC, campo = 'messages') {
  const value: any = { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: pnid } };
  if (campo === 'messages') { value.contacts = [{ wa_id: C, profile: { name: 'Cliente' } }]; value.messages = [mensagem]; }
  else value.message_echoes = [mensagem];
  return { object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: campo, value }] }] };
}
const texto = (id: string, body: string) => ({ from: C, id, timestamp: TS, type: 'text', text: { body } });
const lista = (id: string, n: number) => ({ from: C, id, timestamp: TS, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: `opcao-${n}`, title: 'X' } } });

const cfg = { verifyToken: 'v', appSecret: SECRET };
const post = (p: unknown, assinatura?: string) => {
  const corpo = JSON.stringify(p);
  return new Request('https://x/functions/v1/webhook', { method: 'POST', body: corpo, headers: { 'x-hub-signature-256': assinatura ?? assinar(corpo) } });
};
function montar() {
  const b = bancoEmMemoria();
  const e = enviadorFalso();
  return { ...b, ...e, h: criarHandler(cfg, b.db, e.enviador) };
}

test('verificação: devolve o challenge só com o token certo', async () => {
  const p = (t: string) => new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': t, 'hub.challenge': '42' });
  assert.equal(desafioDaVerificacao(p('certo'), 'certo'), '42');
  assert.equal(desafioDaVerificacao(p('errado'), 'certo'), null);
  assert.equal(desafioDaVerificacao(p(''), ''), null);
  const { h } = montar();
  assert.equal(await (await h(new Request('https://x/w?hub.mode=subscribe&hub.verify_token=v&hub.challenge=123'))).text(), '123');
});

test('assinatura: aceita a certa e recusa a errada ou ausente', async () => {
  const corpo = '{"a":1}';
  assert.equal(await assinaturaValida(corpo, assinar(corpo), SECRET), true);
  assert.equal(await assinaturaValida(corpo + ' ', assinar(corpo), SECRET), false);
  assert.equal(await assinaturaValida(corpo, null, SECRET), false);
});

test('extração: texto, opção da lista vira o número e status são ignorados', () => {
  assert.equal(extrairMensagens(payload(texto('w1', 'Oi')))[0].texto, 'Oi');
  assert.equal(extrairMensagens(payload(lista('w2', 5)))[0].texto, '5');
  const status = payload(texto('w3', 'x')) as any;
  delete status.entry[0].changes[0].value.messages;
  assert.deepEqual(extrairMensagens(status), []);
});

test('extração de ecos do app (coexistência)', () => {
  const e = extrairEcos(payload({ from: '15550000000', to: C, id: 'e1', timestamp: TS, type: 'text', text: { body: 'Olá' } }, PNID_REC, 'smb_message_echoes'));
  assert.deepEqual([e[0].para, e[0].texto], [C, 'Olá']);
});

test('fluxo pelo webhook: "Oi" recebe o menu; escolher 5 na lista recebe o link', async () => {
  const m = montar();
  assert.equal((await m.h(post(payload(texto('w1', 'Oi'))))).status, 200);
  assert.equal(m.enviados[0].tipo, 'menu');
  await m.h(post(payload(lista('w2', 5))));
  assert.equal(m.enviados[1].tipo, 'link');
  assert.equal(m.atendimentos[0].estado, 'encaminhado');
  assert.deepEqual(m.mensagens.map((x) => x.origem), ['cliente', 'sistema', 'cliente', 'sistema']);
});

test('webhook repetido não processa duas vezes', async () => {
  const m = montar();
  const p = payload(texto('w1', 'Oi'));
  await m.h(post(p));
  await m.h(post(p));
  assert.equal(m.enviados.length, 1);
});

test('assinatura errada é recusada sem gravar nada', async () => {
  const m = montar();
  assert.equal((await m.h(post(payload(texto('w1', 'Oi')), 'sha256=00'))).status, 401);
  assert.equal(m.mensagens.length, 0);
});

test('número desconhecido não grava nem responde', async () => {
  const m = montar();
  assert.equal((await m.h(post(payload(texto('w1', 'Oi'), 'PNID-OUTRO')))).status, 200);
  assert.equal(m.mensagens.length + m.enviados.length, 0);
});

test('eco de mensagem do próprio sistema é ignorado; link reenviado pelo atendente conta como resgate pelo app', async () => {
  const m = montar();
  await m.h(post(payload(texto('w1', 'Oi'))));
  await m.h(post(payload(lista('w2', 5))));
  const doSistema = m.mensagens.find((x) => x.origem === 'sistema')!.wa_message_id;
  await m.h(post(payload({ from: '1', to: C, id: doSistema, timestamp: TS, type: 'text', text: { body: 'qualquer' } }, PNID_REC, 'smb_message_echoes')));
  assert.equal(m.mensagens.filter((x) => x.origem === 'atendente').length, 0);

  await m.h(post(payload({ from: '1', to: C, id: 'e9', timestamp: TS, type: 'text', text: { body: 'De novo: https://wa.me/5521300000004?text=Ol%C3%A1' } }, PNID_REC, 'smb_message_echoes')));
  assert.deepEqual(m.resgates, [{ atendimento_id: 101, canal: 'app', por_template: false }]);
});
