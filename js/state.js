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
function blankState(){ const settings={showOver:true, strict:true, smart:{margin:10, hours:6, basis:'lista'}, seedItems:true, seedGuests:true, seedEventCosts:true, seedSmartV2:true}; return { items:[], funds:[], history:[], guests:[], varCosts:[], settings }; }
function normFund(f){ const amount=Math.max(0,round2(f.amount)); return { id:f.id||uid(), name:f.name||'Aporte', type:f.type||'Outros', amount, used:Math.max(0,Math.min(amount,round2(f.used))), date:f.date||todayISO() }; }

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
      normItems.push({ id:it.id||uid(), name:it.name||'Item', category:it.category||'Outros', total:t, paid:p, paidExt:Math.max(0,round2(it.paidExt)), sponsor:String(it.sponsor||'').trim(), varId:it.varId||null, paidFrom:it.paidFrom||null, paidAt:it.paidAt||null });
    }
  });
  history = (history||[]).filter(h=>h&&typeof h==='object').map(h=>({ id:h.id||uid(), ts:h.ts||Date.now(), kind:h.kind||'ajuste', desc:h.desc||'', delta:round2(h.delta) }));
  guests = guests.filter(g=>g&&typeof g==='object').map(normGuest);
  varCosts = varCosts.filter(v=>v&&typeof v==='object').map(normVar);
  // Estados antigos que ainda não tinham perfis/margem nos custos ganham os campos novos, sem ADICIONAR itens.
  if(!settings.seedSmartV2){ upgradeSmartSeeds(varCosts, {}); settings.seedSmartV2=true; }
  settings.smart = Object.assign({margin:10, hours:6, basis:'lista'}, (settings.smart&&typeof settings.smart==='object')?settings.smart:{});
  const empty = normItems.length===0 && outFunds.length===0 && history.length===0 && guests.length===0 && varCosts.length===0;
  if(empty) return { state:blankState(), migrated:[] };
  // Retrocompatibilidade: garante o invariante funds.used == items.paid.
  // Se ninguém tinha 'used' ainda, distribui o total pago entre os recursos.
  (function reconcileFunds(){
    const paidOwn = round2(normItems.reduce((a,it)=>a+(it.paid||0),0));
    let usedSum   = round2(outFunds.reduce((a,f)=>a+(f.used||0),0));
    if(outFunds.length===0) return;
    if(Math.abs(usedSum - paidOwn) < 0.005) return;         // já coerente
    outFunds.forEach(f=>f.used=0);                           // zera e redistribui
    let rest = paidOwn;
    for(const f of outFunds){ if(rest<=0) break; const take=Math.min(f.amount, rest); f.used=round2(take); rest=round2(rest-take); }
    // Se pagamos mais do que há em recursos (raro), o excedente fica sem lastro
    // e aparecerá como saldo negativo — coerente com a realidade.
  })();
  // ── Faxina de itens automáticos duplicados (ex.: sincronizações antigas da nuvem) ──
  (function dedupeAutoItems(){
    const validVar=new Set((varCosts||[]).map(v=>v.id));
    const byVar=new Map();            // varId -> item mantido (o primeiro)
    const keep=[];
    for(const it of normItems){
      if(!it.varId){ keep.push(it); continue; }         // manual: mantém
      const first=byVar.get(it.varId);
      if(!first){
        // primeiro deste varId
        if(!validVar.has(it.varId) && !((it.paid||0)>0 || (it.paidExt||0)>0)){
          continue;                                      // órfão sem pagamento: descarta
        }
        byVar.set(it.varId, it); keep.push(it);
      } else {
        // DUPLICADO: funde pagamentos no primeiro e descarta (NÃO cria manual novo)
        first.paid    = round2((first.paid||0)    + (it.paid||0));
        first.paidExt = round2((first.paidExt||0) + (it.paidExt||0));
        if(it.sponsor && !first.sponsor) first.sponsor=it.sponsor;
      }
    }
    // corrige pagamento que exceda o total, e converte órfãos remanescentes em manuais
    for(const it of keep){
      if(it.varId){
        const cap=it.total||0;
        if((it.paid||0)+(it.paidExt||0) > cap) it.paid=Math.max(0, round2(cap-(it.paidExt||0)));
        if(!validVar.has(it.varId)) delete it.varId;     // custo sumiu, mas tinha pagamento → vira manual único
      }
    }
    normItems.length=0; normItems.push(...keep);
  })();
  const built = { items:normItems, funds:outFunds, history, guests, varCosts, settings };
  return { state: built, migrated };
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

/* RESET TOTAL (fábrica): apaga TUDO — dados, preferências, nome do evento
   e o localStorage inteiro do app (v3 e o antigo v2). Se a nuvem estiver
   ativa, o vazio é sincronizado antes de recarregar a página. */
function resetTotal(){
  state = blankState();
  try{ localStorage.removeItem(STORE); localStorage.removeItem('@wedding_planner_v2'); }catch{}
  save();  // repersiste o estado de fábrica e empurra para a nuvem (se logado)
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
    validate:v=>{ if(!(v.name||'').trim()) return 'Dê um nome ao aporte.'; const a=parseMoneyToNumber(v.amount); if(a<=0) return 'Informe um valor maior que zero.'; if(a < (f.used||0)-0.005) return `Este recurso já tem ${toBRL(f.used)} usados em pagamentos. O valor não pode ficar abaixo disso (estorne antes se precisar reduzir).`; return null; }
  });
  if(!res) return;
  const old=f.amount;
  f.name=(res.name||'').trim(); f.type=res.type||'Outros'; f.amount=Math.max(0,round2(parseMoneyToNumber(res.amount))); f.used=Math.max(0,Math.min(f.amount, f.used||0)); f.date=res.date||f.date;
  logHist('ajuste', `Aporte editado — ${f.name}: ${toBRL(old)} → ${toBRL(f.amount)}`, 0);
  save(); renderAll(); toast('Aporte atualizado');
}

/* ═══════════ Cálculo central (fonte única de verdade) ═══════════ */
function compute(){
  /* ═══════════ REGRA DE NEGÓCIO ÚNICA (fonte da verdade) ═══════════
     Despesas (items): total = quanto custa; paid = pago com NOSSOS recursos
     (sai dos aportes); paidExt = pago por terceiros (ex.: DJ do irmão) — não
     usa o nosso caixa. Recursos (funds): amount = quanto entrou; used =
     quanto já foi gasto em pagamentos.
     INVARIANTE-CHAVE: soma dos funds.used === soma dos items.paid
     (todo pagamento nosso sai de algum recurso; nada é contado em dobro). */
  const totalExpense = round2(state.items.reduce((a,it)=>a+(it.total||0),0)); // previsto (inclui itens de terceiros)
  const paidOwn      = round2(state.items.reduce((a,it)=>a+(it.paid||0),0));   // pago com nosso dinheiro
  const paidExt      = round2(state.items.reduce((a,it)=>a+(it.paidExt||0),0));// pago por terceiros
  const totalPaid    = round2(paidOwn + paidExt);                             // pago no total (progresso)
  const pending      = Math.max(0, round2(totalExpense - totalPaid));          // ainda falta pagar

  const totalFunds   = round2(state.funds.reduce((a,f)=>a+(f.amount||0),0));   // recursos cadastrados
  const usedFunds    = round2(state.funds.reduce((a,f)=>a+(f.used||0),0));     // recursos já gastos
  const saldo        = round2(totalFunds - usedFunds);                        // DINHEIRO EM CAIXA disponível

  /* Cobertura do objetivo = TODO o dinheiro que conta para o casamento:
     o que ainda temos em caixa (saldo) + o que JÁ gastamos dos recursos
     (usedFunds) + o que terceiros bancam (paidExt).
     saldo + usedFunds = totalFunds, então: coverage = totalFunds + paidExt...
     MAS só quando usedFunds == paidOwn (invariante). Para ser à prova de
     qualquer descasamento, somamos explicitamente o que já pagamos do nosso
     bolso (paidOwn), que é o dinheiro que saiu de recursos e virou pagamento. */
  const coverage       = round2(saldo + paidOwn + paidExt);
  const faltaArrecadar = Math.max(0, round2(totalExpense - coverage));         // quanto ainda precisa ENTRAR
  const surplus        = Math.max(0, round2(coverage - totalExpense));

  const pctPago      = totalExpense>0 ? clamp(totalPaid/totalExpense*100,0,100) : 0;
  const pctGarantido = totalExpense>0 ? clamp(coverage/totalExpense*100,0,100) : 0;

  // Do que ainda falta pagar, quanto o caixa atual cobre e quanto ficaria a descoberto
  const coveredUnpaid= clamp(Math.min(Math.max(0,saldo), pending), 0, pending);
  const uncovered    = Math.max(0, round2(pending - coveredUnpaid));

  return { totalExpense, totalPaid, paidOwn, paidExt, pending,
           totalFunds, usedFunds, saldo, coverage, faltaArrecadar, surplus,
           pctPago, pctGarantido, coveredUnpaid, uncovered };
}

/* Saldo disponível de UM recurso específico (amount − used). */
function fundBalance(f){ return round2((f.amount||0) - (f.used||0)); }
/* Aplica/estorna consumo de um recurso, sem passar do disponível nem de zero. */
function fundUse(fundId, delta){
  const f=state.funds.find(x=>x.id===fundId); if(!f) return 0;
  const applied=round2(Math.max(-(f.used||0), Math.min(delta, fundBalance(f))));
  f.used=round2((f.used||0)+applied);
  return applied;
}