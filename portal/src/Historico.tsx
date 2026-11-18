import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type Atendimento, type Indicadores } from './supabase.ts';
import { useCadastro } from './dados.ts';
import { ESTADOS, dataHora, hojeBr, inicioDoDia, somarDias, telefone } from './formato.ts';
import { Detalhe } from './Detalhe.tsx';

const ATALHOS = [
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: '7 dias', dias: 6 },
  { rotulo: '30 dias', dias: 29 },
];

export function Historico() {
  const { nome } = useCadastro();
  const hoje = hojeBr();
  const [de, setDe] = useState(somarDias(hoje, -6));
  const [ate, setAte] = useState(hoje);
  const [busca, setBusca] = useState('');
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [lista, setLista] = useState<Atendimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Atendimento | null>(null);

  const carregar = useCallback(async () => {
    if (!de || !ate || de > ate) return;
    const ini = inicioDoDia(de);
    const fim = inicioDoDia(somarDias(ate, 1));
    setLista(null);
    const [i, l] = await Promise.all([
      supabase.rpc('indicadores', { de: ini, ate: fim }),
      supabase.from('atendimentos').select('*').gte('criado_em', ini).lt('criado_em', fim).order('criado_em', { ascending: false }).limit(1000),
    ]);
    if (i.error || l.error) { setErro((i.error ?? l.error)!.message); return; }
    setErro(null);
    setInd(i.data as Indicadores);
    setLista(l.data as Atendimento[]);
  }, [de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = useMemo(() => {
    const q = busca.replace(/[^\dA-Za-z]/g, '');
    if (!lista || !q) return lista;
    return lista.filter((a) => a.cliente.includes(q) || (a.protocolo ?? '').replace('-', '').includes(q));
  }, [lista, busca]);

  const cartoes = ind && [
    { rotulo: 'Atendimentos', valor: ind.volume, dica: 'abertos no período' },
    { rotulo: 'Contatos diretos', valor: ind.contatos_diretos, dica: 'direto num setor, sem passar pela Recepção' },
    { rotulo: 'Encerrados', valor: ind.encerrados, dica: 'pelos atendentes' },
    { rotulo: 'Alertas', valor: ind.alertas, dica: `${ind.resgates} resgate${ind.resgates === 1 ? '' : 's'} · ${ind.nao_concluidos} não concluído${ind.nao_concluidos === 1 ? '' : 's'}` },
  ];

  return (
    <>
      <section className="filtros" aria-label="Período">
        <div className="atalhos">
          {ATALHOS.map((a) => {
            const d = somarDias(hoje, -a.dias);
            return <button key={a.rotulo} className={de === d && ate === hoje ? 'ativo' : ''} onClick={() => { setDe(d); setAte(hoje); }}>{a.rotulo}</button>;
          })}
        </div>
        <label>De <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
        <label>Até <input type="date" value={ate} min={de} max={hoje} onChange={(e) => setAte(e.target.value)} /></label>
        <label className="busca">Buscar <input type="search" placeholder="Telefone ou protocolo" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
      </section>

      {erro && <p className="erro-msg">Erro ao carregar: {erro}</p>}

      <section className="indicadores" aria-label="Indicadores">
        {cartoes ? cartoes.map((c) => (
          <div key={c.rotulo} className="cartao indicador">
            <span className="valor">{c.valor}</span>
            <span className="rotulo">{c.rotulo}</span>
            <span className="dica">{c.dica}</span>
          </div>
        )) : <p className="carregando">Carregando…</p>}
      </section>

      <section aria-labelledby="t-lista">
        <div className="secao-titulo">
          <h2 id="t-lista">Atendimentos do período</h2>
          {filtrada && <span className="dica">{filtrada.length}{lista && lista.length >= 1000 ? '+ (mostrando os 1000 mais recentes)' : ''}</span>}
        </div>
        {!filtrada ? <p className="carregando">Carregando…</p> : filtrada.length === 0 ? <p className="vazio">Nenhum atendimento encontrado.</p> : (
          <table className="tabela">
            <thead><tr><th>Aberto em</th><th>Protocolo</th><th>Cliente</th><th>Entrada</th><th>Assunto</th><th>Onde</th><th>Situação</th></tr></thead>
            <tbody>
              {filtrada.map((a) => (
                <tr key={a.id} onClick={() => setDetalhe(a)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDetalhe(a)}>
                  <td>{dataHora(a.criado_em)}</td>
                  <td className="mono">{a.protocolo ?? '—'}</td>
                  <td className="mono">{telefone(a.cliente)}</td>
                  <td>{nome(a.entrada)}</td>
                  <td className="assunto-celula" title={a.assunto}>{a.assunto}</td>
                  <td>{nome(a.onde)}</td>
                  <td><span className={`selo ${ESTADOS[a.estado]?.classe ?? 'neutro'}`}>{ESTADOS[a.estado]?.rotulo ?? a.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {detalhe && <Detalhe atendimento={detalhe} nome={nome} aoFechar={() => setDetalhe(null)} />}
    </>
  );
}
