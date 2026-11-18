import { useState, type FormEvent } from 'react';
import { supabase } from './supabase.ts';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  }

  return (
    <div className="login">
      <form className="cartao login-cartao" onSubmit={entrar}>
        <div className="marca grande">
          <span className="logo" aria-hidden>☎</span>
          <div>
            <strong>PabxZap</strong>
            <small>Portal da Recepção</small>
          </div>
        </div>
        <label>
          E-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="erro-msg" role="alert">{erro}</p>}
        <button className="primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="dica">Esqueceu a senha? Fale com o administrador (FL²).</p>
      </form>
    </div>
  );
}
