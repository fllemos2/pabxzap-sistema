// Chamadas à Graph API usadas pelo console de demonstração do App Review.
// O token fica só aqui, no servidor: nada deste módulo devolve token ou segredo ao navegador.
// No modo ensaio, todas as respostas são simuladas e nada é enviado à Meta.

const VERSAO = 'v23.0'; // a mesma de scripts/app-review.mjs
const BASE = `https://graph.facebook.com/${VERSAO}`;

// Definição do template do vídeo 2 (roteiro em docs/app-review.md).
export const TEMPLATE_RESGATE = {
  name: 'pabxzap_resgate',
  category: 'UTILITY',
  language: 'pt_BR',
  components: [
    {
      type: 'BODY',
      text: 'Olá! Seu atendimento {{1}} com o setor {{2}} ainda está aberto. Toque no botão abaixo para continuar a conversa.',
      example: { body_text: [['20261110-0042', 'Financeiro']] },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Continuar',
          url: 'https://wa.me/{{1}}',
          example: ['https://wa.me/5511999999999?text=Protocolo%2020261110-0042'],
        },
      ],
    },
  ],
};

const so_digitos = (s) => String(s ?? '').replace(/\D/g, '');

// "5511987651234" -> "+55 •• •••••-1234"
export function mascararTelefone(numero) {
  const d = so_digitos(numero);
  if (d.length < 8) return '••••';
  const pais = d.slice(0, 2);
  const resto = d.slice(4);
  return `+${pais} •• ${'•'.repeat(Math.max(resto.length - 4, 1))}-${resto.slice(-4)}`;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function criarMeta({ ensaio, env = process.env, log = console.log }) {
  const { META_APP_ID, META_APP_SECRET, META_TEST_ACCESS_TOKEN, META_TEST_PHONE_NUMBER_ID, META_WABA_ID } = env;
  const destinatario = so_digitos(env.META_TEST_RECIPIENT) || (ensaio ? '5511900001234' : '');
  const segredos = [META_APP_SECRET, META_TEST_ACCESS_TOKEN].filter((s) => s && s.length >= 8);

  // Remove qualquer segredo ou o telefone do destinatário de um objeto antes de ele sair do servidor.
  function limpar(obj) {
    let txt = JSON.stringify(obj);
    for (const s of segredos) txt = txt.split(s).join('[hidden]');
    if (destinatario) txt = txt.split(destinatario).join(mascararTelefone(destinatario));
    return JSON.parse(txt);
  }

  function faltando() {
    const exigidas = { META_APP_ID, META_APP_SECRET, META_TEST_ACCESS_TOKEN, META_TEST_PHONE_NUMBER_ID, META_TEST_RECIPIENT: destinatario };
    return Object.entries(exigidas).filter(([, v]) => !v).map(([k]) => k);
  }

  async function graph(caminho, { metodo = 'GET', token = META_TEST_ACCESS_TOKEN, corpo } = {}) {
    const r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, dados };
  }

  let cacheConta = null;
  // Descobre a WABA pelo debug_token (como em scripts/app-review.mjs), o número de teste e o business_id.
  async function conta() {
    if (cacheConta) return cacheConta;
    if (ensaio) {
      cacheConta = { waba: '100000000000001', businessId: '100000000000002', numeroTeste: '+1 555 010 0000', nomeNumero: 'Test Number' };
      return cacheConta;
    }
    const debug = await graph(`/debug_token?input_token=${encodeURIComponent(META_TEST_ACCESS_TOKEN)}`, {
      token: `${META_APP_ID}|${META_APP_SECRET}`,
    });
    if (!debug.ok || !debug.dados.data?.is_valid) throw new Error('Token inválido ou vencido. Gere outro em WhatsApp › API Setup.');
    const escopos = debug.dados.data.granular_scopes ?? [];
    // Tokens da página de teste podem vir sem target_ids; nesse caso usa META_WABA_ID.
    const waba = escopos.find((e) => e.scope === 'whatsapp_business_management')?.target_ids?.[0] ?? META_WABA_ID;
    if (!waba) throw new Error('O token não informa a conta do WhatsApp (WABA). Preencha META_WABA_ID no .env.');
    const num = await graph(`/${META_TEST_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`);
    const dono = await graph(`/${waba}?fields=owner_business_info`);
    cacheConta = {
      waba,
      businessId: dono.dados.owner_business_info?.id ?? null,
      numeroTeste: num.dados.display_phone_number ?? null,
      nomeNumero: num.dados.verified_name ?? null,
    };
    return cacheConta;
  }

  // ---- respostas simuladas (modo ensaio) ----
  const simulados = [
    { name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US', id: '100000000000101' },
  ];
  const simular = async (rotulo, resposta) => {
    log(`[SIMULADO] ${rotulo} (modo ensaio: nada foi enviado à Meta)`);
    await espera(700);
    return resposta;
  };

  return {
    ensaio,
    faltando,
    conta,
    destinatarioMascarado: () => mascararTelefone(destinatario),

    async enviarHelloWorld() {
      const caminho = `/${META_TEST_PHONE_NUMBER_ID || '{phone-number-id}'}/messages`;
      if (ensaio) {
        return simular(`POST ${caminho}`, {
          ok: true, simulado: true, metodo: 'POST', caminho, status: 200,
          dados: limpar({
            messaging_product: 'whatsapp',
            contacts: [{ input: destinatario, wa_id: destinatario }],
            messages: [{ id: 'wamid.SIMULATED0000000000000000000000000000000000000000', message_status: 'accepted' }],
          }),
        });
      }
      const r = await graph(caminho, {
        metodo: 'POST',
        corpo: { messaging_product: 'whatsapp', to: destinatario, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } },
      });
      log(`POST /{phone-number-id}/messages -> HTTP ${r.status}`);
      return { ok: r.ok, metodo: 'POST', caminho, status: r.status, dados: limpar(r.dados) };
    },

    async listarTemplates() {
      const { waba } = await conta();
      const caminho = `/${waba}/message_templates`;
      if (ensaio) return simular(`GET ${caminho}`, { ok: true, simulado: true, metodo: 'GET', caminho, status: 200, dados: { data: simulados.slice().reverse() } });
      const r = await graph(`${caminho}?fields=id,name,status,category,language&limit=50`);
      log(`GET /{waba}/message_templates -> HTTP ${r.status}`);
      return { ok: r.ok, metodo: 'GET', caminho, status: r.status, dados: limpar(r.dados) };
    },

    async criarTemplate() {
      const { waba } = await conta();
      const caminho = `/${waba}/message_templates`;
      if (ensaio) {
        const existente = simulados.find((t) => t.name === TEMPLATE_RESGATE.name);
        if (!existente) simulados.push({ name: TEMPLATE_RESGATE.name, status: 'PENDING', category: 'UTILITY', language: 'pt_BR', id: '100000000000202' });
        return simular(`POST ${caminho}`, { ok: true, simulado: true, metodo: 'POST', caminho, status: 200, dados: { id: '100000000000202', status: 'PENDING', category: 'UTILITY' } });
      }
      const r = await graph(caminho, { metodo: 'POST', corpo: TEMPLATE_RESGATE });
      log(`POST /{waba}/message_templates -> HTTP ${r.status}`);
      return { ok: r.ok, metodo: 'POST', caminho, status: r.status, dados: limpar(r.dados) };
    },
  };
}
