// Edge Function do Supabase: webhook da WhatsApp Cloud API (tickets wf-pabxzap-20 e 22).
// Publicar com: npm run webhook:publicar (deploy sem verificação de JWT, porque quem chama é a Meta).

import { criarHandler } from './servico.ts';
import { dbSupabase } from '../_compartilhado/db.ts';
import { enviadorGraph } from '../_compartilhado/meta.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(criarHandler(
  {
    verifyToken: env('META_WEBHOOK_VERIFY_TOKEN'),
    appSecret: env('META_APP_SECRET'),
    linkPolitica: env('PABX_LINK_POLITICA') || null,
  },
  dbSupabase(env('SUPABASE_URL'), env('PABX_DB_KEY')),
  enviadorGraph(env('META_ACCESS_TOKEN')),
));
