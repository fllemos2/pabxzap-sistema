// Chamadas de API para o App Review (ticket wf-pabxzap-13).
// A Meta exige pelo menos uma chamada bem-sucedida por permissão nos 30 dias antes da submissão.
//
// Uso:
//   npm run app-review                      -> chamadas de leitura (whatsapp_business_management)
//   npm run app-review -- --enviar 5511...  -> também envia o template hello_world (whatsapp_business_messaging)
//
// Lê do .env: META_APP_ID, META_APP_SECRET, META_TEST_ACCESS_TOKEN, META_TEST_PHONE_NUMBER_ID.
// Nunca imprime tokens. Não cria nem apaga nada na conta (o template do vídeo é criado pela tela).

const VERSAO = 'v23.0'; // versão da Graph API; conferir a atual no App Dashboard se der erro de versão
const BASE = `https://graph.facebook.com/${VERSAO}`;

const { META_APP_ID, META_APP_SECRET, META_TEST_ACCESS_TOKEN, META_TEST_PHONE_NUMBER_ID } = process.env;
const faltando = Object.entries({ META_APP_ID, META_APP_SECRET, META_TEST_ACCESS_TOKEN, META_TEST_PHONE_NUMBER_ID })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (faltando.length) {
  console.error(`Preencha no .env: ${faltando.join(', ')}`);
  process.exit(1);
}

async function graph(caminho, { metodo = 'GET', token = META_TEST_ACCESS_TOKEN, corpo } = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${caminho.split('?')[0]} -> HTTP ${r.status}: ${dados?.error?.message ?? 'erro'}`);
  return dados;
}

const ok = (permissao, o) => console.log(`OK [${permissao}] ${o}`);

// 1. Descobrir as contas do WhatsApp (WABA) que o token alcança.
const tokenApp = `${META_APP_ID}|${META_APP_SECRET}`;
const debug = await graph(`/debug_token?input_token=${encodeURIComponent(META_TEST_ACCESS_TOKEN)}`, { token: tokenApp });
const escopos = debug.data?.granular_scopes ?? [];
const wabas = escopos.find((e) => e.scope === 'whatsapp_business_management')?.target_ids ?? [];
console.log(`token válido: ${debug.data?.is_valid}; vence: ${debug.data?.expires_at ? new Date(debug.data.expires_at * 1000).toLocaleString('pt-BR') : 'não informado'}`);
console.log(`permissões do token: ${escopos.map((e) => e.scope).join(', ') || '(nenhuma)'}`);
if (!wabas.length) {
  console.error('O token não alcança nenhuma conta do WhatsApp. Gere outro em WhatsApp › API Setup.');
  process.exit(1);
}

// 2. whatsapp_business_management: ler conta, números e templates.
for (const waba of wabas) {
  const conta = await graph(`/${waba}?fields=id,name,currency,timezone_id`);
  ok('whatsapp_business_management', `conta ${conta.id} (${conta.name})`);
  const numeros = await graph(`/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
  for (const n of numeros.data ?? []) ok('whatsapp_business_management', `número ${n.id} ${n.display_phone_number} (${n.verified_name})`);
  const templates = await graph(`/${waba}/message_templates?fields=name,status,category,language&limit=50`);
  for (const t of templates.data ?? []) ok('whatsapp_business_management', `template ${t.name} [${t.language}] ${t.category} ${t.status}`);
}

// 3. whatsapp_business_messaging: enviar hello_world (opcional).
const i = process.argv.indexOf('--enviar');
if (i > -1) {
  const para = (process.argv[i + 1] ?? '').replace(/\D/g, '');
  if (!para) {
    console.error('Informe o telefone do destinatário: --enviar 55DDDNUMERO');
    process.exit(1);
  }
  const envio = await graph(`/${META_TEST_PHONE_NUMBER_ID}/messages`, {
    metodo: 'POST',
    corpo: { messaging_product: 'whatsapp', to: para, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } },
  });
  ok('whatsapp_business_messaging', `mensagem enviada, id ${envio.messages?.[0]?.id}`);
}
