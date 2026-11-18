import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { Login } from './Login.tsx';
import { Agora } from './Agora.tsx';
import { Historico } from './Historico.tsx';
import { Feriados } from './Feriados.tsx';
import { Privacidade } from './Privacidade.tsx';

const ABAS = [
  { id: 'agora', rotulo: 'Agora' },
  { id: 'historico', rotulo: 'Histórico' },
  { id: 'feriados', rotulo: 'Feriados' },
  { id: 'privacidade', rotulo: 'Privacidade' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

export function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [aba, setAba] = useState<Aba>(() => (sessionStorage.getItem('aba') as Aba) || 'agora');
  const [alertas, setAlertas] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { try { sessionStorage.setItem('aba', aba); } catch { /* sem armazenamento */ } }, [aba]);
  useEffect(() => { document.title = alertas ? `(${alertas}) PabxZap · Portal` : 'PabxZap · Portal'; }, [alertas]);

  if (sessao === undefined) return <div className="carregando">Carregando…</div>;
  if (!sessao) return <Login />;

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <span className="logo" aria-hidden>☎</span>
          <div>
            <strong>PabxZap</strong>
            <small>Laboratório João Emídio · Recepção</small>
          </div>
        </div>
        <nav className="abas" role="tablist">
          {ABAS.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'ativa' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
              {a.id === 'agora' && alertas > 0 && <span className="contador" aria-label={`${alertas} alertas`}>{alertas}</span>}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <span title={sessao.user.email ?? ''}>{sessao.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <main className="conteudo">
        {aba === 'agora' && <Agora aoContarAlertas={setAlertas} />}
        {aba === 'historico' && <Historico />}
        {aba === 'feriados' && <Feriados />}
        {aba === 'privacidade' && <Privacidade />}
      </main>
    </div>
  );
}
