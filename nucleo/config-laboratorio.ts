// Configuração do Laboratório João Emídio.
// Telefones: os reais são confidenciais e entram pelo banco (tabela numeros); aqui ficam fictícios, para os testes.
// Textos do menu, da confirmação, do encaminhamento e de fora do horário: documento da Daniela
// (wiki/fontes/fonte-textos-atendimento-automatico), com a opção 8 reduzida por decisão de 14/11.
// Textos ainda PROVISÓRIOS (do protótipo): opção inválida, ficou na Recepção, apresentação, resgate e respostas rápidas.

import { EXPEDIENTE_PADRAO } from './calendario.ts';
import type { Config, Numero } from './tipos.ts';

const exp = EXPEDIENTE_PADRAO;

export const NUMEROS_EXEMPLO: Numero[] = [
  { id: 'rec', nome: 'Recepção',         telefone: '5521300000000', atalho: '/recepcao',   expediente: exp, descricao: 'Informações gerais, atendimento e agendamentos.' },
  { id: 's1',  nome: 'Triagem',          telefone: '5521300000001', atalho: '/triagem',    expediente: exp, descricao: 'Dúvidas técnicas e planejamento de trabalhos.' },
  { id: 's2',  nome: 'CAD/CAM',          telefone: '5521300000002', atalho: '/cadcam',     expediente: exp, descricao: 'Escaneamentos, arquivos digitais e serviços digitais.' },
  { id: 's3',  nome: 'Previsão e Saída', telefone: '5521300000003', atalho: '/previsao',   expediente: exp, descricao: 'Prazos, andamento e previsão de entrega dos trabalhos.' },
  { id: 's4',  nome: 'Financeiro',       telefone: '5521300000004', atalho: '/financeiro', expediente: exp, descricao: 'Boletos, pagamentos, cobranças e assuntos financeiros.' },
  { id: 's5',  nome: 'RH',               telefone: '5521300000005', atalho: '/rh',         expediente: exp, descricao: 'Assuntos relacionados a Recursos Humanos.' },
  { id: 's6',  nome: 'SAC',              telefone: '5521300000006', atalho: '/sac',        expediente: exp, descricao: 'Reclamações, ocorrências e acompanhamento de solicitações.' },
  { id: 's7',  nome: 'Fale com o Dono',  telefone: '5521300000007', atalho: '/dono',       expediente: exp, descricao: 'Contato para assuntos que exigem atendimento direto com João Emídio.' },
];

const rotulo = (n: Numero) => n.id === 'rec' ? 'a Recepção' : n.id === 's7' ? 'o Dono' : 'o setor ' + n.nome;
// "o setor de Fale com o Dono" não soa bem; a opção 8 vira o nome da pessoa (a confirmar com a Daniela).
const setorDe = (n: Numero) => n.id === 's7' ? 'João Emídio (Fale com o Dono)' : 'o setor de ' + n.nome;

export function configLaboratorio(numeros: Numero[] = NUMEROS_EXEMPLO, feriados: string[] = []): Config {
  return {
    numeros,
    semContatoDireto: ['s5', 's7'],
    encerraAoResponder: ['s7'],
    alertaMs: 15 * 60 * 1000,
    maxResgates: 2,
    naoConcluidoMs: 24 * 60 * 60 * 1000,
    janelaMs: 24 * 60 * 60 * 1000,
    calendario: { fusoMinutos: -180, feriados },
    linkPolitica: null, // ticket wf-pabxzap-05: o laboratório ainda não publicou
    textos: {
      menu: (ns, link) => 'Olá! Seja bem-vindo(a) ao atendimento do Laboratório João Emídio!\n' +
        'Para direcionar sua solicitação, escolha uma das opções abaixo:\n' +
        ns.map((n, i) => `${i + 1}. ${n.nome} – ${n.descricao}`).join('\n') +
        '\nAo prosseguir, você declara estar ciente da nossa Política de Privacidade' + (link ? ': ' + link : '') + '.\n' +
        'Laboratório João Emídio agradece seu contato!',
      menuInvalido: total => 'Não entendi. Responda com o número da opção (1 a ' + total + ').',
      ficouNaRecepcao: p => 'Certo! Um atendente da recepção vai falar com você por aqui. Protocolo ' + p + '.',
      mensagemCurta: (n, p) => `Olá! Recebemos sua mensagem pelo setor de ${n.nome}. Seu protocolo de atendimento é ${p}. ` +
        'Nossa equipe já recebeu sua solicitação e retornará assim que possível. Agradecemos seu contato!',
      link: (d, p) => `Seu atendimento está sendo direcionado para ${setorDe(d)}. Protocolo: ${p}. ` +
        'Clique no botão abaixo para continuar o atendimento. Sua solicitação será encaminhada junto com a transferência.',
      foraDoHorario: (_n, p, h) => 'Olá! Agradecemos seu contato com o Laboratório João Emídio. No momento, nosso atendimento está fora do horário de funcionamento. ' +
        `Seu protocolo ${p} foi registrado e nossa equipe dará continuidade à sua solicitação no próximo dia útil, dentro do horário de atendimento do setor. ` +
        `Horário de funcionamento: ${h}. Agradecemos a compreensão!`,
      apresentacao: (de, para, p, assunto) => 'Olá, ' + para.nome + '! Vim encaminhado(a) de: ' + de.nome + '. Protocolo ' + p + '. Assunto: ' + assunto,
      resgate: (d, p) => 'Oi! Vimos que você ainda não conseguiu falar com ' + rotulo(d) + '. Toque abaixo para continuar — sua mensagem já vai pronta. Protocolo ' + p + '.',
      respostaEncerrar: 'Seu atendimento foi encerrado. Obrigado pelo contato! ✅',
      respostaPendente: 'Seu atendimento ficou pendente. Vamos retornar por aqui assim que possível. ⏳',
      respostaEncaminhar: d => 'Vou te encaminhar para ' + rotulo(d) + '. O link chega logo abaixo. ↪',
    },
  };
}
