// =========================================================
// LibreAI — Client API (fetch avec cookies de session)
// =========================================================
const Api = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* pas de corps JSON */ }
    if (!res.ok) {
      const message = (data && data.error) || `Erreur ${res.status}`;
      const error = new Error(message);
      error.status = res.status;
      error.code = data && data.code;
      throw error;
    }
    return data;
  },
  get(url) { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body ?? {}); },
  patch(url, body) { return this.request('PATCH', url, body ?? {}); },
  delete(url) { return this.request('DELETE', url); },
};

function toast(message, type = 'success') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast glass ${type === 'error' ? 'alert-error' : 'alert-success'}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 300);
  }, 3400);
}

function initials(name) {
  if (!name) return '?';
  return name.trim().slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
