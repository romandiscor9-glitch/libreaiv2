// =========================================================
// LibreAI — Panneau d'administration (frontend)
// Le code d'accès est vérifié EXCLUSIVEMENT côté serveur (/api/admin/verify).
// =========================================================
const el = (id) => document.getElementById(id);
let usersPage = 1;
let logsPage = 1;
let chartMain = null;
let chartAi = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function boot() {
  try {
    const { isAdmin, requirePasswordEachTime } = await Api.get('/api/admin/session');
    el('page-loader').style.display = 'none';
    if (isAdmin && !requirePasswordEachTime) {
      showDashboard();
    } else {
      el('gate-shell').style.display = 'flex';
    }
  } catch {
    el('page-loader').style.display = 'none';
    el('gate-shell').style.display = 'flex';
  }
  bindGate();
}

function bindGate() {
  el('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = el('gate-code').value;
    const btn = el('gate-submit');
    el('gate-alert').innerHTML = '';
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    try {
      await Api.post('/api/admin/verify', { code });
      el('gate-shell').style.display = 'none';
      showDashboard();
    } catch (err) {
      el('gate-alert').innerHTML = `<div class="alert alert-error">⚠️ ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Déverrouiller';
    }
  });
}

function showDashboard() {
  el('admin-shell').style.display = 'flex';
  bindNav();
  loadOverview();
}

function bindNav() {
  document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
  el('admin-logout').addEventListener('click', async () => {
    await Api.post('/api/admin/logout');
    window.location.reload();
  });
  el('refresh-overview').addEventListener('click', loadOverview);

  el('admin-hamburger')?.addEventListener('click', () => {
    el('admin-sidebar').classList.add('open');
    el('admin-sidebar-backdrop').classList.add('open');
  });
  el('admin-sidebar-backdrop').addEventListener('click', () => {
    el('admin-sidebar').classList.remove('open');
    el('admin-sidebar-backdrop').classList.remove('open');
  });

  el('user-search').addEventListener('input', debounce(() => { usersPage = 1; loadUsers(); }, 350));
  el('user-status-filter').addEventListener('change', () => { usersPage = 1; loadUsers(); });
  el('user-sort').addEventListener('change', () => { usersPage = 1; loadUsers(); });
  el('users-prev').addEventListener('click', () => { if (usersPage > 1) { usersPage--; loadUsers(); } });
  el('users-next').addEventListener('click', () => { usersPage++; loadUsers(); });

  el('logs-prev').addEventListener('click', () => { if (logsPage > 1) { logsPage--; loadLogs(); } });
  el('logs-next').addEventListener('click', () => { logsPage++; loadLogs(); });

  el('um-close').addEventListener('click', () => { el('user-modal').style.display = 'none'; });
  el('user-modal').addEventListener('click', (e) => { if (e.target.id === 'user-modal') el('user-modal').style.display = 'none'; });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach((i) => i.classList.toggle('active', i.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  el('admin-sidebar').classList.remove('open');
  el('admin-sidebar-backdrop').classList.remove('open');
  if (tab === 'users') loadUsers();
  if (tab === 'logs') loadLogs();
  if (tab === 'settings') loadSettings();
}

// ---------- Vue d'ensemble ----------
async function loadOverview() {
  try {
    const data = await Api.get('/api/admin/stats');
    renderKpis(data.totals);
    renderCharts(data.charts);
    renderActivity(data.recentActivity);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderKpis(t) {
  const cards = [
    { label: 'Utilisateurs totaux', value: t.totalUsers, sub: `${t.newUsers7d} nouveaux (7j)` },
    { label: 'Comptes actifs', value: t.activeUsers, sub: `${t.recentlyActive} connectés (24h)` },
    { label: 'Conversations', value: t.totalConversations, sub: `${t.totalMessages} messages envoyés` },
    { label: 'Requêtes IA', value: t.totalAiRequests, sub: `${t.aiErrors} erreurs` },
  ];
  el('kpi-grid').innerHTML = cards
    .map((c) => `<div class="glass kpi-card"><div class="kpi-label">${c.label}</div><div class="kpi-value">${c.value}</div><div class="kpi-sub">${c.sub}</div></div>`)
    .join('');
}

function last14Days() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function renderCharts(charts) {
  const days = last14Days();
  const dayLabel = (d) => d.slice(5).split('-').reverse().join('/');

  const signupsMap = Object.fromEntries(charts.signupsByDay.map((r) => [r.day, r.count]));
  const messagesMap = Object.fromEntries(charts.messagesByDay.map((r) => [r.day, r.count]));
  const aiMap = Object.fromEntries(charts.aiByDay.map((r) => [r.day, r]));

  if (chartMain) chartMain.destroy();
  chartMain = new Chart(el('chart-main'), {
    type: 'line',
    data: {
      labels: days.map(dayLabel),
      datasets: [
        { label: 'Inscriptions', data: days.map((d) => signupsMap[d] || 0), borderColor: '#7c6cff', backgroundColor: 'rgba(124,108,255,0.15)', tension: 0.35, fill: true },
        { label: 'Messages', data: days.map((d) => messagesMap[d] || 0), borderColor: '#3ed9c4', backgroundColor: 'rgba(62,217,196,0.12)', tension: 0.35, fill: true },
      ],
    },
    options: chartOptions(),
  });

  if (chartAi) chartAi.destroy();
  chartAi = new Chart(el('chart-ai'), {
    type: 'bar',
    data: {
      labels: days.map(dayLabel),
      datasets: [
        { label: 'Succès', data: days.map((d) => (aiMap[d] ? aiMap[d].ok : 0)), backgroundColor: 'rgba(62,217,196,0.65)', borderRadius: 4 },
        { label: 'Erreurs', data: days.map((d) => (aiMap[d] ? aiMap[d].failed : 0)), backgroundColor: 'rgba(255,107,107,0.65)', borderRadius: 4 },
      ],
    },
    options: { ...chartOptions(), scales: { ...chartOptions().scales, x: { ...chartOptions().scales.x, stacked: true }, y: { ...chartOptions().scales.y, stacked: true } } },
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#a7adc0', boxWidth: 12, font: { size: 11.5 } } } },
    scales: {
      x: { ticks: { color: '#6b7185', font: { size: 10.5 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#6b7185', font: { size: 10.5 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
    },
  };
}

function renderActivity(rows) {
  if (!rows.length) { el('activity-feed').innerHTML = '<div class="empty-convs">Aucune activité récente.</div>'; return; }
  el('activity-feed').innerHTML = rows
    .map((r) => `<div class="activity-row"><span class="activity-dot"></span><span class="a-label"><strong>${escapeHtml(r.label || 'Utilisateur')}</strong> — ${r.type}</span><span class="a-time">${formatDate(r.ts)}</span></div>`)
    .join('');
}

// ---------- Utilisateurs ----------
async function loadUsers() {
  const search = el('user-search').value;
  const status = el('user-status-filter').value;
  const sort = el('user-sort').value;
  try {
    const data = await Api.get(`/api/admin/users?search=${encodeURIComponent(search)}&status=${status}&sort=${sort}&page=${usersPage}&pageSize=15`);
    renderUsersTable(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderUsersTable(data) {
  if (!data.users.length) {
    el('users-tbody').innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:30px">Aucun utilisateur trouvé.</td></tr>`;
  } else {
    el('users-tbody').innerHTML = data.users
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td class="strong">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>${formatDate(u.last_login)}</td>
        <td>${u.conversations}</td>
        <td>${u.messages}</td>
        <td><span class="badge ${u.is_active ? 'badge-active' : 'badge-disabled'}">${u.is_active ? 'Actif' : 'Désactivé'}</span></td>
        <td>
          <div class="row-actions">
            <button title="Voir le détail" data-action="view" data-id="${u.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${u.is_active
              ? `<button title="Désactiver" data-action="disable" data-id="${u.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg></button>`
              : `<button title="Réactiver" data-action="enable" data-id="${u.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></button>`}
            <button title="Supprimer" class="danger" data-action="delete" data-id="${u.id}" data-name="${escapeHtml(u.username)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join('');
  }

  const start = (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);
  el('users-count').textContent = data.total === 0 ? '0 utilisateur' : `${start}–${end} sur ${data.total} utilisateurs`;
  el('users-prev').disabled = data.page <= 1;
  el('users-next').disabled = data.page * data.pageSize >= data.total;

  el('users-tbody').querySelectorAll('button[data-action]').forEach((btn) => {
    const id = btn.dataset.id;
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'view') openUserDetail(id);
      if (btn.dataset.action === 'disable') moderateUser(id, 'disable');
      if (btn.dataset.action === 'enable') moderateUser(id, 'enable');
      if (btn.dataset.action === 'delete') deleteUser(id, btn.dataset.name);
    });
  });
}

async function moderateUser(id, action) {
  try {
    await Api.post(`/api/admin/users/${id}/${action}`);
    toast(action === 'disable' ? 'Compte désactivé.' : 'Compte réactivé.');
    loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`Supprimer définitivement le compte « ${name} » et toutes ses conversations ? Cette action est irréversible.`)) return;
  try {
    await Api.delete(`/api/admin/users/${id}`);
    toast('Utilisateur supprimé.');
    loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openUserDetail(id) {
  try {
    const data = await Api.get(`/api/admin/users/${id}`);
    el('um-title').textContent = data.user.username;
    const convRows = data.conversations.length
      ? data.conversations
          .map(
            (c) => `
        <div class="info-row conv-mod-row" data-uid="${id}" data-cid="${c.id}" style="cursor:pointer">
          <span class="k">${escapeHtml(c.title)}</span>
          <span class="v">${c.messageCount} msg · ${formatDate(c.updated_at)}</span>
        </div>
        <div class="conv-mod-messages" id="conv-msgs-${c.id}" style="display:none;padding:10px 0 14px;border-bottom:1px solid var(--border-soft)"></div>`
          )
          .join('')
      : '<div class="empty-convs">Aucune conversation.</div>';
    el('um-body').innerHTML = `
      <div class="info-row"><span class="k">E-mail</span><span class="v">${escapeHtml(data.user.email)}</span></div>
      <div class="info-row"><span class="k">Inscrit le</span><span class="v">${formatDate(data.user.created_at)}</span></div>
      <div class="info-row"><span class="k">Dernière connexion</span><span class="v">${formatDate(data.user.last_login)}</span></div>
      <div class="info-row"><span class="k">Statut</span><span class="v"><span class="badge ${data.user.is_active ? 'badge-active' : 'badge-disabled'}">${data.user.is_active ? 'Actif' : 'Désactivé'}</span></span></div>
      <h3 style="margin:18px 0 8px;font-size:14px">Conversations (${data.conversations.length}) — cliquez pour voir les messages</h3>
      ${convRows}
    `;
    el('user-modal').style.display = 'flex';

    document.querySelectorAll('.conv-mod-row').forEach((row) => {
      row.addEventListener('click', () => toggleConvMessages(row.dataset.uid, row.dataset.cid));
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleConvMessages(userId, convId) {
  const box = el(`conv-msgs-${convId}`);
  if (!box) return;
  if (box.style.display === 'block') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<div class="skeleton" style="height:16px;width:60%;margin:6px 0"></div>';
  try {
    const data = await Api.get(`/api/admin/users/${userId}/conversations/${convId}`);
    box.innerHTML = data.messages
      .map((m) => `<div style="font-size:12.5px;margin-bottom:8px"><strong style="color:${m.role === 'user' ? 'var(--accent)' : 'var(--teal)'}">${m.role === 'user' ? 'Utilisateur' : 'LibreAI'}</strong> <span style="color:var(--text-3)">— ${formatDate(m.created_at)}</span><br><span style="color:var(--text-2)">${escapeHtml(m.content).slice(0, 400)}</span></div>`)
      .join('') || '<span style="color:var(--text-3);font-size:12.5px">Aucun message.</span>';
  } catch (err) {
    box.innerHTML = `<span style="color:var(--danger);font-size:12.5px">${escapeHtml(err.message)}</span>`;
  }
}

// ---------- Journal admin ----------
async function loadLogs() {
  try {
    const data = await Api.get(`/api/admin/logs?page=${logsPage}`);
    if (!data.logs.length) {
      el('logs-tbody').innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:30px">Aucune entrée pour le moment.</td></tr>`;
    } else {
      el('logs-tbody').innerHTML = data.logs
        .map((l) => `<tr><td>${formatDate(l.created_at)}</td><td class="strong">${escapeHtml(l.action)}</td><td>${escapeHtml(l.details || '—')}</td><td>${escapeHtml(l.ip || '—')}</td></tr>`)
        .join('');
    }
    const start = (data.page - 1) * data.pageSize + 1;
    const end = Math.min(data.page * data.pageSize, data.total);
    el('logs-count').textContent = data.total === 0 ? '0 entrée' : `${start}–${end} sur ${data.total} entrées`;
    el('logs-prev').disabled = data.page <= 1;
    el('logs-next').disabled = data.page * data.pageSize >= data.total;
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- Paramètres ----------
async function loadSettings() {
  try {
    const data = await Api.get('/api/admin/settings');
    el('set-model').textContent = data.aiModel;
    el('set-key').innerHTML = data.apiKeyConfigured
      ? '<span class="badge badge-active">Configurée</span>'
      : '<span class="badge badge-disabled">Absente</span>';
    el('set-image-model').textContent = data.imageModel;
    el('set-image-key').innerHTML = data.imageApiConfigured
      ? '<span class="badge badge-active">Configurée</span>'
      : '<span class="badge badge-disabled">Absente — ajoutez HF_TOKEN</span>';
    el('set-daily-credits').textContent = data.dailyCredits;
    el('set-credit-costs').textContent = `${data.chatCreditCost} / ${data.imageCreditCost}`;
    el('set-smtp').innerHTML = data.smtpConfigured
      ? '<span class="badge badge-active">Configuré</span>'
      : '<span class="badge badge-disabled">Non configuré</span>';
    el('set-chat-limit').textContent = `${data.limits.rateLimitChatPerWindow} messages / ${data.limits.windowMinutes} min`;
    el('set-auth-limit').textContent = `${data.limits.rateLimitAuthPerWindow} tentatives / ${data.limits.windowMinutes} min`;
    el('set-msg-len').textContent = `${data.limits.maxMessageLength} caractères`;
    el('set-session').textContent = `${data.limits.sessionDurationDays} jours`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

boot();
