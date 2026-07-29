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

/* Primeiro acesso: faz perguntas básicas para o cliente configurar o evento.
   Só aparece uma vez (settings.onboarded) e quando o app está vazio. */
async function maybeOnboard(){
  if(state.settings.onboarded) return;
  const vazio = !state.items.length && !state.guests.length && !state.funds.length;
  if(!vazio){ state.settings.onboarded=true; save(); return; }
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
if(__boot.migrated && __boot.migrated.length) setTimeout(()=>toast(`${__boot.migrated.length} aporte(s) migrados dos itens antigos`,'ok'), 450);
