// Publica as funções do portal e agenda o relógio (ticket wf-pabxzap-23).
// Uso: npm run portal:funcoes
//
// 1. Gera (uma vez) o segredo do relógio e guarda em PABX_CRON_SECRET no .env.
// 2. Grava no Supabase as chaves das funções (PABX_CRON_SECRET, PABX_CHAVE_PUBLICA).
// 3. Publica `relogio` e `resgatar` sem a verificação de JWT do gateway (cada uma confere quem chama).
// 4. Guarda o endereço e o segredo no Vault e agenda o pg_cron "relogio" a cada minuto (via pg_net).
// Nunca imprime segredos.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const e = process.env;
for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN']) {
  if (!e[k]) { console.error(`Preencha ${k} no .env`); process.exit(1); }
}
const ref = new URL(e.SUPABASE_URL).hostname.split('.')[0];

let segredo = e.PABX_CRON_SECRET;
if (!segredo) {
  segredo = randomBytes(32).toString('hex');
  appendFileSync('.env', `\n# Segredo que o pg_cron manda à função relogio (gerado por npm run portal:funcoes)\nPABX_CRON_SECRET=${segredo}\n`);
  console.log('1. segredo do relógio gerado e guardado no .env');
} else console.log('1. segredo do relógio já existia no .env');

function supabase(args) {
  const r = spawnSync('npx', ['supabase', ...args, `--remote=${ref}`, '--yes'], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32', env: process.env });
  if (r.status !== 0) throw new Error(`supabase ${args.slice(0, 2).join(' ')} falhou`);
}

const pasta = mkdtempSync(join(tmpdir(), 'pabxzap-'));
try {
  const arq = join(pasta, 's.env');
  writeFileSync(arq, `PABX_CRON_SECRET=${segredo}\nPABX_CHAVE_PUBLICA=${e.SUPABASE_ANON_KEY}\n`, { mode: 0o600 });
  supabase(['secrets', 'set', '--env-file', arq]);
} finally { rmSync(pasta, { recursive: true, force: true }); }
console.log('2. chaves das funções gravadas no Supabase');

for (const f of ['relogio', 'resgatar']) supabase(['functions', 'deploy', f, '--no-verify-jwt']);
console.log('3. funções relogio e resgatar publicadas');

const c = new pg.Client({ connectionString: e.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
async function guardar(nome, valor) {
  const ex = await c.query('select id from vault.secrets where name = $1', [nome]);
  if (ex.rows[0]) await c.query('select vault.update_secret($1, $2)', [ex.rows[0].id, valor]);
  else await c.query('select vault.create_secret($1, $2)', [valor, nome]);
}
await guardar('pabx_relogio_url', `https://${ref}.supabase.co/functions/v1/relogio`);
await guardar('pabx_cron_secret', segredo);
await c.query(`select cron.schedule('relogio', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'pabx_relogio_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-pabx-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'pabx_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000)
$$)`);
await c.end();
console.log('4. relógio agendado a cada minuto (pg_cron "relogio")');
