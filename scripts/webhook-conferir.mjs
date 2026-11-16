// Mostra as últimas mensagens gravadas pelo webhook (telefones mascarados). Uso: npm run webhook:conferir
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `select criado_em, numero_id, origem, cliente, left(coalesce(texto, ''), 70) as texto
     from public.mensagens order by id desc limit 10`);
await c.end();
const mascara = (t) => (t.length > 4 ? '•'.repeat(t.length - 4) + t.slice(-4) : t);
if (!rows.length) console.log('Nenhuma mensagem gravada ainda.');
for (const r of rows.reverse()) {
  console.log(`${r.criado_em.toLocaleString('pt-BR')}  ${r.numero_id.padEnd(6)} ${r.origem.padEnd(8)} ${mascara(r.cliente)}  ${r.texto}`);
}
