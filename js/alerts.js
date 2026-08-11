/* ═══════════════════════════════════════════════════════════════════════
   CENTRO DE ALERTAS — gera avisos inteligentes a partir dos dados reais.
   100% leitura (não altera nada). Deriva de compute() e guestStats().
   ═══════════════════════════════════════════════════════════════════════ */
function buildAlerts(){
  const out=[];
  try{
    const c=compute();
    const s=(typeof guestStats==='function')?guestStats():null;

    // ── Convidados sem confirmação ──
    if(s && s.pending>0){
      out.push({kind:'warn', icon:'⏳', html:`Você tem <strong>${s.pending} convidado(s)</strong> sem confirmação de presença.`});
    }
    // ── Crianças no evento (planejamento de cardápio/estrutura) ──
    if(s && s.pKids>0){
      out.push({kind:'info', icon:'🧒', html:`Há <strong>${s.pKids} criança(s)</strong> na lista — considere cardápio e estrutura para elas.`});
    }
    // ── Orçamento acima dos recursos ──
    if(c.faltaArrecadar>0.005){
      out.push({kind:'danger', icon:'⚠️', html:`Faltam <strong>${toBRL(c.faltaArrecadar)}</strong> em recursos para cobrir todo o evento.`});
    } else if(c.totalExpense>0){
      out.push({kind:'ok', icon:'✅', html:`Seus recursos cobrem <strong>100%</strong> do evento planejado.`});
    }
    // ── Progresso de pagamento ──
    if(c.totalExpense>0 && c.pending>0.005){
      out.push({kind:'info', icon:'💰', html:`Ainda falta pagar <strong>${toBRL(c.pending)}</strong> (${c.pctPago.toFixed(0)}% já quitado).`});
    }
    if(c.totalExpense>0 && c.pending<=0.005){
      out.push({kind:'ok', icon:'🎉', html:`<strong>Tudo pago!</strong> Todas as despesas do evento estão quitadas.`});
    }
    // ── Contagem regressiva ──
    const d=(state.settings&&state.settings.eventDate)||'';
    if(d){
      const days=Math.round((new Date(d+'T00:00:00')-new Date().setHours(0,0,0,0))/86400000);
      if(days>0 && days<=30) out.push({kind:'warn', icon:'📅', html:`Faltam <strong>${days} dia(s)</strong> para o evento — reta final!`});
      else if(days===0) out.push({kind:'info', icon:'🎊', html:`É <strong>hoje</strong>! Aproveite cada momento.`});
    }
    // ── Titular sem família confirmada (dica de organização) ──
    if(s && s.pPeople>0 && s.conf===0){
      out.push({kind:'info', icon:'📋', html:`Nenhuma confirmação ainda. Envie os convites e acompanhe por aqui.`});
    }
  }catch(e){ /* silencioso: alertas nunca quebram o app */ }
  return out;
}

function renderAlerts(){
  const list=el('alert-list'), badge=el('alert-badge'), cnt=el('alert-count-txt');
  if(!list) return;
  const alerts=buildAlerts();
  list.innerHTML='';
  if(alerts.length===0){
    list.innerHTML='<div class="alert-empty">Nenhum alerta no momento. Tudo em ordem ✦</div>';
    if(badge){ badge.hidden=true; }
  } else {
    alerts.forEach(a=>{
      const it=document.createElement('div'); it.className='alert-item '+a.kind;
      it.innerHTML=`<span class="ai-ico">${a.icon}</span><span class="ai-txt">${a.html}</span>`;
      list.appendChild(it);
    });
    if(badge){ badge.textContent=alerts.length; badge.hidden=false; }
  }
  if(cnt) cnt.textContent = alerts.length? `(${alerts.length})` : '';
}

function initAlerts(){
  const bell=el('alert-bell'), panel=el('alert-panel');
  if(!bell||!panel) return;
  bell.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open=panel.hidden;
    panel.hidden=!open; bell.setAttribute('aria-expanded', String(open));
    if(open) renderAlerts();
  });
  document.addEventListener('click', (e)=>{
    if(!panel.hidden && !panel.contains(e.target) && e.target!==bell && !bell.contains(e.target)){
      panel.hidden=true; bell.setAttribute('aria-expanded','false');
    }
  });
  renderAlerts();  // calcula o badge no boot
}
