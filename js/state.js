/* ═════════════════════════════════════════════════════════════════════
   state.js — o coração dos dados
   O QUE: o objeto `state` (items, funds, guests, varCosts, history,
   settings), migração de versões antigas (migrate), sementes de custos,
   persistência local (save → localStorage) e o cálculo central (compute).
   POR QUÊ compute() é a única fonte de verdade: saldo = recursos − pago,
   sempre DERIVADO — nunca um contador solto que pode "desandar".
   FLUXO: app.js chama initState() → loadState() lê o localStorage →
   migrate() normaliza/semeia → todos os renders leem via compute().
   CONVERSA COM: convidados.js (usa os normalizadores de lá — por isso o
   initState é adiado até tudo carregar) e firebase-sync.js (hook no save).
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════ Estado + migração ═══════════ */
const STORE = '@wedding_planner_v3', LEGACY = '@wedding_planner_v2';
const DEFAULT_ITEMS = [
  {name:'DJ',                category:'Música'},      {name:'Comida (buffet)',   category:'Gastronomia'},
  {name:'Bebidas',           category:'Bebidas'},     {name:'Fotógrafo',         category:'Foto & Vídeo'},
  {name:'Cerimonialista',    category:'Organização'}, {name:'Decoradora',        category:'Decoração'},
  {name:'Vestido da noiva',  category:'Trajes'},      {name:'Terno do noivo',    category:'Trajes'},
  {name:'Maquiagem & cabelo',category:'Beleza'},      {name:'Igreja',            category:'Cerimônia'}
];
function seedItems(){ return DEFAULT_ITEMS.map(d=>({id:uid(), name:d.name, category:d.category, total:0, paid:0, paidAt:null})); }
/* Estado NOVO nasce vazio — cada conta/casal começa do zero.
   As sementes (itens padrão, custos de referência, lista de convidados)
   deixam de rodar no boot; ficam disponíveis apenas como ações manuais
   (ex.: botão "Carregar exemplos" / "Restaurar padrão"). */
function blankState(){ const settings={showOver:true, strict:true, smart:{margin:10, hours:6}, seedItems:true, seedGuests:true, seedEventCosts:true, seedSmartV2:true}; return { items:[], funds:[], history:[], guests:[], varCosts:[], settings }; }
function normFund(f){ return { id:f.id||uid(), name:f.name||'Aporte', type:f.type||'Outros', amount:Math.max(0,round2(f.amount)), date:f.date||todayISO() }; }

// Migração idempotente: aceita array antigo, {items,...} antigo ou o formato novo.
// Itens legados que só serviam de "cofre" (total 0 e pago > 0) viram aportes automaticamente.
function migrate(raw){
  let items=[], funds=[], history=[], guests=[], varCosts=[], settings={showOver:true, strict:true};
  if(Array.isArray(raw)){ items = raw; }
  else if(raw && typeof raw==='object'){
    if(Array.isArray(raw.items))   items   = raw.items;
    if(Array.isArray(raw.funds))   funds   = raw.funds;
    if(Array.isArray(raw.history)) history = raw.history;
    if(Array.isArray(raw.guests))  guests  = raw.guests;
    if(Array.isArray(raw.varCosts)) varCosts = raw.varCosts;
    if(raw.settings && typeof raw.settings==='object') settings = {...settings, ...raw.settings};
    if(typeof raw.showOver==='boolean') settings.showOver = raw.showOver;
    if(typeof raw.strict==='boolean')   settings.strict   = raw.strict;
  }
  const normItems=[]; const outFunds = funds.map(normFund); const migrated=[];
  items.forEach(it=>{
    const t = Math.max(0, round2(it.total)), p = Math.max(0, round2(it.paid));
    if(t===0 && p>0){
      const f = normFund({name:it.name, type:'Outros', amount:p, date:it.paidAt||todayISO()});
      outFunds.push(f); migrated.push(f);
    } else {
      normItems.push({ id:it.id||uid(), name:it.name||'Item', category:it.category||'Outros', total:t, paid:p, paidAt:it.paidAt||null });
    }
  });
  history = (history||[]).filter(h=>h&&typeof h==='object').map(h=>({ id:h.id||uid(), ts:h.ts||Date.now(), kind:h.kind||'ajuste', desc:h.desc||'', delta:round2(h.delta) }));
  guests = guests.filter(g=>g&&typeof g==='object').map(normGuest);
  varCosts = varCosts.filter(v=>v&&typeof v==='object').map(normVar);
  // Estados antigos que ainda não tinham perfis/margem nos custos ganham os campos novos, sem ADICIONAR itens.
  if(!settings.seedSmartV2){ upgradeSmartSeeds(varCosts, {}); settings.seedSmartV2=true; }
  settings.smart = Object.assign({margin:10, hours:6}, (settings.smart&&typeof settings.smart==='object')?settings.smart:{});
  const empty = normItems.length===0 && outFunds.length===0 && history.length===0 && guests.length===0 && varCosts.length===0;
  if(empty) return { state:blankState(), migrated:[] };
  return { state:{ items:normItems, funds:outFunds, history, guests, varCosts, settings }, migrated };
}
function loadState(){
  try{ const s=localStorage.getItem(STORE);  if(s) return migrate(JSON.parse(s)); }catch{}
  try{ const s=localStorage.getItem(LEGACY); if(s) return migrate(JSON.parse(s)); }catch{}
  return { state:blankState(), migrated:[] };
}
let __boot = null;
let state  = null;
/* Chamado uma única vez pelo app.js, DEPOIS que todos os módulos carregaram
   (os normalizadores de convidados/custos vivem em convidados.js). */
function initState(){ __boot = loadState(); state = __boot.state; }
function save(){ try{ localStorage.setItem(STORE, JSON.stringify(state)); }catch{} if(window.__cloudSave) window.__cloudSave(); }

/* Zera todos os dados desta conta (itens, aportes, convidados, custos e
   histórico), preservando apenas as preferências. Sincroniza com a nuvem. */
function resetAllData(){
  state.items=[]; state.funds=[]; state.guests=[]; state.varCosts=[]; state.history=[];
  logHist('ajuste','Sistema zerado — recomeço do planejamento',0);
  save();
}
/* Carrega, sob demanda, os exemplos/modelos (itens padrão de casamento e
   custos de referência com estimativas inteligentes). Não toca em convidados. */
function loadExampleData(){
  if(!state.items.length) state.items=seedItems();
  const st2={}; state.varCosts=upgradeSmartSeeds(seedEventCosts(state.varCosts, st2), st2);
  logHist('ajuste','Exemplos carregados (itens e custos de referência)',0);
  save();
}
function logHist(kind, desc, delta){
  state.history.unshift({ id:uid(), ts:Date.now(), kind, desc, delta:round2(delta) });
  if(state.history.length>500) state.history.length = 500;
}

async function editFund(id){
  const f=state.funds.find(x=>x.id===id); if(!f) return;
  const opts=['Guardado','A receber','Investimento','Economia mensal','Presente','Outros'];
  const res=await modal({
    title:'Editar aporte',
    fields:[
      {key:'name',   label:'Descrição', value:f.name},
      {key:'type',   label:'Tipo', type:'select', options:opts, value:opts.includes(f.type)?f.type:'Outros'},
      {key:'amount', label:'Valor', type:'money', value:f.amount},
      {key:'date',   label:'Data', type:'date', value:f.date}
    ],
    confirmText:'Salvar',
    validate:v=>{ if(!(v.name||'').trim()) return 'Dê um nome ao aporte.'; if(parseMoneyToNumber(v.amount)<=0) return 'Informe um valor maior que zero.'; return null; }
  });
  if(!res) return;
  const old=f.amount;
  f.name=(res.name||'').trim(); f.type=res.type||'Outros'; f.amount=Math.max(0,round2(parseMoneyToNumber(res.amount))); f.date=res.date||f.date;
  logHist('ajuste', `Aporte editado — ${f.name}: ${toBRL(old)} → ${toBRL(f.amount)}`, 0);
  save(); renderAll(); toast('Aporte atualizado');
}

/* ═══════════ Cálculo central (fonte única de verdade) ═══════════ */
function compute(){
  const totalExpense = state.items.reduce((a,it)=>a+(it.total||0),0);
  const totalPaid    = state.items.reduce((a,it)=>a+(it.paid||0),0);
  const totalFunds   = state.funds.reduce((a,f)=>a+(f.amount||0),0);
  const pending      = Math.max(0, totalExpense - totalPaid);
  const saldo        = round2(totalFunds - totalPaid);           // disponível (pode ser negativo)
  const faltaArrecadar = Math.max(0, round2(totalExpense - totalFunds));
  const surplus      = Math.max(0, round2(totalFunds - totalExpense));
  const pctPago      = totalExpense>0 ? clamp(totalPaid/totalExpense*100,0,100) : 0;
  const pctGarantido = totalExpense>0 ? clamp(totalFunds/totalExpense*100,0,100) : 0;
  const coveredUnpaid= clamp(Math.min(Math.max(0,saldo), pending), 0, pending);
  const uncovered    = Math.max(0, round2(pending - coveredUnpaid));
  return { totalExpense, totalPaid, totalFunds, pending, saldo, faltaArrecadar, surplus, pctPago, pctGarantido, coveredUnpaid, uncovered };
}
