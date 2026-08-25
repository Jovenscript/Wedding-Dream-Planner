/* ═════════════════════════════════════════════════════════════════════
   sorteio.js — Dinâmicas de sorteio da festa
   O QUE: o usuário cria DINÂMICAS nomeadas ("Gravata", "Tamanco da
   Noiva", "Chá"…). Cada uma tem sua própria lista de participantes/
   pagantes, seu valor unitário e seu próprio sorteio/ganhador.
   POR QUÊ um módulo próprio: os dados são PRIVADOS do dono (nunca vão
   para links compartilhados nem para o painel da cerimonialista) e o
   fluxo é independente do orçamento/convidados — só LÊ state.guests.
   REGRA DE ELEGIBILIDADE: quem está como "não irá" NÃO participa. O
   bloqueio é na ORIGEM (não dá para marcar) e também no pool do sorteio
   (marcações antigas, feitas antes de a pessoa cancelar, ficam de fora).
   FLUXO: renderSorteio() desenha as dinâmicas + contador + lista + palco;
   runSorteio() roda a animação e revela; confirmWinner() grava o ganhador
   na dinâmica ativa.
   CARREGA: depois de modules.js (usa downloadCSV) e antes de app.js
   (que faz o wiring e chama renderSorteio dentro de renderAll).
   ═════════════════════════════════════════════════════════════════════ */

/* Busca da lista de participantes (só na tela — não vai para o state). */
let sortSearch = '';
/* Ganhador sorteado mas AINDA não confirmado (some se recarregar a página). */
let __sortPending = null;
/* Trava para não disparar dois sorteios sobrepostos. */
let __sortRolling = false;

/* ═══════════ Acesso ao bloco de dados ═══════════ */
/* Bloco do sorteio sempre válido, mesmo em estados antigos que não o tinham
   ou que ainda estão no formato de uma gravata só (normSorteio migra). */
function sorteioData(){
  if(!state.sorteio || typeof state.sorteio!=='object' || !Array.isArray(state.sorteio.dynamics) || !state.sorteio.dynamics.length){
    state.sorteio = normSorteio(state.sorteio);
  }
  return state.sorteio;
}
function sorteioDinamicas(){ return sorteioData().dynamics; }
/* A dinâmica aberta na tela. Se o activeId apontar para uma dinâmica que
   sumiu (apagada em outro aparelho), cai na primeira — nunca retorna nulo. */
function dinamicaAtiva(){
  const s = sorteioData();
  return s.dynamics.find(d=>d.id===s.activeId) || s.dynamics[0];
}
function setDinamicaAtiva(id){
  const s = sorteioData();
  if(!s.dynamics.some(d=>d.id===id)) return;
  s.activeId = id; __sortPending = null;
  save(); renderSorteio();
}

/* ═══════════ Elegibilidade ═══════════ */
/* Só participa quem vai à festa. Quem marcou "não irá" fica de fora — e o
   titular que cancela leva a família junto (convidados.js), então essa
   checagem precisa valer no MOMENTO do sorteio, não só na hora de marcar. */
function sorteioElegivel(g){ return !!g && g.status !== 'nao'; }

/* PAGANTES: todo mundo marcado, elegível ou não. Quem pagou e depois
   cancelou continua contando no dinheiro arrecadado — o valor entrou. */
function sorteioPagantes(d){
  d = d || dinamicaAtiva();
  return (state.guests||[]).filter(g=>!!d.buyers[g.id]);
}
/* POOL DO SORTEIO: pagantes que ainda vão à festa. Esta é a lista que
   runSorteio() usa — e o filtro que fechava o buraco do "não irá". */
function sorteioBuyers(d){
  d = d || dinamicaAtiva();
  return (state.guests||[]).filter(g=>!!d.buyers[g.id] && sorteioElegivel(g));
}
function sorteioPrice(d){ return Math.max(0, round2((d||dinamicaAtiva()).price)); }
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
  const d = dinamicaAtiva();
  const pagantes = sorteioPagantes(d);
  const buyers   = sorteioBuyers(d);
  const price    = sorteioPrice(d);
  const fora     = pagantes.length - buyers.length;   // pagaram mas não vão

  renderSorteioDinamicas(s, d);

  /* ── Título da dinâmica aberta ── */
  const h = el('sort-people-h');
  if(h) h.textContent = `Quem participa · ${d.name}`;

  /* ── Contador + total arrecadado ── */
  const cnt = el('sort-count');
  if(cnt){
    const n = pagantes.length;
    const pessoas = n===1 ? 'pessoa marcada' : 'pessoas marcadas';
    cnt.innerHTML = `<span class="sc-n">${n}</span>`
      + `<span class="sc-t">${escapeHtml(pessoas)}</span>`
      + (fora>0 ? `<span class="sc-sep" aria-hidden="true">·</span><span class="sc-out">${buyers.length} no sorteio <small>(${fora} marcado(s) como “não irá”)</small></span>` : '')
      + (price>0 ? `<span class="sc-sep" aria-hidden="true">·</span><span class="sc-money">Total arrecadado: <b>${escapeHtml(toBRL(n*price))}</b></span>` : '');
  }

  /* ── Campo de preço (não mexe enquanto o usuário digita) ── */
  const pLab = el('sort-price-label');
  if(pLab) pLab.textContent = `Valor por participação em “${d.name}” (opcional)`;
  const pIn = el('sort-price');
  if(pIn && document.activeElement!==pIn && pIn.dataset.formatted!=='false'){
    pIn.value = price ? toBRL(price) : '';
  }

  /* ── Lista de participantes (filtrada pela busca) ──
     Quem está como "não irá" APARECE, travado e etiquetado: sumir da lista
     faria o usuário procurar um nome que ele sabe que cadastrou. */
  const list = el('sort-list');
  if(list){
    const q = sortSearch.trim().toLowerCase();
    const todos = state.guests||[];
    const vis = q ? todos.filter(g=>((g.name||'')+' '+(g.group||'')).toLowerCase().includes(q)) : todos;
    if(!todos.length){
      list.innerHTML = `<div class="empty">Sua lista de convidados está vazia. Cadastre as pessoas em <strong>Convidados</strong> e elas aparecem aqui para você marcar quem participa de “${escapeHtml(d.name)}”.</div>`;
    } else if(!vis.length){
      list.innerHTML = `<div class="empty">Nenhum convidado encontrado para “${escapeHtml(sortSearch)}”.</div>`;
    } else {
      list.innerHTML = vis.map(g=>{
        const on  = !!d.buyers[g.id];
        const apto= sorteioElegivel(g);
        const cls = 'sort-row' + (on?' is-on':'') + (apto?'':' is-blocked');
        const aria= apto ? `${g.name} participa de ${d.name}` : `${g.name} marcou “não irá” e não pode participar`;
        return `<label class="${cls}">`
          + `<span class="sort-row-info">`
          + `<span class="sort-row-name">${escapeHtml(g.name)}${apto?'':` <span class="sort-badge-off">Não irá</span>`}</span>`
          + `<span class="sort-row-group">${escapeHtml(g.group||'Sem grupo')}${(!apto&&on)?' · pagou, mas está fora do sorteio':''}</span>`
          + `</span>`
          + `<span class="sort-toggle">`
          + `<input type="checkbox" data-sort-buyer="${escapeHtml(g.id)}"${on?' checked':''}${apto?'':' disabled'} aria-label="${escapeHtml(aria)}">`
          + `<span class="sort-track" aria-hidden="true"></span><span class="sort-knob" aria-hidden="true"></span>`
          + `</span></label>`;
      }).join('');
    }
    const info = el('sort-list-info');
    if(info){
      const nAptos = todos.filter(sorteioElegivel).length;
      const nFora  = todos.length - nAptos;
      info.textContent = todos.length
        ? `Mostrando ${vis.length} de ${todos.length} convidado(s)` + (nFora ? ` · ${nFora} marcado(s) como “não irá” não podem participar` : '')
        : '';
    }
  }

  /* ── Palco: botão de sortear OU ganhador já confirmado ── */
  const stage = el('sort-stage');
  if(stage){
    if(d.winner){
      stage.innerHTML = `<div class="sort-confirmed">`
        + `<span class="sc-trophy" aria-hidden="true">🏆</span>`
        + `<span class="sc-label">Ganhador · ${escapeHtml(d.name)}</span>`
        + `<span class="sc-name">${escapeHtml(d.winner.name)}</span>`
        + `<span class="sc-when">Sorteado em ${escapeHtml(fmtDateTime(d.winner.sortedAt))}</span>`
        + `<button class="btn-sm" id="sort-reset" type="button">↻ Refazer sorteio</button>`
        + `</div>`
        + (buyers.length===0 ? `<p class="sort-hint">Esta dinâmica está sem participantes marcados no momento — o ganhador acima continua valendo.</p>` : '');
    } else {
      const n = buyers.length;
      stage.innerHTML = `<button class="sort-btn-big" id="sort-run" type="button"${n?'':' disabled'}>🎲 Sortear ganhador · ${escapeHtml(d.name)}</button>`
        + `<p class="sort-hint">${n
            ? `O sorteio é feito entre <strong>${n}</strong> ${n===1?'participante':'participantes'} que vão à festa — todo mundo com a mesma chance.`
            + (fora>0 ? ` ${fora} pagante(s) marcado(s) como “não irá” ficam de fora.` : '')
            : (pagantes.length
                ? `Todos os marcados nesta dinâmica estão como “não irá” — ninguém pode ser sorteado.`
                : `Marque quem participa de “${escapeHtml(d.name)}” na lista acima para liberar o sorteio.`)}</p>`;
    }
  }

  /* Ganhador confirmado encerra o palco: some com a área de resultado pendente. */
  const res = el('sort-result');
  if(res && d.winner && !__sortRolling){ res.hidden = true; res.innerHTML=''; __sortPending=null; }

  renderSorteioHistory();
}

/* Barra de dinâmicas: uma pílula por dinâmica (padrão .chip do app) +
   as ações da que está aberta. */
function renderSorteioDinamicas(s, ativa){
  const box = el('sort-dyn-chips');
  if(box){
    box.innerHTML = s.dynamics.map(d=>{
      const n = sorteioBuyers(d).length;
      return `<button class="chip${d.id===ativa.id?' active':''}" type="button" data-sort-dyn="${escapeHtml(d.id)}">`
        + `${escapeHtml(d.name)}<span class="chip-n">${n}</span>`
        + (d.winner?`<span class="chip-tro" aria-hidden="true" title="Ganhador confirmado">🏆</span>`:'')
        + `</button>`;
    }).join('');
  }
  const info = el('sort-dyn-info');
  if(info){
    info.textContent = s.dynamics.length===1
      ? 'Crie outras dinâmicas para sortear mais de um brinde na festa — cada uma com sua própria lista.'
      : `${s.dynamics.length} dinâmicas · cada uma tem participantes, valor e sorteio próprios.`;
  }
  const del = el('sort-del-dyn');
  if(del) del.disabled = s.dynamics.length<=1;   // sempre resta pelo menos uma
}

/* Histórico dos sorteios já confirmados NA DINÂMICA ATIVA (recente primeiro). */
function renderSorteioHistory(){
  const box = el('sort-history'); if(!box) return;
  const d = dinamicaAtiva();
  const h = d.history;
  if(!h.length){ box.innerHTML=''; box.hidden=true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="sort-hist-title">Histórico de sorteios · ${escapeHtml(d.name)}</div>`
    + h.map(x=>`<div class="sort-hist-row"><span class="sh-name">${escapeHtml(x.name)}</span>`
        + `<span class="sh-meta">${escapeHtml(fmtDateTime(x.sortedAt))}${x.pool?` · entre ${x.pool}`:''}</span></div>`).join('');
}

/* ═══════════ CRUD das dinâmicas ═══════════ */
function sorteioNomeEmUso(nome, exceptId){
  const alvo = String(nome||'').trim().toLowerCase();
  return sorteioDinamicas().some(d=>d.id!==exceptId && d.name.trim().toLowerCase()===alvo);
}
async function newDinamica(){
  const r = await modal({
    title:'Nova dinâmica',
    message:'Dê um nome à brincadeira (ex.: Gravata, Tamanco da Noiva, Chá). Ela nasce com a lista de participantes vazia.',
    fields:[
      {key:'name',  label:'Nome da dinâmica', value:''},
      {key:'price', label:'Valor por participação (opcional)', type:'money', value:0}
    ],
    confirmText:'Criar dinâmica',
    validate:v=>{
      const n=(v.name||'').trim();
      if(!n) return 'Dê um nome à dinâmica.';
      if(n.length>40) return 'Use um nome de até 40 caracteres.';
      if(sorteioNomeEmUso(n)) return `Já existe uma dinâmica chamada “${n}”.`;
      return null;
    }
  });
  if(!r) return;
  const s = sorteioData();
  const d = blankDinamica((r.name||'').trim());
  d.price = Math.max(0, round2(parseMoneyToNumber(r.price)));
  s.dynamics.push(d); s.activeId = d.id;
  __sortPending = null; sortSearch = '';
  const sb = el('sort-search'); if(sb) sb.value = '';
  save(); renderSorteio();
  toast(`Dinâmica “${d.name}” criada`,'ok');
}
async function renameDinamica(){
  const d = dinamicaAtiva();
  const r = await modal({
    title:'Renomear dinâmica',
    fields:[{key:'name', label:'Nome da dinâmica', value:d.name}],
    confirmText:'Salvar',
    validate:v=>{
      const n=(v.name||'').trim();
      if(!n) return 'Dê um nome à dinâmica.';
      if(n.length>40) return 'Use um nome de até 40 caracteres.';
      if(sorteioNomeEmUso(n, d.id)) return `Já existe uma dinâmica chamada “${n}”.`;
      return null;
    }
  });
  if(!r) return;
  const antigo = d.name;
  d.name = (r.name||'').trim();
  save(); renderSorteio();
  toast(`“${antigo}” agora se chama “${d.name}”`);
}
/* LIMPAR: zera SÓ os participantes/pagantes desta dinâmica. Não toca nos
   convidados, nas outras dinâmicas, no ganhador nem no histórico. */
async function clearDinamica(){
  const d = dinamicaAtiva();
  const n = Object.keys(d.buyers).length;
  if(!n){ toast(`“${d.name}” já está sem participantes marcados`); return; }
  const ok = await confirmDialog(`Limpar “${d.name}”`,
    `Remove as ${n} marcação(ões) de participantes/pagantes de “${d.name}”. Os convidados, as outras dinâmicas e o histórico de sorteios NÃO são afetados. Continuar?`,
    {danger:true, confirmText:'Limpar participantes'});
  if(!ok) return;
  d.buyers = {};
  try{ logHist('ajuste', `Participantes da dinâmica “${d.name}” limpos (${n})`, 0); }catch{}
  save(); renderSorteio();
  toast(`“${d.name}” zerada — ${n} marcação(ões) removidas`);
}
async function deleteDinamica(){
  const s = sorteioData(); const d = dinamicaAtiva();
  if(s.dynamics.length<=1){ toast('É preciso manter pelo menos uma dinâmica','warn'); return; }
  const n = Object.keys(d.buyers).length;
  const ok = await confirmDialog(`Excluir “${d.name}”`,
    `A dinâmica “${d.name}” é apagada com os ${n} participante(s) marcados, o ganhador e todo o histórico dela. As outras dinâmicas e os convidados não são afetados. Esta ação não pode ser desfeita.`,
    {danger:true, confirmText:'Excluir dinâmica'});
  if(!ok) return;
  const i = s.dynamics.findIndex(x=>x.id===d.id);
  s.dynamics.splice(i,1);
  s.activeId = s.dynamics[Math.max(0,i-1)].id;
  __sortPending = null;
  try{ logHist('ajuste', `Dinâmica “${d.name}” excluída`, 0); }catch{}
  save(); renderSorteio();
  toast(`Dinâmica “${d.name}” excluída`);
}

/* ═══════════ Ações da lista ═══════════ */
/* BLOQUEIO NA ORIGEM: quem está como "não irá" não pode ser adicionado como
   pagante/participante em NENHUMA dinâmica. O toggle já nasce desabilitado no
   render; esta checagem cobre o resto (teclado, script, estado antigo). */
function toggleBuyer(guestId){
  const d = dinamicaAtiva();
  const g = (state.guests||[]).find(x=>x.id===guestId);
  if(!g){ toast('Convidado não encontrado','warn'); return; }
  if(d.buyers[guestId]){ delete d.buyers[guestId]; }
  else {
    if(!sorteioElegivel(g)){
      toast(`${g.name} está marcado como “não irá” e não pode participar`,'warn');
      renderSorteio(); return;                     // desfaz o clique na tela
    }
    d.buyers[guestId] = true;
  }
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
  const d = dinamicaAtiva();
  const visiveis = sorteioVisibleGuests();
  const alvo = visiveis.filter(sorteioElegivel);          // "não irá" nunca entra em massa
  const bloqueados = visiveis.length - alvo.length;
  if(!alvo.length){
    toast(bloqueados ? 'Só há convidados marcados como “não irá” aqui' : 'Não há convidados para marcar','warn');
    return;
  }
  alvo.forEach(g=>{ d.buyers[g.id]=true; });
  save(); renderSorteio();
  toast(`${alvo.length} convidado(s) marcados em “${d.name}”` + (bloqueados?` · ${bloqueados} “não irá” ignorado(s)`:''),'ok');
}
function unmarkAllBuyers(){
  const d = dinamicaAtiva();
  const alvo = sorteioVisibleGuests();
  let n=0; alvo.forEach(g=>{ if(d.buyers[g.id]){ delete d.buyers[g.id]; n++; } });
  save(); renderSorteio();
  toast(n ? `${n} marcação(ões) removidas` : 'Ninguém estava marcado');
}
function setSorteioPrice(v){
  const d = dinamicaAtiva();
  d.price = Math.max(0, round2(parseMoneyToNumber(v)));
  save(); renderSorteio();
}

/* ═══════════ O sorteio ═══════════ */
/* O vencedor é escolhido ANTES da animação (a roleta é só apresentação —
   assim o resultado não depende de quando o timer parou). */
function runSorteio(){
  if(__sortRolling) return;
  const d = dinamicaAtiva();
  const buyers = sorteioBuyers(d);                 // já sem os "não irá"
  if(buyers.length===0){
    toast(sorteioPagantes(d).length
      ? 'Todos os marcados estão como “não irá” — ninguém pode ser sorteado'
      : 'Marque ao menos um participante antes de sortear','warn');
    return;
  }
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
    if(i >= STEPS){ __sortReveal(winner, buyers.length, d); return; }
    if(roll) roll.textContent = buyers[Math.floor(Math.random()*buyers.length)].name;
    i++;
    const t = i/STEPS;                                  // desacelera: ~35ms → ~365ms (≈3s no total)
    setTimeout(step, reduce ? 120 : Math.round(35 + 330*Math.pow(t,3)));
  })();
}

/* Revela o vencedor e oferece "sortear outro" / "confirmar". */
function __sortReveal(g, pool, d){
  __sortRolling = false;
  d = d || dinamicaAtiva();
  __sortPending = { id:g.id, name:g.name, pool, dynId:d.id };
  const box = el('sort-result'); if(!box) return;
  box.innerHTML = `<div class="sort-winner" role="status" aria-live="polite">`
    + `<span class="sw-eyebrow">Ganhador · ${escapeHtml(d.name)}</span>`
    + `<span class="sw-mono" aria-hidden="true">${escapeHtml(sorteioInitials(g.name))}</span>`
    + `<span class="sw-name">${escapeHtml(g.name)}</span>`
    + `<span class="sw-sub">${escapeHtml(g.group||'')}${g.group?' · ':''}sorteado entre ${pool} ${pool===1?'participante':'participantes'}</span>`
    + `</div>`
    + `<div class="sort-result-actions">`
    + `<button class="btn-sm" id="sort-again" type="button">🎲 Sortear outro</button>`
    + `<button class="btn-sm primary" id="sort-confirm-winner" type="button">✓ Confirmar ganhador</button>`
    + `</div>`;
  const runBtn = el('sort-run'); if(runBtn) runBtn.disabled = false;
  try{ if(typeof celebrate==='function') celebrate(); }catch{}
  try{ if(typeof playChime==='function') playChime('ok'); }catch{}
}

/* Grava o ganhador na dinâmica ativa. Sem argumento, usa o que acabou de
   sair na roleta — e só se ele foi sorteado NESTA dinâmica. */
function confirmWinner(guestId){
  const d = dinamicaAtiva();
  let w = (__sortPending && __sortPending.dynId===d.id) ? __sortPending : null;
  if(guestId){
    const g = (state.guests||[]).find(x=>x.id===guestId);
    if(g){
      if(!sorteioElegivel(g)){ toast(`${g.name} está marcado como “não irá” e não pode ganhar`,'warn'); return; }
      w = { id:g.id, name:g.name, pool:sorteioBuyers(d).length };
    }
  }
  if(!w){ toast('Rode o sorteio antes de confirmar','warn'); return; }
  const sortedAt = Date.now();
  d.winner = { id:w.id, name:w.name, sortedAt };
  d.history.unshift({ id:w.id, name:w.name, sortedAt, pool:w.pool||0 });
  if(d.history.length>100) d.history.length = 100;
  try{ logHist('ajuste', `Sorteio “${d.name}” — ganhador: ${w.name}`, 0); }catch{}
  __sortPending = null;
  save(); renderSorteio();
  toast(`🏆 ${w.name} é o ganhador de “${d.name}”!`,'ok');
}

/* Libera um novo sorteio NA DINÂMICA ATIVA. Mantém participantes e histórico. */
async function resetSorteio(){
  const d = dinamicaAtiva();
  if(!d.winner){ toast('Nenhum ganhador confirmado ainda'); return; }
  const ok = await confirmDialog('Refazer sorteio',
    `${d.winner.name} deixa de ser o ganhador confirmado de “${d.name}” e você pode sortear de novo. As marcações de participantes e o histórico dos sorteios são mantidos. Continuar?`,
    {danger:true, confirmText:'Refazer sorteio'});
  if(!ok) return;
  d.winner = null; __sortPending = null;
  save(); renderSorteio();
  toast('Sorteio liberado — pode sortear de novo');
}

/* ═══════════ Relatório ═══════════ */
/* Uma coluna por dinâmica: dá para conferir a festa inteira numa planilha só. */
function exportSorteioCSV(){
  const dyns = sorteioDinamicas();
  const head = ['Nome','Grupo/Família','Vai à festa'];
  dyns.forEach(d=>{ head.push(d.name, `${d.name} — valor`); });
  const rows = [head];
  (state.guests||[]).forEach(g=>{
    const apto = sorteioElegivel(g);
    const linha = [g.name, g.group||'', apto?'Sim':'Não irá'];
    dyns.forEach(d=>{
      const on = !!d.buyers[g.id];
      const price = sorteioPrice(d);
      linha.push(on ? (apto?'Sim':'Sim (fora do sorteio)') : 'Não', (on&&price)?toBRL(price):'');
    });
    rows.push(linha);
  });
  rows.push([]);
  dyns.forEach(d=>{
    const pag = sorteioPagantes(d).length, pool = sorteioBuyers(d).length, price = sorteioPrice(d);
    rows.push([`— ${d.name} —`]);
    rows.push(['Marcados (pagantes)', pag]);
    rows.push(['No sorteio (vão à festa)', pool]);
    rows.push(['Valor por participação', price?toBRL(price):'—']);
    rows.push(['Total arrecadado', toBRL(pag*price)]);
    if(d.winner) rows.push(['Ganhador', d.winner.name, fmtDateTime(d.winner.sortedAt)]);
  });
  downloadCSV('sorteio-dinamicas', rows);
}
