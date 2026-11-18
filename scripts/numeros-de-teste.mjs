// Fase de teste (ticket wf-pabxzap-22): o número de teste da Meta faz o papel da Recepção.
// Os outros 7 setores ficam com telefones fictícios (5521300000001...) e sem phone_number_id, até a conexão real
// (ticket wf-pabxzap-26), quando este cadastro é substituído pelos números do laboratório.
// Uso: npm run numeros:teste
import pg from 'pg';
import { NUMEROS_EXEMPLO } from '../nucleo/config-laboratorio.ts';

const e = process.env;
if (!e.SUPABASE_DB_URL || !e.META_TEST_PHONE_NUMBER_ID) { console.error('Preencha SUPABASE_DB_URL e META_TEST_PHONE_NUMBER_ID no .env'); process.exit(1); }
const c = new pg.Client({ connectionString: e.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('begin');
  const antigo = await c.query(`select telefone from public.numeros where phone_number_id = $1`, [e.META_TEST_PHONE_NUMBER_ID]);
  const telTeste = antigo.rows[0]?.telefone ?? '15556460837';
  // A linha provisória 'teste' (ticket 20) sai; as mensagens dela passam para a Recepção.
  await c.query(`update public.numeros set phone_number_id = null where id = 'teste'`);
  for (const [i, n] of NUMEROS_EXEMPLO.entries()) {
    const rec = n.id === 'rec';
    await c.query(
      `insert into public.numeros (id, ordem, nome, descricao, telefone, atalho, phone_number_id, sem_contato_direto, encerra_ao_responder)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set ordem = excluded.ordem, nome = excluded.nome, descricao = excluded.descricao, telefone = excluded.telefone,
         atalho = excluded.atalho, phone_number_id = excluded.phone_number_id,
         sem_contato_direto = excluded.sem_contato_direto, encerra_ao_responder = excluded.encerra_ao_responder`,
      [n.id, i + 1, n.nome, n.descricao, rec ? telTeste : n.telefone, n.atalho, rec ? e.META_TEST_PHONE_NUMBER_ID : null,
       ['s5', 's7'].includes(n.id), n.id === 's7'],
    );
  }
  await c.query(`update public.mensagens set numero_id = 'rec' where numero_id = 'teste'`);
  await c.query(`delete from public.numeros where id = 'teste'`);
  await c.query('commit');
} catch (err) { await c.query('rollback'); throw err; }
const { rows } = await c.query(`select ordem, id, nome, phone_number_id is not null as conectado from public.numeros order by ordem`);
await c.end();
console.table(rows);
