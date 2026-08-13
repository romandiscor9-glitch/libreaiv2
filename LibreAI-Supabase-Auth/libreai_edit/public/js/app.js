// =========================================================
// LibreAI — Application de chat (frontend)
// =========================================================
let currentUser = null;
let conversations = [];
let activeConvId = null;
let isSending = false;

const el = (id) => document.getElementById(id);

async function boot() {
  try {
    const { user } = await Api.get('/api/auth/me');
    currentUser = user;
  } catch {
    window.location.href = '/login.html';
    return;
  }

  el('page-loader').style.display = 'none';
  el('app-shell').style.display = 'flex';

  el('user-name').textContent = currentUser.username;
  el('user-email').textContent = currentUser.email;
  el('user-avatar').textContent = initials(currentUser.username);
  if (currentUser.isAdmin) el('admin-entry').style.display = 'block';

  await loadConversations();
  await refreshCredits();
  bindEvents();
}

async function loadConversations() {
  try {
    const data = await Api.get('/api/chat/conversations');
    conversations = data.conversations;
    renderConvList();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderConvList(filter = '') {
  const list = el('conv-list');
  const q = filter.trim().toLowerCase();
  const filtered = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-convs">${q ? 'Aucun résultat.' : "Pas encore de conversation.<br>Cliquez sur « Nouveau chat »."}</div>`;
    return;
  }

  list.innerHTML = filtered
    .map(
      (c) => `
    <div class="conv-item ${c.id === activeConvId ? 'active' : ''}" data-id="${c.id}">
      <span class="conv-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
      <div class="conv-actions">
        <button data-action="rename" title="Renommer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button data-action="delete" class="danger" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </div>
    </div>`
    )
    .join('');

  list.querySelectorAll('.conv-item').forEach((item) => {
    const id = parseInt(item.dataset.id, 10);
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      openConversation(id);
      closeMobileSidebar();
    });
    item.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(item, id);
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(id);
    });
  });
}

function startRename(item, id) {
  const titleEl = item.querySelector('.conv-title');
  const current = titleEl.textContent;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = current;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  async function commit() {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== current) {
      try {
        await Api.patch(`/api/chat/conversations/${id}`, { title: newTitle });
        const conv = conversations.find((c) => c.id === id);
        if (conv) conv.title = newTitle;
        if (id === activeConvId) el('current-conv-title').textContent = newTitle;
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    renderConvList(el('search-conv').value);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

async function deleteConversation(id) {
  const conv = conversations.find((c) => c.id === id);
  if (!confirm(`Supprimer « ${conv ? conv.title : 'cette conversation'} » ? Cette action est irréversible.`)) return;
  try {
    await Api.delete(`/api/chat/conversations/${id}`);
    conversations = conversations.filter((c) => c.id !== id);
    if (activeConvId === id) {
      activeConvId = null;
      showWelcomeScreen();
    }
    renderConvList(el('search-conv').value);
    toast('Conversation supprimée.');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showWelcomeScreen() {
  el('current-conv-title').textContent = 'Nouvelle conversation';
  el('chat-inner').innerHTML = `
    <div class="welcome" id="welcome-screen">
      <div class="logo-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6l-8-4z" stroke="#0a0d13" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#0a0d13" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2>Bonjour, comment puis-je vous aider ?</h2>
      <p>Posez une question, demandez de l'aide pour du code, ou lancez simplement une conversation.</p>
      <div class="suggestions">
        <div class="suggestion-chip" data-prompt="Explique-moi les bases de Docker en 5 points.">Explique-moi Docker</div>
        <div class="suggestion-chip" data-prompt="Écris une fonction JavaScript qui trie un tableau d'objets par date.">Fonction de tri JS</div>
        <div class="suggestion-chip" data-prompt="Donne-moi 5 idées de titres pour un article de blog sur l'IA.">Idées d'article</div>
        <div class="suggestion-chip" data-prompt="Résume les avantages et inconvénients du télétravail.">Télétravail : pour/contre</div>
      </div>
    </div>`;
  bindSuggestionChips();
}

async function newChat() {
  activeConvId = null;
  showWelcomeScreen();
  renderConvList(el('search-conv').value);
  el('msg-input').focus();
}

async function openConversation(id) {
  try {
    const data = await Api.get(`/api/chat/conversations/${id}`);
    activeConvId = id;
    el('current-conv-title').textContent = data.conversation.title;
    el('chat-inner').innerHTML = '';
    data.messages.forEach((m) => appendMessage(m.role, m.content, { animate: false }));
    renderConvList(el('search-conv').value);
    scrollToBottom();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function appendMessage(role, content, opts = {}) {
  const welcome = el('welcome-screen');
  if (welcome) welcome.remove();

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  const avatarLabel = role === 'user' ? initials(currentUser.username) : 'AI';
  row.innerHTML = `
    <div class="msg-avatar">${avatarLabel}</div>
    <div class="msg-bubble ${opts.isError ? 'error-bubble' : ''}">${role === 'assistant' && !opts.isError ? renderMarkdown(content) : escapeHtml(content)}</div>
  `;
  if (opts.animate === false) row.style.animation = 'none';
  el('chat-inner').appendChild(row);
  scrollToBottom();
  return row;
}

function appendThinking() {
  const row = document.createElement('div');
  row.className = 'thinking-row';
  row.id = 'thinking-indicator';
  row.innerHTML = `
    <div class="msg-avatar" style="background:linear-gradient(135deg, var(--accent), var(--teal));color:#0a0d13">AI</div>
    <div class="thinking-dots"><span></span><span></span><span></span></div>
    <span class="thinking-label">LibreAI réfléchit…</span>
  `;
  el('chat-inner').appendChild(row);
  scrollToBottom();
}

function removeThinking() {
  const t = el('thinking-indicator');
  if (t) t.remove();
}

function scrollToBottom() {
  const scroller = el('chat-scroll');
  requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
}

async function sendMessage(text) {
  if (isSending) return;
  const content = text.trim();
  if (!content) return;

  isSending = true;
  el('send-btn').disabled = true;

  // 1. Créer une conversation si nécessaire
  if (!activeConvId) {
    try {
      const { conversation } = await Api.post('/api/chat/conversations', {});
      activeConvId = conversation.id;
      conversations.unshift(conversation);
    } catch (err) {
      toast(err.message, 'error');
      isSending = false;
      el('send-btn').disabled = false;
      return;
    }
  }

  // 2. Afficher immédiatement le message utilisateur
  appendMessage('user', content);
  el('msg-input').value = '';
  autoGrow(el('msg-input'));
  updateSendButtonState();

  // 3. Indicateur de réflexion
  appendThinking();

  // 4. Appel backend
  try {
    const data = await Api.post(`/api/chat/conversations/${activeConvId}/messages`, { content });
    removeThinking();
    appendMessage('assistant', data.message.content);
    if (data.credits) renderCredits(data.credits);

    const conv = conversations.find((c) => c.id === activeConvId);
    if (conv) {
      conv.title = data.conversation.title;
      conv.updated_at = data.conversation.updated_at;
      conversations = [conv, ...conversations.filter((c) => c.id !== conv.id)];
    }
    el('current-conv-title').textContent = data.conversation.title;
    renderConvList(el('search-conv').value);
  } catch (err) {
    removeThinking();
    appendMessage('assistant', `⚠️ ${err.message}`, { isError: true });
  } finally {
    isSending = false;
    updateSendButtonState();
    el('msg-input').focus();
  }
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function updateSendButtonState() {
  el('send-btn').disabled = isSending || el('msg-input').value.trim().length === 0;
}

function bindSuggestionChips() {
  document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => sendMessage(chip.dataset.prompt));
  });
}

function closeMobileSidebar() {
  el('sidebar').classList.remove('open');
  el('sidebar-backdrop').classList.remove('open');
}

function bindEvents() {
  bindSuggestionChips();

  el('new-chat-btn').addEventListener('click', newChat);

  el('search-conv').addEventListener('input', (e) => renderConvList(e.target.value));

  const input = el('msg-input');
  input.addEventListener('input', () => { autoGrow(input); updateSendButtonState(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });
  el('send-btn').addEventListener('click', () => sendMessage(input.value));

  el('hamburger-btn').addEventListener('click', () => {
    el('sidebar').classList.add('open');
    el('sidebar-backdrop').classList.add('open');
  });
  el('sidebar-backdrop').addEventListener('click', closeMobileSidebar);

  // Modal compte
  el('account-btn').addEventListener('click', openAccountModal);
  el('user-pill').addEventListener('click', openAccountModal);
  el('close-account-modal').addEventListener('click', () => { el('account-modal').style.display = 'none'; });
  el('account-modal').addEventListener('click', (e) => { if (e.target.id === 'account-modal') el('account-modal').style.display = 'none'; });
  el('logout-btn').addEventListener('click', logout);

  el('chat-mode-btn').addEventListener('click', () => switchMode('chat'));
  el('image-mode-btn').addEventListener('click', () => switchMode('images'));
  el('gallery-mode-btn').addEventListener('click', () => switchMode('gallery'));
  el('generate-image-btn').addEventListener('click', generateImage);
  el('refresh-gallery-btn').addEventListener('click', loadGallery);
  el('open-admin-btn')?.addEventListener('click', openAdmin);
  el('close-admin-btn')?.addEventListener('click', closeAdmin);
}

async function openAccountModal() {
  el('account-modal').style.display = 'flex';
  try {
    const data = await Api.get('/api/account/stats');
    el('modal-avatar').textContent = initials(data.user.username);
    el('modal-username').textContent = data.user.username;
    el('modal-email').textContent = data.user.email;
    el('stat-convs').textContent = data.stats.conversations;
    el('stat-msgs').textContent = data.stats.messages;
    el('stat-images').textContent = data.stats.images;
    renderCredits(data.credits);
    el('modal-created').textContent = formatDate(data.user.createdAt);
    el('modal-last-login').textContent = formatDate(data.user.lastLogin);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function logout() {
  try {
    await Api.post('/api/auth/logout');
  } finally {
    window.location.href = '/login.html';
  }
}

let activeMode = 'chat';

function renderCredits(data) {
  if (!data) return;
  const label = data.unlimited ? '∞ illimités' : `${data.credits} crédits`;
  const pill = el('image-credit-pill');
  if (pill) pill.textContent = label;
  const modal = el('modal-credits');
  if (modal) modal.textContent = label;
}

async function refreshCredits() {
  try {
    const data = await Api.get('/api/images/credits');
    renderCredits(data.credits);
  } catch {}
}

function switchMode(mode) {
  activeMode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  el(mode === 'chat' ? 'chat-mode-btn' : mode === 'images' ? 'image-mode-btn' : 'gallery-mode-btn').classList.add('active');

  const chatScroll = el('chat-scroll');
  const composer = document.querySelector('.composer-wrap');
  const imagePanel = el('image-panel');
  const galleryPanel = el('gallery-panel');

  chatScroll.style.display = mode === 'chat' ? 'block' : 'none';
  composer.style.display = mode === 'chat' ? 'block' : 'none';
  imagePanel.style.display = mode === 'images' ? 'block' : 'none';
  galleryPanel.style.display = mode === 'gallery' ? 'block' : 'none';

  if (mode === 'images') {
    el('current-conv-title').textContent = 'Génération d’images';
    refreshCredits();
  } else if (mode === 'gallery') {
    el('current-conv-title').textContent = 'Ma galerie';
    loadGallery();
  } else {
    el('current-conv-title').textContent = activeConvId
      ? (conversations.find(c => c.id === activeConvId)?.title || 'Conversation')
      : 'Nouvelle conversation';
    el('msg-input').focus();
  }
}

async function generateImage() {
  const prompt = el('image-prompt').value.trim();
  if (!prompt) return toast('Décris d’abord l’image à générer.', 'error');

  const btn = el('generate-image-btn');
  const result = el('image-result');
  btn.disabled = true;
  btn.textContent = 'Génération en cours…';
  result.innerHTML = '<div class="thinking-dots" style="margin:20px auto;width:max-content"><span></span><span></span><span></span></div>';

  try {
    const data = await Api.post('/api/images/generate', { prompt });
    renderCredits(data.credits);
    result.innerHTML = `
      <img class="generated-image" src="${data.image.url}" alt="${escapeHtml(data.image.prompt)}">
      <div class="image-result-actions">
        <a class="btn btn-ghost btn-sm" href="${data.image.url}" download>⬇ Télécharger</a>
        <button class="btn btn-ghost btn-sm" id="save-gallery-refresh">🖼️ Galerie</button>
      </div>`;
    el('save-gallery-refresh').addEventListener('click', () => switchMode('gallery'));
    toast('Image générée.');
  } catch (err) {
    result.innerHTML = `<div class="alert alert-error">⚠️ ${escapeHtml(err.message)}</div>`;
    if (err.code === 'insufficient_credits' && typeof err.credits === 'number') renderCredits({ credits: err.credits, unlimited: false });
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Générer l’image';
  }
}

async function loadGallery() {
  const grid = el('gallery-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="gallery-empty">Chargement…</div>';
  try {
    const data = await Api.get('/api/images/gallery');
    if (!data.images.length) {
      grid.innerHTML = '<div class="gallery-empty">Aucune image pour le moment. Lance ta première génération !</div>';
      return;
    }
    grid.innerHTML = data.images.map((img) => `
      <article class="gallery-card">
        <img src="${img.url}" alt="${escapeHtml(img.prompt)}" loading="lazy">
        <div class="gallery-meta">
          <div class="gallery-prompt">${escapeHtml(img.prompt)}</div>
          <div class="gallery-actions">
            <a class="btn btn-ghost btn-sm" href="${img.url}" download>⬇</a>
            <button class="btn btn-ghost btn-sm" data-delete-image="${img.id}">🗑</button>
          </div>
        </div>
      </article>`).join('');
    grid.querySelectorAll('[data-delete-image]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Supprimer cette image ?')) return;
        try {
          await Api.delete(`/api/images/gallery/${button.dataset.deleteImage}`);
          loadGallery();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (err) {
    grid.innerHTML = `<div class="gallery-empty">${escapeHtml(err.message)}</div>`;
  }
}

function openAdmin() {
  const overlay = el('admin-overlay');
  const frame = el('admin-frame');
  overlay.style.display = 'flex';
  frame.src = '/admin?embedded=1&ts=' + Date.now();
}

function closeAdmin() {
  const frame = el('admin-frame');
  el('admin-overlay').style.display = 'none';
  frame.src = 'about:blank';
}

boot();
