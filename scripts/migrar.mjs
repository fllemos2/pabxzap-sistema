// Aplica as migrações de supabase/migrations que ainda não rodaram no banco.
// Uso: npm run migrar   (lê SUPABASE_DB_URL do .env; nunca imprime a URL)
// Cada arquivo roda numa transação; o controle fica na tabela public._migracoes.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL vazia no .env');
  process.exit(1);
}

const pasta = path.resolve('supabase/migrations');
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();

try {
  await cliente.query(`create table if not exists public._migracoes (
    arquivo text primary key,
    aplicada_em timestamptz not null default now()
  )`);
  await cliente.query('alter table public._migracoes enable row level security');

  const feitas = new Set((await cliente.query('select arquivo from public._migracoes')).rows.map((r) => r.arquivo));
  const arquivos = (await readdir(pasta)).filter((a) => a.endsWith('.sql')).sort();

  let novas = 0;
  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) continue;
    const sql = await readFile(path.join(pasta, arquivo), 'utf8');
    await cliente.query('begin');
    try {
      await cliente.query(sql);
      await cliente.query('insert into public._migracoes (arquivo) values ($1)', [arquivo]);
      await cliente.query('commit');
      console.log(`aplicada: ${arquivo}`);
      novas++;
    } catch (erro) {
      await cliente.query('rollback');
      console.error(`FALHOU: ${arquivo}: ${erro.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (novas === 0 && !process.exitCode) console.log('nada a aplicar');
} finally {
  await cliente.end();
}
