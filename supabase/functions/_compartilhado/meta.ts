// Envio de mensagens pela WhatsApp Cloud API. A interface Enviador permite testar o fluxo sem rede.

export interface OpcaoMenu { n: number; nome: string; descricao: string }

export interface Enviador {
  texto(phoneNumberId: string, para: string, corpo: string): Promise<string | null>;
  /** Menu como lista interativa; se o texto passar do limite, vai como texto simples. */
  menu(phoneNumberId: string, para: string, corpo: string, opcoes: OpcaoMenu[]): Promise<string | null>;
  /** Link com botão; se a Meta recusar o botão, vai como texto com o link no fim. */
  link(phoneNumberId: string, para: string, corpo: string, url: string): Promise<string | null>;
  /** Template de utilidade do resgate fora da janela de 24 h. */
  templateResgate(phoneNumberId: string, para: string, protocolo: string, setor: string): Promise<string | null>;
}

/** Id da linha da lista para a opção n; o webhook converte de volta para o número que o núcleo espera. */
export const idOpcao = (n: number) => `opcao-${n}`;
export const LIMITE_CORPO_INTERATIVO = 1024;
export const TEMPLATE_RESGATE = 'pabxzap_resgate';

/**
 * Celulares do Brasil às vezes chegam no webhook sem o 9 depois do DDD (55 + DDD + 8 dígitos).
 * Devolve a forma com o 9, para tentar de novo quando o envio for recusado; ou null se não se aplica.
 */
export function comNonoDigito(waId: string): string | null {
  const d = waId.replace(/\D/g, '');
  if (d.length !== 12 || !d.startsWith('55')) return null;
  const local = d.slice(4);
  if (!/^[6-9]/.test(local)) return null; // fixo não ganha o 9
  return d.slice(0, 4) + '9' + local;
}

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function corpoTexto(para: string, texto: string) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: false, body: texto } };
}

export function corpoMenu(para: string, corpo: string, opcoes: OpcaoMenu[]) {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: corpo },
      action: {
        button: 'Ver opções',
        sections: [{ title: 'Setores', rows: opcoes.map((o) => ({ id: idOpcao(o.n), title: corta(o.nome, 24), description: corta(o.descricao, 72) })) }],
      },
    },
  };
}

export function corpoLink(para: string, corpo: string, url: string) {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'interactive',
    interactive: { type: 'cta_url', body: { text: corpo }, action: { name: 'cta_url', parameters: { display_text: 'Continuar', url } } },
  };
}

export function corpoTemplateResgate(para: string, protocolo: string, setor: string) {
  return {
    messaging_product: 'whatsapp', to: para, type: 'template',
    template: { name: TEMPLATE_RESGATE, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: protocolo }, { type: 'text', text: setor }] }] },
  };
}

const log = (...a: unknown[]) => console.log('[meta]', ...a);

export function enviadorGraph(accessToken: string, versao = 'v23.0', f: typeof fetch = fetch): Enviador {
  const base = `https://graph.facebook.com/${versao}`;

  /** Envia; se recusar um celular do Brasil sem o 9, tenta com o 9. Lança erro se falhar. */
  async function enviar(phoneNumberId: string, para: string, montar: (p: string) => unknown): Promise<string | null> {
    const tentar = async (destino: string) => {
      const r = await f(`${base}/${phoneNumberId}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(montar(destino)),
      });
      return { r, d: await r.json().catch(() => ({})) as any };
    };
    let { r, d } = await tentar(para);
    const alt = comNonoDigito(para);
    if (!r.ok && alt) { log(`envio recusado (${d?.error?.code ?? r.status}); tentando com o nono dígito`); ({ r, d } = await tentar(alt)); }
    if (!r.ok) throw new Error(`envio falhou: ${d?.error?.code ?? r.status} ${d?.error?.message ?? ''}`);
    return d?.messages?.[0]?.id ?? null;
  }

  return {
    texto: (pn, para, corpo) => enviar(pn, para, (p) => corpoTexto(p, corpo)),
    menu: (pn, para, corpo, opcoes) => corpo.length > LIMITE_CORPO_INTERATIVO
      ? enviar(pn, para, (p) => corpoTexto(p, corpo))
      : enviar(pn, para, (p) => corpoMenu(p, corpo, opcoes)),
    link: async (pn, para, corpo, url) => {
      try {
        return await enviar(pn, para, (p) => corpoLink(p, corpo, url));
      } catch (e) {
        log(`botão recusado (${(e as Error).message}); enviando o link como texto`);
        return enviar(pn, para, (p) => corpoTexto(p, `${corpo}\n\n${url}`));
      }
    },
    templateResgate: (pn, para, protocolo, setor) => enviar(pn, para, (p) => corpoTemplateResgate(p, protocolo, setor)),
  };
}
