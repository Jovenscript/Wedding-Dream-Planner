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
function renderAll(){ applyTheme(); applyEventName(); applyCountdown(); try{ if(typeof renderAlerts==='function' && el('alert-list')) renderAlerts(); }catch{} try{ if(typeof renderModules==='function') renderModules(); }catch{} syncVarLinkedItems(); const c=compute(); renderDashboard(c); renderFunds(c); renderItems(c); renderHistory(); renderGuestView(c); }

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
      const card=e.target.closest && e.target.closest('.card'); if(!card) return;
      const r=card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
    }, {passive:true});
  }catch{}
})();
// Fallbacks p/ modo local (sem nuvem): compartilhamento exige nuvem; avisa se faltar.
if(typeof window.publishShare!=='function'){ window.publishShare=function(){ if(!window.FIREBASE_CONFIG) toast('O link externo funciona com a conta na nuvem ativa.','warn'); }; }
if(typeof window.unpublishShare!=='function'){ window.unpublishShare=function(){}; }
// PWA: registra o service worker (app instalável + offline). Falha silenciosa em file://
// Atalho de teclado: "/" foca a busca de convidados (padrão de apps profissionais)
document.addEventListener('keydown', function(e){ /* keydown-global */
  if(e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')){
    const s=el('g-search'); if(s){ e.preventDefault(); if(location.hash!=='#convidados'&&typeof switchView==='function') switchView('convidados'); s.focus(); }
  }
});
if('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }catch{} }
if(__boot.migrated && __boot.migrated.length) setTimeout(()=>toast(`${__boot.migrated.length} aporte(s) migrados dos itens antigos`,'ok'), 450);
