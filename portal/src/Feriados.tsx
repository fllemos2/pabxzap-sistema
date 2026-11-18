import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, type Feriado } from './supabase.ts';
import { dataCurta, hojeBr } from './formato.ts';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaDaSemana = (dia: string) => DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()];

export function Feriados() {
  const [lista, setLista] = useState<Feriado[] | null>(null);
  const [dia, setDia] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeBr();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('feriados').select('*').order('dia');
    if (error) setErro(error.message); else setLista(data as Feriado[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function incluir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const { error } = await supabase.from('feriados').insert({ dia, descricao: descricao.trim() || null });
    if (error) { setErro(error.code === '23505' ? 'Esse dia já está cadastrado.' : error.message); return; }
    setDia(''); setDescricao('');
    carregar();
  }
  async function remover(f: Feriado) {
    if (!confirm(`Remover o feriado de ${dataCurta(f.dia)}?`)) return;
    const { error } = await supabase.from('feriados').delete().eq('dia', f.dia);
    if (error) setErro(error.message); else carregar();
  }

  const futuros = lista?.filter((f) => f.dia >= hoje) ?? [];
  const passados = lista?.filter((f) => f.dia < hoje).reverse() ?? [];

  return (
    <section className="estreito">
      <div className="secao-titulo">
        <h2>Feriados</h2>
        <span className="dica">Nos feriados, o atendimento fica fora do horário o dia inteiro: o cliente recebe o aviso de horário e o alerta de 15 minutos não conta.</span>
      </div>
      <form className="cartao linha-form" onSubmit={incluir}>
        <label>Dia <input type="date" value={dia} min={hoje} onChange={(e) => setDia(e.target.value)} required /></label>
        <label className="cresce">Descrição <input value={descricao} maxLength={80} placeholder="Ex.: Natal" onChange={(e) => setDescricao(e.target.value)} /></label>
        <button className="primario">Incluir</button>
      </form>
      {erro && <p className="erro-msg" role="alert">{erro}</p>}
      {!lista ? <p className="carregando">Carregando…</p> : (
        <>
          <h3>Próximos</h3>
          {futuros.length === 0 ? <p className="vazio">Nenhum feriado cadastrado.</p> : (
            <ul className="lista">
              {futuros.map((f) => (
                <li key={f.dia}>
                  <span className="mono">{dataCurta(f.dia)}</span> <span className="dica">{diaDaSemana(f.dia)}</span>
                  <span className="cresce">{f.descricao}</span>
                  <button className="link perigo" onClick={() => remover(f)}>Remover</button>
                </li>
              ))}
            </ul>
          )}
          {passados.length > 0 && (
            <details>
              <summary>Já passaram ({passados.length})</summary>
              <ul className="lista">{passados.map((f) => <li key={f.dia}><span className="mono">{dataCurta(f.dia)}</span><span className="cresce">{f.descricao}</span></li>)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
