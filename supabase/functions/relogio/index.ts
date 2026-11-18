// Edge Function `relogio` (ticket wf-pabxzap-23): o pg_cron chama a cada minuto, com o segredo no cabeçalho x-pabx-cron.
// Publicar sem verificação de JWT: quem chama é o banco.
import { criarRelogio } from '../_compartilhado/funcoes.ts';
import { dbSupabase } from '../_compartilhado/db.ts';
import { enviadorGraph } from '../_compartilhado/meta.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
Deno.serve(criarRelogio(dbSupabase(env('SUPABASE_URL'), env('PABX_DB_KEY')), enviadorGraph(env('META_ACCESS_TOKEN')), env('PABX_CRON_SECRET')));
