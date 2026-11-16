// Publica o webhook (ticket wf-pabxzap-20) e liga a Meta a ele, sem passar pelo painel.
//
// Uso: npm run webhook:publicar
//
// 1. Cadastra o número de teste em public.numeros (id 'teste'), para as mensagens terem a que se ligar.
// 2. Grava as chaves da função no Supabase (supabase secrets set).
// 3. Publica a Edge Function `webhook` sem verificação de JWT (quem chama é a Meta).
// 4. Configura o webhook do app na Meta (POST /{app-id}/subscriptions, campo messages); a Meta chama o GET de verificação na hora.
// 5. Assina o app na conta do WhatsApp (POST /{waba-id}/subscribed_apps).
//
// Lê do .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN,
// META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_TEST_PHONE_NUMBER_ID, META_WABA_ID
// e META_ACCESS_TOKEN (token permanente de usuário do sistema) ou, na falta dele, META_TEST_ACCESS_TOKEN (24 h).
// Nunca imprime tokens.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const VERSAO = 'v23.0';
const e = process.env;
const tokenMeta = e.META_ACCESS_TOKEN || e.META_TEST_ACCESS_TOKEN;
const obrig = {
  SUPABASE_URL: e.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL: e.SUPABASE_DB_URL,
  SUPABASE_ACCESS_TOKEN: e.SUPABASE_ACCESS_TOKEN, META_APP_ID: e.META_APP_ID, META_APP_SECRET: e.META_APP_SECRET,
  META_WEBHOOK_VERIFY_TOKEN: e.META_WEBHOOK_VERIFY_TOKEN, META_TEST_PHONE_NUMBER_ID: e.META_TEST_PHONE_NUMBER_ID,
  META_WABA_ID: e.META_WABA_ID, 'META_ACCESS_TOKEN ou META_TEST_ACCESS_TOKEN': tokenMeta,
};
const faltando = Object.entries(obrig).filter(([, v]) => !v).map(([k]) => k);
if (faltando.length) {
  console.error(`Preencha no .env: ${faltando.join(', ')}`);
  process.exit(1);
}
if (!e.META_ACCESS_TOKEN) console.warn('Aviso: usando META_TEST_ACCESS_TOKEN, que vence em 24 h. Depois disso o webhook grava, mas não responde.');

const ref = new URL(e.SUPABASE_URL).hostname.split('.')[0];
const callback = `https://${ref}.supabase.co/functions/v1/webhook`;

async function graph(caminho, { metodo = 'GET', token = tokenMeta, params } = {}) {
  const url = new URL(`https://graph.facebook.com/${VERSAO}${caminho}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const r = await fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${caminho} -> HTTP ${r.status}: ${d?.error?.message ?? 'erro'}`);
  return d;
}

function supabase(args) {
  const r = spawnSync('npx', ['supabase', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: e.SUPABASE_ACCESS_TOKEN },
  });
  if (r.status !== 0) throw new Error(`supabase ${args[0]} ${args[1] ?? ''} falhou`);
}

// 1. Número de teste no banco
const num = await graph(`/${e.META_TEST_PHONE_NUMBER_ID}`, { params: { fields: 'display_phone_number,verified_name' } });
const cliente = new pg.Client({ connectionString: e.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await cliente.connect();
await cliente.query(
  `insert into public.numeros (id, ordem, nome, telefone, atalho, phone_number_id)
   values ('teste', 99, 'Número de teste (Meta)', $1, '#teste', $2)
   on conflict (id) do update set telefone = excluded.telefone, phone_number_id = excluded.phone_number_id`,
  [num.display_phone_number.replace(/\D/g, ''), e.META_TEST_PHONE_NUMBER_ID],
);
await cliente.end();
console.log(`1. número de teste cadastrado em numeros (id 'teste', ${num.verified_name})`);

// 2. Chaves da função (arquivo temporário, apagado logo depois)
const pasta = mkdtempSync(join(tmpdir(), 'pabxzap-'));
const arq = join(pasta, 'segredos.env');
try {
  writeFileSync(arq, [
    `META_WEBHOOK_VERIFY_TOKEN=${e.META_WEBHOOK_VERIFY_TOKEN}`,
    `META_APP_SECRET=${e.META_APP_SECRET}`,
    `META_ACCESS_TOKEN=${tokenMeta}`,
    `PABX_DB_KEY=${e.SUPABASE_SERVICE_ROLE_KEY}`,
    `PABX_RESPONDER_TESTE=1`,
  ].join('\n') + '\n', { mode: 0o600 });
  supabase(['secrets', 'set', '--env-file', arq, '--project-ref', ref]);
} finally {
  rmSync(pasta, { recursive: true, force: true });
}
console.log('2. chaves gravadas no Supabase');

// 3. Deploy
supabase(['functions', 'deploy', 'webhook', '--no-verify-jwt', '--project-ref', ref]);
console.log(`3. função publicada em ${callback}`);

// 4. Webhook do app na Meta (token de app)
await graph(`/${e.META_APP_ID}/subscriptions`, {
  metodo: 'POST', token: `${e.META_APP_ID}|${e.META_APP_SECRET}`,
  params: { object: 'whatsapp_business_account', callback_url: callback, verify_token: e.META_WEBHOOK_VERIFY_TOKEN, fields: 'messages' },
});
console.log('4. webhook configurado na Meta (campo messages) e verificado');

// 5. App assinado na conta do WhatsApp
await graph(`/${e.META_WABA_ID}/subscribed_apps`, { metodo: 'POST' });
console.log('5. app assinado na conta do WhatsApp');
console.log('\nPronto. Mande uma mensagem do seu celular para o número de teste.');
