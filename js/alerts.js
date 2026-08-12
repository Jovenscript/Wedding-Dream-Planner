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

const ALERT_SEEN_KEY='@eventflow_alerts_seen';
function getSeenAlerts(){ try{ return JSON.parse(localStorage.getItem(ALERT_SEEN_KEY)||'[]'); }catch{ return []; } }
function setSeenAlerts(ids){ try{ localStorage.setItem(ALERT_SEEN_KEY, JSON.stringify(ids)); }catch{} }
function alertId(a){ return a.kind+'|'+a.html.replace(/<[^>]+>/g,'').replace(/[\d.,]+/g,'#').slice(0,60); }

function renderAlerts(){
  const list=el('alert-list'), badge=el('alert-badge'), cnt=el('alert-count-txt');
  if(!list) return;
  const alerts=buildAlerts();
  const seen=getSeenAlerts();
  const novos=alerts.filter(a=>!seen.includes(alertId(a)));
  list.innerHTML='';
  if(alerts.length===0){
    list.innerHTML='<div class="alert-empty">Nenhum alerta no momento. Tudo em ordem ✦</div>';
    if(badge){ badge.hidden=true; }
  } else {
    alerts.forEach(a=>{
      const isNew=!seen.includes(alertId(a));
      const it=document.createElement('div'); it.className='alert-item '+a.kind+(isNew?' is-new':'');
      it.innerHTML=`<span class="ai-ico">${a.icon}</span><span class="ai-txt">${a.html}</span>${isNew?'<span class="ai-new">novo</span>':''}`;
      list.appendChild(it);
    });
    // badge conta só os NÃO vistos
    if(badge){ if(novos.length>0){ badge.textContent=novos.length; badge.hidden=false; } else { badge.hidden=true; } }
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
    if(open){
      renderAlerts();
      // marca todos os alertas atuais como vistos, mas o badge só some ao FECHAR
      // (assim o usuário vê os selos "novo" enquanto o painel está aberto)
      const atuais=buildAlerts().map(alertId);
      setTimeout(()=>{ setSeenAlerts(atuais); const badge=el('alert-badge'); if(badge) badge.hidden=true; }, 1200);
    }
  });
  document.addEventListener('click', (e)=>{
    if(!panel.hidden && !panel.contains(e.target) && e.target!==bell && !bell.contains(e.target)){
      panel.hidden=true; bell.setAttribute('aria-expanded','false');
    }
  });
  renderAlerts();  // calcula o badge no boot
}
