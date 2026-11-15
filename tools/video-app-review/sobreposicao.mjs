// Scripts injetados em todas as páginas gravadas (context.addInitScript).
// Rodam dentro do navegador: não podem usar nada do Node.

// Legenda em inglês, cursor visível, realce e efeito de clique. Expõe window.__ar.
export function instalarSobreposicao() {
  if (window.top !== window || window.__ar) return;
  const Z = '2147483647';
  const els = {};

  function criar() {
    const raiz = document.documentElement;
    if (!raiz) return false;
    if (els.legenda?.isConnected) return true;

    const estilo = document.createElement('style');
    estilo.textContent = `
      #__ar-legenda { position: fixed; left: 0; right: 0; bottom: 0; z-index: ${Z}; pointer-events: none;
        background: rgba(8, 14, 20, 0.93); color: #fff; padding: 18px 90px 26px; text-align: center;
        font: 600 42px/1.3 "Segoe UI", system-ui, Arial, sans-serif; letter-spacing: .005em;
        border-top: 4px solid #2dd4bf; transition: opacity .35s; min-height: 150px;
        display: flex; flex-direction: column; justify-content: center; }
      #__ar-legenda.esquerda { left: 24px; right: auto; bottom: 24px; width: 600px; text-align: left;
        border-radius: 16px; border: 4px solid #2dd4bf; padding: 22px 30px; font-size: 36px; }
      #__ar-legenda .rotulo { font: 600 21px/1.3 "Segoe UI", system-ui, Arial, sans-serif; color: #99f6e4;
        text-transform: none; margin-bottom: 6px; letter-spacing: .02em; }
      #__ar-legenda.oculta { opacity: 0; }
      #__ar-cursor { position: fixed; left: 960px; top: 540px; width: 44px; height: 44px; z-index: ${Z};
        pointer-events: none; transition-property: left, top; transition-timing-function: cubic-bezier(.45,.05,.25,1);
        filter: drop-shadow(0 3px 4px rgba(0,0,0,.45)); }
      #__ar-realce { position: fixed; z-index: 2147483646; pointer-events: none; border: 5px solid #ffb300;
        border-radius: 12px; box-shadow: 0 0 0 4px rgba(255,179,0,.35), 0 0 0 9999px rgba(0,0,0,.16);
        opacity: 0; transition: opacity .3s, left .3s, top .3s, width .3s, height .3s; }
      #__ar-realce.visivel { opacity: 1; }
      .__ar-onda { position: fixed; z-index: ${Z}; pointer-events: none; width: 24px; height: 24px; margin: -12px 0 0 -12px;
        border-radius: 50%; border: 4px solid #ffb300; animation: __ar-onda .7s ease-out forwards; }
      @keyframes __ar-onda { to { transform: scale(4); opacity: 0; } }`;
    raiz.appendChild(estilo);

    els.realce = Object.assign(document.createElement('div'), { id: '__ar-realce' });
    els.legenda = Object.assign(document.createElement('div'), { id: '__ar-legenda', className: 'oculta' });
    els.rotulo = Object.assign(document.createElement('div'), { className: 'rotulo' });
    els.texto = document.createElement('div');
    els.legenda.append(els.rotulo, els.texto);
    els.cursor = Object.assign(document.createElement('div'), { id: '__ar-cursor' });
    els.cursor.innerHTML = `<svg viewBox="0 0 32 32" width="44" height="44"><path d="M5 2 L5 27 L11.5 20.5 L16 30 L20 28.2 L15.6 19 L25 19 Z"
      fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>`;
    raiz.append(els.realce, els.legenda, els.cursor);
    return true;
  }

  window.__ar = {
    legenda(texto, { rotulo = '', posicao = 'baixo' } = {}) {
      if (!criar()) return;
      els.texto.textContent = texto;
      els.rotulo.textContent = rotulo;
      els.rotulo.style.display = rotulo ? '' : 'none';
      els.legenda.classList.toggle('esquerda', posicao === 'esquerda');
      els.legenda.classList.remove('oculta');
    },
    cursor(x, y, ms = 0) {
      if (!criar()) return;
      els.cursor.style.transitionDuration = `${ms}ms`;
      els.cursor.style.left = `${x}px`;
      els.cursor.style.top = `${y}px`;
    },
    realce(r) {
      if (!criar()) return;
      if (!r) return els.realce.classList.remove('visivel');
      const m = 8;
      Object.assign(els.realce.style, { left: `${r.x - m}px`, top: `${r.y - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
      els.realce.classList.add('visivel');
    },
    clique(x, y) {
      if (!criar()) return;
      const o = Object.assign(document.createElement('div'), { className: '__ar-onda' });
      Object.assign(o.style, { left: `${x}px`, top: `${y}px` });
      document.documentElement.appendChild(o);
      setTimeout(() => o.remove(), 800);
    },
  };
}

// Privacidade no WhatsApp Web (e no placeholder do ensaio): desfoca o cabeçalho com o perfil próprio
// e a lista de conversas, exceto a conversa selecionada (a do número de teste).
// Se a estrutura da página não for reconhecida, desfoca a lista inteira (falha do lado seguro).
export function instalarMascaraWhatsApp() {
  if (window.top !== window) return;
  const alvo = location.host === 'web.whatsapp.com' || location.pathname.startsWith('/placeholder/whatsapp-web');
  if (!alvo) return;

  const css = `
    /* perfil próprio: cabeçalho da lista e barra lateral de navegação */
    #side > header, #side header, header:not(#main header):not(#main *) { filter: blur(14px) !important; }
    /* lista de conversas, exceto a selecionada */
    #pane-side [role="listitem"]:not([aria-selected="true"]):not(:has([aria-selected="true"])),
    #pane-side [role="row"]:not([aria-selected="true"]):not(:has([aria-selected="true"])) { filter: blur(14px) !important; }
    /* falha segura: estrutura desconhecida -> lista inteira desfocada */
    html.__ar-lista-toda #pane-side { filter: blur(14px) !important; }`;

  const aplicar = () => {
    if (!document.documentElement) return false;
    const s = document.createElement('style');
    s.id = '__ar-mascara';
    s.textContent = css;
    document.documentElement.appendChild(s);
    document.documentElement.classList.add('__ar-lista-toda'); // começa pelo lado seguro
    return true;
  };
  if (!aplicar()) {
    new MutationObserver((_, obs) => { if (aplicar()) obs.disconnect(); }).observe(document, { childList: true });
  }

  // Confere a estrutura a cada meio segundo.
  setInterval(() => {
    const raiz = document.documentElement;
    const lista = document.querySelector('#pane-side');
    if (!raiz || !lista) return;
    const itens = lista.querySelectorAll('[role="listitem"], [role="row"]').length;
    const selecionada = lista.querySelector('[aria-selected="true"]');
    raiz.classList.toggle('__ar-lista-toda', !itens || !selecionada);
    raiz.dataset.arMascara = itens && selecionada ? 'fina' : 'lista-toda';
  }, 500);
}
