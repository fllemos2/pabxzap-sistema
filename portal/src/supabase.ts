import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ---- tipos das linhas do banco usados no portal ----
export interface Numero { id: string; ordem: number; nome: string; telefone: string; phone_number_id: string | null }
export interface Passo { t: number; texto: string }
export interface Atendimento {
  id: number; protocolo: string | null; cliente: string; assunto: string; entrada: string; estado: string; onde: string;
  origem: string | null; criado_em: string; desde: string; encaminhado_em: string | null; alertado: boolean; resgates: number;
  ultimo_resgate_em: string | null; ultima_msg_cliente_em: string | null; encerrado_em: string | null; percurso: Passo[];
}
export interface Alerta { id: number; atendimento_id: number; para: string; destino: string; estado: string; criado_em: string; atendimentos: Atendimento | null }
export interface Mensagem { id: number; numero_id: string; cliente: string; origem: string; texto: string | null; criado_em: string }
export interface Feriado { dia: string; descricao: string | null }
export interface Exclusao { id: number; final: string; atendimentos: number; mensagens: number; criado_em: string }
export interface Indicadores { volume: number; contatos_diretos: number; encerrados: number; alertas: number; nao_concluidos: number; resgates: number }
