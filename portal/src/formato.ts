// Formatação no horário de Brasília, independente do relógio do computador.
const FUSO = 'America/Sao_Paulo';

export const dataHora = (iso: string | number | null) => iso === null ? '—'
  : new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const hora = (iso: string | number) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const dataCurta = (dia: string) => {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
};

/** "há 5 min", "há 2 h", "há 3 dias". */
export function ha(iso: string, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dia${h >= 36 ? 's' : ''}`;
}

/** +55 21 91234-5678 */
export function telefone(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const local = d.slice(4);
    return `+55 ${d.slice(2, 4)} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
  }
  return '+' + d;
}

/** Início do dia (Brasília) de uma data 'AAAA-MM-DD', como ISO em UTC. */
export const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString();
export const hojeBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const ESTADOS: Record<string, { rotulo: string; classe: string }> = {
  menu:           { rotulo: 'No menu',          classe: 'neutro' },
  recepcao:       { rotulo: 'Na Recepção',      classe: 'info' },
  encaminhado:    { rotulo: 'A caminho',        classe: 'aviso' },
  em_atendimento: { rotulo: 'Em atendimento',   classe: 'ok' },
  pendente:       { rotulo: 'Pendente',         classe: 'pendente' },
  nao_concluido:  { rotulo: 'Não concluído',    classe: 'erro' },
  encerrado:      { rotulo: 'Encerrado',        classe: 'neutro' },
};
