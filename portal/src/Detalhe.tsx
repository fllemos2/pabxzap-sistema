import { useEffect, useRef, useState } from 'react';
import { supabase, type Atendimento, type Mensagem } from './supabase.ts';
import { ESTADOS, dataHora, telefone } from './formato.ts';

const ORIGEM: Record<string, string> = { cliente: 'Cliente', sistema: 'Sistema', atendente: 'Atendente' };

export function Detalhe({ atendimento: a, nome, aoFechar }: { atendimento: Atendimento; nome: (id: string | null) => string; aoFechar: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const caixa = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    caixa.current?.showModal();
    supabase.from('mensagens').select('*').eq('cliente', a.cliente)
      .gte('criado_em', new Date(Date.parse(a.criado_em) - 60_000).toISOString())
      .order('criado_em').limit(200)
      .then(({ data }) => setMensagens((data ?? []) as Mensagem[]));
  }, [a]);

  return (
    <dialog ref={caixa} className="detalhe" onClose={aoFechar} onClick={(e) => e.target === caixa.current && caixa.current?.close()}>
      <div className="detalhe-corpo">
        <header>
          <div>
            <h2>Protocolo {a.protocolo ?? '(sem protocolo)'}</h2>
            <p className="dica">{telefone(a.cliente)} · entrou por {nome(a.entrada)} em {dataHora(a.criado_em)}</p>
          </div>
          <button className="link" onClick={() => caixa.current?.close()} aria-label="Fechar">✕</button>
        </header>
        <p><span className={`selo ${ESTADOS[a.estado]?.classe ?? 'neutro'}`}>{ESTADOS[a.estado]?.rotulo ?? a.estado}</span> em {nome(a.onde)}
          {a.resgates > 0 && <> · {a.resgates} resgate{a.resgates > 1 ? 's' : ''}</>}</p>
        <p className="assunto-detalhe">“{a.assunto}”</p>

        <h3>Percurso</h3>
        <ol className="percurso">
          {a.percurso.map((p, i) => <li key={i}><time>{dataHora(p.t)}</time> {p.texto}</li>)}
        </ol>

        <h3>Mensagens</h3>
        {!mensagens ? <p className="carregando">Carregando…</p> : mensagens.length === 0 ? <p className="vazio">Nenhuma mensagem guardada.</p> : (
          <ul className="conversa">
            {mensagens.map((m) => (
              <li key={m.id} className={m.origem}>
                <small>{ORIGEM[m.origem] ?? m.origem} · {nome(m.numero_id)} · {dataHora(m.criado_em)}</small>
                <p>{m.texto ?? '(sem texto)'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
