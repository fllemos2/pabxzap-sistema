// Testes do núcleo. Rodar: npm test (node --test, com remoção de tipos nativa do Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abertos, estadoInicial, processar, respostasRapidas, responsavel } from './motor.ts';
import { configLaboratorio } from './config-laboratorio.ts';
import type { Efeito, Estado, Evento } from './tipos.ts';

const cfg = configLaboratorio();
const C = '5521912345678';
const T0 = new Date(2026, 10, 3, 9, 0).getTime();
const MIN = 60_000;

/** Aplica uma sequência de eventos e devolve o estado final e todos os efeitos. */
function rodar(eventos: Evento[], inicio: Estado = estadoInicial()) {
  let estado = inicio;
  const efeitos: Efeito[] = [];
  for (const ev of eventos) { const r = processar(cfg, estado, ev); estado = r.estado; efeitos.push(...r.efeitos); }
  return { estado, efeitos };
}
const cli = (numero: string, texto: string, t = T0): Evento => ({ tipo: 'cliente_mensagem', numero, cliente: C, texto, t });
const atd = (numero: string, texto: string, t = T0): Evento => ({ tipo: 'atendente_mensagem', numero, cliente: C, texto, t });
const rr = (numero: string, atalho: string) => respostasRapidas(cfg, numero).find(r => r.atalho === atalho)!.texto;

// Menu: 1 Recepção, 2 Triagem, 3 Cad Cam, 4 Previsão, 5 Financeiro, 6 RH, 7 SAC, 8 Fale com o Dono.
function pelaRecepcao(opcao: number, chegar: boolean) {
  const evs: Evento[] = [cli('rec', 'Preciso da 2ª via do boleto'), cli('rec', String(opcao), T0 + MIN)];
  const r1 = rodar(evs);
  if (!chegar) return r1;
  const destino = cfg.numeros[opcao - 1].id;
  return rodar([cli(destino, 'Olá, vim encaminhado', T0 + 2 * MIN)], r1.estado);
}

test('mensagem à Recepção abre atendimento e envia o menu de 8 opções', () => {
  const { estado, efeitos } = rodar([cli('rec', 'Oi')]);
  assert.equal(abertos(estado, C).length, 1);
  const menu = efeitos.find(x => x.tipo === 'enviar_menu');
  assert.ok(menu && menu.tipo === 'enviar_menu');
  assert.equal(menu.opcoes.length, 8);
  assert.equal(menu.opcoes[0].nome, 'Recepção');
  assert.equal(menu.opcoes[7].nome, 'Fale com o Dono');
});

test('escolher Financeiro gera protocolo e link wa.me com mensagem pronta', () => {
  const { estado, efeitos } = pelaRecepcao(5, false);
  const a = abertos(estado, C)[0];
  assert.match(a.protocolo!, /^PZ-\d{4}-0001$/);
  assert.equal(a.estado, 'encaminhado');
  const link = efeitos.find(x => x.tipo === 'enviar_link');
  assert.ok(link && link.tipo === 'enviar_link');
  assert.equal(link.destino, 's4');
  assert.ok(link.url.startsWith('https://wa.me/5521300000004?text='));
  assert.ok(decodeURIComponent(link.url).includes(a.protocolo!));
});

test('opção inválida responde pedindo o número', () => {
  const { efeitos } = rodar([cli('rec', 'Oi'), cli('rec', '9')]);
  assert.ok(efeitos.some(x => x.tipo === 'enviar_texto' && x.texto.includes('1 a 8')));
});

test('a chegada passa a responsabilidade ao destino', () => {
  const antes = pelaRecepcao(5, false);
  assert.equal(responsavel(abertos(antes.estado, C)[0]), 'rec');
  const depois = pelaRecepcao(5, true);
  const a = abertos(depois.estado, C)[0];
  assert.equal(a.estado, 'em_atendimento');
  assert.equal(responsavel(a), 's4');
});

test('15 minutos sem chegada: alerta para quem encaminhou', () => {
  const r = pelaRecepcao(5, false);
  const antes = rodar([{ tipo: 'relogio', t: T0 + 15 * MIN }], r.estado);   // encaminhado em T0+1min
  assert.equal(antes.efeitos.length, 0);
  const { estado, efeitos } = rodar([{ tipo: 'relogio', t: T0 + 16 * MIN }], r.estado);
  const al = efeitos.find(x => x.tipo === 'alerta');
  assert.ok(al && al.tipo === 'alerta');
  assert.equal(al.para, 'rec');
  assert.equal(abertos(estado, C)[0].estado, 'nao_concluido');
});

test('resgate reenvia o link e a chegada depois resolve o alerta', () => {
  const r = pelaRecepcao(5, false);
  const alertado = rodar([{ tipo: 'relogio', t: T0 + 20 * MIN }], r.estado);
  const id = abertos(alertado.estado, C)[0].id;
  const { estado, efeitos } = rodar([
    { tipo: 'resgatar', atendimentoId: id, t: T0 + 25 * MIN },
    cli('s4', 'Cheguei', T0 + 27 * MIN),
  ], alertado.estado);
  assert.ok(efeitos.some(x => x.tipo === 'enviar_link'));
  assert.ok(efeitos.some(x => x.tipo === 'alerta_resolvido'));
  assert.equal(abertos(estado, C)[0].estado, 'em_atendimento');
});

test('resposta rápida /encerrar encerra; o atendimento fica guardado como encerrado', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([atd('s4', rr('s4', '/encerrar'), T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C).length, 0);
  assert.equal(estado.atendimentos[0].estado, 'encerrado');
});

test('resposta rápida /pendente deixa pendente', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([atd('s4', rr('s4', '/pendente'), T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C)[0].estado, 'pendente');
});

test('resposta rápida de destino encaminha mantendo o protocolo; quem encaminhou segue responsável', () => {
  const r = pelaRecepcao(5, true);
  const p = abertos(r.estado, C)[0].protocolo;
  const { estado, efeitos } = rodar([atd('s4', rr('s4', '/sac'), T0 + 5 * MIN)], r.estado);
  const a = abertos(estado, C)[0];
  assert.equal(a.protocolo, p);
  assert.equal(a.onde, 's6');
  assert.equal(responsavel(a), 's4');
  assert.ok(efeitos.some(x => x.tipo === 'enviar_link' && x.destino === 's6'));
});

test('texto parecido mas editado é só mensagem comum', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([atd('s4', rr('s4', '/encerrar') + ' Até logo', T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C)[0].estado, 'em_atendimento');
});

test('contato direto num setor abre atendimento com protocolo e mensagem curta', () => {
  const { estado, efeitos } = rodar([cli('s1', 'Tenho uma dúvida técnica')]);
  const a = abertos(estado, C)[0];
  assert.equal(a.estado, 'em_atendimento');
  assert.equal(a.entrada, 's1');
  assert.ok(efeitos.some(x => x.tipo === 'enviar_texto' && x.de === 's1' && x.texto.includes(a.protocolo!)));
});

test('com atendimento num setor, escrever direto a outro abre um segundo atendimento', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([cli('s1', 'Outra dúvida', T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C).length, 2);
});

// ---------- RH e Dono (decisão de 19/10/2026) ----------
test('contato direto no RH e no Dono: nenhuma mensagem e nenhum atendimento', () => {
  for (const n of ['s5', 's7']) {
    const { estado, efeitos } = rodar([cli(n, 'Olá')]);
    assert.equal(abertos(estado, C).length, 0, n);
    assert.equal(efeitos.length, 0, n);
  }
});

test('encaminhado ao RH: funciona como os outros setores', () => {
  const r = pelaRecepcao(6, true);
  assert.equal(abertos(r.estado, C)[0].onde, 's5');
  const { estado } = rodar([atd('s5', rr('s5', '/encerrar'), T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C).length, 0);
});

test('Dono: chegada cancela o alerta; fica em atendimento sem alerta até ele responder', () => {
  const r = pelaRecepcao(8, true);
  const longe = rodar([{ tipo: 'relogio', t: T0 + 4 * 60 * MIN }], r.estado);
  assert.equal(longe.efeitos.length, 0);
  assert.equal(abertos(longe.estado, C)[0].estado, 'em_atendimento');
});

test('Dono: qualquer resposta encerra; não há respostas rápidas para ele', () => {
  const r = pelaRecepcao(8, true);
  assert.equal(respostasRapidas(cfg, 's7').length, 0);
  const { estado } = rodar([atd('s7', 'Olá, aqui é o João.', T0 + 60 * MIN)], r.estado);
  assert.equal(abertos(estado, C).length, 0);
});

test('outros setores podem encaminhar ao RH e ao Dono', () => {
  const l = respostasRapidas(cfg, 's4');
  assert.ok(l.some(x => x.destino === 's5') && l.some(x => x.destino === 's7'));
});

test('processar não altera o estado recebido', () => {
  const inicial = estadoInicial();
  processar(cfg, inicial, cli('rec', 'Oi'));
  assert.equal(inicial.atendimentos.length, 0);
});
