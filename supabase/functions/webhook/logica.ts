// Lógica pura do webhook da Meta (ticket wf-pabxzap-20).
// Sem Deno, sem banco e sem rede: tudo aqui roda no Node (testes) e no Deno (Edge Function).

/** Mensagem recebida de um cliente, já extraída do payload da Meta. */
export type MensagemRecebida = {
  phoneNumberId: string; // número da empresa que recebeu (metadata.phone_number_id)
  de: string;            // wa_id do cliente (só dígitos)
  waMessageId: string;   // id da mensagem (wamid...), usado para não processar duas vezes
  tipo: string;          // text, image, interactive...
  texto: string | null;  // texto, legenda ou título da opção escolhida
  nome: string | null;   // nome do perfil do cliente, se veio
  em: Date;              // horário informado pela Meta
};

/**
 * Verificação do webhook (GET). A Meta manda hub.mode=subscribe, hub.verify_token e hub.challenge;
 * se o token bate, devolvemos o challenge. Retorna null quando não deve ser aceito.
 */
export function desafioDaVerificacao(params: URLSearchParams, tokenEsperado: string): string | null {
  if (!tokenEsperado) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  if (params.get('hub.verify_token') !== tokenEsperado) return null;
  return params.get('hub.challenge');
}

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app secret). */
export async function assinaturaValida(corpoCru: string, cabecalho: string | null, appSecret: string): Promise<boolean> {
  if (!cabecalho || !appSecret || !cabecalho.startsWith('sha256=')) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoCru)));
  const esperado = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const recebido = cabecalho.slice('sha256='.length).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

/** Extrai as mensagens de clientes de um payload do objeto whatsapp_business_account. Ignora status e outros campos. */
export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const p = payload as any;
  if (p?.object !== 'whatsapp_business_account') return [];
  const saida: MensagemRecebida[] = [];
  for (const entrada of p.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== 'messages') continue;
      const v = mudanca.value ?? {};
      const phoneNumberId = v.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const nomes = new Map<string, string>();
      for (const c of v.contacts ?? []) if (c.wa_id) nomes.set(c.wa_id, c.profile?.name ?? null);
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        saida.push({
          phoneNumberId,
          de: String(m.from).replace(/\D/g, ''),
          waMessageId: m.id,
          tipo: m.type ?? 'desconhecido',
          texto: textoDa(m),
          nome: nomes.get(m.from) ?? null,
          em: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }
    }
  }
  return saida;
}

function textoDa(m: any): string | null {
  switch (m.type) {
    case 'text': return m.text?.body ?? null;
    case 'interactive':
      return m.interactive?.list_reply?.title ?? m.interactive?.button_reply?.title ?? null;
    case 'button': return m.button?.text ?? null;
    case 'image': case 'video': case 'document': return m[m.type]?.caption ?? null;
    default: return null;
  }
}

/** Resposta fixa da fase de teste (o menu de verdade entra no ticket wf-pabxzap-22). */
export function respostaDeTeste(m: MensagemRecebida): string {
  const trecho = m.texto ? `"${m.texto.length > 60 ? m.texto.slice(0, 57) + '...' : m.texto}"` : `uma mensagem (${m.tipo})`;
  return `PabxZap (teste): recebemos ${trecho}. Esta é uma resposta automática do número de teste.`;
}

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

/** Corpo do POST /{phone-number-id}/messages para um texto simples. */
export function corpoTexto(para: string, texto: string) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: false, body: texto } };
}
