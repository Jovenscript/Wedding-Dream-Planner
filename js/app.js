/* ═══════════════════════════════════════════════════════════════════════
   MODO SOMENTE-LEITURA (Admin/Cerimonialista)
   Quando window.READONLY=true (setado por admin.html), TODAS as funções
   de escrita/edição são bloqueadas. Mostra um toast e não faz nada.
   A proteção REAL fica nas regras do Firestore (que rejeitam writes
   sem uid dono). Isto aqui é a UX para nunca deixar tentar.
   ═══════════════════════════════════════════════════════════════════════ */
(function readonlyShield(){
  if(!window.READONLY) return;

  function blocked(msg){
    if(typeof toast==='function') toast(msg||'Você possui acesso somente para visualização.', 'warn');
    return undefined;
  }

  // Espera o restante dos scripts carregar, então "envolve" as funções perigosas
  function wrapDangerous(){
    const targets = [
      // salvar/sincronizar
      'save', 'saveNow', 'commitState',
      // itens/aportes
      'addItem', 'removeItem', 'editItem', 'markPaid', 'markUnpaid', 'payItem',
      'addFund', 'removeFund', 'editFund',
      // convidados
      'addGuest', 'removeGuest', 'editGuest', 'toggleGuestStatus',
      // módulos
      'editTask', 'removeTask', 'editSchedule', 'removeSchedule',
      'editSupplier', 'removeSupplier',
      'editShare', 'removeShare', 'unpublishShare',
      'publishInvite', 'unpublishInvite',
      // demo
      'loadDemoData', 'maybeOnboard'
    ];
    targets.forEach(fnName=>{
      const fn = window[fnName];
      if(typeof fn === 'function'){
        window[fnName] = function(){
          blocked();
          return typeof fn.returnDefault === 'function' ? undefined : (Array.isArray(fn.returnDefault) ? [] : undefined);
        };
      }
    });

    // Também intercepta cliques em botões de ação (add-, edit-, delete-)
    document.addEventListener('click', function(e){
      if(!window.READONLY) return;
      const t = e.target.closest('button, a');
      if(!t) return;
      // Botões de nav (mudar de view) e o hambúrguer devem funcionar
      const isNav = t.classList.contains('side-link') || t.classList.contains('tab') || t.id==='hamburger' || t.id==='drawer-close' || t.id==='alert-bell';
      if(isNav) return;
      // Ações claramente de escrita
      const isWrite = t.id && /^(add|new-|g-add|task-add|sched-add|sup-add|share-add|inv-refresh|demo-)/i.test(t.id)
        || t.dataset.act && /^(edit|del|remove|create|save|pay|new)/i.test(t.dataset.act)
        || /adicionar|editar|remover|excluir|criar|salvar|pagar/i.test((t.textContent||'').trim().toLowerCase());
      if(isWrite){
        e.preventDefault();
        e.stopPropagation();
        blocked();
      }
    }, true); // capture=true para pegar ANTES do listener normal

    // Bloqueia onboarding IMEDIATAMENTE (antes do resto carregar)
    window.maybeOnboard = function(){ /* no-op em readonly */ };
    // Marca visualmente: adiciona "readonly-mode" no <html> pra CSS reagir
    document.documentElement.classList.add('readonly-mode');
  }

  // Roda depois que tudo carregou
  if(document.readyState==='complete') wrapDangerous();
  else window.addEventListener('load', wrapDangerous);
})();

/* ═════════════════════════════════════════════════════════════════════
   app.js — maestro da aplicação
   O QUE: renderAll() (redesenha as duas vistas a partir do compute) e o
   Boot na ordem certa: initState → wirings → save → renderAll.
   POR QUÊ o boot vive aqui: garante que TODOS os módulos já carregaram
   antes de qualquer função rodar (evita erro de "usado antes de definir").
   ═════════════════════════════════════════════════════════════════════ */

/* Aplica o tema de cores salvo (settings.theme). 'olive' = padrão (sem atributo). */
function applyTheme(){
  const t=(state.settings&&state.settings.theme)||'olive';
  if(t==='olive') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const tm=document.querySelector('meta[name=theme-color]');
  const c=getComputedStyle(document.documentElement).getPropertyValue('--olive').trim();
  if(tm && c) tm.setAttribute('content', c);
  // marca o swatch ativo
  document.querySelectorAll('.theme-swatch').forEach(b=>b.classList.toggle('active', (b.dataset.themeVal||'olive')===t));
}
/* Contagem regressiva: se há data do evento, mostra "faltam X dias" no topo. */
function applyCountdown(){
  const cd=el('countdown'); if(!cd) return;
  const d=(state.settings&&state.settings.eventDate)||'';
  const di=el('event-date'); if(di && document.activeElement!==di && di.value!==d) di.value=d;
  if(!d){ cd.hidden=true; return; }
  const target=new Date(d+'T00:00:00'); const now=new Date(); now.setHours(0,0,0,0);
  const days=Math.round((target-now)/86400000);
  cd.classList.remove('today');
  if(days>1) cd.innerHTML=`✦ Faltam <span class="cd-num">${days}</span> dias para o grande dia`;
  else if(days===1) cd.innerHTML=`✦ É amanhã! <span class="cd-num">1</span> dia`;
  else if(days===0){ cd.innerHTML=`🎉 É hoje! Aproveite cada momento`; cd.classList.add('today'); }
  else cd.innerHTML=`✦ Evento realizado há <span class="cd-num">${Math.abs(days)}</span> dias`;
  cd.hidden=false;
}
/* Reflete o "Nome do evento" (Configurações) no cabeçalho e no <title>,
   mantendo o subtítulo genérico. Vazio → mostra o nome do produto. */
function applyEventName(){
  const nm=(state.settings && state.settings.eventName || '').trim();
  const h1=document.querySelector('.site-header h1');
  const eb=document.querySelector('.site-header .eyebrow');
  if(h1) h1.innerHTML = nm ? escapeHtml(nm) : 'Event <em>Manager</em>';
  if(eb) eb.textContent = nm ? '✦ EventFlow ✦' : '✦ EventFlow ✦';
  document.title = (nm ? nm+' — ' : '') + 'EventFlow';
  const inp=el('event-name'); if(inp && document.activeElement!==inp && inp.value!==nm) inp.value=nm;
}
function renderAll(){
  const safe=(fn,name)=>{ try{ fn(); }catch(e){ console.error('renderAll:'+name, e); } };
  safe(applyTheme,'applyTheme'); safe(applyEventName,'applyEventName'); safe(applyCountdown,'applyCountdown');
  safe(()=>{ const db=el('demo-banner'); if(db) db.hidden = !(state.settings&&state.settings.demo); },'demoBanner');
  safe(()=>{ if(typeof renderAlerts==='function' && el('alert-list')) renderAlerts(); },'renderAlerts');
  safe(()=>{ if(typeof renderModules==='function') renderModules(); },'renderModules');
  safe(()=>{ if(typeof renderSorteio==='function') renderSorteio(); },'renderSorteio');
  safe(syncVarLinkedItems,'syncVar');
  let c; try{ c=compute(); }catch(e){ console.error('compute',e); return; }
  safe(()=>renderDashboard(c),'renderDashboard'); safe(()=>renderFunds(c),'renderFunds');
  safe(()=>renderItems(c),'renderItems'); safe(renderHistory,'renderHistory'); safe(()=>renderGuestView(c),'renderGuestView');
}

/* Primeiro acesso: faz perguntas básicas para o cliente configurar o evento.
   Só aparece uma vez (settings.onboarded) e quando o app está vazio. */
let __onboarding=false;
async function maybeOnboard(){
  if(__onboarding) return;                       // não abre duas vezes
  if(state.settings.onboarded) return;
  const vazio = !state.items.length && !state.guests.length && !state.funds.length;
  if(!vazio){ state.settings.onboarded=true; save(); return; }
  __onboarding=true;
  const res=await modal({
    title:'Bem-vindo(a) ao EventFlow 🎉',
    message:'Vamos configurar seu evento em segundos. Você pode mudar tudo depois.',
    fields:[
      {key:'name',  label:'Nome do evento', value:''},
      {key:'kind',  label:'Tipo de evento', type:'select', options:['Casamento','Aniversário','Confraternização','Corporativo','Formatura','Outro'], value:'Casamento'},
      {key:'margin',label:'Margem de segurança nas bebidas (%)', type:'number', value:10},
      {key:'basis', label:'Estimar bebidas/comida para', type:'select', options:['Toda a lista (recomendado)','Só quem confirmar'], value:'Toda a lista (recomendado)'}
    ],
    confirmText:'Começar', hideCancel:true
  });
  if(res){
    state.settings.eventName=(res.name||'').trim();
    state.settings.eventKind=res.kind||'Casamento';
    state.settings.smart=Object.assign({margin:10,hours:6,basis:'lista'}, state.settings.smart||{});
    const m=Number(String(res.margin).replace(',','.')); if(isFinite(m)) state.settings.smart.margin=Math.max(0,Math.min(100,m));
    state.settings.smart.basis = String(res.basis).startsWith('Só') ? 'confirmados' : 'lista';
  }
  state.settings.onboarded=true;
  save(); renderAll();
  __onboarding=false;
  // oferece carregar exemplos para o cliente ver o app preenchido
  const go=await confirmDialog('Quer um ponto de partida?', 'Posso carregar itens típicos e custos de referência (chope, comida, bolo…) para você só ajustar os valores. Ou começar em branco.', {danger:false, confirmText:'Carregar exemplos', cancelText:'Começar em branco'});
  if(go){ loadExampleData(); renderAll(); toast('Exemplos carregados — ajuste os valores','ok'); }
}

/* ═══════════ Boot ═══════════
   Ordem: 1) initState carrega/migra os dados; 2) os wirings ligam a interface;
   3) save persiste eventuais migrações; 4) renderAll desenha tudo.
   O firebase-sync.js (carregado por último) assume depois, se a nuvem estiver ativa. */
initState();
initOrcamentoUI();
initConvidadosUI();
save(); renderAll();
// Onboarding: em modo LOCAL roda já; em modo NUVEM, o firebase-sync dispara
// window.__maybeOnboard() só DEPOIS de baixar os dados (evita o modal piscar/travar).
if(!window.FIREBASE_CONFIG){ maybeOnboard(); }
window.__maybeOnboard = maybeOnboard;
// Uso interno (sem botão visível): no console do navegador digite implantarTudo()
// para carregar o preset do casamento Carol & Marlon. Invisível para clientes.
try{ window.presetCasamento = function(){ implantarTudo(); renderAll(); if(typeof switchView==='function') switchView('convidados'); toast('Preset carregado','ok'); }; }catch{}
// SHELL FX: reveal suave dos cards no scroll + motion do dashboard.
// Só liga se o navegador suporta IntersectionObserver (senão, tudo fica visível).
(function initShellFX(){
  try{
    if(!('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('fx');
    const io=new IntersectionObserver((ents)=>{
      ents.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{ threshold:.08, rootMargin:'0px 0px -6% 0px' });
    document.querySelectorAll('.card').forEach(c=>io.observe(c));
    // Segurança: revela cards que já estão visíveis na tela no carregamento,
    // e revela QUALQUER card não revelado após 1.5s (nunca fica invisível).
    setTimeout(()=>{ document.querySelectorAll('.card:not(.in)').forEach(c=>{
      const r=c.getBoundingClientRect(); if(r.top < window.innerHeight && r.bottom > 0) c.classList.add('in');
    }); }, 100);
    setTimeout(()=>{ document.querySelectorAll('.card:not(.in)').forEach(c=>c.classList.add('in')); }, 1500);
  }catch{ document.documentElement.classList.remove('fx'); }
})();
// Sidebar → Configurações: troca pra vista Financeiro e rola até o card de config
(function(){ const b=el('side-config'); if(!b) return;
  b.addEventListener('click', ()=>{
    if(typeof switchView==='function') switchView('orcamento');
    const alvo=el('event-name'); if(alvo){ const card=alvo.closest('.card'); (card||alvo).scrollIntoView({behavior:'smooth', block:'start'}); }
  });
})();
// Spotlight: o brilho no topo do card segue o mouse (só desktop, leve).
(function cardSpotlight(){
  try{
    if(matchMedia('(pointer:coarse)').matches) return;
    document.addEventListener('pointermove', (e)=>{
      const t=e.target; if(!t || typeof t.closest!=='function') return; const card=t.closest('.card'); if(!card) return;
      const r=card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
    }, {passive:true});
  }catch{}
})();
// Fallbacks p/ modo local (sem nuvem): compartilhamento exige nuvem; avisa se faltar.
if(typeof window.publishShare!=='function'){ window.publishShare=function(){ if(!window.FIREBASE_CONFIG) toast('O link externo funciona com a conta na nuvem ativa.','warn'); }; }
if(typeof window.unpublishShare!=='function'){ window.unpublishShare=function(){}; }
if(typeof window.publishInvite!=='function'){ window.publishInvite=function(){ if(!window.FIREBASE_CONFIG) toast('Convites funcionam com a conta na nuvem ativa.','warn'); }; }
if(typeof window.unpublishInvite!=='function'){ window.unpublishInvite=function(){}; }
if(typeof window.fetchRSVP!=='function'){ window.fetchRSVP=null; }

// ═══ WIRING CENTRAL — liga notificações, botões dos módulos e navegação ═══
// (Este bloco reúne toda a inicialização de interação num só lugar seguro.)
(function wireEverything(){
  try{
    // Central de Alertas / Notificações
    if(typeof initAlerts==='function') initAlerts();
    // Kanban drag-and-drop
    if(typeof initKanbanDnD==='function') initKanbanDnD();
    // helper de clique seguro
    const on=(id,fn)=>{ const b=el(id); if(b) b.addEventListener('click', fn); };
    // botões "+" dos módulos
    on('task-add',   ()=>editTask());
    on('sched-add',  ()=>editSchedule());
    on('sup-add',    ()=>editSupplier());
    on('share-add',  ()=>editShare());
    on('inv-refresh',()=>checkAllRSVP());
    on('admin-add', ()=>editAdminAccess());
    // ── SORTEIO DA GRAVATA ──
    // Delegação: os botões do palco (sortear / refazer) e do resultado
    // (sortear outro / confirmar) nascem no render, então não dá para ligar
    // um a um no boot — um único listener na vista cobre todos.
    const svw=el('view-sorteio');
    if(svw){
      svw.addEventListener('click', e=>{
        const b=e.target.closest('button'); if(!b || !svw.contains(b)) return;
        switch(b.id){
          case 'sort-run':            runSorteio(); break;
          case 'sort-again':          runSorteio(); break;
          case 'sort-confirm-winner': confirmWinner(); break;
          case 'sort-reset':          resetSorteio(); break;
          case 'sort-mark-all':       markAllBuyers(); break;
          case 'sort-unmark-all':     unmarkAllBuyers(); break;
          case 'sort-csv':            exportSorteioCSV(); break;
        }
      });
      // toggles "comprou gravata" (a lista é redesenhada a cada clique)
      svw.addEventListener('change', e=>{
        const c=e.target.closest('input[data-sort-buyer]'); if(!c) return;
        toggleBuyer(c.dataset.sortBuyer);
      });
      const ss=el('sort-search');
      if(ss) ss.addEventListener('input', ()=>{ sortSearch=ss.value; renderSorteio(); });
      const sp=el('sort-price');
      if(sp && typeof attachMoney==='function'){
        attachMoney(sp, ()=>sorteioPrice(), n=>setSorteioPrice(n));
      }
    }
    // relatórios CSV
    on('task-csv', ()=>reportTasks());
    on('sup-csv',  ()=>reportSuppliers());
    on('guests-csv',()=>reportGuests());
    // Modo demonstração — ativar
    on('demo-mode', async ()=>{
      const temDados = state.guests.length || state.items.length || (state.suppliers&&state.suppliers.length);
      const ok = temDados ? await confirmDialog('Ativar modo demonstração','Isto vai guardar seus dados atuais e mostrar um evento fictício de exemplo. Você poderá voltar aos seus dados a qualquer momento. Continuar?',{confirmText:'Ativar demo'}) : true;
      if(ok && typeof loadDemoData==='function') loadDemoData();
    });
    // Modo demonstração — sair (restaura backup)
    on('demo-exit', async ()=>{
      const temBackup = !!localStorage.getItem('@eventflow_prebackup');
      const msg = temBackup ? 'Isto vai remover os dados fictícios e RESTAURAR os seus dados reais. Continuar?' : 'Isto vai remover os dados fictícios de demonstração. Continuar?';
      if(await confirmDialog('Sair do modo demonstração', msg, {confirmText:'Sair do demo'})){
        try{ const bk=localStorage.getItem('@eventflow_prebackup');
          if(bk){ localStorage.setItem('@wedding_planner_v3', bk); localStorage.removeItem('@eventflow_prebackup'); }
          else { localStorage.removeItem('@wedding_planner_v3'); }
        }catch{}
        location.reload();
      }
    });
    // ── MENU DRAWER (hambúrguer no mobile) ──
    const drawer=el('app-side'), overlay=el('drawer-overlay'), burger=el('hamburger'), closeBtn=el('drawer-close');
    function openDrawer(){ if(!drawer) return; drawer.classList.add('open'); if(overlay){ overlay.hidden=false; requestAnimationFrame(()=>overlay.classList.add('show')); } if(burger) burger.setAttribute('aria-expanded','true'); }
    function closeDrawer(){ if(!drawer) return; drawer.classList.remove('open'); if(overlay){ overlay.classList.remove('show'); setTimeout(()=>{ overlay.hidden=true; }, 300); } if(burger) burger.setAttribute('aria-expanded','false'); }
    if(burger) burger.addEventListener('click', openDrawer);
    if(overlay) overlay.addEventListener('click', closeDrawer);
    if(closeBtn) closeBtn.addEventListener('click', closeDrawer);
    // fechar drawer ao escolher qualquer item do menu
    if(drawer) drawer.querySelectorAll('.side-link[data-view], #side-config').forEach(link=>{
      link.addEventListener('click', ()=>{ setTimeout(closeDrawer, 120); });
    });
    // config no drawer (side-config já existe)
    window.__closeDrawer = closeDrawer;
  }catch(e){ console.error('wireEverything', e); }
})();

// PWA: registra o service worker (app instalável + offline). Falha silenciosa em file://
// Atalho de teclado: "/" foca a busca de convidados (padrão de apps profissionais)
document.addEventListener('keydown', function(e){ /* keydown-global */
  if(e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')){
    const s=el('g-search'); if(s){ e.preventDefault(); if(location.hash!=='#convidados'&&typeof switchView==='function') switchView('convidados'); s.focus(); }
  }
});
if('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch{} }
if(__boot.migrated && __boot.migrated.length) setTimeout(()=>toast(`${__boot.migrated.length} aporte(s) migrados dos itens antigos`,'ok'), 450);
