// Edge Function `resgatar` (ticket wf-pabxzap-23): botão "Resgatar" do portal.
// Publicada sem a verificação de JWT do gateway; a própria função confere o usuário no Auth do Supabase.
import { criarResgatar, verificadorSupabase } from '../_compartilhado/funcoes.ts';
import { dbSupabase } from '../_compartilhado/db.ts';
import { enviadorGraph } from '../_compartilhado/meta.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
Deno.serve(criarResgatar(
  dbSupabase(env('SUPABASE_URL'), env('PABX_DB_KEY')),
  enviadorGraph(env('META_ACCESS_TOKEN')),
  verificadorSupabase(env('SUPABASE_URL'), env('PABX_CHAVE_PUBLICA')),
));
