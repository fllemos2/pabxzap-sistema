// Edge Function do Supabase: webhook da WhatsApp Cloud API (ticket wf-pabxzap-20).
// Publicar com: npm run webhook:publicar (deploy sem verificação de JWT, porque quem chama é a Meta).

import { criarHandler } from './servico.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(criarHandler({
  verifyToken: env('META_WEBHOOK_VERIFY_TOKEN'),
  appSecret: env('META_APP_SECRET'),
  accessToken: env('META_ACCESS_TOKEN'),
  supabaseUrl: env('SUPABASE_URL'),
  dbKey: env('PABX_DB_KEY'),
  responder: env('PABX_RESPONDER_TESTE') === '1',
}));
