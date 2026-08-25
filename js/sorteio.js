/* ═════════════════════════════════════════════════════════════════════
   sorteio.js — Sorteio da Gravata
   O QUE: marca quais convidados compraram gravata na festa e sorteia,
   ao vivo, um deles para levar o brinde.
   POR QUÊ um módulo próprio: os dados são PRIVADOS do dono (nunca vão
   para links compartilhados nem para o painel da cerimonialista) e o
   fluxo é independente do orçamento/convidados — só LÊ state.guests.
   FLUXO: renderSorteio() desenha contador + lista + palco; runSorteio()
   roda a animação e revela; confirmWinner() grava state.sorteio.winner.
   CARREGA: depois de modules.js (usa downloadCSV) e antes de app.js
   (que faz o wiring e chama renderSorteio dentro de renderAll).
   ═════════════════════════════════════════════════════════════════════ */

/* Busca da lista de participantes (só na tela — não vai para o state). */
let sortSearch = '';
/* Ganhador sorteado mas AINDA não confirmado (some se recarregar a página). */
let __sortPending = null;
/* Trava para não disparar dois sorteios sobrepostos. */
let __sortRolling = false;

/* Bloco do sorteio sempre válido, mesmo em estados antigos que não o tinham. */
function sorteioData(){
  if(!state.sorteio || typeof state.sorteio!=='object') state.sorteio = { buyers:{}, pricePerGravata:0, winner:null, history:[] };
  if(!state.sorteio.buyers || typeof state.sorteio.buyers!=='object') state.sorteio.buyers = {};
  if(!Array.isArray(state.sorteio.history)) state.sorteio.history = [];
  return state.sorteio;
}
/* Compradores = convidados da lista com a marcação ligada. A verdade é sempre
   state.guests: quem sai da lista deixa de participar automaticamente. */
function sorteioBuyers(){ const s=sorteioData(); return (state.guests||[]).filter(g=>!!s.buyers[g.id]); }
function sorteioPrice(){ return Math.max(0, round2(sorteioData().pricePerGravata)); }
/* Iniciais para o monograma do card do vencedor (1 ou 2 letras). */
function sorteioInitials(name){
  const p=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!p.length) return '?';
  return (p[0][0] + (p.length>1 ? p[p.length-1][0] : '')).toUpperCase();
}

/* ═══════════ Render ═══════════ */
function renderSorteio(){
  if(!el('view-sorteio')) return;                 // página sem a vista (admin.html)
  const s = sorteioData();
  const buyers = sorteioBuyers();
  const price  = sorteioPrice();

  /* ── Contador + total arrecadado ── */
  const cnt = el('sort-count');
  if(cnt){
    const n = buyers.length;
    const pessoas = n===1 ? 'pessoa comprou gravata' : 'pessoas compraram gravata';
    cnt.innerHTML = `<span class="sc-n">${n}</span>`
      + `<span class="sc-t">${escapeHtml(pessoas)}</span>`
      + (price>0 ? `<span class="sc-sep" aria-hidden="true">·</span><span class="sc-money">Total arrecadado: <b>${escapeHtml(toBRL(n*price))}</b></span>` : '');
  }

  /* ── Campo de preço (não mexe enquanto o usuário digita) ── */
  const pIn = el('sort-price');
  if(pIn && document.activeElement!==pIn && pIn.dataset.formatted!=='false'){
    pIn.value = price ? toBRL(price) : '';
  }

  /* ── Lista de participantes (filtrada pela busca) ── */
  const list = el('sort-list');
  if(list){
    const q = sortSearch.trim().toLowerCase();
    const todos = state.guests||[];
    const vis = q ? todos.filter(g=>((g.name||'')+' '+(g.group||'')).toLowerCase().includes(q)) : todos;
    if(!todos.length){
      list.innerHTML = `<div class="empty">Sua lista de convidados está vazia. Cadastre as pessoas em <strong>Convidados</strong> e elas aparecem aqui para você marcar quem comprou a gravata.</div>`;
    } else if(!vis.length){
      list.innerHTML = `<div class="empty">Nenhum convidado encontrado para “${escapeHtml(sortSearch)}”.</div>`;
    } else {
      list.innerHTML = vis.map(g=>{
        const on = !!s.buyers[g.id];
        return `<label class="sort-row${on?' is-on':''}">`
          + `<span class="sort-row-info">`
          + `<span class="sort-row-name">${escapeHtml(g.name)}</span>`
          + `<span class="sort-row-group">${escapeHtml(g.group||'Sem grupo')}</span>`
          + `</span>`
          + `<span class="sort-toggle">`
          + `<input type="checkbox" data-sort-buyer="${escapeHtml(g.id)}"${on?' checked':''} aria-label="${escapeHtml(g.name)} comprou gravata">`
          + `<span class="sort-track" aria-hidden="true"></span><span class="sort-knob" aria-hidden="true"></span>`
          + `</span></label>`;
      }).join('');
    }
    const info = el('sort-list-info');
    if(info) info.textContent = todos.length ? `Mostrando ${vis.length} de ${todos.length} convidado(s)` : '';
  }

  /* ── Palco: botão de sortear OU ganhador já confirmado ── */
  const stage = el('sort-stage');
  if(stage){
    if(s.winner){
      stage.innerHTML = `<div class="sort-confirmed">`
        + `<span class="sc-trophy" aria-hidden="true">🏆</span>`
        + `<span class="sc-label">Ganhador confirmado</span>`
        + `<span class="sc-name">${escapeHtml(s.winner.name)}</span>`
        + `<span class="sc-when">Sorteado em ${escapeHtml(fmtDateTime(s.winner.sortedAt))}</span>`
        + `<button class="btn-sm" id="sort-reset" type="button">↻ Refazer sorteio</button>`
        + `</div>`;
    } else {
      const n = buyers.length;
      stage.innerHTML = `<button class="sort-btn-big" id="sort-run" type="button"${n?'':' disabled'}>🎲 Sortear ganhador</button>`
        + `<p class="sort-hint">${n
            ? `O sorteio é feito entre <strong>${n}</strong> ${n===1?'comprador':'compradores'} — todo mundo com a mesma chance.`
            : `Marque quem comprou gravata na lista acima para liberar o sorteio.`}</p>`;
    }
  }

  /* Ganhador confirmado encerra o palco: some com a área de resultado pendente. */
  const res = el('sort-result');
  if(res && s.winner && !__sortRolling){ res.hidden = true; res.innerHTML=''; __sortPending=null; }

  renderSorteioHistory();
}

/* Histórico dos sorteios já confirmados (mais recente primeiro). */
function renderSorteioHistory(){
  const box = el('sort-history'); if(!box) return;
  const h = sorteioData().history;
  if(!h.length){ box.innerHTML=''; box.hidden=true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="sort-hist-title">Histórico de sorteios</div>`
    + h.map(x=>`<div class="sort-hist-row"><span class="sh-name">${escapeHtml(x.name)}</span>`
        + `<span class="sh-meta">${escapeHtml(fmtDateTime(x.sortedAt))}${x.pool?` · entre ${x.pool}`:''}</span></div>`).join('');
}

/* ═══════════ Ações da lista ═══════════ */
function toggleBuyer(guestId){
  const s = sorteioData();
  if(s.buyers[guestId]) delete s.buyers[guestId];
  else s.buyers[guestId] = true;
  save(); renderSorteio();
}
/* Marcar/desmarcar em massa. Respeita a busca: com um filtro ativo, a ação
   vale só para quem está aparecendo (senão marcaria a lista inteira sem querer). */
function sorteioVisibleGuests(){
  const q = sortSearch.trim().toLowerCase();
  const todos = state.guests||[];
  return q ? todos.filter(g=>((g.name||'')+' '+(g.group||'')).toLowerCase().includes(q)) : todos;
}
function markAllBuyers(){
  const s = sorteioData(); const alvo = sorteioVisibleGuests();
  if(!alvo.length){ toast('Não há convidados para marcar','warn'); return; }
  alvo.forEach(g=>{ s.buyers[g.id]=true; });
  save(); renderSorteio(); toast(`${alvo.length} convidado(s) marcados`,'ok');
}
function unmarkAllBuyers(){
  const s = sorteioData(); const alvo = sorteioVisibleGuests();
  let n=0; alvo.forEach(g=>{ if(s.buyers[g.id]){ delete s.buyers[g.id]; n++; } });
  save(); renderSorteio();
  toast(n ? `${n} marcação(ões) removidas` : 'Ninguém estava marcado');
}
function setSorteioPrice(v){
  const s = sorteioData();
  s.pricePerGravata = Math.max(0, round2(parseMoneyToNumber(v)));
  save(); renderSorteio();
}

/* ═══════════ O sorteio ═══════════ */
/* O vencedor é escolhido ANTES da animação (a roleta é só apresentação —
   assim o resultado não depende de quando o timer parou). */
function runSorteio(){
  if(__sortRolling) return;
  const buyers = sorteioBuyers();
  if(buyers.length===0){ toast('Marque ao menos um comprador antes de sortear','warn'); return; }
  const winner = buyers[Math.floor(Math.random()*buyers.length)];

  const box = el('sort-result'); if(!box) return;
  __sortRolling = true; __sortPending = null;
  const runBtn = el('sort-run'); if(runBtn) runBtn.disabled = true;

  box.hidden = false;
  box.innerHTML = `<div class="sort-rolling" id="sort-rolling" role="status" aria-live="polite">${escapeHtml(buyers[0].name)}</div>`;
  const roll = el('sort-rolling');
  box.scrollIntoView({behavior:'smooth', block:'center'});

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEPS = reduce ? 1 : 28;
  let i = 0;
  (function step(){
    if(i >= STEPS){ __sortReveal(winner, buyers.length); return; }
    if(roll) roll.textContent = buyers[Math.floor(Math.random()*buyers.length)].name;
    i++;
    const t = i/STEPS;                                  // desacelera: ~35ms → ~365ms (≈3s no total)
    setTimeout(step, reduce ? 120 : Math.round(35 + 330*Math.pow(t,3)));
  })();
}

/* Revela o vencedor e oferece "sortear outro" / "confirmar". */
function __sortReveal(g, pool){
  __sortRolling = false;
  __sortPending = { id:g.id, name:g.name, pool };
  const box = el('sort-result'); if(!box) return;
  box.innerHTML = `<div class="sort-winner" role="status" aria-live="polite">`
    + `<span class="sw-eyebrow">Ganhador da gravata</span>`
    + `<span class="sw-mono" aria-hidden="true">${escapeHtml(sorteioInitials(g.name))}</span>`
    + `<span class="sw-name">${escapeHtml(g.name)}</span>`
    + `<span class="sw-sub">${escapeHtml(g.group||'')}${g.group?' · ':''}sorteado entre ${pool} ${pool===1?'comprador':'compradores'}</span>`
    + `</div>`
    + `<div class="sort-result-actions">`
    + `<button class="btn-sm" id="sort-again" type="button">🎲 Sortear outro</button>`
    + `<button class="btn-sm primary" id="sort-confirm-winner" type="button">✓ Confirmar ganhador</button>`
    + `</div>`;
  const runBtn = el('sort-run'); if(runBtn) runBtn.disabled = false;
  try{ if(typeof celebrate==='function') celebrate(); }catch{}
  try{ if(typeof playChime==='function') playChime('ok'); }catch{}
}

/* Grava o ganhador. Sem argumento, usa o que acabou de sair na roleta. */
function confirmWinner(guestId){
  const s = sorteioData();
  let w = __sortPending;
  if(guestId){
    const g = (state.guests||[]).find(x=>x.id===guestId);
    if(g) w = { id:g.id, name:g.name, pool:sorteioBuyers().length };
  }
  if(!w){ toast('Rode o sorteio antes de confirmar','warn'); return; }
  const sortedAt = Date.now();
  s.winner = { id:w.id, name:w.name, sortedAt };
  s.history.unshift({ id:w.id, name:w.name, sortedAt, pool:w.pool||0 });
  if(s.history.length>100) s.history.length = 100;
  try{ logHist('ajuste', `Sorteio da gravata — ganhador: ${w.name}`, 0); }catch{}
  __sortPending = null;
  save(); renderSorteio();
  toast(`🏆 ${w.name} é o ganhador!`,'ok');
}

/* Libera um novo sorteio. Mantém quem comprou e o histórico. */
async function resetSorteio(){
  const s = sorteioData();
  if(!s.winner){ toast('Nenhum ganhador confirmado ainda'); return; }
  const ok = await confirmDialog('Refazer sorteio',
    `${s.winner.name} deixa de ser o ganhador confirmado e você pode sortear de novo. As marcações de quem comprou gravata e o histórico dos sorteios são mantidos. Continuar?`,
    {danger:true, confirmText:'Refazer sorteio'});
  if(!ok) return;
  s.winner = null; __sortPending = null;
  save(); renderSorteio();
  toast('Sorteio liberado — pode sortear de novo');
}

/* ═══════════ Relatório ═══════════ */
function exportSorteioCSV(){
  const s = sorteioData(); const price = sorteioPrice();
  const rows = [['Nome','Grupo/Família','Comprou gravata','Valor']];
  (state.guests||[]).forEach(g=>{
    const on = !!s.buyers[g.id];
    rows.push([g.name, g.group||'', on?'Sim':'Não', (on&&price)?toBRL(price):'']);
  });
  const n = sorteioBuyers().length;
  rows.push([]);
  rows.push(['Compradores', n]);
  rows.push(['Valor por gravata', price?toBRL(price):'—']);
  rows.push(['Total arrecadado', toBRL(n*price)]);
  if(s.winner) rows.push(['Ganhador', s.winner.name, fmtDateTime(s.winner.sortedAt)]);
  downloadCSV('sorteio-gravata', rows);
}
