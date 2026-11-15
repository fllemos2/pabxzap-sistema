// Console de demonstração: a interface só conversa com o servidor local, que guarda o token.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function api(metodo, caminho) {
  const r = await fetch(caminho, { method: metodo });
  return r.json();
}

// ---- abas ----
function abrirAba(nome) {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  $('#painel-messaging').hidden = nome !== 'messaging';
  $('#painel-templates').hidden = nome !== 'templates';
  if (nome === 'templates') carregarTemplates();
}
document.querySelectorAll('.aba').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

// ---- resposta da API ----
function mostrarResposta(alvo, r, destaque) {
  const el = $(alvo);
  el.classList.remove('vazia');
  if (r.erro) {
    el.innerHTML = `<div class="linha-status erro">Error: ${esc(r.erro)}</div>`;
    return;
  }
  const classe = r.ok ? 'ok' : 'erro';
  const caminho = r.caminho; // o servidor só devolve IDs públicos, nunca o token
  el.innerHTML = `
    <div class="linha-status"><span class="${classe}">HTTP ${esc(r.status)}</span> · <code>${esc(r.metodo)} ${esc(caminho)}</code></div>
    ${destaque ? `<div class="destaque" id="${destaque.id}"><b>${esc(destaque.rotulo)}</b><code>${esc(destaque.valor)}</code></div>` : ''}
    <pre>${esc(JSON.stringify(r.dados, null, 2))}</pre>`;
}

// ---- Messaging ----
$('#btn-enviar').addEventListener('click', async () => {
  const b = $('#btn-enviar');
  b.disabled = true;
  b.textContent = 'Sending…';
  const r = await api('POST', '/api/enviar').catch((e) => ({ erro: e.message }));
  const id = r.dados?.messages?.[0]?.id;
  mostrarResposta('#resposta-envio', r, id ? { id: 'message-id', rotulo: 'Message ID', valor: id } : null);
  document.body.dataset.envio = r.ok && id ? 'ok' : 'erro';
  b.disabled = false;
  b.textContent = 'Send test message';
});

// ---- Templates ----
const STATUS = { PENDING: ['In review (PENDING)', 'pendente'], APPROVED: ['Approved', 'aprovado'], REJECTED: ['Rejected', 'recusado'] };
const IDIOMAS = { pt_BR: 'Portuguese (BR)', en_US: 'English (US)' };
const CATEGORIAS = { UTILITY: 'Utility', MARKETING: 'Marketing', AUTHENTICATION: 'Authentication' };
let destacarNovo = false;

async function carregarTemplates() {
  const corpo = $('#lista-templates tbody');
  const r = await api('GET', '/api/templates').catch((e) => ({ erro: e.message }));
  if (r.erro || !r.ok) {
    corpo.innerHTML = `<tr><td colspan="4" class="erro">Error: ${esc(r.erro ?? r.dados?.error?.message ?? 'request failed')}</td></tr>`;
    return;
  }
  // O template do vídeo vem primeiro e a tabela mostra no máximo 4 linhas (o resto ficaria sob a legenda).
  const lista = (r.dados?.data ?? []).slice().sort((a, b) => (b.name === 'pabxzap_resgate') - (a.name === 'pabxzap_resgate'));
  const MAX = 4;
  const resto = lista.length - MAX;
  corpo.innerHTML = lista.length
    ? lista.slice(0, MAX).map((t) => {
        const [rotulo, classe] = STATUS[t.status] ?? [t.status, ''];
        const novo = destacarNovo && t.name === 'pabxzap_resgate';
        return `<tr class="${novo ? 'novo' : ''}" data-nome="${esc(t.name)}">
          <td><code>${esc(t.name)}</code></td><td>${esc(CATEGORIAS[t.category] ?? t.category)}</td>
          <td>${esc(IDIOMAS[t.language] ?? t.language)}</td><td><span class="chip ${classe}">${esc(rotulo)}</span></td></tr>`;
      }).join('') + (resto > 0 ? `<tr><td colspan="4" class="dica">…and ${resto} more</td></tr>` : '')
    : '<tr><td colspan="4" class="dica">No templates yet.</td></tr>';
  document.body.dataset.templates = String(lista.length);
}

$('#btn-criar').addEventListener('click', async () => {
  const b = $('#btn-criar');
  b.disabled = true;
  b.textContent = 'Creating…';
  const r = await api('POST', '/api/templates').catch((e) => ({ erro: e.message }));
  const id = r.dados?.id;
  mostrarResposta('#resposta-criacao', r, id ? { id: 'template-id', rotulo: `Template ID · status ${r.dados.status ?? ''}`, valor: id } : null);
  document.body.dataset.criacao = r.ok && id ? 'ok' : 'erro';
  destacarNovo = true;
  await carregarTemplates();
  b.disabled = false;
  b.textContent = 'Create template';
});

function realcarVariaveis(texto) {
  return esc(texto).replace(/\{\{(\d+)\}\}/g, '<span class="var">{{$1}}</span>');
}

// ---- início ----
(async () => {
  const e = await api('GET', '/api/estado').catch((x) => ({ erro: x.message }));
  if (e.erro) {
    $('#resposta-envio').textContent = `Error: ${e.erro}`;
    return;
  }
  $('#selo-ensaio').hidden = !e.ensaio;
  $('#campo-remetente').textContent = [e.numeroTeste, e.nomeNumero].filter(Boolean).join(' · ') || 'WhatsApp test number';
  $('#campo-destinatario').value = e.destinatario;

  const corpo = e.template.components.find((c) => c.type === 'BODY');
  const botao = e.template.components.find((c) => c.type === 'BUTTONS')?.buttons?.[0];
  $('#campo-botao').style.display = botao ? '' : 'none';
  $('#t-nome').textContent = e.template.name;
  $('#t-corpo').innerHTML = realcarVariaveis(corpo.text);
  const [v1, v2] = corpo.example.body_text[0];
  $('#t-exemplos').innerHTML = `<span class="var">{{1}}</span> = <code>${esc(v1)}</code> (ticket number)<br><span class="var">{{2}}</span> = <code>${esc(v2)}</code> (department)`;
  if (botao) $('#t-botao').innerHTML = `Visit website · “${esc(botao.text)}” → <code>${realcarVariaveis(botao.url)}</code><br><span class="dica">Sample: <code>${esc(botao.example[0])}</code></span>`;
  document.body.dataset.pronto = '1';
})();
