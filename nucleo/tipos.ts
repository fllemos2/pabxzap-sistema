// Tipos do núcleo de regras do PabxZap.
// O núcleo é puro: recebe o estado e um evento, devolve o novo estado e os efeitos (mensagens a enviar, alertas).
// Quem grava no banco e chama a API da Meta é a camada de fora (Edge Function do webhook).

export type NumeroId = string; // 'rec', 's1'...'s7'

export interface Numero {
  id: NumeroId;
  nome: string;
  /** Telefone no formato internacional, só dígitos (ex.: 5521999990000). Usado no link wa.me. */
  telefone: string;
  /** Resposta rápida usada para encaminhar para este número (ex.: '/financeiro'). */
  atalho: string;
}

export interface Config {
  /** Os 8 números, na ordem do menu. O primeiro é a Recepção. */
  numeros: Numero[];
  /** Números em que o contato direto não gera mensagem nem atendimento (decisão de 19/10: RH e Dono). */
  semContatoDireto: NumeroId[];
  /** Números em que qualquer resposta do atendente encerra o atendimento (decisão de 19/10: Dono). */
  encerraAoResponder: NumeroId[];
  /** Tempo sem chegada que dispara o alerta (decisão de 11/09: 15 minutos). */
  alertaMs: number;
  textos: Textos;
}

export interface Textos {
  menu: (numeros: Numero[]) => string;
  menuInvalido: (total: number) => string;
  ficouNaRecepcao: (protocolo: string) => string;
  mensagemCurta: (numero: Numero, protocolo: string) => string;
  link: (destino: Numero, protocolo: string) => string;
  apresentacao: (de: Numero, para: Numero, protocolo: string, assunto: string) => string;
  resgate: (destino: Numero, protocolo: string) => string;
  respostaEncerrar: string;
  respostaPendente: string;
  respostaEncaminhar: (destino: Numero) => string;
}

export type EstadoAtendimento =
  | 'menu'            // cliente escolhendo no menu da Recepção
  | 'recepcao'        // com um atendente da Recepção
  | 'encaminhado'     // a caminho de outro número
  | 'em_atendimento'  // com o atendente do número em que está
  | 'pendente'        // o responsável deixou como pendência
  | 'nao_concluido'   // não chegou em 15 minutos (alerta disparado)
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
  alertado: boolean;
  respondidoEm: number | null;
  encerradoEm: number | null;
  percurso: PassoPercurso[];
}

export interface Estado {
  atendimentos: Atendimento[];
  seqId: number;
  seqProtocolo: number;
}

export type Evento =
  | { tipo: 'cliente_mensagem'; numero: NumeroId; cliente: string; texto: string; t: number }
  | { tipo: 'atendente_mensagem'; numero: NumeroId; cliente: string; texto: string; t: number }
  | { tipo: 'relogio'; t: number }
  | { tipo: 'resgatar'; atendimentoId: number; t: number };

export type Efeito =
  | { tipo: 'enviar_texto'; de: NumeroId; para: string; texto: string }
  | { tipo: 'enviar_menu'; de: NumeroId; para: string; texto: string; opcoes: { n: number; numero: NumeroId; nome: string }[] }
  | { tipo: 'enviar_link'; de: NumeroId; para: string; destino: NumeroId; protocolo: string; texto: string; url: string }
  | { tipo: 'alerta'; para: NumeroId; atendimentoId: number; protocolo: string; destino: NumeroId; cliente: string; assunto: string }
  | { tipo: 'alerta_resolvido'; atendimentoId: number };

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
