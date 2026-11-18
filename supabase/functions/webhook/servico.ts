// Webhook da Meta: confere a assinatura, grava as mensagens e passa cada uma pelo núcleo de regras (ticket wf-pabxzap-22).
// Recebe o banco e o enviador de fora, para o fluxo inteiro poder ser testado no Node sem rede.

import { assinaturaValida, desafioDaVerificacao, extrairEcos, extrairMensagens } from './logica.ts';
import { carregarContexto, executarEvento } from '../_compartilhado/executar.ts';
import type { Db } from '../_compartilhado/db.ts';
import type { Enviador } from '../_compartilhado/meta.ts';

export type Config = {
  verifyToken: string;   // META_WEBHOOK_VERIFY_TOKEN
  appSecret: string;     // META_APP_SECRET
  linkPolitica?: string | null;
};

const log = (...a: unknown[]) => console.log('[webhook]', ...a);

export function criarHandler(cfg: Config, db: Db, enviador: Enviador) {
  async function tratar(payload: unknown) {
    const mensagens = extrairMensagens(payload);
    const ecos = extrairEcos(payload);
    if (!mensagens.length && !ecos.length) return;
    const ctx = await carregarContexto(db, cfg.linkPolitica ?? null);

    for (const m of mensagens) {
      try {
        const numero = ctx.numeroDePnid.get(m.phoneNumberId);
        if (!numero) { log(`phone_number_id ${m.phoneNumberId} não está em numeros; mensagem ignorada`); continue; }
        if (!(await db.gravarMensagem({ numero_id: numero, cliente: m.de, origem: 'cliente', texto: m.texto, wa_message_id: m.waMessageId }))) {
          log('mensagem repetida ignorada');
          continue;
        }
        const r = await executarEvento(db, enviador, ctx,
          { tipo: 'cliente_mensagem', numero, cliente: m.de, texto: m.texto ?? `[${m.tipo}]`, t: m.em.getTime() },
          () => db.abertosDoCliente(m.de));
        log(`mensagem em ${numero}: ${r.efeitos.map((e) => e.tipo).join(', ') || 'sem efeitos'}`);
      } catch (e) {
        log(`erro ao tratar mensagem: ${(e as Error).message}`);
      }
    }

    for (const eco of ecos) {
      try {
        const numero = ctx.numeroDePnid.get(eco.phoneNumberId);
        if (!numero) continue;
        // Ecos das mensagens que o próprio sistema enviou não são ação do atendente.
        if (await db.mensagemExiste(eco.waMessageId)) continue;
        await db.gravarMensagem({ numero_id: numero, cliente: eco.para, origem: 'atendente', texto: eco.texto, wa_message_id: eco.waMessageId });
        if (!eco.texto) continue;
        const r = await executarEvento(db, enviador, ctx,
          { tipo: 'atendente_mensagem', numero, cliente: eco.para, texto: eco.texto, t: eco.em.getTime() },
          () => db.abertosDoCliente(eco.para));
        log(`atendente em ${numero}: ${r.efeitos.map((e) => e.tipo).join(', ') || 'sem efeitos'}`);
      } catch (e) {
        log(`erro ao tratar eco: ${(e as Error).message}`);
      }
    }
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
    try { await tratar(payload); } catch (e) { log(`erro: ${(e as Error).message}`); }
    return new Response('ok', { status: 200 });
  };
}
