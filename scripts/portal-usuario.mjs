// Cria (ou redefine a senha de) uma conta do portal (decisão 2026-11-17-portal-contas-e-hospedagem: Recepção e administrador).
// Uso: npm run portal:usuario -- email@exemplo.com
// Gera uma senha forte e mostra uma única vez, só no seu terminal. Entregue à pessoa por um canal seguro.
import { randomBytes } from 'node:crypto';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run portal:usuario -- email@exemplo.com');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

const admin = (caminho, init = {}) => fetch(`${SUPABASE_URL}/auth/v1/admin${caminho}`, {
  ...init,
  headers: { 'User-Agent': 'pabxzap-admin', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
});

const senha = randomBytes(12).toString('base64url');
const lista = await (await admin('/users?per_page=200')).json();
const existente = (lista.users ?? []).find((u) => u.email === email);
const r = existente
  ? await admin(`/users/${existente.id}`, { method: 'PUT', body: JSON.stringify({ password: senha }) })
  : await admin('/users', { method: 'POST', body: JSON.stringify({ email, password: senha, email_confirm: true }) });
if (!r.ok) { console.error('Falhou:', (await r.json().catch(() => ({}))).msg ?? r.status); process.exit(1); }

console.log(existente ? `Senha redefinida para ${email}.` : `Conta criada: ${email}.`);
console.log(`Senha: ${senha}`);
console.log('Guarde agora: ela não é mostrada de novo. Para trocar, rode o comando outra vez.');
