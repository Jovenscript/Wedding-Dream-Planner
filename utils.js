/* ═════════════════════════════════════════════════════════════════════
   app.js — maestro da aplicação
   O QUE: renderAll() (redesenha as duas vistas a partir do compute) e o
   Boot na ordem certa: initState → wirings → save → renderAll.
   POR QUÊ o boot vive aqui: garante que TODOS os módulos já carregaram
   antes de qualquer função rodar (evita erro de "usado antes de definir").
   ═════════════════════════════════════════════════════════════════════ */

/* Reflete o "Nome do evento" (Configurações) no cabeçalho e no <title>,
   mantendo o subtítulo genérico. Vazio → mostra o nome do produto. */
function applyEventName(){
  const nm=(state.settings && state.settings.eventName || '').trim();
  const h1=document.querySelector('.site-header h1');
  const eb=document.querySelector('.site-header .eyebrow');
  if(h1) h1.innerHTML = nm ? escapeHtml(nm) : 'Event <em>Manager</em>';
  if(eb) eb.textContent = nm ? '✦ EventFlow ✦' : '✦ EventFlow ✦';
  document.title = (nm ? nm+' — ' : '') + 'EventFlow';
  const inp=el('event-name'); if(inp && document.activeElement!==inp) inp.value=nm;
}
function renderAll(){ applyEventName(); syncVarLinkedItems(); const c=compute(); renderDashboard(c); renderFunds(c); renderItems(c); renderHistory(); renderGuestView(c); }

/* ═══════════ Boot ═══════════
   Ordem: 1) initState carrega/migra os dados; 2) os wirings ligam a interface;
   3) save persiste eventuais migrações; 4) renderAll desenha tudo.
   O firebase-sync.js (carregado por último) assume depois, se a nuvem estiver ativa. */
initState();
initOrcamentoUI();
initConvidadosUI();
save(); renderAll();
if(__boot.migrated && __boot.migrated.length) setTimeout(()=>toast(`${__boot.migrated.length} aporte(s) migrados dos itens antigos`,'ok'), 450);
