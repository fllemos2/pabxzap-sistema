// Configuração do Laboratório João Emídio.
// Telefones: os reais são confidenciais e entram pelo banco (tabela numeros); aqui ficam fictícios, para os testes.
// Textos: PROVISÓRIOS, copiados do protótipo. Os definitivos saem do ticket "Quais são os textos do menu e da
// mensagem curta do contato direto?" (wf-pabxzap-05), com a Daniela.

import type { Config, Numero } from './tipos.ts';

export const NUMEROS_EXEMPLO: Numero[] = [
  { id: 'rec', nome: 'Recepção',        telefone: '5521300000000', atalho: '/recepcao' },
  { id: 's1',  nome: 'Triagem',         telefone: '5521300000001', atalho: '/triagem' },
  { id: 's2',  nome: 'Cad Cam',         telefone: '5521300000002', atalho: '/cadcam' },
  { id: 's3',  nome: 'Previsão',        telefone: '5521300000003', atalho: '/previsao' },
  { id: 's4',  nome: 'Financeiro',      telefone: '5521300000004', atalho: '/financeiro' },
  { id: 's5',  nome: 'RH',              telefone: '5521300000005', atalho: '/rh' },
  { id: 's6',  nome: 'SAC',             telefone: '5521300000006', atalho: '/sac' },
  { id: 's7',  nome: 'Fale com o Dono', telefone: '5521300000007', atalho: '/dono' },
];

const rotulo = (n: Numero) => n.id === 'rec' ? 'a Recepção' : n.id === 's7' ? 'o Dono' : 'o setor ' + n.nome;

export function configLaboratorio(numeros: Numero[] = NUMEROS_EXEMPLO): Config {
  return {
    numeros,
    semContatoDireto: ['s5', 's7'],
    encerraAoResponder: ['s7'],
    alertaMs: 15 * 60 * 1000,
    textos: {
      menu: ns => 'Olá! Você está na central de atendimento do Laboratório João Emídio. Para agilizar, escolha uma opção:\n' +
        ns.map((n, i) => (i + 1) + ' · ' + n.nome).join('\n') +
        '\n\nAo continuar, você concorda com a nossa política de privacidade.',
      menuInvalido: total => 'Não entendi. Responda com o número da opção (1 a ' + total + ').',
      ficouNaRecepcao: p => 'Certo! Um atendente da recepção vai falar com você por aqui. Protocolo ' + p + '.',
      mensagemCurta: (n, p) => 'Olá! Recebemos sua mensagem no setor ' + n.nome + '. Seu protocolo é ' + p + '. Já vamos te responder por aqui.',
      link: (d, p) => 'Protocolo ' + p + '. Toque abaixo para falar com ' + rotulo(d) + ' — sua mensagem já vai pronta.',
      apresentacao: (de, para, p, assunto) => 'Olá, ' + para.nome + '! Vim encaminhado(a) de: ' + de.nome + '. Protocolo ' + p + '. Assunto: ' + assunto,
      resgate: (d, p) => 'Oi! Vimos que você ainda não conseguiu falar com ' + rotulo(d) + '. Toque abaixo para continuar — sua mensagem já vai pronta. Protocolo ' + p + '.',
      respostaEncerrar: 'Seu atendimento foi encerrado. Obrigado pelo contato! ✅',
      respostaPendente: 'Seu atendimento ficou pendente. Vamos retornar por aqui assim que possível. ⏳',
      respostaEncaminhar: d => 'Vou te encaminhar para ' + rotulo(d) + '. O link chega logo abaixo. ↪',
    },
  };
}
