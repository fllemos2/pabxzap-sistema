// Lógica pura do webhook da Meta (tickets wf-pabxzap-20 e 22).
// Sem Deno, sem banco e sem rede: tudo aqui roda no Node (testes) e no Deno (Edge Function).

/** Mensagem recebida de um cliente, já extraída do payload da Meta. */
export type MensagemRecebida = {
  phoneNumberId: string; // número da empresa que recebeu (metadata.phone_number_id)
  de: string;            // wa_id do cliente (só dígitos)
  waMessageId: string;   // id da mensagem (wamid...), usado para não processar duas vezes
  tipo: string;          // text, image, interactive...
  texto: string | null;  // texto, legenda, título do botão ou número da opção escolhida no menu
  nome: string | null;   // nome do perfil do cliente, se veio
  em: Date;              // horário informado pela Meta
};

/** Mensagem enviada por um atendente pelo app do WhatsApp Business (coexistência: smb_message_echoes). */
export type EcoDoApp = {
  phoneNumberId: string;
  para: string;          // cliente
  waMessageId: string;
  texto: string | null;
  em: Date;
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

const so = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const quando = (ts: unknown) => (ts ? new Date(Number(ts) * 1000) : new Date());

function mudancas(payload: unknown, campo: string): any[] {
  const p = payload as any;
  if (p?.object !== 'whatsapp_business_account') return [];
  const saida: any[] = [];
  for (const entrada of p.entry ?? []) for (const m of entrada.changes ?? []) if (m.field === campo && m.value) saida.push(m.value);
  return saida;
}

/** Extrai as mensagens de clientes (campo messages). Ignora status e outros campos. */
export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const saida: MensagemRecebida[] = [];
  for (const v of mudancas(payload, 'messages')) {
    const phoneNumberId = v.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const nomes = new Map<string, string>();
    for (const c of v.contacts ?? []) if (c.wa_id) nomes.set(c.wa_id, c.profile?.name ?? null);
    for (const m of v.messages ?? []) {
      if (!m.id || !m.from) continue;
      saida.push({
        phoneNumberId, de: so(m.from), waMessageId: m.id, tipo: m.type ?? 'desconhecido',
        texto: textoDa(m), nome: nomes.get(m.from) ?? null, em: quando(m.timestamp),
      });
    }
  }
  return saida;
}

/** Extrai as mensagens enviadas pelo app do WhatsApp Business (campo smb_message_echoes, só em coexistência). */
export function extrairEcos(payload: unknown): EcoDoApp[] {
  const saida: EcoDoApp[] = [];
  for (const v of mudancas(payload, 'smb_message_echoes')) {
    const phoneNumberId = v.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    for (const m of v.message_echoes ?? []) {
      if (!m.id || !m.to) continue;
      saida.push({ phoneNumberId, para: so(m.to), waMessageId: m.id, texto: textoDa(m), em: quando(m.timestamp) });
    }
  }
  return saida;
}

function textoDa(m: any): string | null {
  switch (m.type) {
    case 'text': return m.text?.body ?? null;
    case 'interactive': {
      // Opção do menu: o id da linha é "opcao-N"; o núcleo espera o número N.
      const id: string | undefined = m.interactive?.list_reply?.id;
      const n = id?.match(/^opcao-(\d+)$/)?.[1];
      if (n) return n;
      return m.interactive?.list_reply?.title ?? m.interactive?.button_reply?.title ?? null;
    }
    case 'button': return m.button?.text ?? null;
    case 'image': case 'video': case 'document': return m[m.type]?.caption ?? null;
    default: return null;
  }
}
