// =========================================================
// LibreAI — Panneau d'administration (frontend)
// Correction stats API
// =========================================================

const el = (id) => document.getElementById(id);

let usersPage = 1;
let logsPage = 1;
let chartMain = null;
let chartAi = null;


function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}



// =========================================================
// Démarrage
// =========================================================

async function boot() {

  try {

    const { isAdmin, requirePasswordEachTime } =
      await Api.get('/api/admin/session');


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


  el('gate-form').addEventListener('submit', async (e)=>{


    e.preventDefault();


    const code = el('gate-code').value;

    const btn = el('gate-submit');


    el('gate-alert').innerHTML='';


    btn.disabled=true;

    btn.textContent='Vérification…';



    try {


      await Api.post(
        '/api/admin/verify',
        { code }
      );


      el('gate-shell').style.display='none';

      showDashboard();



    } catch(err){


      el('gate-alert').innerHTML =
      `<div class="alert alert-error">
      ⚠️ ${escapeHtml(err.message)}
      </div>`;


    } finally {


      btn.disabled=false;

      btn.textContent='Déverrouiller';


    }


  });


}




function showDashboard(){

  el('admin-shell').style.display='flex';

  bindNav();

  loadOverview();

}




// =========================================================
// Vue d'ensemble CORRIGÉE
// =========================================================


async function loadOverview(){


  try {


    const data =
      await Api.get('/api/admin/stats');



    renderKpis({

      totalUsers: data.totalUsers,

      newUsers7d: data.newUsers,

      activeUsers: data.activeUsers,

      recentlyActive: data.onlineUsers,

      totalConversations: data.totalConversations,

      totalMessages: data.totalMessages,

      totalAiRequests: data.totalAIRequests,

      aiErrors: data.totalAIErrors

    });



  } catch(err){


    toast(err.message,'error');


  }


}






function renderKpis(t){


  const cards=[


    {

      label:'Utilisateurs totaux',

      value:t.totalUsers ?? 0,

      sub:`${t.newUsers7d ?? 0} nouveaux (7j)`

    },


    {

      label:'Comptes actifs',

      value:t.activeUsers ?? 0,

      sub:`${t.recentlyActive ?? 0} connectés (24h)`

    },


    {

      label:'Conversations',

      value:t.totalConversations ?? 0,

      sub:`${t.totalMessages ?? 0} messages envoyés`

    },


    {

      label:'Requêtes IA',

      value:t.totalAiRequests ?? 0,

      sub:`${t.aiErrors ?? 0} erreurs`

    }


  ];



  el('kpi-grid').innerHTML = cards

  .map(c=>`

    <div class="glass kpi-card">

      <div class="kpi-label">
        ${c.label}
      </div>

      <div class="kpi-value">
        ${c.value}
      </div>

      <div class="kpi-sub">
        ${c.sub}
      </div>

    </div>

  `)

  .join('');

}
// =========================================================
// Navigation
// =========================================================

function bindNav() {

  document.querySelectorAll('.nav-item[data-tab]')
    .forEach((item)=>{

      item.addEventListener('click',()=>{

        switchTab(item.dataset.tab);

      });

    });



  el('admin-logout')
    ?.addEventListener('click', async()=>{

      await Api.post('/api/admin/logout');

      window.location.reload();

    });



  el('refresh-overview')
    ?.addEventListener('click',loadOverview);


  el('admin-hamburger')
    ?.addEventListener('click',()=>{

      el('admin-sidebar').classList.add('open');

      el('admin-sidebar-backdrop')
      .classList.add('open');

    });



  el('admin-sidebar-backdrop')
    ?.addEventListener('click',()=>{

      el('admin-sidebar')
      .classList.remove('open');

      el('admin-sidebar-backdrop')
      .classList.remove('open');

    });



}




function switchTab(tab){


  document
  .querySelectorAll('.nav-item[data-tab]')
  .forEach(i=>{

    i.classList.toggle(
      'active',
      i.dataset.tab===tab
    );

  });



  document
  .querySelectorAll('.tab-panel')
  .forEach(p=>{

    p.classList.toggle(
      'active',
      p.id===`tab-${tab}`
    );

  });



  if(tab==='users')
    loadUsers();


  if(tab==='logs')
    loadLogs();


  if(tab==='settings')
    loadSettings();

}



// =========================================================
// Utilisateurs
// =========================================================


async function loadUsers(){

  try{


    const data =
      await Api.get('/api/admin/users');


    renderUsersTable(data);


  }catch(err){

    toast(err.message,'error');

  }

}




function renderUsersTable(data){


  const users=data.users || [];


  if(!users.length){


    el('users-tbody').innerHTML=
    `
    <tr>
    <td colspan="9">
    Aucun utilisateur trouvé.
    </td>
    </tr>
    `;


    return;

  }



  el('users-tbody').innerHTML = users.map(u=>`

    <tr>

      <td>${u.id}</td>

      <td>${escapeHtml(u.username)}</td>

      <td>${escapeHtml(u.email)}</td>

      <td>${u.is_active ? 'Actif':'Désactivé'}</td>

      <td>${u.credits}</td>

      <td>${u.created_at || '-'}</td>

    </tr>

  `).join('');

}



// =========================================================
// Logs
// =========================================================


async function loadLogs(){

 try{


  const data =
    await Api.get('/api/admin/logs');


  const logs=data.logs || [];


  el('logs-tbody').innerHTML =
  logs.map(l=>`

  <tr>

  <td>${escapeHtml(l.action)}</td>

  <td>${escapeHtml(l.details || '')}</td>

  <td>${l.created_at}</td>

  </tr>

  `).join('');



 }catch(err){

  toast(err.message,'error');

 }

}




// =========================================================
// Paramètres
// =========================================================


async function loadSettings(){

 try{


  const data =
  await Api.get('/api/admin/settings');


  if(el('set-model'))
    el('set-model').textContent =
    data.aiModel || '-';


 }catch(err){

  toast(err.message,'error');

 }

}




// =========================================================
// Utils
// =========================================================


function toast(message,type='info'){

  console.log(type,message);

}




// Lancement

boot();
