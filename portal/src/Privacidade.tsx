import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, type Exclusao } from './supabase.ts';
import { dataHora, telefone } from './formato.ts';

export function Privacidade() {
  const [tel, setTel] = useState('');
  const [certeza, setCerteza] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState<Exclusao[]>([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('exclusoes').select('*').order('criado_em', { ascending: false }).limit(50);
    setHistorico((data ?? []) as Exclusao[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const digitos = tel.replace(/\D/g, '');
  const completo = digitos.length >= 12 ? digitos : digitos.length >= 10 ? '55' + digitos : digitos;

  async function apagar(e: FormEvent) {
    e.preventDefault();
    setErro(null); setResultado(null);
    if (completo.length < 12) { setErro('Informe o telefone com DDD (por exemplo, 21 91234-5678).'); return; }
    setEnviando(true);
    const { data, error } = await supabase.rpc('excluir_dados_cliente', { p_cliente: completo });
    setEnviando(false);
    if (error) { setErro(error.message); return; }
    setResultado(`Apagados ${data.atendimentos} atendimento(s) e ${data.mensagens} mensagem(ns) de ${telefone(completo)}.`);
    setTel(''); setCerteza(false);
    carregar();
  }

  return (
    <section className="estreito">
      <div className="secao-titulo">
        <h2>Apagar os dados de um cliente</h2>
        <span className="dica">Use quando o próprio cliente pedir a exclusão (LGPD). Apaga todos os atendimentos e mensagens guardados desse telefone. Não dá para desfazer.</span>
      </div>
      <form className="cartao" onSubmit={apagar}>
        <label>Telefone do cliente <input inputMode="tel" placeholder="21 91234-5678" value={tel} onChange={(e) => setTel(e.target.value)} required /></label>
        {completo.length >= 12 && <p className="dica">Será apagado: <strong>{telefone(completo)}</strong> (com e sem o 9 depois do DDD).</p>}
        <label className="marcar"><input type="checkbox" checked={certeza} onChange={(e) => setCerteza(e.target.checked)} /> Confirmo que o cliente pediu a exclusão.</label>
        {erro && <p className="erro-msg" role="alert">{erro}</p>}
        {resultado && <p className="aviso-msg" role="status">{resultado}</p>}
        <button className="perigo-botao" disabled={!certeza || enviando}>{enviando ? 'Apagando…' : 'Apagar dados'}</button>
      </form>
      <p className="dica">O WhatsApp de cada setor guarda as próprias conversas; essas o atendente apaga no celular. Os dados do PabxZap são apagados aqui, e os demais saem sozinhos depois de 1 ano.</p>

      {historico.length > 0 && (
        <>
          <h3>Exclusões feitas</h3>
          <ul className="lista">
            {historico.map((x) => (
              <li key={x.id}><span>{dataHora(x.criado_em)}</span><span className="mono">final {x.final}</span>
                <span className="cresce dica">{x.atendimentos} atendimento(s), {x.mensagens} mensagem(ns)</span></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
