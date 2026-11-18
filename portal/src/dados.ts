import { useCallback, useEffect, useState } from 'react';
import { supabase, type Numero } from './supabase.ts';
import { EXPEDIENTE_PADRAO, duracaoDoDia, msUteis, type Expediente } from '../../nucleo/calendario.ts';

/** Números (para mostrar nomes) e feriados, carregados uma vez. */
export function useCadastro() {
  const [numeros, setNumeros] = useState<(Numero & { expediente: Expediente })[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('numeros').select('id, ordem, nome, telefone, phone_number_id, expediente').order('ordem')
      .then(({ data }) => setNumeros((data ?? []) as any));
    supabase.from('feriados').select('dia').then(({ data }) => setFeriados((data ?? []).map((f: any) => String(f.dia))));
  }, []);
  const nome = useCallback((id: string | null) => (id ? numeros.find((n) => n.id === id)?.nome ?? id : '—'), [numeros]);
  /** Pendência com mais de 1 dia útil (decisão de 02/11), no expediente do número. */
  const pendenciaAtrasada = useCallback((onde: string, desde: string, agora = Date.now()) => {
    const exp = numeros.find((n) => n.id === onde)?.expediente ?? EXPEDIENTE_PADRAO;
    return msUteis(exp, { fusoMinutos: -180, feriados }, Date.parse(desde), agora) >= duracaoDoDia(exp);
  }, [numeros, feriados]);
  return { numeros, nome, pendenciaAtrasada };
}

/** Recarrega quando atendimentos ou alertas mudam no banco (tempo real) e a cada minuto. */
export function useAoVivo(recarregar: () => void) {
  useEffect(() => {
    recarregar();
    const canal = supabase.channel('portal-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, () => recarregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, () => recarregar())
      .subscribe();
    const t = setInterval(recarregar, 60_000);
    return () => { clearInterval(t); supabase.removeChannel(canal); };
  }, [recarregar]);
}
