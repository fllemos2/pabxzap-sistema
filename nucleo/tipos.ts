// Tipos do núcleo de regras do PabxZap.
// O núcleo é puro: recebe o estado e um evento, devolve o novo estado e os efeitos (mensagens a enviar, alertas).
// Quem grava no banco e chama a API da Meta é a camada de fora (Edge Function do webhook).

import type { Calendario, Expediente } from './calendario.ts';
export type { Calendario, Expediente } from './calendario.ts';

export type NumeroId = string; // 'rec', 's1'...'s7'

export interface Numero {
  id: NumeroId;
  /** Título da opção no menu (até 24 caracteres na lista do WhatsApp). */
  nome: string;
  /** Descrição curta da opção no menu (até 72 caracteres). */
  descricao: string;
  /** Telefone no formato internacional, só dígitos (ex.: 5521999990000). Usado no link wa.me. */
  telefone: string;
  /** Resposta rápida usada para encaminhar para este número (ex.: '/financeiro'). */
  atalho: string;
  /** Horário de atendimento (decisão de 14/11: o mesmo para todos, mas guardado por número). */
  expediente: Expediente;
}

export interface Config {
  /** Os 8 números, na ordem do menu. O primeiro é a Recepção. */
  numeros: Numero[];
  /** Números em que o contato direto não gera mensagem nem atendimento (decisão de 19/10: RH e Dono). */
  semContatoDireto: NumeroId[];
  /** Números em que qualquer resposta do atendente encerra o atendimento (decisão de 19/10: Dono). */
  encerraAoResponder: NumeroId[];
  /** Tempo útil sem chegada que dispara o alerta no portal (15 minutos, contados só no expediente). */
  alertaMs: number;
  /** Resgates permitidos por atendimento (decisão de 02/11: 2). */
  maxResgates: number;
  /** Depois do último resgate permitido, tempo sem chegada até encerrar como "não concluído" (24 h). */
  naoConcluidoMs: number;
  /** Janela de atendimento da Meta: resgate pelo portal fora dela sai por template. */
  janelaMs: number;
  calendario: Calendario;
  /** Link da política de privacidade do atendimento (ainda não publicado pelo laboratório). */
  linkPolitica: string | null;
  textos: Textos;
}

export interface Textos {
  menu: (numeros: Numero[], linkPolitica: string | null) => string;
  menuInvalido: (total: number) => string;
  ficouNaRecepcao: (protocolo: string) => string;
  mensagemCurta: (numero: Numero, protocolo: string) => string;
  link: (destino: Numero, protocolo: string) => string;
  foraDoHorario: (numero: Numero, protocolo: string, horario: string) => string;
  apresentacao: (de: Numero, para: Numero, protocolo: string, assunto: string) => string;
  resgate: (destino: Numero, protocolo: string) => string;
  respostaEncerrar: string;
  respostaPendente: string;
  respostaEncaminhar: (destino: Numero) => string;
}

export type EstadoAtendimento =
  | 'menu'            // cliente escolhendo no menu da Recepção
  | 'recepcao'        // com um atendente da Recepção
  | 'encaminhado'     // a caminho de outro número (com ou sem alerta)
  | 'em_atendimento'  // com o atendente do número em que está
  | 'pendente'        // o responsável deixou como pendência
  | 'nao_concluido'   // 2 resgates sem chegada; encerrado 24 h depois do último (decisão de 02/11)
  | 'encerrado';

export interface PassoPercurso { t: number; texto: string }

export interface Atendimento {
  id: number;
  protocolo: string | null;
  cliente: string;          // telefone do cliente
  assunto: string;
  entrada: NumeroId;        // número por onde entrou
  estado: EstadoAtendimento;
  onde: NumeroId;           // número em que está (ou para onde está indo)
  origem: NumeroId | null;  // quem encaminhou por último
  criadoEm: number;
  desde: number;
  encaminhadoEm: number | null;
  alertado: boolean;        // alerta de 15 minutos ativo no portal
  resgates: number;
  ultimoResgateEm: number | null;
  ultimaMsgClienteEm: number | null;
  respondidoEm: number | null;
  encerradoEm: number | null;
  percurso: PassoPercurso[];
}

export interface Estado {
  atendimentos: Atendimento[];
  seqId: number;
  /** Sequência do protocolo, que recomeça a cada dia (formato AAAAMMDD-NNNN). */
  seqProtocolo: number;
  diaProtocolo: string;
}

export type CanalResgate = 'app' | 'portal';

export type Evento =
  | { tipo: 'cliente_mensagem'; numero: NumeroId; cliente: string; texto: string; t: number }
  | { tipo: 'atendente_mensagem'; numero: NumeroId; cliente: string; texto: string; t: number }
  | { tipo: 'relogio'; t: number }
  /** Botão "Resgatar" do portal. O resgate pelo app é reconhecido em atendente_mensagem (link reenviado). */
  | { tipo: 'resgatar'; atendimentoId: number; t: number };

export type Efeito =
  | { tipo: 'enviar_texto'; de: NumeroId; para: string; texto: string }
  | { tipo: 'enviar_menu'; de: NumeroId; para: string; texto: string; opcoes: { n: number; numero: NumeroId; nome: string; descricao: string }[] }
  | {
      tipo: 'enviar_link'; de: NumeroId; para: string; destino: NumeroId; protocolo: string; texto: string; url: string;
      /** Só no resgate pelo portal fora da janela de 24 h: tem de sair pelo template de utilidade. */
      porTemplate?: boolean;
    }
  | { tipo: 'alerta'; para: NumeroId; atendimentoId: number; protocolo: string; destino: NumeroId; cliente: string; assunto: string }
  | { tipo: 'alerta_resolvido'; atendimentoId: number }
  | { tipo: 'resgate'; atendimentoId: number; canal: CanalResgate; numero: number; porTemplate: boolean }
  | { tipo: 'nao_concluido'; atendimentoId: number };

export interface Resultado {
  estado: Estado;
  efeitos: Efeito[];
  /** Atendimento afetado pelo evento, se houver. */
  atendimento: Atendimento | null;
}

export interface RespostaRapida {
  atalho: string;
  acao: 'encerrar' | 'pendente' | 'encaminhar';
  destino?: NumeroId;
  texto: string;
}
