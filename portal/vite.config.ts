// O portal lê SUPABASE_URL e SUPABASE_ANON_KEY (chave publicável) do .env da raiz do repositório.
// A chave secret nunca entra aqui: o navegador só usa a publicável, e o RLS protege os dados.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '..', ''), ...process.env };
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_CHAVE': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
    },
    server: { port: 5180, fs: { allow: ['..'] } },
  };
});
