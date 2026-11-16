// Liga a lógica do webhook ao banco (PostgREST do Supabase) e à Graph API.
// Recebe as chaves e o fetch de fora, para o fluxo inteiro poder ser testado no Node sem rede.

import {
  assinaturaValida, comNonoDigito, corpoTexto, desafioDaVerificacao, extrairMensagens, respostaDeTeste,
  type MensagemRecebida,
} from './logica.ts';

export type Config = {
  verifyToken: string;   // META_WEBHOOK_VERIFY_TOKEN
  appSecret: string;     // META_APP_SECRET
  accessToken: string;   // token da Graph API para responder
  supabaseUrl: string;   // SUPABASE_URL
  dbKey: string;         // chave secret do Supabase (ignora RLS)
  graphVersao?: string;
  responder?: boolean;   // fase de teste: responde com texto fixo
};

type Fetch = typeof fetch;
const log = (...a: unknown[]) => console.log('[webhook]', ...a);

export function criarHandler(cfg: Config, f: Fetch = fetch) {
  const graph = `https://graph.facebook.com/${cfg.graphVersao ?? 'v23.0'}`;
  const rest = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const cabDb = { apikey: cfg.dbKey, 'Content-Type': 'application/json' };

  async function numeroPorPhoneId(phoneNumberId: string): Promise<string | null> {
    const r = await f(`${rest}/numeros?select=id&phone_number_id=eq.${encodeURIComponent(phoneNumberId)}`, { headers: cabDb });
    if (!r.ok) throw new Error(`numeros: HTTP ${r.status}`);
    const linhas = await r.json();
    return linhas[0]?.id ?? null;
  }

  /** Grava a mensagem; devolve false se ela já tinha sido gravada (webhook repetido). */
  async function gravar(numeroId: string, cliente: string, origem: 'cliente' | 'sistema', texto: string | null, waMessageId: string | null): Promise<boolean> {
    const r = await f(`${rest}/mensagens?on_conflict=wa_message_id`, {
      method: 'POST',
      headers: { ...cabDb, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ numero_id: numeroId, cliente, origem, texto, wa_message_id: waMessageId }),
    });
    if (!r.ok) throw new Error(`mensagens: HTTP ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    return Array.isArray(linhas) && linhas.length > 0;
  }

  async function enviar(phoneNumberId: string, para: string, texto: string): Promise<{ ok: boolean; id?: string; para: string; erro?: string }> {
    const tentar = async (destino: string) => {
      const r = await f(`${graph}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoTexto(destino, texto)),
      });
      const d = await r.json().catch(() => ({}));
      return { r, d };
    };
    let { r, d } = await tentar(para);
    let destino = para;
    // Número de teste: o destinatário cadastrado costuma ter o 9; o webhook pode trazer sem.
    const alternativo = comNonoDigito(para);
    if (!r.ok && alternativo) {
      log(`envio recusado (${d?.error?.code ?? r.status}); tentando com o nono dígito`);
      ({ r, d } = await tentar(alternativo));
      destino = alternativo;
    }
    if (!r.ok) return { ok: false, para: destino, erro: `${d?.error?.code ?? r.status}: ${d?.error?.message ?? 'erro'}` };
    return { ok: true, id: d?.messages?.[0]?.id, para: destino };
  }

  async function tratar(m: MensagemRecebida) {
    const numeroId = await numeroPorPhoneId(m.phoneNumberId);
    if (!numeroId) {
      log(`phone_number_id ${m.phoneNumberId} não está em numeros; mensagem ignorada`);
      return;
    }
    const nova = await gravar(numeroId, m.de, 'cliente', m.texto, m.waMessageId);
    if (!nova) {
      log(`mensagem repetida ignorada`);
      return;
    }
    log(`mensagem gravada (${m.tipo}) no número ${numeroId}`);
    if (!cfg.responder) return;
    const texto = respostaDeTeste(m);
    const envio = await enviar(m.phoneNumberId, m.de, texto);
    if (!envio.ok) {
      log(`resposta falhou: ${envio.erro}`);
      return;
    }
    await gravar(numeroId, m.de, 'sistema', texto, envio.id ?? null);
    log('resposta enviada e gravada');
  }

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      const desafio = desafioDaVerificacao(url.searchParams, cfg.verifyToken);
      return desafio === null ? new Response('forbidden', { status: 403 }) : new Response(desafio, { status: 200 });
    }
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const corpo = await req.text();
    if (!(await assinaturaValida(corpo, req.headers.get('x-hub-signature-256'), cfg.appSecret))) {
      log('assinatura inválida; evento recusado');
      return new Response('invalid signature', { status: 401 });
    }
    let payload: unknown;
    try { payload = JSON.parse(corpo); } catch { return new Response('bad json', { status: 400 }); }

    // Erros de banco ou de envio não devolvem 5xx: a Meta reenviaria o mesmo evento várias vezes.
    for (const m of extrairMensagens(payload)) {
      try { await tratar(m); } catch (e) { log(`erro ao tratar mensagem: ${(e as Error).message}`); }
    }
    return new Response('ok', { status: 200 });
  };
}
