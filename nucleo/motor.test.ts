// Testes do núcleo. Rodar: npm test (node --test, com remoção de tipos nativa do Node 22.18+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abertos, estadoInicial, pendenciaAtrasada, processar, respostasRapidas, responsavel } from './motor.ts';
import { configLaboratorio } from './config-laboratorio.ts';
import { msUteis, textoDoExpediente, EXPEDIENTE_PADRAO } from './calendario.ts';
import type { Config, Efeito, Estado, Evento } from './tipos.ts';

const cfg = configLaboratorio();
const C = '5521912345678';
const MIN = 60_000;
const HORA = 60 * MIN;
/** Horário de Brasília (UTC-3) → instante. Novembro de 2026: dia 3 é terça; 7 é sábado; 20 é sexta. */
const br = (dia: number, h: number, m = 0) => Date.UTC(2026, 10, dia, h + 3, m);
const T0 = br(3, 9);

/** Aplica uma sequência de eventos e devolve o estado final e todos os efeitos. */
function rodar(eventos: Evento[], inicio: Estado = estadoInicial(), c: Config = cfg) {
  let estado = inicio;
  const efeitos: Efeito[] = [];
  for (const ev of eventos) { const r = processar(c, estado, ev); estado = r.estado; efeitos.push(...r.efeitos); }
  return { estado, efeitos };
}
const cli = (numero: string, texto: string, t = T0): Evento => ({ tipo: 'cliente_mensagem', numero, cliente: C, texto, t });
const atd = (numero: string, texto: string, t = T0): Evento => ({ tipo: 'atendente_mensagem', numero, cliente: C, texto, t });
const relogio = (t: number): Evento => ({ tipo: 'relogio', t });
const rr = (numero: string, atalho: string) => respostasRapidas(cfg, numero).find(r => r.atalho === atalho)!.texto;
const textos = (efs: Efeito[]) => efs.filter(x => x.tipo === 'enviar_texto').map(x => (x as any).texto as string);

// Menu: 1 Recepção, 2 Triagem, 3 CAD/CAM, 4 Previsão e Saída, 5 Financeiro, 6 RH, 7 SAC, 8 Fale com o Dono.
function pelaRecepcao(opcao: number, chegar: boolean, t = T0) {
  const r1 = rodar([cli('rec', 'Preciso da 2ª via do boleto', t), cli('rec', String(opcao), t + MIN)]);
  if (!chegar) return r1;
  const destino = cfg.numeros[opcao - 1].id;
  return rodar([cli(destino, 'Olá, vim encaminhado', t + 2 * MIN)], r1.estado);
}

// ---------- Menu e encaminhamento ----------
test('mensagem à Recepção abre atendimento e envia o menu de 8 opções com descrição', () => {
  const { estado, efeitos } = rodar([cli('rec', 'Oi')]);
  assert.equal(abertos(estado, C).length, 1);
  const menu = efeitos.find(x => x.tipo === 'enviar_menu');
  assert.ok(menu && menu.tipo === 'enviar_menu');
  assert.equal(menu.opcoes.length, 8);
  assert.equal(menu.opcoes[2].nome, 'CAD/CAM');
  assert.equal(menu.opcoes[3].nome, 'Previsão e Saída');
  assert.equal(menu.opcoes[7].nome, 'Fale com o Dono');
  assert.ok(menu.texto.includes('8. Fale com o Dono – Contato para assuntos que exigem atendimento direto com João Emídio.'));
});

test('limites da lista do WhatsApp: título até 24 e descrição até 72 caracteres', () => {
  for (const n of cfg.numeros) {
    assert.ok(n.nome.length <= 24, n.nome);
    assert.ok(n.descricao.length <= 72, n.descricao);
  }
});

test('política de privacidade: sem link enquanto o laboratório não publicar; com link quando houver', () => {
  const sem = rodar([cli('rec', 'Oi')]).efeitos.find(x => x.tipo === 'enviar_menu') as any;
  assert.ok(sem.texto.includes('Política de Privacidade.\n'));
  const com = rodar([cli('rec', 'Oi')], estadoInicial(), { ...cfg, linkPolitica: 'https://exemplo.com/p' }).efeitos.find(x => x.tipo === 'enviar_menu') as any;
  assert.ok(com.texto.includes('Política de Privacidade: https://exemplo.com/p.'));
});

test('escolher Financeiro gera protocolo AAAAMMDD-NNNN e link wa.me com mensagem pronta', () => {
  const { estado, efeitos } = pelaRecepcao(5, false);
  const a = abertos(estado, C)[0];
  assert.equal(a.protocolo, '20261103-0001');
  assert.equal(a.estado, 'encaminhado');
  const link = efeitos.find(x => x.tipo === 'enviar_link');
  assert.ok(link && link.tipo === 'enviar_link');
  assert.equal(link.destino, 's4');
  assert.ok(link.texto.startsWith('Seu atendimento está sendo direcionado para o setor de Financeiro. Protocolo: 20261103-0001.'));
  assert.ok(link.url.startsWith('https://wa.me/5521300000004?text='));
  assert.ok(decodeURIComponent(link.url).includes(a.protocolo!));
  assert.equal(textos(efeitos).length, 0); // dentro do horário: sem aviso
});

test('a sequência do protocolo recomeça a cada dia', () => {
  const r = rodar([cli('rec', 'Oi', br(3, 23, 58)), cli('rec', '5', br(3, 23, 59))]);
  const r2 = rodar([{ tipo: 'cliente_mensagem', numero: 's1', cliente: '5521900000000', texto: 'Oi', t: br(4, 0, 1) }], r.estado);
  assert.equal(r.estado.atendimentos[0].protocolo, '20261103-0001');
  assert.equal(r2.estado.atendimentos[1].protocolo, '20261104-0001');
});

test('opção inválida responde pedindo o número', () => {
  const { efeitos } = rodar([cli('rec', 'Oi'), cli('rec', '9')]);
  assert.ok(textos(efeitos).some(x => x.includes('1 a 8')));
});

test('a chegada passa a responsabilidade ao destino', () => {
  const antes = pelaRecepcao(5, false);
  assert.equal(responsavel(abertos(antes.estado, C)[0]), 'rec');
  const depois = pelaRecepcao(5, true);
  const a = abertos(depois.estado, C)[0];
  assert.equal(a.estado, 'em_atendimento');
  assert.equal(responsavel(a), 's4');
});

// ---------- Fora do horário (decisões de 14/11 e 17/11) ----------
test('fora do horário, a escolha de um setor envia o link e depois o aviso com o horário', () => {
  const { efeitos } = pelaRecepcao(5, false, br(3, 20));
  const tipos = efeitos.map(x => x.tipo);
  assert.deepEqual(tipos, ['enviar_menu', 'enviar_link', 'enviar_texto']);
  const aviso = textos(efeitos)[0];
  assert.ok(aviso.includes('fora do horário de funcionamento'));
  assert.ok(aviso.includes('Horário de funcionamento: segunda a sexta, das 8h às 18h.'));
  assert.ok(aviso.includes('20261103-0001'));
});

test('fora do horário, a opção Recepção recebe o aviso no lugar de "ficou na Recepção"', () => {
  const { efeitos } = pelaRecepcao(1, false, br(7, 10)); // sábado
  const ts = textos(efeitos);
  assert.equal(ts.length, 1);
  assert.ok(ts[0].includes('fora do horário'));
});

test('fora do horário, o contato direto recebe o aviso no lugar da confirmação', () => {
  const dentro = textos(rodar([cli('s1', 'Dúvida', br(3, 10))]).efeitos);
  assert.ok(dentro[0].startsWith('Olá! Recebemos sua mensagem pelo setor de Triagem.'));
  const fora = textos(rodar([cli('s1', 'Dúvida', br(3, 7, 59))]).efeitos);
  assert.ok(fora[0].includes('fora do horário'));
});

test('feriado cadastrado conta como fora do horário', () => {
  const comFeriado = configLaboratorio(undefined, ['2026-11-20']);
  const ts = textos(rodar([cli('s1', 'Dúvida', br(20, 10))], estadoInicial(), comFeriado).efeitos);
  assert.ok(ts[0].includes('fora do horário'));
});

// ---------- Alerta (só no portal, 15 minutos úteis) ----------
test('15 minutos úteis sem chegada: alerta no portal; o atendimento segue encaminhado', () => {
  const r = pelaRecepcao(5, false);                      // encaminhado às 9h01
  assert.equal(rodar([relogio(T0 + 15 * MIN)], r.estado).efeitos.length, 0);
  const { estado, efeitos } = rodar([relogio(T0 + 16 * MIN)], r.estado);
  const al = efeitos.find(x => x.tipo === 'alerta');
  assert.ok(al && al.tipo === 'alerta');
  assert.equal(al.para, 'rec');
  const a = abertos(estado, C)[0];
  assert.equal(a.estado, 'encaminhado');
  assert.equal(a.alertado, true);
});

test('o alerta conta só o expediente: encaminhado às 17h50, alerta às 8h05 do dia seguinte', () => {
  const r = pelaRecepcao(5, false, br(3, 17, 49));        // encaminhado às 17h50 de terça
  assert.equal(rodar([relogio(br(4, 8, 4))], r.estado).efeitos.length, 0);
  assert.ok(rodar([relogio(br(4, 8, 5))], r.estado).efeitos.some(x => x.tipo === 'alerta'));
});

test('a chegada depois do alerta resolve o alerta', () => {
  const r = rodar([relogio(T0 + 20 * MIN)], pelaRecepcao(5, false).estado);
  const { estado, efeitos } = rodar([cli('s4', 'Cheguei', T0 + 22 * MIN)], r.estado);
  assert.ok(efeitos.some(x => x.tipo === 'alerta_resolvido'));
  assert.equal(abertos(estado, C)[0].estado, 'em_atendimento');
});

// ---------- Resgates e "não concluído" (decisões de 02/11 e 17/11) ----------
test('resgate pelo portal reenvia o link, registra o resgate e a chegada resolve', () => {
  const alertado = rodar([relogio(T0 + 20 * MIN)], pelaRecepcao(5, false).estado);
  const id = abertos(alertado.estado, C)[0].id;
  const { estado, efeitos } = rodar([{ tipo: 'resgatar', atendimentoId: id, t: T0 + 25 * MIN }, cli('s4', 'Cheguei', T0 + 27 * MIN)], alertado.estado);
  const resg = efeitos.find(x => x.tipo === 'resgate');
  assert.ok(resg && resg.tipo === 'resgate');
  assert.equal(resg.canal, 'portal');
  assert.equal(resg.porTemplate, false); // o cliente escreveu há menos de 24 h
  assert.ok(efeitos.some(x => x.tipo === 'enviar_link' && x.porTemplate === false));
  assert.equal(abertos(estado, C)[0].estado, 'em_atendimento');
});

test('resgate pelo portal fora da janela de 24 h sai por template', () => {
  const r = pelaRecepcao(5, false);
  const id = abertos(r.estado, C)[0].id;
  const { efeitos } = rodar([{ tipo: 'resgatar', atendimentoId: id, t: T0 + 25 * HORA }], r.estado);
  assert.ok(efeitos.some(x => x.tipo === 'enviar_link' && x.porTemplate === true));
});

test('resgate pelo app: o responsável reenvia o link do destino e o sistema só registra', () => {
  const r = rodar([relogio(T0 + 20 * MIN)], pelaRecepcao(5, false).estado);
  const { estado, efeitos } = rodar([atd('rec', 'Segue de novo: https://wa.me/5521300000004?text=Ol%C3%A1', T0 + 25 * MIN)], r.estado);
  assert.deepEqual(efeitos.map(x => x.tipo), ['resgate']);
  assert.equal((efeitos[0] as any).canal, 'app');
  const a = abertos(estado, C)[0];
  assert.equal(a.resgates, 1);
  assert.equal(a.alertado, false);
});

test('cada resgate reinicia a contagem: novo alerta 15 minutos úteis depois', () => {
  const r = rodar([relogio(T0 + 20 * MIN)], pelaRecepcao(5, false).estado);
  const id = abertos(r.estado, C)[0].id;
  const r2 = rodar([{ tipo: 'resgatar', atendimentoId: id, t: T0 + 30 * MIN }], r.estado);
  assert.equal(rodar([relogio(T0 + 44 * MIN)], r2.estado).efeitos.length, 0);
  assert.ok(rodar([relogio(T0 + 45 * MIN)], r2.estado).efeitos.some(x => x.tipo === 'alerta'));
});

test('depois de 2 resgates: o 3º é recusado e, 24 h depois do último, encerra como não concluído', () => {
  const r = pelaRecepcao(5, false);
  const id = abertos(r.estado, C)[0].id;
  const res = (t: number): Evento => ({ tipo: 'resgatar', atendimentoId: id, t });
  const r2 = rodar([res(T0 + 20 * MIN), res(T0 + 40 * MIN)], r.estado);
  assert.equal(rodar([res(T0 + 60 * MIN)], r2.estado).efeitos.length, 0);
  const quase = rodar([relogio(T0 + 40 * MIN + 24 * HORA - 1)], r2.estado);
  assert.ok(!quase.efeitos.some(x => x.tipo === 'nao_concluido'));
  const { estado, efeitos } = rodar([relogio(T0 + 40 * MIN + 24 * HORA)], r2.estado);
  assert.ok(efeitos.some(x => x.tipo === 'nao_concluido'));
  assert.equal(abertos(estado, C).length, 0);
  assert.equal(estado.atendimentos[0].estado, 'nao_concluido');
});

test('sem 2 resgates, o atendimento não vira "não concluído" sozinho', () => {
  const r = pelaRecepcao(5, false);
  const { estado } = rodar([relogio(T0 + 10 * 24 * HORA)], r.estado);
  assert.equal(abertos(estado, C)[0].estado, 'encaminhado');
});

// ---------- Respostas rápidas e pendência ----------
test('resposta rápida /encerrar encerra; o atendimento fica guardado como encerrado', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([atd('s4', rr('s4', '/encerrar'), T0 + 5 * MIN)], r.estado);
  assert.equal(abertos(estado, C).length, 0);
  assert.equal(estado.atendimentos[0].estado, 'encerrado');
});

test('resposta rápida /pendente deixa pendente; o portal destaca depois de 1 dia útil', () => {
  const r = pelaRecepcao(5, true);
  const { estado } = rodar([atd('s4', rr('s4', '/pendente'), br(3, 10))], r.estado);
  const a = abertos(estado, C)[0];
  assert.equal(a.estado, 'pendente');
  assert.equal(pendenciaAtrasada(cfg, a, br(4, 9, 59)), false); // 8h na terça + 1h59 na quarta
  assert.equal(pendenciaAtrasada(cfg, a, br(4, 10)), true);     // 10 h úteis = 1 dia útil
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

test('contato direto num setor abre atendimento com protocolo e confirmação', () => {
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
test('contato direto no RH e no Dono: nenhuma mensagem e nenhum atendimento, mesmo fora do horário', () => {
  for (const n of ['s5', 's7']) for (const t of [T0, br(3, 22)]) {
    const { estado, efeitos } = rodar([cli(n, 'Olá', t)]);
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

test('encaminhado ao Dono: o link fala em João Emídio', () => {
  const link = pelaRecepcao(8, false).efeitos.find(x => x.tipo === 'enviar_link') as any;
  assert.ok(link.texto.includes('direcionado para João Emídio (Fale com o Dono).'));
});

test('Dono: chegada cancela o alerta; fica em atendimento sem alerta até ele responder', () => {
  const r = pelaRecepcao(8, true);
  const longe = rodar([relogio(T0 + 4 * HORA)], r.estado);
  assert.equal(longe.efeitos.length, 0);
  assert.equal(abertos(longe.estado, C)[0].estado, 'em_atendimento');
});

test('Dono: qualquer resposta encerra; não há respostas rápidas para ele', () => {
  const r = pelaRecepcao(8, true);
  assert.equal(respostasRapidas(cfg, 's7').length, 0);
  const { estado } = rodar([atd('s7', 'Olá, aqui é o João.', T0 + HORA)], r.estado);
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

// ---------- Calendário ----------
test('calendário: tempo útil atravessa a noite e o fim de semana', () => {
  const cal = cfg.calendario;
  assert.equal(msUteis(EXPEDIENTE_PADRAO, cal, br(6, 17), br(9, 9)), 2 * HORA); // sexta 17h → segunda 9h
  assert.equal(msUteis(EXPEDIENTE_PADRAO, cal, br(7, 9), br(8, 18)), 0);        // sábado e domingo
  assert.equal(textoDoExpediente(EXPEDIENTE_PADRAO), 'segunda a sexta, das 8h às 18h');
});
