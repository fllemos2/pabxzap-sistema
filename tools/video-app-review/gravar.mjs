// Gravador dos vídeos do App Review da Meta (Playwright + Chrome do sistema, 1920×1080, sem áudio).
//
//   npm run video:ensaio                 -> os dois vídeos com respostas simuladas e placeholders locais
//   npm run video:ensaio -- --video 1    -> só o vídeo 1
//   npm run video:gravar                 -> modo real: ENVIA a mensagem e CRIA o template (depois do video:login)
//
// Flags: --ensaio, --video 1|2, --visivel (mostra o navegador no ensaio), --manter-webm.
// Saída: tools/video-app-review/saida/video-1-messaging.mp4 e video-2-management.mp4.

import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarServidor } from './console/servidor.mjs';
import { instalarSobreposicao, instalarMascaraWhatsApp } from './sobreposicao.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const PERFIL = join(AQUI, '.perfil');
const SAIDA = join(AQUI, 'saida');
const TAM = { width: 1920, height: 1080 };

const args = process.argv.slice(2);
const ENSAIO = args.includes('--ensaio');
const VISIVEL = args.includes('--visivel') || !ENSAIO;
const MANTER_WEBM = args.includes('--manter-webm');
const iVideo = args.indexOf('--video');
const SO_VIDEO = iVideo > -1 ? args[iVideo + 1] : null;
if (SO_VIDEO && !['1', '2'].includes(SO_VIDEO)) {
  console.error('Use --video 1 ou --video 2');
  process.exit(1);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const digitos = (s) => String(s ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Direção: legenda, cursor, realce, clique e controle dos trechos de cada aba.
// ---------------------------------------------------------------------------
class Diretor {
  constructor(contexto, { titulo, passos }) {
    this.contexto = contexto;
    this.titulo = titulo;
    this.total = passos;
    this.passo = 0;
    this.cursores = new Map(); // página -> {x, y}
    this.trechos = []; // {pagina, inicio, fim} em ms absolutos
    this.inicioPagina = new Map(); // página -> instante (ms) em que o vídeo dela começou
  }

  registrarPagina(pagina, inicio) {
    this.inicioPagina.set(pagina, inicio);
    this.cursores.set(pagina, { x: TAM.width / 2, y: TAM.height / 2 });
  }

  // Começa a usar a gravação desta página a partir de agora.
  focar(pagina, fimAnterior = Date.now()) {
    const agora = Date.now();
    const atual = this.trechos.at(-1);
    if (atual && !atual.fim) atual.fim = Math.min(agora, fimAnterior); // o carregamento da nova aba não entra no vídeo
    this.trechos.push({ pagina, inicio: agora, fim: null });
    this.pagina = pagina;
  }

  encerrar() {
    const atual = this.trechos.at(-1);
    if (atual && !atual.fim) atual.fim = Date.now();
  }

  async legenda(texto, { posicao = 'baixo' } = {}) {
    this.passo += 1;
    const rotulo = `${this.titulo} · step ${this.passo} of ${this.total}`;
    await this.pagina.evaluate(([t, o]) => window.__ar?.legenda(t, o), [texto, { rotulo, posicao }]);
    console.log(`  passo ${this.passo}/${this.total}: ${texto}`);
  }

  async moverCursor(x, y, ms = 900) {
    await this.pagina.evaluate(([x, y, ms]) => window.__ar?.cursor(x, y, ms), [x, y, ms]);
    this.cursores.set(this.pagina, { x, y });
    await espera(ms + 100);
  }

  // Leva o cursor até o elemento e o realça.
  async apontar(alvo, { ms = 2500, cursor = true } = {}) {
    const loc = typeof alvo === 'string' ? this.pagina.locator(alvo).first() : alvo;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const r = await loc.boundingBox();
    if (!r) throw new Error(`elemento não encontrado na tela: ${alvo}`);
    if (cursor) await this.moverCursor(Math.round(r.x + Math.min(r.width * 0.5, 160)), Math.round(r.y + r.height * 0.6));
    await this.pagina.evaluate((r) => window.__ar?.realce(r), r);
    await espera(ms);
    return r;
  }

  async tirarRealce() {
    await this.pagina.evaluate(() => window.__ar?.realce(null));
    await espera(300);
  }

  async clicar(seletor, { antes = 1800, depois = 1200 } = {}) {
    const loc = this.pagina.locator(seletor).first();
    const r = await this.apontar(loc, { ms: antes });
    const x = Math.round(r.x + Math.min(r.width * 0.5, 160));
    const y = Math.round(r.y + r.height * 0.6);
    await this.pagina.evaluate(([x, y]) => window.__ar?.clique(x, y), [x, y]);
    await this.pagina.mouse.click(x, y);
    await espera(depois);
    await this.tirarRealce();
  }

  // Abre uma nova aba, espera ela ficar pronta (o carregamento não entra no vídeo) e passa a gravá-la.
  // A primeira legenda da nova aba já entra antes do corte, para o vídeo não mostrar a página sem legenda.
  async novaAba(url, pronta, { legenda, posicao } = {}) {
    const antes = Date.now();
    const pagina = await this.contexto.newPage();
    this.registrarPagina(pagina, antes);
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await pronta(pagina);
    await pagina.bringToFront();
    await pagina.evaluate(([x, y]) => window.__ar?.cursor(x, y, 0), [TAM.width / 2, TAM.height / 2]);
    const anterior = this.pagina;
    this.pagina = pagina;
    if (legenda) await this.legenda(legenda, { posicao });
    this.pagina = anterior;
    await espera(500);
    this.focar(pagina, antes);
    return pagina;
  }
}

// ---------------------------------------------------------------------------
// Roteiros (legendas do docs/app-review.md, adaptadas ao console).
// ---------------------------------------------------------------------------
async function abrirConsole(d, servidor) {
  const pagina = d.pagina;
  await pagina.goto(servidor.url, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('body[data-pronto="1"]', { timeout: 30_000 });
  await espera(600);
}

async function video1(d, servidor, conta) {
  await abrirConsole(d, servidor);
  d.focar(d.pagina);

  await d.legenda('PabxZap app – admin console of our WhatsApp Cloud API integration (test number)');
  await espera(3500);

  await d.legenda('Messaging tab: sends WhatsApp messages (whatsapp_business_messaging)');
  await d.clicar('#aba-messaging', { depois: 1500 });

  await d.legenda('Recipient: our test phone (number partially hidden for privacy)');
  await d.apontar('#campo-destinatario', { ms: 3200 });
  await d.tirarRealce();

  await d.legenda('“Send test message” sends the hello_world template with the WhatsApp Cloud API');
  await d.clicar('#btn-enviar', { antes: 3000, depois: 300 });
  await d.pagina.waitForSelector('body[data-envio]', { timeout: 30_000 });
  if ((await d.pagina.getAttribute('body', 'data-envio')) !== 'ok') {
    throw new Error(`o envio falhou: ${await d.pagina.locator('#resposta-envio').innerText()}`);
  }
  await espera(1200);

  await d.legenda('The API returns the message ID');
  await d.apontar('#message-id', { ms: 4000 });
  await d.tirarRealce();

  const numero = digitos(conta.numeroTeste);
  const url = ENSAIO
    ? `${servidor.url}/placeholder/whatsapp-web?phone=${numero}`
    : `https://web.whatsapp.com/send?phone=${numero}`;
  await d.legenda('Opening WhatsApp Web of the test recipient in a new tab…');
  await espera(2200);
  await d.novaAba(url, async (p) => {
    // O WhatsApp Web não usa mais a classe .message-in; cada mensagem é um [role="row"] dentro de #main.
    await p.locator(MSG_HELLO).last().waitFor({ timeout: 120_000 }).catch(async () => {
      if (await p.locator('canvas[aria-label*="QR" i], [data-ref]').count()) {
        throw new Error('O WhatsApp Web pediu o QR code: rode npm run video:login e entre de novo.');
      }
      throw new Error('A conversa com o número de teste não abriu no WhatsApp Web.');
    });
    await espera(2500); // tempo para a máscara de privacidade se ajustar à estrutura da página
  }, { legenda: 'WhatsApp Web of the test recipient (other chats are blurred for privacy)', posicao: 'esquerda' });
  await espera(3500);

  await d.legenda('The message is delivered to the recipient’s WhatsApp', { posicao: 'esquerda' });
  await d.apontar(d.pagina.locator(MSG_HELLO).last(), { ms: 5000 });
  d.encerrar();
}

const MSG_HELLO = '#main [role="row"]:has-text("Hello World")';

async function video2(d, servidor, conta) {
  await abrirConsole(d, servidor);
  d.focar(d.pagina);

  await d.legenda('PabxZap app – admin console of our WhatsApp Cloud API integration (test number)');
  await espera(3500);

  await d.legenda('Templates tab: manages message templates (whatsapp_business_management)');
  await d.clicar('#aba-templates', { depois: 300 });
  await d.pagina.waitForSelector('body[data-templates]', { timeout: 30_000 });
  await espera(1200);

  await d.legenda('Listing the message templates of our WhatsApp Business Account');
  await d.apontar('#lista-templates', { ms: 3200 });
  await d.tirarRealce();

  await d.legenda('Creating the utility template our app uses to remind a customer of an open ticket');
  await d.apontar('#t-nome', { ms: 3500 });

  await d.legenda('Category: Utility. Language: Portuguese (Brazil)');
  await d.apontar('#campo-categoria', { ms: 2000 });
  await d.apontar('#campo-idioma', { ms: 2000 });

  await d.legenda('Body with the ticket number and the department name');
  await d.apontar('#campo-corpo', { ms: 4000 });

  await d.legenda('Sample values for the variables');
  await d.apontar('#campo-exemplos', { ms: 3500 });

  if (await d.pagina.locator('#campo-botao').isVisible()) {
    await d.legenda('Button that opens the chat with the department');
    await d.apontar('#campo-botao', { ms: 4000 });
  }
  await d.tirarRealce();

  await d.legenda('“Create template” submits the template to Meta for approval');
  await d.clicar('#btn-criar', { antes: 3000, depois: 300 });
  await d.pagina.waitForSelector('body[data-criacao]', { timeout: 30_000 });
  if ((await d.pagina.getAttribute('body', 'data-criacao')) !== 'ok') {
    throw new Error(`a criação falhou: ${await d.pagina.locator('#resposta-criacao').innerText()}`);
  }
  await espera(1200);

  await d.legenda('Template submitted for approval: the API returns its ID and status');
  await d.apontar('#template-id', { ms: 4000 });
  await d.tirarRealce();

  const linha = d.pagina.locator('#lista-templates tr[data-nome="pabxzap_resgate"]');
  const status = (await linha.locator('.chip').innerText()).trim();
  await d.legenda(/review|pending/i.test(status)
    ? 'The new template is listed in our account, in review (PENDING)'
    : `The new template is listed in our account (status: ${status})`);
  await d.apontar(linha, { ms: 4000 });
  await d.tirarRealce();

  const url = ENSAIO
    ? `${servidor.url}/placeholder/whatsapp-manager`
    : process.env.META_WA_MANAGER_URL ||
      (conta.businessId
        ? `https://business.facebook.com/latest/whatsapp_manager/message_templates?business_id=${conta.businessId}&asset_id=${conta.waba}`
        : `https://business.facebook.com/wa/manage/message-templates/?waba_id=${conta.waba}`);
  await d.legenda('Opening WhatsApp Manager › Message templates in a new tab…');
  await espera(2200);
  await d.novaAba(url, async (p) => {
    if (/login|checkpoint/i.test(p.url())) throw new Error('O Facebook pediu login: rode npm run video:login e entre de novo.');
    await p.getByText('pabxzap_resgate').first().waitFor({ timeout: 90_000 }).catch(() => {
      throw new Error(`O template não apareceu no WhatsApp Manager (${p.url().split('?')[0]}). Confira a URL (META_WA_MANAGER_URL).`);
    });
    await espera(2000);
  }, { legenda: 'The same template in WhatsApp Manager, waiting for Meta’s review' });
  await espera(1000);
  await d.apontar(d.pagina.getByText('pabxzap_resgate').first(), { ms: 5000 });
  d.encerrar();
}

const VIDEOS = {
  1: { arquivo: 'video-1-messaging.mp4', titulo: 'Video 1 · whatsapp_business_messaging', passos: 8, roteiro: video1 },
  2: { arquivo: 'video-2-management.mp4', titulo: 'Video 2 · whatsapp_business_management', passos: 13, roteiro: video2 },
};

// ---------------------------------------------------------------------------
// Gravação e conversão
// ---------------------------------------------------------------------------
async function gravar(n, servidor, conta) {
  const v = VIDEOS[n];
  const dirWebm = join(SAIDA, `.webm-${n}`);
  await rm(dirWebm, { recursive: true, force: true });
  const perfil = ENSAIO ? await mkdtemp(join(tmpdir(), 'pabxzap-ensaio-')) : PERFIL;

  console.log(`\n${v.titulo} (${ENSAIO ? 'ensaio' : 'REAL'})`);
  if (n === '2' && !ENSAIO && (await servidor.templateExiste())) {
    throw new Error('O template pabxzap_resgate já existe na WABA, então o botão "Create template" daria erro no vídeo. ' +
      'Veja o LEIA-ME (seção "Se o vídeo 2 precisar ser regravado").');
  }
  const antes = Date.now();
  const contexto = await chromium.launchPersistentContext(perfil, {
    channel: 'chrome',
    headless: !VISIVEL,
    viewport: TAM,
    deviceScaleFactor: 1,
    locale: 'en-US',
    bypassCSP: true,
    recordVideo: { dir: dirWebm, size: TAM },
    ignoreDefaultArgs: ['--enable-automation'],
    args: [`--window-size=${TAM.width},${TAM.height}`, '--hide-scrollbars', '--lang=en-US'],
  });
  await contexto.addInitScript(instalarSobreposicao);
  await contexto.addInitScript(instalarMascaraWhatsApp);

  const d = new Diretor(contexto, v);
  const inicial = contexto.pages()[0] ?? (await contexto.newPage());
  d.registrarPagina(inicial, antes);
  for (const p of contexto.pages()) if (p !== inicial) await p.close(); // abas restauradas do perfil
  d.pagina = inicial;

  let erro = null;
  try {
    await v.roteiro(d, servidor, conta);
    await espera(500);
  } catch (e) {
    erro = e;
    d.encerrar();
  }
  await contexto.close();
  if (ENSAIO) await rm(perfil, { recursive: true, force: true }).catch(() => {});

  // Se algo falhou no meio (por exemplo, depois de o template já ter sido criado), guarda o que foi gravado
  // em <nome>-parcial.mp4, para não perder a parte do console.
  const destino = join(SAIDA, erro ? v.arquivo.replace('.mp4', '-parcial.mp4') : v.arquivo);
  if (erro && !d.trechos.length) throw erro;
  try {
    await converter(d, destino);
  } catch (e) {
    throw erro ?? e;
  }
  if (erro) {
    erro.message += `\n  (o que foi gravado até a falha está em ${destino})`;
    throw erro;
  }
}

// Instante (ms) em que o Playwright começou a gravar a aba: vem do metadado creation_time do WebM.
function inicioDoVideo(arquivo) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', arquivo], { encoding: 'utf8' });
  const m = /creation_time\s*:\s*(\S+)/.exec(r.stderr ?? '');
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? t : null;
}

// Junta os trechos de cada aba num MP4 só (H.264, yuv420p, sem áudio).
async function converter(d, destino) {
  const entradas = [];
  for (const t of d.trechos) {
    const arquivo = await t.pagina.video().path();
    const inicioVideo = inicioDoVideo(arquivo) ?? d.inicioPagina.get(t.pagina);
    const inicio = Math.max(0, (t.inicio - inicioVideo) / 1000);
    entradas.push({ arquivo, inicio, duracao: (t.fim - t.inicio) / 1000 });
  }
  const argsFfmpeg = ['-y', '-loglevel', 'error'];
  for (const e of entradas) argsFfmpeg.push('-ss', e.inicio.toFixed(3), '-t', e.duracao.toFixed(3), '-i', e.arquivo);
  const filtros = entradas.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,fps=30,scale=${TAM.width}:${TAM.height}:flags=lanczos,setsar=1[v${i}]`);
  const concat = `${entradas.map((_, i) => `[v${i}]`).join('')}concat=n=${entradas.length}:v=1:a=0,format=yuv420p[saida]`;
  argsFfmpeg.push(
    '-filter_complex', [...filtros, concat].join(';'),
    '-map', '[saida]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', destino,
  );
  const r = spawnSync(ffmpeg, argsFfmpeg, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${r.stderr}`);
  if (!MANTER_WEBM) await rm(dirname(entradas[0].arquivo), { recursive: true, force: true });
  const total = entradas.reduce((s, e) => s + e.duracao, 0);
  console.log(`  -> ${destino} (${total.toFixed(1)} s)`);
}

async function principal() {
  await mkdir(SAIDA, { recursive: true });
  const servidor = await iniciarServidor({ ensaio: ENSAIO });
  try {
    const conta = await servidor.conta();
    for (const n of SO_VIDEO ? [SO_VIDEO] : ['1', '2']) await gravar(n, servidor, conta);
  } finally {
    await servidor.fechar();
  }
}

principal().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
