import { useCallback, useEffect, useState } from 'react';
import { supabase, type Alerta, type Atendimento } from './supabase.ts';
import { useAoVivo, useCadastro } from './dados.ts';
import { ESTADOS, ha, hora, telefone } from './formato.ts';
import { Detalhe } from './Detalhe.tsx';

const MAX_RESGATES = 2;

export function Agora({ aoContarAlertas }: { aoContarAlertas: (n: number) => void }) {
  const { nome, pendenciaAtrasada } = useCadastro();
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [abertos, setAbertos] = useState<Atendimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resgatando, setResgatando] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Atendimento | null>(null);

  const recarregar = useCallback(async () => {
    const [al, at] = await Promise.all([
      supabase.from('alertas').select('*, atendimentos(*)').in('estado', ['ativo', 'resgate_enviado']).order('criado_em', { ascending: false }),
      supabase.from('atendimentos').select('*').not('estado', 'in', '(encerrado,nao_concluido)').order('desde', { ascending: false }).limit(300),
    ]);
    if (al.error || at.error) { setErro((al.error ?? at.error)!.message); return; }
    setErro(null);
    // Um alerta por atendimento: o mais recente.
    const vistos = new Set<number>();
    const unicos = (al.data as Alerta[]).filter((a) => !vistos.has(a.atendimento_id) && vistos.add(a.atendimento_id));
    setAlertas(unicos);
    setAbertos(at.data as Atendimento[]);
  }, []);
  useAoVivo(recarregar);
  useEffect(() => { aoContarAlertas(alertas?.filter((a) => a.estado === 'ativo').length ?? 0); }, [alertas, aoContarAlertas]);

  async function resgatar(a: Alerta) {
    setResgatando(a.atendimento_id);
    setAviso(null);
    const { data, error } = await supabase.functions.invoke('resgatar', { body: { atendimentoId: a.atendimento_id } });
    setResgatando(null);
    if (error) {
      const corpo = await (error as any).context?.json?.().catch(() => null);
      setAviso(corpo?.motivo ?? corpo?.erro ?? 'Não foi possível resgatar agora. Tente de novo em instantes.');
    } else if (data?.falhas?.length) {
      setAviso('O resgate foi registrado, mas a mensagem não saiu: ' + data.falhas.join('; '));
    } else {
      setAviso(data?.resgate?.porTemplate ? 'Link reenviado pelo template de resgate (fora da janela de 24 h).' : 'Link reenviado ao cliente.');
    }
    recarregar();
  }

  if (erro) return <p className="erro-msg">Erro ao carregar: {erro}</p>;
  if (!alertas || !abertos) return <p className="carregando">Carregando…</p>;

  const comAlerta = new Set(alertas.map((a) => a.atendimento_id));
  const grupos = [
    { titulo: 'Pendentes', lista: abertos.filter((a) => a.estado === 'pendente') },
    { titulo: 'A caminho de um setor', lista: abertos.filter((a) => a.estado === 'encaminhado' && !comAlerta.has(a.id)) },
    { titulo: 'Em atendimento', lista: abertos.filter((a) => ['em_atendimento', 'recepcao'].includes(a.estado)) },
    { titulo: 'No menu', lista: abertos.filter((a) => a.estado === 'menu') },
  ];

  return (
    <>
      <section aria-labelledby="t-alertas">
        <div className="secao-titulo">
          <h2 id="t-alertas">Alertas</h2>
          <span className="dica">Clientes que não chegaram ao setor em 15 minutos úteis. O resgate pelo app é grátis: reenvie o link pelo WhatsApp.</span>
        </div>
        {aviso && <p className="aviso-msg" role="status">{aviso}</p>}
        {alertas.length === 0 ? <p className="vazio">Nenhum alerta agora. 👍</p> : (
          <div className="cartoes">
            {alertas.map((al) => {
              const a = al.atendimentos;
              if (!a) return null;
              const restam = MAX_RESGATES - a.resgates;
              return (
                <article key={al.id} className={`cartao alerta ${al.estado === 'ativo' ? 'ativo' : 'resgatado'}`}>
                  <header>
                    <span className={`selo ${al.estado === 'ativo' ? 'erro' : 'aviso'}`}>{al.estado === 'ativo' ? 'Não chegou' : 'Link reenviado'}</span>
                    <span className="protocolo">{a.protocolo}</span>
                  </header>
                  <p className="cliente">{telefone(a.cliente)}</p>
                  <p className="assunto" title={a.assunto}>{a.assunto}</p>
                  <dl>
                    <dt>Destino</dt><dd>{nome(al.destino)}</dd>
                    <dt>Encaminhou</dt><dd>{nome(al.para)}</dd>
                    <dt>Encaminhado</dt><dd>{a.encaminhado_em ? `${hora(a.encaminhado_em)} (${ha(a.encaminhado_em)})` : '—'}</dd>
                    <dt>Resgates</dt><dd>{a.resgates} de {MAX_RESGATES}</dd>
                  </dl>
                  <footer>
                    <button className="primario" disabled={restam <= 0 || resgatando !== null} onClick={() => resgatar(al)}>
                      {resgatando === a.id ? 'Reenviando…' : restam <= 0 ? 'Resgates esgotados' : 'Resgatar'}
                    </button>
                    <button className="link" onClick={() => setDetalhe(a)}>Ver percurso</button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="t-andamento">
        <div className="secao-titulo">
          <h2 id="t-andamento">Em andamento</h2>
          <span className="dica">{abertos.length} atendimento{abertos.length === 1 ? '' : 's'} aberto{abertos.length === 1 ? '' : 's'}</span>
        </div>
        {grupos.every((g) => g.lista.length === 0) ? <p className="vazio">Nenhum atendimento aberto.</p> : grupos.map((g) => g.lista.length > 0 && (
          <div key={g.titulo} className="grupo">
            <h3>{g.titulo} <span className="dica">({g.lista.length})</span></h3>
            <table className="tabela">
              <thead><tr><th>Protocolo</th><th>Cliente</th><th>Assunto</th><th>Onde</th><th>Situação</th><th>Desde</th></tr></thead>
              <tbody>
                {g.lista.map((a) => {
                  const atrasada = a.estado === 'pendente' && pendenciaAtrasada(a.onde, a.desde);
                  return (
                    <tr key={a.id} onClick={() => setDetalhe(a)} className={atrasada ? 'destaque' : ''} tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setDetalhe(a)}>
                      <td className="mono">{a.protocolo ?? '—'}</td>
                      <td className="mono">{telefone(a.cliente)}</td>
                      <td className="assunto-celula" title={a.assunto}>{a.assunto}</td>
                      <td>{nome(a.onde)}</td>
                      <td>
                        <span className={`selo ${ESTADOS[a.estado]?.classe ?? 'neutro'}`}>{ESTADOS[a.estado]?.rotulo ?? a.estado}</span>
                        {atrasada && <span className="selo erro">+1 dia útil</span>}
                      </td>
                      <td title={a.desde}>{ha(a.desde)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      {detalhe && <Detalhe atendimento={detalhe} nome={nome} aoFechar={() => setDetalhe(null)} />}
    </>
  );
}
