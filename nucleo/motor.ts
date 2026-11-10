// Núcleo de regras do PabxZap, portado de prototipo/motor.js (vault 53-PabxZap).
// Regras e onde estão decididas (wiki do vault):
//   fluxo, menu e encaminhamento ...... conceitos/central-de-distribuicao, decisoes/2026-10-19-menu-completo-sem-filtro
//   contato direto ..................... decisoes/2026-09-11-contato-direto
//   RH e Dono .......................... decisoes/2026-10-19-regras-rh-e-dono
//   responsável ........................ conceitos/responsavel-pelo-atendimento
//   respostas rápidas .................. conceitos/respostas-rapidas
//   chegada, alerta de 15 min, desfecho  decisoes/2026-09-11-regras-de-resolucao-e-alerta
// Diferença para o protótipo: encerrar não apaga o atendimento; ele fica 'encerrado' e a retenção
// (15 dias, decisoes/2026-09-12-retencao-do-historico-no-produto) é aplicada pelo banco.

import type {
  Atendimento, Config, Efeito, Estado, Evento, Numero, NumeroId, RespostaRapida, Resultado,
} from './tipos.ts';

const A_CAMINHO = ['encaminhado', 'nao_concluido'];
const COM_ATENDENTE = ['recepcao', 'em_atendimento', 'pendente'];

export function estadoInicial(): Estado {
  return { atendimentos: [], seqId: 0, seqProtocolo: 0 };
}

export function recepcao(cfg: Config): Numero { return cfg.numeros[0]; }

export function numero(cfg: Config, id: NumeroId): Numero {
  const n = cfg.numeros.find(x => x.id === id);
  if (!n) throw new Error('número desconhecido: ' + id);
  return n;
}

/** O primeiro número contactado é o responsável; a responsabilidade só passa quando o cliente chega. */
export function responsavel(a: Atendimento): NumeroId {
  return A_CAMINHO.includes(a.estado) && a.origem ? a.origem : a.onde;
}

export function abertos(e: Estado, cliente: string): Atendimento[] {
  return e.atendimentos.filter(a => a.cliente === cliente && a.estado !== 'encerrado');
}

/** Respostas rápidas cadastradas no WhatsApp Business de cada número. O Dono não usa. */
export function respostasRapidas(cfg: Config, id: NumeroId): RespostaRapida[] {
  if (cfg.encerraAoResponder.includes(id)) return [];
  const t = cfg.textos;
  return [
    { atalho: '/encerrar', acao: 'encerrar' as const, texto: t.respostaEncerrar },
    { atalho: '/pendente', acao: 'pendente' as const, texto: t.respostaPendente },
    ...cfg.numeros.filter(n => n.id !== id).map(n => ({
      atalho: n.atalho, acao: 'encaminhar' as const, destino: n.id, texto: t.respostaEncaminhar(n),
    })),
  ];
}

export function linkWhatsApp(destino: Numero, texto: string): string {
  return 'https://wa.me/' + destino.telefone + '?text=' + encodeURIComponent(texto);
}

function ultimo<T>(l: T[]): T | null { return l.length ? l[l.length - 1] : null; }
function minutos(ms: number): number { return Math.max(0, Math.round(ms / 60000)); }

/** Processa um evento. Não altera o estado recebido. */
export function processar(cfg: Config, estadoAtual: Estado, ev: Evento): Resultado {
  const e: Estado = structuredClone(estadoAtual);
  const efeitos: Efeito[] = [];
  const t = ev.t;

  const nome = (id: NumeroId) => numero(cfg, id).nome;
  const rec = recepcao(cfg).id;

  function protocolo(): string {
    e.seqProtocolo += 1;
    const d = new Date(t);
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'PZ-' + mmdd + '-' + String(e.seqProtocolo).padStart(4, '0');
  }

  function novo(cliente: string, assunto: string, entrada: NumeroId): Atendimento {
    const a: Atendimento = {
      id: ++e.seqId, protocolo: null, cliente, assunto, entrada, estado: 'menu', onde: entrada, origem: null,
      criadoEm: t, desde: t, encaminhadoEm: null, alertado: false, respondidoEm: null, encerradoEm: null, percurso: [],
    };
    e.atendimentos.push(a);
    return a;
  }

  function encaminhar(a: Atendimento, de: NumeroId, para: NumeroId, textoLink: string) {
    a.origem = de; a.onde = para; a.estado = 'encaminhado'; a.encaminhadoEm = t; a.desde = t;
    a.percurso.push({ t, texto: nome(de) + ' → ' + nome(para) });
    const destino = numero(cfg, para);
    const pronto = cfg.textos.apresentacao(numero(cfg, de), destino, a.protocolo!, a.assunto);
    efeitos.push({ tipo: 'enviar_link', de, para: a.cliente, destino: para, protocolo: a.protocolo!, texto: textoLink, url: linkWhatsApp(destino, pronto) });
  }

  function encerrar(a: Atendimento, por: NumeroId) {
    a.estado = 'encerrado'; a.encerradoEm = t; a.desde = t;
    a.percurso.push({ t, texto: 'Encerrado por ' + nome(por) });
  }

  if (ev.tipo === 'cliente_mensagem') {
    const texto = ev.texto.trim();
    if (!texto) return { estado: e, efeitos, atendimento: null };
    const lista = abertos(e, ev.cliente);

    // 1. Chegada: o cliente estava a caminho deste número.
    const chegando = ultimo(lista.filter(a => a.onde === ev.numero && A_CAMINHO.includes(a.estado)));
    if (chegando) {
      const espera = t - (chegando.encaminhadoEm ?? t);
      chegando.estado = chegando.onde === rec ? 'recepcao' : 'em_atendimento';
      chegando.desde = t;
      chegando.percurso.push({ t, texto: 'Chegou em ' + nome(chegando.onde) + ' (' + minutos(espera) + ' min)' });
      if (chegando.alertado) { chegando.alertado = false; efeitos.push({ tipo: 'alerta_resolvido', atendimentoId: chegando.id }); }
      return { estado: e, efeitos, atendimento: chegando };
    }

    // 2. Conversa em andamento com o responsável.
    const atual = ultimo(lista.filter(a => responsavel(a) === ev.numero));
    if (atual) {
      if (atual.estado === 'menu') {
        const n = /^\d+$/.test(texto) ? parseInt(texto, 10) : NaN;
        if (n >= 1 && n <= cfg.numeros.length) {
          atual.protocolo = protocolo();
          if (n === 1) {
            atual.estado = 'recepcao'; atual.desde = t;
            atual.percurso.push({ t, texto: 'Ficou com a Recepção' });
            efeitos.push({ tipo: 'enviar_texto', de: rec, para: ev.cliente, texto: cfg.textos.ficouNaRecepcao(atual.protocolo) });
          } else {
            const destino = cfg.numeros[n - 1];
            encaminhar(atual, rec, destino.id, cfg.textos.link(destino, atual.protocolo));
          }
        } else {
          efeitos.push({ tipo: 'enviar_texto', de: rec, para: ev.cliente, texto: cfg.textos.menuInvalido(cfg.numeros.length) });
        }
      }
      return { estado: e, efeitos, atendimento: atual };
    }

    // 3. Novo atendimento.
    if (cfg.semContatoDireto.includes(ev.numero)) return { estado: e, efeitos, atendimento: null };   // RH e Dono
    if (ev.numero === rec) {
      const a = novo(ev.cliente, texto, rec);
      a.percurso.push({ t, texto: 'Entrou pela Recepção' });
      efeitos.push({
        tipo: 'enviar_menu', de: rec, para: ev.cliente, texto: cfg.textos.menu(cfg.numeros),
        opcoes: cfg.numeros.map((x, i) => ({ n: i + 1, numero: x.id, nome: x.nome })),
      });
      return { estado: e, efeitos, atendimento: a };
    }
    const a = novo(ev.cliente, texto, ev.numero);
    a.protocolo = protocolo();
    a.estado = 'em_atendimento';
    a.percurso.push({ t, texto: 'Contato direto em ' + nome(ev.numero) });
    efeitos.push({ tipo: 'enviar_texto', de: ev.numero, para: ev.cliente, texto: cfg.textos.mensagemCurta(numero(cfg, ev.numero), a.protocolo) });
    return { estado: e, efeitos, atendimento: a };
  }

  if (ev.tipo === 'atendente_mensagem') {
    const texto = ev.texto.trim();
    const a = ultimo(abertos(e, ev.cliente).filter(x => x.onde === ev.numero && COM_ATENDENTE.includes(x.estado)));
    if (!a || !texto) return { estado: e, efeitos, atendimento: null };
    if (a.respondidoEm === null && a.estado !== 'pendente') {
      a.respondidoEm = t;
      a.percurso.push({ t, texto: nome(ev.numero) + ' respondeu' });
    }
    if (cfg.encerraAoResponder.includes(ev.numero)) { encerrar(a, ev.numero); return { estado: e, efeitos, atendimento: a }; }
    const rr = respostasRapidas(cfg, ev.numero).find(r => r.texto === texto);
    if (!rr) return { estado: e, efeitos, atendimento: a };
    if (rr.acao === 'encerrar') encerrar(a, ev.numero);
    else if (rr.acao === 'pendente') {
      a.estado = 'pendente'; a.desde = t;
      a.percurso.push({ t, texto: nome(ev.numero) + ' deixou como pendência' });
    } else {
      if (!a.protocolo) a.protocolo = protocolo();
      encaminhar(a, ev.numero, rr.destino!, cfg.textos.link(numero(cfg, rr.destino!), a.protocolo));
    }
    return { estado: e, efeitos, atendimento: a };
  }

  if (ev.tipo === 'relogio') {
    for (const a of e.atendimentos) {
      if (a.estado === 'encaminhado' && a.encaminhadoEm !== null && t - a.encaminhadoEm >= cfg.alertaMs) {
        a.estado = 'nao_concluido'; a.desde = t; a.alertado = true;
        a.percurso.push({ t, texto: 'Não chegou em ' + nome(a.onde) + ' — alerta para ' + nome(a.origem!) });
        efeitos.push({ tipo: 'alerta', para: a.origem!, atendimentoId: a.id, protocolo: a.protocolo!, destino: a.onde, cliente: a.cliente, assunto: a.assunto });
      }
    }
    return { estado: e, efeitos, atendimento: null };
  }

  // resgatar: o responsável reenvia o link ao cliente que não chegou.
  const a = e.atendimentos.find(x => x.id === ev.atendimentoId);
  if (!a || a.estado !== 'nao_concluido' || !a.origem) return { estado: e, efeitos, atendimento: null };
  a.estado = 'encaminhado'; a.encaminhadoEm = t; a.desde = t;
  a.percurso.push({ t, texto: 'Resgate: ' + nome(a.origem) + ' reenviou o link' });
  const destino = numero(cfg, a.onde);
  const pronto = cfg.textos.apresentacao(numero(cfg, a.origem), destino, a.protocolo!, a.assunto);
  efeitos.push({ tipo: 'enviar_link', de: a.origem, para: a.cliente, destino: a.onde, protocolo: a.protocolo!, texto: cfg.textos.resgate(destino, a.protocolo!), url: linkWhatsApp(destino, pronto) });
  return { estado: e, efeitos, atendimento: a };
}
