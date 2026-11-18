// Calendário do atendimento: expediente de cada número, feriados e tempo útil.
// Decisão: wiki/decisoes/2026-11-14-horario-padrao-dos-setores (seg a sex, 8h às 18h, para todos; feriados cadastrados no portal).
// O horário é o de Brasília. O Brasil não tem horário de verão desde 2019, então o fuso é um deslocamento fixo.

export interface Expediente {
  /** Dias da semana com atendimento: 0 = domingo ... 6 = sábado. */
  dias: number[];
  /** Início e fim no horário local, 'HH:MM'. */
  inicio: string;
  fim: string;
}

export interface Calendario {
  /** Deslocamento do horário local em relação ao UTC, em minutos (Brasília: -180). */
  fusoMinutos: number;
  /** Feriados, 'AAAA-MM-DD' no horário local. */
  feriados: string[];
}

export const EXPEDIENTE_PADRAO: Expediente = { dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' };

const DIA = 24 * 60 * 60 * 1000;
const minutosDe = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Data local 'AAAA-MM-DD' de um instante. */
export function diaLocal(t: number, cal: Calendario): string {
  return new Date(t + cal.fusoMinutos * 60_000).toISOString().slice(0, 10);
}

function eDiaUtil(exp: Expediente, cal: Calendario, inicioDoDia: number): boolean {
  const local = new Date(inicioDoDia + cal.fusoMinutos * 60_000);
  return exp.dias.includes(local.getUTCDay()) && !cal.feriados.includes(local.toISOString().slice(0, 10));
}

/** Instante (UTC) em que começa o dia local que contém t. */
function inicioDoDiaLocal(t: number, cal: Calendario): number {
  const off = cal.fusoMinutos * 60_000;
  return Math.floor((t + off) / DIA) * DIA - off;
}

export function dentroDoExpediente(exp: Expediente, cal: Calendario, t: number): boolean {
  const d = inicioDoDiaLocal(t, cal);
  if (!eDiaUtil(exp, cal, d)) return false;
  return t >= d + minutosDe(exp.inicio) * 60_000 && t < d + minutosDe(exp.fim) * 60_000;
}

/** Tempo, em ms, entre `de` e `ate` que cai dentro do expediente (o alerta de 15 minutos conta só esse tempo). */
export function msUteis(exp: Expediente, cal: Calendario, de: number, ate: number): number {
  if (ate <= de) return 0;
  let total = 0;
  let d = inicioDoDiaLocal(de, cal);
  for (let i = 0; d < ate && i < 800; i++, d += DIA) {
    if (!eDiaUtil(exp, cal, d)) continue;
    const ini = d + minutosDe(exp.inicio) * 60_000;
    const fim = d + minutosDe(exp.fim) * 60_000;
    total += Math.max(0, Math.min(fim, ate) - Math.max(ini, de));
  }
  return total;
}

/** Duração de um dia útil, em ms (para "pendência com mais de 1 dia útil"). */
export function duracaoDoDia(exp: Expediente): number {
  return (minutosDe(exp.fim) - minutosDe(exp.inicio)) * 60_000;
}

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const hora = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };

/** Texto do horário para o cliente, por exemplo "segunda a sexta, das 8h às 18h". */
export function textoDoExpediente(exp: Expediente): string {
  const dias = [...exp.dias].sort((a, b) => a - b);
  const seguidos = dias.length > 1 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const quando = seguidos
    ? `${NOMES_DIAS[dias[0]]} a ${NOMES_DIAS[dias[dias.length - 1]]}`
    : dias.map((d) => NOMES_DIAS[d]).join(', ');
  return `${quando}, das ${hora(exp.inicio)} às ${hora(exp.fim)}`;
}
