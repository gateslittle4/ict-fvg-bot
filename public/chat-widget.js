// chat-widget.js - assistant IA flottant, présent sur toutes les pages du
// dashboard (2026-09-15, Esdras : "est Il possible de mettre un IA dans le
// chat de Mon bot" - pensé pour lui ET pour un investisseur "pas un grand
// en trading" qui doit pouvoir poser ses questions directement, sans passer
// par Esdras). Même pattern que theme.js : un seul fichier chargé sur
// chaque page (index/journal/chart/accounts), pas de framework, pas de
// build step. Parle au backend via POST /api/chat (voir chatAssistant.js) -
// même modèle sans état que le reste de l'API : l'historique de la
// conversation est gardé ici, en mémoire de page (perdu à l'actualisation,
// comme n'importe quel chat qui ne prétend pas être un historique permanent).
(function () {
  const STORAGE_KEY = 'apexfvg-chat-open';
  let history = []; // [{role:'user'|'assistant', content:string}]
  let sending = false;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #chat-fab {
        position: fixed; right: 18px; bottom: 18px; z-index: 9999;
        width: 52px; height: 52px; border-radius: 50%;
        background: var(--blue); color: #fff; border: none;
        font-size: 22px; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
      }
      #chat-fab:hover { filter: brightness(1.08); }
      #chat-panel {
        position: fixed; right: 18px; bottom: 82px; z-index: 9999;
        width: min(360px, calc(100vw - 36px)); height: min(520px, calc(100vh - 140px));
        background: var(--panel); border: 1px solid var(--panel-border);
        border-radius: 8px; display: none; flex-direction: column;
        overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.4);
        font-family: var(--sans); color: var(--text);
      }
      #chat-panel.open { display: flex; }
      #chat-head {
        padding: 10px 12px; border-bottom: 1px solid var(--panel-border);
        display: flex; align-items: center; justify-content: space-between;
        background: var(--panel-2); font-size: 13px; font-weight: 600;
      }
      #chat-head span.sub { display: block; font-weight: 400; font-size: 11px; color: var(--muted); margin-top: 2px; }
      #chat-close { background: none; border: none; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 6px; }
      #chat-close:hover { color: var(--text); }
      #chat-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .chat-msg { font-size: 13px; line-height: 1.45; max-width: 92%; white-space: pre-wrap; }
      .chat-msg.user { align-self: flex-end; background: var(--blue); color: #fff; padding: 8px 10px; border-radius: 10px 10px 2px 10px; }
      .chat-msg.assistant { align-self: flex-start; background: var(--panel-2); border: 1px solid var(--panel-border); padding: 8px 10px; border-radius: 10px 10px 10px 2px; }
      .chat-msg.error { align-self: flex-start; color: var(--red); font-size: 12px; }
      .chat-msg.hint { align-self: center; color: var(--muted); font-size: 11.5px; text-align: center; }
      #chat-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid var(--panel-border); }
      #chat-input {
        flex: 1; resize: none; border: 1px solid var(--panel-border); background: var(--bg-inset, var(--bg));
        color: var(--text); border-radius: var(--radius, 3px); padding: 8px 10px; font-size: 13px;
        font-family: var(--sans); max-height: 90px;
      }
      #chat-send { background: var(--blue); color: #fff; border: none; border-radius: var(--radius, 3px); padding: 0 14px; font-size: 13px; cursor: pointer; }
      #chat-send:disabled { opacity: 0.5; cursor: default; }
      .chat-typing { display: inline-flex; gap: 3px; align-items: center; }
      .chat-typing span { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); animation: chat-blink 1.2s infinite ease-in-out; }
      .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
      .chat-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes chat-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  function buildDom() {
    const fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Poser une question sur les données');
    fab.textContent = '💬';

    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.innerHTML = `
      <div id="chat-head">
        <div>Assistant Apex FVG<span class="sub">Répond avec les vraies données du bot</span></div>
        <button id="chat-close" type="button" aria-label="Fermer">✕</button>
      </div>
      <div id="chat-body"></div>
      <form id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Pose ta question sur les données..." maxlength="2000"></textarea>
        <button id="chat-send" type="submit">Envoyer</button>
      </form>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    return { fab, panel };
  }

  function addMessage(body, role, text) {
    const el = document.createElement('div');
    el.className = `chat-msg ${role}`;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function addTyping(body) {
    const el = document.createElement('div');
    el.className = 'chat-msg assistant';
    el.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  async function send(body, input, sendBtn) {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    addMessage(body, 'user', text);
    history.push({ role: 'user', content: text });
    input.value = '';
    input.style.height = 'auto';
    const typingEl = addTyping(body);

    try {
      // Même route par défaut que chaque autre appel du dashboard
      // (journal.html/chart.html font pareil - voir '/api/trade-log' etc.)
      // - pas de scoping par compte ici, cohérent avec le reste de l'app.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      const data = await res.json().catch(() => ({}));
      typingEl.remove();
      if (!res.ok) {
        addMessage(body, 'error', data.error || `Erreur (${res.status})`);
        history.pop(); // ne garde pas la question dans l'historique si la réponse a échoué
        return;
      }
      addMessage(body, 'assistant', data.reply || '(réponse vide)');
      history.push({ role: 'assistant', content: data.reply || '' });
    } catch (err) {
      typingEl.remove();
      addMessage(body, 'error', 'Connexion impossible. Réessaie dans un instant.');
      history.pop();
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    const { fab, panel } = buildDom();
    const body = panel.querySelector('#chat-body');
    const form = panel.querySelector('#chat-form');
    const input = panel.querySelector('#chat-input');
    const sendBtn = panel.querySelector('#chat-send');
    const closeBtn = panel.querySelector('#chat-close');

    addMessage(body, 'hint', "Pose une question sur les résultats, le journal, le compte... L'assistant répond avec les vraies données du bot, pas des estimations.");

    function open() {
      panel.classList.add('open');
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      input.focus();
    }
    function close() {
      panel.classList.remove('open');
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    fab.addEventListener('click', () => {
      panel.classList.contains('open') ? close() : open();
    });
    closeBtn.addEventListener('click', close);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      send(body, input, sendBtn);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });

    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') open();
    } catch (e) {}
  });
})();
