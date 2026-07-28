/* ═════════════════════════════════════════════════════════════════════
   orcamento.js — vista Orçamento
   O QUE: aportes (add/editar/remover), pagamentos (payItem com aviso de
   saldo, estorno, remoção), renders do painel financeiro/aportes/itens/
   histórico e o wiring initOrcamentoUI().
   REGRA DE OURO: pagar só via botão "Pagar" → desconta do saldo derivado,
   registra no histórico e muda o status (Pago parcial / Quitado).
   CONVERSA COM: state.js (dados/compute), ui.js (modal/toast),
   convidados.js (itens automáticos chegam prontos via syncVarLinkedItems).
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════ Ações: aportes ═══════════ */
function addFundFromForm(){
  const nameEl=el('fund-name'), typeEl=el('fund-type'), amtEl=el('fund-amount'), dateEl=el('fund-date');
  const name=(nameEl.value||'').trim();
  const amount=Math.max(0, parseMoneyToNumber(amtEl.dataset.raw||amtEl.value));
  const type=typeEl.value||'Outros';
  const date=dateEl.value||todayISO();
  if(!name){ nameEl.focus(); toast('Dê um nome ao aporte.','warn'); return; }
  if(amount<=0){ amtEl.focus(); toast('Informe um valor maior que zero.','warn'); return; }
  state.funds.unshift(normFund({name, type, amount, date}));
  logHist('aporte', `Aporte — ${name}`, +amount);
  save(); renderAll();
  nameEl.value=''; amtEl.value=''; amtEl.dataset.raw='0'; dateEl.value=todayISO(); nameEl.focus();
  toast(`Aporte de ${toBRL(amount)} adicionado`,'ok');
}
async function removeFund(id){
  const f=state.funds.find(x=>x.id===id); if(!f) return;
  const ok=await confirmDialog('Remover aporte', `Remover “${f.name}” (${toBRL(f.amount)})? O saldo disponível será reduzido nesse valor.`, {confirmText:'Remover'});
  if(!ok) return;
  state.funds=state.funds.filter(x=>x.id!==id);
  logHist('exclusao', `Aporte removido — ${f.name}`, -f.amount);
  save(); renderAll(); toast('Aporte removido');
}

/* ═══════════ Ações: pagamentos ═══════════ */
async function payItem(id){
  const it=state.items.find(x=>x.id===id); if(!it) return;
  const c=compute();
  const remaining=Math.max(0, round2((it.total||0)-(it.paid||0)-(it.paidExt||0)));
  if(remaining<=0){ toast('Este item já está quitado.'); return; }
  const SRC_SALDO='Saldo dos aportes (desconta do caixa)', SRC_EXT='Terceiro — presente/família (não mexe no caixa)';
  const res=await modal({
    title:`Pagar — ${it.name}`,
    fields:[
      {key:'amount', label:'Valor a pagar', type:'money', value:remaining},
      {key:'source', label:'De onde sai o dinheiro?', type:'select', options:[SRC_SALDO, SRC_EXT], value:it.sponsor?SRC_EXT:SRC_SALDO},
      {key:'sponsor', label:'Quem pagou? (se terceiro — ex.: Irmão)', value:it.sponsor||''}
    ],
    note:`Falta neste item: ${toBRL(remaining)}   ·   Saldo disponível em caixa: ${toBRL(c.saldo)}`,
    confirmText:'Registrar pagamento',
    dynamicNote:(v)=>{ if(v.source===SRC_EXT) return {warn:false, text:'Pagamento de terceiro: entra no progresso do evento, mas não desconta do seu saldo.'}; const a=parseMoneyToNumber(v.amount); if(a>0 && a>c.saldo){ const falta=round2(a-Math.max(0,c.saldo)); return {warn:true, text:`Saldo insuficiente: faltam ${toBRL(falta)} de saldo para este pagamento (disponível ${toBRL(Math.max(0,c.saldo))}). Você pode pagar ${toBRL(Math.max(0,Math.min(c.saldo,remaining)))} agora e complementar depois com um novo aporte.`}; } return null; },
    validate:(v)=>{ const a=parseMoneyToNumber(v.amount); if(a<=0) return 'Informe um valor maior que zero.'; if(state.settings.strict && a>remaining+0.001) return `O valor não pode passar do que falta neste item (${toBRL(remaining)}).`; return null; }
  });
  if(!res) return;
  let a=parseMoneyToNumber(res.amount);
  if(state.settings.strict) a=Math.min(a, remaining);
  a=round2(a);
  const ext = res.source===SRC_EXT;
  if(ext){
    it.paidExt=round2((it.paidExt||0)+a);
    it.sponsor=(res.sponsor||'').trim()||it.sponsor||'Terceiro';
    logHist('pagamento', `Pagamento — ${it.name} (pago por ${it.sponsor}, sem usar o saldo)`, 0);
  } else {
    it.paid=round2((it.paid||0)+a);
    if(state.settings.strict && round2((it.paid||0)+(it.paidExt||0))>it.total) it.paid=round2(it.total-(it.paidExt||0));
    logHist('pagamento', `Pagamento — ${it.name} (saldo dos aportes → despesa)`, -a);
  }
  save(); renderAll();
  const now=Math.max(0, round2((it.total||0)-(it.paid||0)-(it.paidExt||0)));
  toast(now<=0 ? `${it.name} quitado ✓` : `Pago ${toBRL(a)} · falta ${toBRL(now)}`, 'ok');
}
async function estornoItem(id){
  const it=state.items.find(x=>x.id===id); if(!it) return;
  const own=it.paid||0, ext=it.paidExt||0, amt=round2(own+ext); if(amt<=0) return;
  const msg = ext>0 ? `Estornar ${toBRL(amt)} de “${it.name}”? ${toBRL(own)} voltam ao saldo; ${toBRL(ext)} eram de terceiros e apenas saem do registro.` : `Estornar ${toBRL(amt)} de “${it.name}”? O valor volta para o saldo disponível.`;
  const ok=await confirmDialog('Cancelar pagamento', msg, {confirmText:'Estornar'});
  if(!ok) return;
  it.paid=0; it.paidExt=0; it.paidAt=null;
  logHist('estorno', `Pagamento cancelado — ${it.name}`+(ext>0?` (${toBRL(ext)} eram de terceiros)`:''), +own);
  save(); renderAll(); toast('Pagamento estornado');
}
async function removeItem(id){
  const it=state.items.find(x=>x.id===id); if(!it) return;
  const paid=it.paid||0;
  const msg = paid>0 ? `Remover “${it.name}”? Ele tem ${toBRL(paid)} pago — esse valor volta ao saldo disponível.` : `Remover “${it.name}”?`;
  const ok=await confirmDialog('Remover item', msg, {confirmText:'Remover'});
  if(!ok) return;
  state.items=state.items.filter(x=>x.id!==id);
  logHist('exclusao', `Item removido — ${it.name}`, +paid);
  save(); renderAll(); toast('Item removido');
}

/* ═══════════ Render ═══════════ */
function setKPI(id, val, cls){ const n=el(id); if(!n) return; n.textContent=val; n.classList.remove('pos','neg','accent'); if(cls) n.classList.add(cls); }

function renderDashboard(c){
  setKPI('k-total',  toBRL(c.totalExpense));
  setKPI('k-paid',   toBRL(c.totalPaid));
  setKPI('k-pending',toBRL(c.pending));
  setKPI('k-saldo',  toBRL(c.saldo), c.saldo<0?'neg':(c.saldo>0?'pos':null));
  setKPI('k-funds',  toBRL(c.totalFunds));
  setKPI('k-falta',  toBRL(c.faltaArrecadar), c.faltaArrecadar>0?'neg':'pos');
  setKPI('k-surplus',toBRL(c.surplus), c.surplus>0?'pos':null);

  el('bar-pago').style.width = c.pctPago.toFixed(2)+'%';
  el('bar-pago-legend').textContent = `${c.pctPago.toFixed(0)}% pago`;
  el('bar-gar').style.width = c.pctGarantido.toFixed(2)+'%';
  el('bar-gar-legend').textContent = `${c.pctGarantido.toFixed(0)}% garantido`;

  const total=c.totalExpense;
  const segPago = total>0 ? c.totalPaid/total*100 : 0;
  const segRes  = total>0 ? c.coveredUnpaid/total*100 : 0;
  const donut=el('donut');
  donut.style.setProperty('--p1', segPago.toFixed(3));
  donut.style.setProperty('--p2', (segPago+segRes).toFixed(3));
  el('donut-big').textContent = `${c.pctPago.toFixed(0)}%`;
  el('donut-small').textContent = total>0 ? 'pago' : 'sem itens';
  el('leg-pago').textContent = toBRL(c.totalPaid);
  el('leg-res').textContent  = toBRL(c.coveredUnpaid);
  el('leg-falta').textContent= toBRL(c.uncovered);
}

function renderFunds(c){
  const amtEl=el('saldo-amt'); amtEl.textContent=toBRL(c.saldo); amtEl.classList.toggle('neg', c.saldo<0);
  el('saldo-sub').textContent = `Recursos ${toBRL(c.totalFunds)} − pago ${toBRL(c.totalPaid)}`;
  const list=el('fund-list');
  if(!state.funds.length){ list.innerHTML=`<div class="empty">Nenhum aporte ainda. Cadastre dinheiro guardado, valores a receber, contribuições e economias — tudo vira saldo disponível.</div>`; return; }
  list.innerHTML='';
  state.funds.forEach(f=>{
    const row=document.createElement('div'); row.className='fund-row';
    row.innerHTML =
      `<span class="pill">${escapeHtml(f.type)}</span>`+
      `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">`+
        `<span class="f-name editable" title="Editar aporte">${escapeHtml(f.name)}</span>`+
        `<span class="f-date">${fmtDate(f.date)}</span>`+
      `</div>`+
      `<span class="f-amt">+ ${toBRL(f.amount)}</span>`+
      `<div class="row-actions">`+
        `<button class="btn-sm ghost" data-act="edit" title="Editar aporte" aria-label="Editar aporte">Editar</button>`+
        `<button class="icon-btn" data-act="del" title="Remover aporte" aria-label="Remover aporte">✕</button>`+
      `</div>`;
    row.querySelector('.f-name').addEventListener('click', ()=>editFund(f.id));
    row.querySelector('[data-act="edit"]').addEventListener('click', ()=>editFund(f.id));
    row.querySelector('[data-act="del"]').addEventListener('click', ()=>removeFund(f.id));
    list.appendChild(row);
  });
}

function statusOf(it){
  const t=it.total||0, p=round2((it.paid||0)+(it.paidExt||0));
  if(t>0 && p>=t) return {cls:'ok',    label:'Quitado'};
  if(p>0)         return {cls:'warn',  label:'Pago parcial'};
  if(t>0)         return {cls:'warn',  label:'Em aberto'};
  return               {cls:'danger',label:'Sem valor'};
}

function renderItems(c){
  const tbody=el('tbody'); tbody.innerHTML='';
  if(!state.items.length){ tbody.innerHTML=`<tr><td colspan="7"><div class="empty">Nenhum item. Adicione fornecedores e serviços no campo acima.</div></td></tr>`; return; }
  state.items.forEach(it=>{
    const t=it.total||0, p=round2((it.paid||0)+(it.paidExt||0));
    const remaining=Math.max(0, round2(t-p));
    const quit=(t>0 && p>=t);
    const row=document.createElement('tr'); if(quit) row.className='quitado';

    const tdName=document.createElement('td');
    tdName.innerHTML=`<div class="name">${quit?'<span style="color:var(--ok)" aria-hidden="true">✓</span>':''}<input class="name-input" type="text" value="${escapeHtml(it.name)}" aria-label="Nome do item"></div>`;
    row.appendChild(tdName);

    const tdCat=document.createElement('td'); tdCat.innerHTML=`<span class="pill">${escapeHtml(it.category||'—')}</span>${it.varId?'<span class="auto-tag" title="Calculado pelos convidados confirmados — edite em Convidados › Custos por Convidado">auto</span>':''}`; row.appendChild(tdCat);

    const tdTotal=document.createElement('td');
    const totalInput=document.createElement('input'); totalInput.type='text'; totalInput.className='money'; totalInput.setAttribute('inputmode','decimal'); totalInput.setAttribute('aria-label','Valor total');
    if(it.varId){ totalInput.disabled=true; totalInput.title='Valor automático — calculado pelos convidados confirmados'; }
    tdTotal.appendChild(totalInput); row.appendChild(tdTotal);

    const tdPaid=document.createElement('td');
    let tag=''; if(quit) tag='<span class="paid-tag full">Quitado</span>'; else if(p>0) tag='<span class="paid-tag partial">Pago parcial</span>';
    const spTag = (it.sponsor||(it.paidExt||0)>0) ? `<span class="pill" title="Pagamento de terceiro — não usa o seu saldo" style="margin-left:6px;background:var(--gold-light);color:var(--olive-dark)">paga: ${escapeHtml(it.sponsor||'terceiro')}</span>` : '';
    tdPaid.innerHTML=`<span class="money-falta">${toBRL(p)}</span>${tag}${spTag}`;
    row.appendChild(tdPaid);

    const tdLeft=document.createElement('td');
    const rawFalta=round2(t-p);
    const faltaShown=(rawFalta<0 && state.settings.showOver)?0:rawFalta;
    tdLeft.innerHTML=`<span class="money-falta">${toBRL(faltaShown)}</span>`;
    row.appendChild(tdLeft);

    const st=statusOf(it); const tdStatus=document.createElement('td'); tdStatus.innerHTML=`<span class="status ${st.cls}">${st.label}</span>`; row.appendChild(tdStatus);

    const tdAct=document.createElement('td'); const acts=document.createElement('div'); acts.className='row-actions';
    if(remaining>0){ const pay=document.createElement('button'); pay.className='btn-sm'; pay.textContent='Pagar'; pay.addEventListener('click', ()=>payItem(it.id)); acts.appendChild(pay); }
    if(p>0){ const est=document.createElement('button'); est.className='ghost btn-sm'; est.textContent='Estornar'; est.addEventListener('click', ()=>estornoItem(it.id)); acts.appendChild(est); }
    if(!it.varId){ const del=document.createElement('button'); del.className='icon-btn'; del.title='Remover item'; del.setAttribute('aria-label','Remover item'); del.textContent='✕'; del.addEventListener('click', ()=>removeItem(it.id)); acts.appendChild(del); }
    tdAct.appendChild(acts); row.appendChild(tdAct);

    tbody.appendChild(row);

    const nameInp=tdName.querySelector('.name-input');
    if(it.varId){ nameInp.disabled=true; nameInp.title='Nome automático — edite em Convidados › Custos por Convidado'; }
    else nameInp.addEventListener('input', e=>{ it.name=e.target.value; save(); });
    attachMoney(totalInput, ()=>it.total||0, (n)=>{
      const old=it.total||0; it.total=n;
      if(state.settings.strict && (it.paid||0)>it.total) it.paid=it.total;
      if(Math.abs(old-n)>0.001) logHist('ajuste', `Ajuste de valor — ${it.name}: ${toBRL(old)} → ${toBRL(n)}`, 0);
      save(); renderAll();
    });
  });
}

let histFilter='all';
const KIND_META={
  aporte:    {label:'Aporte',    bg:'#e6f2e8',          fg:'var(--ok)'},
  pagamento: {label:'Pagamento', bg:'var(--olive-mist)',fg:'var(--olive-dark)'},
  estorno:   {label:'Estorno',   bg:'#fdf4e3',          fg:'var(--warn)'},
  ajuste:    {label:'Ajuste',    bg:'var(--ivory-deep)',fg:'var(--ink-muted)'},
  exclusao:  {label:'Exclusão',  bg:'#f8eaea',          fg:'var(--danger)'}
};
function renderHistory(){
  const list=el('hist-list');
  let rows=state.history;
  if(histFilter!=='all') rows=rows.filter(h=>h.kind===histFilter);
  if(!rows.length){ list.innerHTML=`<div class="empty">Sem movimentações ${histFilter==='all'?'ainda':'deste tipo'}. Aportes, pagamentos, estornos e ajustes aparecem aqui com data e hora.</div>`; return; }
  list.innerHTML='';
  rows.slice(0,200).forEach(h=>{
    const meta=KIND_META[h.kind]||KIND_META.ajuste;
    const amtCls=h.delta>0?'in':(h.delta<0?'out':'neutral');
    const amtTxt=h.delta>0?`+ ${toBRL(h.delta)}`:(h.delta<0?`− ${toBRL(Math.abs(h.delta))}`:'—');
    const r=document.createElement('div'); r.className='hist-row';
    r.innerHTML =
      `<span class="hist-when">${fmtDateTime(h.ts)}</span>`+
      `<span class="hist-desc"><span class="kind" style="background:${meta.bg};color:${meta.fg}">${meta.label}</span>${escapeHtml(h.desc)}</span>`+
      `<span class="hist-amt ${amtCls}">${amtTxt}</span>`;
    list.appendChild(r);
  });
}


/* ═══════════ Wiring de controles fixos ═══════════ */
/* Liga botões/inputs fixos da vista Orçamento aos handlers.
   Chamado pelo app.js após initState() — os handlers leem `state` na hora do clique. */
function initOrcamentoUI(){
const showOverToggle=el('show-over'), strictToggle=el('strict-nonnegative');
showOverToggle.checked=!!state.settings.showOver;
strictToggle.checked=!!state.settings.strict;
showOverToggle.addEventListener('change', ()=>{ state.settings.showOver=showOverToggle.checked; save(); renderAll(); });
strictToggle.addEventListener('change',   ()=>{ state.settings.strict=strictToggle.checked;     save(); renderAll(); });

el('add').addEventListener('click', ()=>{
  const inp=el('new-name'); const name=(inp.value||'').trim();
  if(!name){ inp.focus(); return; }
  state.items.push({id:uid(), name, category:'Outros', total:0, paid:0, paidAt:null});
  logHist('ajuste', `Item adicionado — ${name}`, 0);
  inp.value=''; save(); renderAll(); toast('Item adicionado');
  setTimeout(()=>window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'}),0);
});
el('new-name').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); el('add').click(); } });

el('reset').addEventListener('click', async ()=>{
  const ok=await confirmDialog('Restaurar itens padrão','Isso substitui os itens atuais pela lista padrão. Aportes e histórico são mantidos. Continuar?',{confirmText:'Restaurar'});
  if(!ok) return;
  state.items=seedItems(); logHist('ajuste','Itens restaurados para o padrão',0); save(); renderAll(); toast('Itens restaurados');
});
el('clear').addEventListener('click', async ()=>{
  const ok=await confirmDialog('Zerar valores','Zera totais e pagamentos de todos os itens (os itens continuam na lista). Aportes e histórico são mantidos. Continuar?',{confirmText:'Zerar valores'});
  if(!ok) return;
  state.items=state.items.map(it=>({...it, total:0, paid:0, paidAt:null})); logHist('ajuste','Valores dos itens zerados',0); save(); renderAll(); toast('Valores zerados');
});

el('export').addEventListener('click', ()=>{
  const data={ items:state.items, funds:state.funds, history:state.history, guests:state.guests, varCosts:state.varCosts, settings:state.settings, showOver:state.settings.showOver, strict:state.settings.strict, exportedAt:new Date().toISOString() };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='planner-casamento.json'; a.click();
  URL.revokeObjectURL(url); toast('Backup exportado');
});
el('import').addEventListener('change', e=>{
  const file=e.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const raw=JSON.parse(reader.result);
      const m=migrate(raw);
      state=m.state;
      showOverToggle.checked=!!state.settings.showOver;
      strictToggle.checked=!!state.settings.strict;
      save(); renderAll(); toast('Dados importados');
      if(m.migrated && m.migrated.length) setTimeout(()=>toast(`${m.migrated.length} aporte(s) migrados dos itens antigos`,'ok'), 500);
    }catch{ toast('Arquivo inválido. Verifique o JSON.','warn'); }
  };
  reader.readAsText(file); e.target.value='';
});

document.querySelectorAll('.hist-filters .chip').forEach(ch=>{
  ch.addEventListener('click', ()=>{
    document.querySelectorAll('.hist-filters .chip').forEach(x=>x.classList.remove('active'));
    ch.classList.add('active'); histFilter=ch.dataset.kind; renderHistory();
  });
});

// Formulário de aporte
el('fund-add').addEventListener('click', addFundFromForm);
(function(){
  const inp=el('fund-amount'); inp.dataset.raw='0';
  inp.addEventListener('focus', ()=>{ const n=parseMoneyToNumber(inp.dataset.raw); inp.value=n?String(round2(n)).replace('.',','):''; setTimeout(()=>placeCaretAtEnd(inp),0); });
  inp.addEventListener('input', ()=>{ inp.dataset.raw=String(parseMoneyToNumber(inp.value)); });
  inp.addEventListener('blur',  ()=>{ const n=parseMoneyToNumber(inp.value); inp.dataset.raw=String(n); inp.value=n?toBRL(n):''; });
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addFundFromForm(); } });
  el('fund-name').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); el('fund-amount').focus(); } });
  el('fund-date').value=todayISO();
})();


    el('load-examples').addEventListener('click', async ()=>{
      const ok=await confirmDialog('Carregar exemplos', 'Adiciona itens típicos de casamento e custos de referência (com estimativas inteligentes). Seus dados atuais são mantidos. Convidados não são alterados.', {danger:false, confirmText:'Carregar'});
      if(!ok) return; loadExampleData(); renderAll(); toast('Exemplos carregados','ok');
    });
    const evName=el('event-name');
    if(evName){ evName.value=(state.settings.eventName||''); 
      evName.addEventListener('input', ()=>{ state.settings.eventName=evName.value.trim(); applyEventName(); save(); }); }
    el('reset-all').addEventListener('click', async ()=>{
      const ok=await confirmDialog('Reset TOTAL do sistema', 'Isto apaga ABSOLUTAMENTE TUDO: itens, aportes, convidados, custos, histórico, configurações, nome do evento e o armazenamento local do navegador. Se estiver logado, a nuvem também fica vazia. Não dá para desfazer — exporte um backup (JSON) antes se quiser guardar. Deseja continuar?', {danger:true, confirmText:'Apagar tudo'});
      if(!ok) return; resetTotal(); toast('Sistema restaurado de fábrica','ok'); setTimeout(()=>location.reload(), 900);
    });
} /* fim initOrcamentoUI */
