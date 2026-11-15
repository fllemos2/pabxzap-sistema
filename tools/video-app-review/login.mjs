// Login único para a gravação: abre o Chrome com o perfil persistente usado pelo gravador
// (tools/video-app-review/.perfil/), em 1366×768, com o Facebook e o WhatsApp Web em abas.
// Entre nos dois (no WhatsApp Web, leia o QR code com o celular do destinatário de teste)
// e feche o navegador quando terminar. As sessões ficam guardadas no perfil.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PERFIL = join(fileURLToPath(new URL('.', import.meta.url)), '.perfil');

const contexto = await chromium.launchPersistentContext(PERFIL, {
  channel: 'chrome',
  headless: false,
  viewport: null,
  locale: 'en-US',
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--window-size=1366,768', '--window-position=0,0', '--lang=en-US'],
});

const [primeira] = contexto.pages();
const facebook = primeira ?? (await contexto.newPage());
await facebook.goto('https://developers.facebook.com/apps/').catch(() => {});
const whatsapp = await contexto.newPage();
await whatsapp.goto('https://web.whatsapp.com/').catch(() => {});

console.log('Faça login no Facebook (developers.facebook.com) e no WhatsApp Web (QR code do celular do destinatário).');
console.log('Deixe o Facebook em English (US). Quando terminar, feche o navegador.');
await new Promise((fim) => contexto.on('close', fim));
console.log('Perfil salvo em tools/video-app-review/.perfil/');
