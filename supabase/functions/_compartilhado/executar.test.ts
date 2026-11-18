import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarContexto, executarEvento } from './executar.ts';
import { comNonoDigito, corpoMenu, enviadorGraph } from './meta.ts';
import { deLinha, paraLinha } from './db.ts';
import { bancoEmMemoria, enviadorFalso, PNID_REC } from './teste-memoria.ts';
import type { Evento } from '../../../nucleo/tipos.ts';

const C = '5521912345678';
const br = (dia: number, h: number, m = 0) => Date.UTC(2026, 10, dia, h + 3, m); // 17/11/2026 é terça
const T0 = br(17, 9);
const MIN = 60_000;

async function montar() {
  const b = bancoEmMemoria();
  const e = enviadorFalso();
  const ctx = await carregarContexto(b.db);
  const rodar = (ev: Evento, cliente = C) => executarEvento(b.db, e.enviador, ctx, ev,
    () => ev.tipo === 'relogio' ? b.db.encaminhados() : ev.tipo === 'resgatar' ? b.db.atendimento(ev.atendimentoId).then((a) => (a ? [a] : [])) : b.db.abertosDoCliente(cliente));
  const cli = (texto: string, t: number, numero = 'rec'): Evento => ({ tipo: 'cliente_mensagem', numero, cliente: C, texto, t });
  return { ...b, ...e, ctx, rodar, cli };
}

test('contexto: só os números de ordem 1 a 8, com RH e Dono vindos do banco', async () => {
  const { ctx } = await montar();
  assert.equal(ctx.cfg.numeros.length, 8);
  assert.equal(ctx.cfg.numeros[0].id, 'rec');
  assert.deepEqual(ctx.cfg.semContatoDireto, ['s5', 's7']);
  assert.equal(ctx.numeroDePnid.get(PNID_REC), 'rec');
  assert.equal(ctx.numeroDePnid.has('PNID-OUTRO'), false);
});

test('fluxo: menu, escolha, protocolo reservado, link enviado e tudo gravado', async () => {
  const m = await montar();
  await m.rodar(m.cli('Oi, preciso de um boleto', T0));
  assert.equal(m.enviados[0].tipo, 'menu');
  assert.equal(m.atendimentos.length, 1);
  assert.equal(m.atendimentos[0].id, 101); // id do banco, não o temporário do núcleo

  const r = await m.rodar(m.cli('5', T0 + MIN));
  assert.equal(r.atendimentoId, 101);
  assert.equal(m.enviados[1].tipo, 'link');
  assert.ok(String(m.enviados[1].extra).startsWith('https://wa.me/5521300000004?text='));
  assert.equal(m.atendimentos[0].estado, 'encaminhado');
  assert.equal(m.atendimentos[0].protocolo, '20261117-0001');
  assert.equal(m.protocolos.get('20261117'), 1);
  assert.equal(m.mensagens.filter((x) => x.origem === 'sistema').length, 2);
  assert.equal(m.mensagens[1].atendimento_id, 101);
});

test('protocolo: se outro evento reservou antes, refaz e usa o número seguinte', async () => {
  const m = await montar();
  await m.rodar(m.cli('Oi', T0));
  m.roubar();
  await m.rodar(m.cli('5', T0 + MIN));
  assert.equal(m.atendimentos[0].protocolo, '20261117-0002');
  assert.equal(m.enviados.filter((x) => x.tipo === 'link').length, 1); // não enviou duas vezes
});

test('relógio: alerta gravado; resgate pelo portal registra e muda o alerta', async () => {
  const m = await montar();
  await m.rodar(m.cli('Oi', T0));
  await m.rodar(m.cli('5', T0 + MIN));
  await m.rodar({ tipo: 'relogio', t: T0 + 20 * MIN });
  assert.deepEqual(m.alertas.map((a) => [a.atendimento_id, a.para, a.destino, a.estado]), [[101, 'rec', 's4', 'ativo']]);

  await m.rodar({ tipo: 'resgatar', atendimentoId: 101, t: T0 + 25 * MIN });
  assert.deepEqual(m.resgates, [{ atendimento_id: 101, canal: 'portal', por_template: false }]);
  assert.equal(m.alertas[0].estado, 'resgate_enviado');
  assert.equal(m.enviados.at(-1)!.tipo, 'link');
});

test('resgate pelo portal fora da janela de 24 h vai pelo template', async () => {
  const m = await montar();
  await m.rodar(m.cli('Oi', T0));
  await m.rodar(m.cli('5', T0 + MIN));
  await m.rodar({ tipo: 'resgatar', atendimentoId: 101, t: T0 + 30 * 60 * MIN });
  const ult = m.enviados.at(-1)!;
  assert.equal(ult.tipo, 'template');
  assert.equal(ult.corpo, '20261117-0001|Financeiro');
  assert.equal(m.resgates[0].por_template, true);
});

test('chegada ao setor resolve os alertas', async () => {
  const m = await montar();
  await m.rodar(m.cli('Oi', T0));
  await m.rodar(m.cli('5', T0 + MIN));
  await m.rodar({ tipo: 'relogio', t: T0 + 20 * MIN });
  await m.rodar(m.cli('Cheguei', T0 + 22 * MIN, 's4'));
  assert.equal(m.alertas[0].estado, 'resolvido');
  assert.equal(m.atendimentos[0].estado, 'em_atendimento');
});

test('número ainda não conectado: o envio vira falha registrada, sem derrubar o evento', async () => {
  const m = await montar();
  const r = await m.rodar(m.cli('Dúvida técnica', T0, 's1')); // Triagem não tem phone_number_id
  assert.equal(m.atendimentos.length, 1);
  assert.match(r.falhas[0], /s1 ainda não está conectado/);
});

test('conversão de linha do banco: ida e volta preservam o atendimento', () => {
  const a = { id: 7, protocolo: '20261117-0001', cliente: C, assunto: 'x', entrada: 'rec', estado: 'encaminhado' as const, onde: 's4', origem: 'rec',
    criadoEm: T0, desde: T0, encaminhadoEm: T0, alertado: false, resgates: 1, ultimoResgateEm: T0, ultimaMsgClienteEm: T0,
    respondidoEm: null, encerradoEm: null, percurso: [{ t: T0, texto: 'Entrou' }] };
  assert.deepEqual(deLinha({ id: '7', ...paraLinha(a) }), a);
});

// ---- envio pela Meta ----
test('menu: lista com id opcao-N, títulos até 24 e descrições até 72', () => {
  const c = corpoMenu(C, 'corpo', [{ n: 5, nome: 'Financeiro', descricao: 'x'.repeat(80) }]) as any;
  const row = c.interactive.action.sections[0].rows[0];
  assert.equal(row.id, 'opcao-5');
  assert.equal(row.description.length, 72);
});

test('nono dígito: só para celular do Brasil sem o 9', () => {
  assert.equal(comNonoDigito('556199991234'), '5561999991234');
  assert.equal(comNonoDigito('5561999991234'), null);
  assert.equal(comNonoDigito('556133331234'), null);
});

test('link: se a Meta recusar o botão, envia como texto com o link no fim', async () => {
  const corpos: any[] = [];
  const f = (async (_url: string, init: any) => {
    const b = JSON.parse(init.body); corpos.push(b);
    if (b.type === 'interactive') return new Response(JSON.stringify({ error: { code: 131009, message: 'not allowed' } }), { status: 400 });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
  }) as typeof fetch;
  const id = await enviadorGraph('t', 'v23.0', f).link('PN', '5561999991234', 'Corpo', 'https://wa.me/55?text=a');
  assert.equal(id, 'wamid.X');
  assert.equal(corpos.at(-1).text.body, 'Corpo\n\nhttps://wa.me/55?text=a');
});

test('envio: número sem o 9 recusado é tentado de novo com o 9', async () => {
  const destinos: string[] = [];
  const f = (async (_url: string, init: any) => {
    const b = JSON.parse(init.body); destinos.push(b.to);
    return b.to.length === 12
      ? new Response(JSON.stringify({ error: { code: 131030 } }), { status: 400 })
      : new Response(JSON.stringify({ messages: [{ id: 'wamid.Y' }] }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await enviadorGraph('t', 'v23.0', f).texto('PN', '556199991234', 'oi'), 'wamid.Y');
  assert.deepEqual(destinos, ['556199991234', '5561999991234']);
});
