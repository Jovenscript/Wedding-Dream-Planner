/* Cópia robusta: tenta a API moderna, cai para o método antigo se falhar. */
function copyToClipboard(txt, okMsg){
  const done=()=>{ if(okMsg && typeof toast==='function') toast(okMsg,'ok'); };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(done).catch(()=>fallbackCopy(txt,done));
    } else { fallbackCopy(txt,done); }
  }catch{ fallbackCopy(txt,done); }
}
function fallbackCopy(txt, done){
  try{ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy'); ta.remove(); if(done) done();
  }catch{ if(typeof toast==='function') toast('Copie o link manualmente.','warn'); }
}

/* ═══════════════════════════════════════════════════════════════════════
   MÓDULOS SAAS — Tarefas (kanban), Cronograma, Fornecedores, Compartilhamentos.
   Todos operam sobre state.tasks / .schedule / .suppliers / .shares e chamam save().
   Nada aqui toca em convidados/finanças. renderModules() é chamado no renderAll.
   ═══════════════════════════════════════════════════════════════════════ */

/* ---------- TAREFAS (kanban A fazer → Em andamento → Concluído) ---------- */
const TASK_PRIO={ baixa:{l:'Baixa',c:'#3D8A52'}, media:{l:'Média',c:'#C9A84C'}, alta:{l:'Alta',c:'#C4342E'} };
function renderTasks(){
  const cols={todo:el('kb-todo'), doing:el('kb-doing'), done:el('kb-done')};
  if(!cols.todo) return;
  Object.values(cols).forEach(c=>c.innerHTML='');
  const count={todo:0,doing:0,done:0};
  (state.tasks||[]).forEach(t=>{
    count[t.status]=(count[t.status]||0)+1;
    const card=document.createElement('div'); card.className='kb-card'; card.draggable=true; card.dataset.id=t.id;
    const pr=TASK_PRIO[t.priority]||TASK_PRIO.media;
    const due=t.due? `<span class="kb-due">📅 ${fmtDate(t.due)}</span>`:'';
    const late=t.due && t.status!=='done' && new Date(t.due+'T23:59:59')<new Date();
    card.innerHTML=`<div class="kb-title">${escapeHtml(t.title)}</div>
      <div class="kb-meta"><span class="kb-prio" style="--pc:${pr.c}">${pr.l}</span>
      ${t.owner?`<span class="kb-owner">👤 ${escapeHtml(t.owner)}</span>`:''}${due}</div>
      ${late?'<div class="kb-late">⚠️ Atrasada</div>':''}`;
    card.addEventListener('click',(e)=>{ if(!card.__drag) editTask(t.id); });
    card.addEventListener('dragstart',()=>{ card.__drag=true; card.classList.add('dragging'); window.__dragTask=t.id; });
    card.addEventListener('dragend',()=>{ setTimeout(()=>card.__drag=false,50); card.classList.remove('dragging'); });
    cols[t.status].appendChild(card);
  });
  el('kb-c-todo').textContent=count.todo; el('kb-c-doing').textContent=count.doing; el('kb-c-done').textContent=count.done;
}
function initKanbanDnD(){
  document.querySelectorAll('.kb-list').forEach(list=>{
    const col=list.closest('.kb-col').dataset.col;
    list.addEventListener('dragover',e=>{ e.preventDefault(); list.classList.add('kb-over'); });
    list.addEventListener('dragleave',()=>list.classList.remove('kb-over'));
    list.addEventListener('drop',e=>{ e.preventDefault(); list.classList.remove('kb-over');
      const id=window.__dragTask; const t=(state.tasks||[]).find(x=>x.id===id);
      if(t && t.status!==col){ t.status=col; save(); renderTasks(); toast('Tarefa movida','ok'); }
    });
  });
}
async function editTask(id){
  const t=id?(state.tasks||[]).find(x=>x.id===id):null;
  const res=await modal({ title: t?'Editar tarefa':'Nova tarefa',
    fields:[
      {key:'title',label:'O que precisa ser feito?',value:t?t.title:''},
      {key:'owner',label:'Responsável',value:t?t.owner:''},
      {key:'due',label:'Prazo',type:'date',value:t?t.due:''},
      {key:'priority',label:'Prioridade',type:'select',options:['Baixa','Média','Alta'],value:t?({baixa:'Baixa',media:'Média',alta:'Alta'})[t.priority]:'Média'},
      {key:'status',label:'Situação',type:'select',options:['A fazer','Em andamento','Concluído'],value:t?({todo:'A fazer',doing:'Em andamento',done:'Concluído'})[t.status]:'A fazer'},
      {key:'category',label:'Categoria (opcional)',value:t?t.category:''},
      {key:'notes',label:'Observações',type:'textarea',value:t?t.notes:''}
    ], confirmText: t?'Salvar':'Criar', cancelText:'Cancelar',
    extraBtn: t?{label:'Excluir', danger:true, value:'__del'}:null });
  if(!res) return;
  if(res==='__del'){ state.tasks=(state.tasks||[]).filter(x=>x.id!==id); save(); renderTasks(); toast('Tarefa excluída'); return; }
  const map={'A fazer':'todo','Em andamento':'doing','Concluído':'done'};
  const pmap={'Baixa':'baixa','Média':'media','Alta':'alta'};
  const data={ title:res.title, owner:res.owner, due:res.due, priority:pmap[res.priority]||'media',
    status:map[res.status]||'todo', category:res.category, notes:res.notes };
  if(t){ Object.assign(t, normTask({...t,...data})); } else { state.tasks=state.tasks||[]; state.tasks.push(normTask(data)); }
  save(); renderTasks(); toast(t?'Tarefa salva ✓':'Tarefa criada ✓','ok');
}

/* ---------- CRONOGRAMA (timeline) ---------- */
function renderSchedule(){
  const wrap=el('timeline'); if(!wrap) return;
  const list=[...(state.schedule||[])].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if(!list.length){ wrap.innerHTML='<div class="tl-empty">Nenhum momento ainda. Monte o roteiro do dia — recepção, cerimônia, jantar, festa…</div>'; return; }
  wrap.innerHTML='';
  list.forEach(s=>{
    const row=document.createElement('div'); row.className='tl-row';
    row.innerHTML=`<div class="tl-time">${escapeHtml(s.time||'--:--')}</div>
      <div class="tl-dot"></div>
      <div class="tl-body"><div class="tl-title">${escapeHtml(s.title)}</div>
      ${s.who?`<div class="tl-who">${escapeHtml(s.who)}</div>`:''}${s.note?`<div class="tl-note">${escapeHtml(s.note)}</div>`:''}</div>`;
    row.addEventListener('click',()=>editSchedule(s.id));
    wrap.appendChild(row);
  });
}
async function editSchedule(id){
  const s=id?(state.schedule||[]).find(x=>x.id===id):null;
  const res=await modal({ title:s?'Editar momento':'Novo momento',
    fields:[
      {key:'time',label:'Horário',value:s?s.time:'',placeholder:'ex.: 19:00'},
      {key:'title',label:'O que acontece?',value:s?s.title:'',placeholder:'ex.: Cerimônia'},
      {key:'who',label:'Responsável / envolvidos (opcional)',value:s?s.who:''},
      {key:'note',label:'Observação (opcional)',type:'textarea',value:s?s.note:''}
    ], confirmText:s?'Salvar':'Adicionar', cancelText:'Cancelar', extraBtn:s?{label:'Excluir',danger:true,value:'__del'}:null });
  if(!res) return;
  if(res==='__del'){ state.schedule=(state.schedule||[]).filter(x=>x.id!==id); save(); renderSchedule(); toast('Momento removido'); return; }
  const data={time:res.time,title:res.title,who:res.who,note:res.note};
  if(s){ Object.assign(s, normSchedule({...s,...data})); } else { state.schedule=state.schedule||[]; state.schedule.push(normSchedule(data)); }
  save(); renderSchedule(); toast(s?'Momento salvo ✓':'Momento adicionado ✓','ok');
}

function renderModules(){ try{ renderTasks(); }catch{} try{ renderSchedule(); }catch{} try{ renderSuppliers(); }catch{} try{ renderShares(); }catch{} try{ renderInvites(); }catch{} try{ renderAdminAccesses(); }catch{} }

/* ---------- FORNECEDORES ---------- */
const SUP_STATUS={ cotacao:{l:'Cotação',c:'#8a9a5b'}, contratado:{l:'Contratado',c:'#3D8A52'}, pago:{l:'Pago',c:'#C9A84C'} };
function renderSuppliers(){
  const grid=el('sup-grid'); if(!grid) return;
  const list=state.suppliers||[];
  if(!list.length){ grid.innerHTML='<div class="sup-empty">Nenhum fornecedor ainda. Cadastre buffet, DJ, fotógrafo, decoração… e acompanhe valores e pagamentos.</div>'; return; }
  grid.innerHTML='';
  list.forEach(s=>{
    const st=SUP_STATUS[s.status]||SUP_STATUS.cotacao;
    const falta=Math.max(0,(s.value||0)-(s.paid||0));
    // Vínculo com o orçamento — limpa se o item foi excluído (evita vínculo órfão)
    const linked = s.itemId ? (state.items||[]).find(it=>it.id===s.itemId) : null;
    if(s.itemId && !linked){ s.itemId=null; }
    const linkRow = linked
      ? `<div class="sup-budget on">✓ No orçamento</div>`
      : ((s.value||0)>0 ? `<button class="btn-sm sup-addbudget" data-act="addbudget">+ Adicionar ao orçamento</button>` : '');
    const card=document.createElement('div'); card.className='sup-card';
    card.innerHTML=`<div class="sup-top"><span class="sup-cat">${escapeHtml(s.category||'Outros')}</span>
      <span class="sup-status" style="--sc:${st.c}">${st.l}</span></div>
      <div class="sup-name">${escapeHtml(s.name)}</div>
      ${s.contact||s.phone?`<div class="sup-contact">${escapeHtml(s.contact||'')}${s.phone?` · ${escapeHtml(s.phone)}`:''}</div>`:''}
      <div class="sup-vals"><span>Valor: <b>${toBRL(s.value||0)}</b></span>${falta>0?`<span class="sup-falta">Falta ${toBRL(falta)}</span>`:'<span class="sup-ok">Quitado</span>'}</div>
      ${linkRow}`;
    card.addEventListener('click',()=>editSupplier(s.id));
    const addBtn=card.querySelector('[data-act=addbudget]');
    if(addBtn) addBtn.addEventListener('click',(e)=>{
      e.stopPropagation();                                   // não abre o editor do card
      const item={ id:uid(), name:s.name, category:s.category||'Outros', total:s.value||0, paid:0, paidAt:null };
      state.items=state.items||[]; state.items.push(item);   // paid:0 → não mexe em funds.used (invariante intacto)
      s.itemId=item.id;
      try{ logHist('ajuste', `Item criado a partir do fornecedor — ${s.name}`, 0); }catch{}
      save(); renderAll(); toast('Adicionado ao orçamento ✓','ok');
    });
    grid.appendChild(card);
  });
}
async function editSupplier(id){
  const s=id?(state.suppliers||[]).find(x=>x.id===id):null;
  const res=await modal({ title:s?'Editar fornecedor':'Novo fornecedor',
    fields:[
      {key:'name',label:'Nome do fornecedor',value:s?s.name:''},
      {key:'category',label:'Categoria',type:'select',options:['Buffet','Bebidas','Fotografia','Filmagem','DJ / Música','Decoração','Cerimonial','Local','Doces / Bolo','Vestuário','Beleza','Convites','Outros'],value:s?s.category:'Buffet'},
      {key:'contact',label:'Contato (pessoa/empresa)',value:s?s.contact:''},
      {key:'phone',label:'Telefone / WhatsApp',value:s?s.phone:''},
      {key:'value',label:'Valor contratado',type:'money',value:s?s.value:0},
      {key:'paid',label:'Já pago',type:'money',value:s?s.paid:0},
      {key:'status',label:'Situação',type:'select',options:['Cotação','Contratado','Pago'],value:s?({cotacao:'Cotação',contratado:'Contratado',pago:'Pago'})[s.status]:'Cotação'},
      {key:'notes',label:'Observações',type:'textarea',value:s?s.notes:''}
    ], confirmText:s?'Salvar':'Criar', cancelText:'Cancelar', extraBtn:s?{label:'Excluir',danger:true,value:'__del'}:null });
  if(!res) return;
  if(res==='__del'){ state.suppliers=(state.suppliers||[]).filter(x=>x.id!==id); save(); renderSuppliers(); toast('Fornecedor excluído'); return; }
  const smap={'Cotação':'cotacao','Contratado':'contratado','Pago':'pago'};
  const data={name:res.name,category:res.category,contact:res.contact,phone:res.phone,
    value:parseMoney(res.value),paid:parseMoney(res.paid),status:smap[res.status]||'cotacao',notes:res.notes};
  if(s){ Object.assign(s, normSupplier({...s,...data})); } else { state.suppliers=state.suppliers||[]; state.suppliers.push(normSupplier(data)); }
  save(); renderSuppliers(); toast(s?'Fornecedor salvo ✓':'Fornecedor criado ✓','ok');
}
function parseMoney(v){ if(typeof v==='number') return v; return Math.max(0, Number(String(v||'').replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'))||0); }

/* ---------- COMPARTILHAMENTOS (link seguro por token) ---------- */
const SHARE_ROLES={
  cerimonialista:{ label:'Cerimonialista', scopes:['guests','schedule','tasks'] },
  buffet:        { label:'Buffet',         scopes:['guests_count','drinks'] },
  fotografo:     { label:'Fotógrafo',      scopes:['schedule'] },
  dj:            { label:'DJ / Música',    scopes:['schedule'] },
  decorador:     { label:'Decorador',      scopes:['schedule'] },
  local:         { label:'Local do evento',scopes:['guests_count','schedule'] },
  custom:        { label:'Personalizado',  scopes:[] }
};
function genToken(){ const a='abcdefghijklmnopqrstuvwxyz0123456789'; let s=''; for(let i=0;i<20;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }
function shareUrl(sh){ const base=location.origin+location.pathname.replace(/index\.html?$/,''); return `${base}ver.html#${sh.token}`; }

function renderShares(){
  const wrap=el('share-list'); if(!wrap) return;
  const list=state.shares||[];
  const card=el('legacy-share-card');
  if(card) card.hidden = (list.length===0);   // some quando não há links do formato antigo
  if(!list.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML='';
  list.forEach(sh=>{
    const role=SHARE_ROLES[sh.role]||SHARE_ROLES.custom;
    const on=sh.active!==false;
    const exp = sh.expires ? (new Date(sh.expires+'T23:59:59')<new Date() ? 'Expirado' : 'Expira em '+fmtDate(sh.expires)) : 'Sem validade';
    const perms=(sh.scopes||[]).map(s=>SCOPE_LABEL[s]||s).join(' · ')||'—';
    const card=document.createElement('div'); card.className='share-card'+(on?'':' off');
    card.innerHTML=`<div class="share-head"><span class="share-role">👤 ${escapeHtml(sh.name||role.label)}</span>
      <span class="share-dot ${on?'on':''}">${on?'🟢 Ativo':'⚪ Inativo'}</span></div>
      <div class="share-perms">🔒 Somente leitura · ${perms}</div>
      <div class="share-exp">${exp}</div>
      <div class="share-actions">
        <button class="btn-sm" data-act="copy">Copiar link</button>
        <button class="btn-sm" data-act="edit">Permissões</button>
        <button class="btn-sm" data-act="toggle">${on?'Desativar':'Ativar'}</button>
        <button class="btn-sm" data-act="regen">Novo link</button>
        <button class="icon-btn" data-act="del" title="Excluir">✕</button>
      </div>`;
    card.querySelector('[data-act=copy]').addEventListener('click',()=>{ copyToClipboard(shareUrl(sh), 'Link copiado ✓'); });
    card.querySelector('[data-act=edit]').addEventListener('click',()=>editShare(sh.id));
    card.querySelector('[data-act=toggle]').addEventListener('click',()=>{ sh.active=!on; save(); renderShares(); try{ publishShare(sh); }catch{} toast(on?'Compartilhamento desativado':'Compartilhamento ativado','ok'); });
    card.querySelector('[data-act=regen]').addEventListener('click',async ()=>{ const old=sh.token; if(await confirmDialog('Gerar novo link','O link atual deixará de funcionar. Continuar?',{confirmText:'Gerar novo'})){ try{ unpublishShare(old); }catch{} sh.token=genToken(); save(); renderShares(); try{ publishShare(sh); }catch{} toast('Novo link gerado ✓','ok'); } });
    card.querySelector('[data-act=del]').addEventListener('click',async ()=>{ if(await confirmDialog('Excluir compartilhamento','O link deixará de funcionar. Continuar?',{danger:true,confirmText:'Excluir'})){ try{ unpublishShare(sh.token); }catch{} state.shares=(state.shares||[]).filter(x=>x.id!==sh.id); save(); renderShares(); toast('Compartilhamento excluído'); } });
    wrap.appendChild(card);
  });
}
const SCOPE_LABEL={ guests:'Lista de convidados', guests_count:'Total de convidados', drinks:'Consumo de bebidas',
  schedule:'Cronograma', tasks:'Tarefas', suppliers:'Fornecedores' };
async function editShare(id){
  const sh=id?(state.shares||[]).find(x=>x.id===id):null;
  // passo 1: quem é
  const who=await modal({ title: sh?'Editar compartilhamento':'Novo compartilhamento',
    message:'Gere um link somente-leitura para esta pessoa ver as páginas do seu evento. O financeiro nunca é compartilhado.',
    fields:[
      {key:'name',label:'Nome / empresa',value:sh?sh.name:'',placeholder:'ex.: Ana Cerimonial'},
      {key:'role',label:'Tipo de profissional',type:'select',options:Object.values(SHARE_ROLES).map(r=>r.label),value:sh?(SHARE_ROLES[sh.role]||SHARE_ROLES.custom).label:'Cerimonialista'},
      // NOVO: escolha as PÁGINAS que a pessoa poderá ver (modo visualização)
      {key:'dashboard',label:'📊 Painel geral (visão do evento, sem financeiro)',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('dashboard'))?'Sim':'Não'},
      {key:'guests',label:'👥 Lista de convidados (nomes, confirmação, perfil)',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('guests'))?'Sim':'Não'},
      {key:'guests_count',label:'🔢 Só o TOTAL de convidados (números, sem nomes)',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('guests_count'))?'Sim':'Não'},
      {key:'drinks',label:'🍹 Consumo estimado de bebidas',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('drinks'))?'Sim':'Não'},
      {key:'schedule',label:'📅 Cronograma do dia',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('schedule'))?'Sim':'Não'},
      {key:'tasks',label:'✅ Tarefas (checklist de organização)',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('tasks'))?'Sim':'Não'},
      {key:'suppliers',label:'🏢 Fornecedores (contatos, sem valores)',type:'select',options:['Não','Sim'],value:(sh&&sh.scopes&&sh.scopes.includes('suppliers'))?'Sim':'Não'},
      {key:'expires',label:'Validade (opcional)',type:'date',value:sh?sh.expires:''}
    ], confirmText:sh?'Salvar':'Gerar link', cancelText:'Cancelar' });
  if(!who) return;
  const roleKey=Object.keys(SHARE_ROLES).find(k=>SHARE_ROLES[k].label===who.role)||'custom';
  const scopes=['dashboard','guests','guests_count','drinks','schedule','tasks','suppliers'].filter(s=>who[s]==='Sim');
  // financeiro NUNCA entra — não há opção para isso, por design.
  if(sh){ sh.name=who.name; sh.role=roleKey; sh.scopes=scopes; sh.expires=who.expires; save(); renderShares(); try{ publishShare(sh); }catch{} toast('Compartilhamento atualizado ✓','ok'); }
  else {
    state.shares=state.shares||[];
    const nova={ id:uid(), token:genToken(), name:who.name, role:roleKey, scopes, expires:who.expires, active:true, createdAt:new Date().toISOString() };
    state.shares.push(nova); save(); renderShares(); try{ publishShare(nova); }catch{}
    // mostra o link já pronto pra copiar
    const url=shareUrl(nova);
    if(await confirmDialog('Link gerado ✓', 'Compartilhe este link somente-leitura:\n\n'+url, {confirmText:'Copiar link', cancelText:'Fechar'})){
      copyToClipboard(url, 'Link copiado ✓');
    }
  }
}



/* Monta a cópia PÚBLICA e filtrada de um compartilhamento (nunca inclui financeiro). */
function buildSharePayload(sh){
  const scopes=sh.scopes||[]; const out={ event:(state.settings&&state.settings.eventName)||'Evento',
    role:sh.role, name:sh.name||'', scopes, active:sh.active!==false, expires:sh.expires||'', ro:true };
  if(scopes.includes('guests')){
    out.guests=(state.guests||[]).map(g=>({ name:g.name, group:g.group, ageGroup:g.ageGroup,
      drinks:!!g.drinks, status:g.status, companions:g.companions||0, isHead:!!g.isHead }));
  }
  if(scopes.includes('guests_count') || scopes.includes('drinks')){
    try{ const s=guestStats(); out.counts={ pessoas:s.pPeople, adultos:s.pAdults, criancas:s.pKids,
      adolescentes:s.pTeens, confirmados:s.conf, bebem:s.pDrinkers, naoBebem:s.pNonDrinkers }; }catch{}
  }
  if(scopes.includes('schedule')) out.schedule=(state.schedule||[]).map(x=>({time:x.time,title:x.title,who:x.who,note:x.note}));
  if(scopes.includes('tasks')) out.tasks=(state.tasks||[]).map(x=>({title:x.title,status:x.status,owner:x.owner,due:x.due,priority:x.priority}));
  if(scopes.includes('suppliers')){
    // Fornecedores SEM VALORES — só nome, categoria e contato
    out.suppliers=(state.suppliers||[]).map(x=>({name:x.name,category:x.category,phone:x.phone,email:x.email,status:x.status,notes:x.notes}));
  }
  if(scopes.includes('dashboard')){
    // Painel geral: contagem de convidados + progresso de tarefas + próximos momentos
    try{ const gs=guestStats(); const ts=(state.tasks||[]);
      const tasksDone=ts.filter(t=>t.status==='done').length;
      const next=(state.schedule||[]).slice().sort((a,b)=>String(a.time).localeCompare(String(b.time))).slice(0,3);
      out.dashboard={ eventName:(state.settings&&state.settings.eventName)||'',
        eventDate:(state.settings&&state.settings.eventDate)||'',
        eventPlace:(state.settings&&state.settings.eventPlace)||'',
        totalConvidados:gs.pPeople, confirmados:gs.conf,
        totalTarefas:ts.length, tarefasFeitas:tasksDone,
        proximosMomentos:next.map(x=>({time:x.time,title:x.title})) };
    }catch{}
  }
  // NUNCA: items, funds, varCosts (financeiro completo), settings privados.
  return out;
}


/* ---------- MODO DEMONSTRAÇÃO ---------- */
function loadDemoData(){
  // Guarda um backup dos dados reais ANTES de entrar no demo (para restaurar depois).
  try{
    if(!state.settings.demo){
      const real=JSON.stringify({items:state.items,funds:state.funds,guests:state.guests,varCosts:state.varCosts,
        tasks:state.tasks,suppliers:state.suppliers,schedule:state.schedule,shares:state.shares,history:state.history,settings:state.settings});
      localStorage.setItem('@eventflow_prebackup', real);
    }
  }catch{}
  // Evento fictício para apresentar sem expor dados reais. Tudo marcado como DEMO.
  state.settings.eventName='✦ DEMONSTRAÇÃO — Casamento Sofia & Lucas';
  state.settings.eventKind='Casamento';
  state.settings.eventDate=(function(){ const d=new Date(); d.setDate(d.getDate()+45); return d.toISOString().slice(0,10); })();
  state.settings.demo=true;
  // convidados de exemplo (algumas famílias, perfis variados)
  const G=(name,group,age,drinks,status,head)=>normGuest({name,group,ageGroup:age,drinks,status,isHead:!!head});
  state.guests=[
    G('Sofia Almeida','Noivos','adulto',false,'confirmado',true),
    G('Lucas Martins','Noivos','adulto',true,'confirmado'),
    G('Dona Marli','Família da Noiva','adulto',false,'confirmado',true),
    G('Seu Antônio','Família da Noiva','adulto',true,'confirmado'),
    G('Beatriz','Família da Noiva','crianca',false,'confirmado'),
    G('Carlos Souza','Família do Noivo','adulto',true,'pendente',true),
    G('Fernanda Souza','Família do Noivo','adulto',true,'pendente'),
    G('Pedro','Família do Noivo','adolescente',false,'pendente'),
    G('Ana & João','Amigos','adulto',true,'confirmado',true),
    G('Mariana','Amigos','adulto',false,'nao')
  ];
  // orçamento/custos de referência
  if(typeof loadExampleData==='function'){ loadExampleData(); }
  // tarefas
  state.tasks=[
    normTask({title:'Fechar buffet',owner:'Sofia',priority:'alta',status:'done',due:''}),
    normTask({title:'Escolher músicas da cerimônia',owner:'Lucas',priority:'media',status:'doing'}),
    normTask({title:'Enviar convites',owner:'Sofia',priority:'alta',status:'doing'}),
    normTask({title:'Prova do vestido',owner:'Sofia',priority:'media',status:'todo'}),
    normTask({title:'Confirmar decoração',owner:'Lucas',priority:'baixa',status:'todo'})
  ];
  // cronograma
  state.schedule=[
    normSchedule({time:'16:00',title:'Chegada dos fornecedores',who:'Equipe'}),
    normSchedule({time:'18:00',title:'Recepção dos convidados',who:'Recepcionistas'}),
    normSchedule({time:'19:00',title:'Cerimônia',who:'Celebrante'}),
    normSchedule({time:'20:00',title:'Jantar',who:'Buffet'}),
    normSchedule({time:'21:30',title:'Festa e pista',who:'DJ'})
  ];
  // fornecedores
  state.suppliers=[
    normSupplier({name:'Buffet Sabor & Arte',category:'Buffet',value:18000,paid:9000,status:'contratado',phone:'(47) 99999-0001'}),
    normSupplier({name:'Studio Luz Foto',category:'Fotografia',value:4500,paid:4500,status:'pago',phone:'(47) 99999-0002'}),
    normSupplier({name:'DJ Marcelo',category:'DJ / Música',value:2800,paid:0,status:'cotacao',phone:'(47) 99999-0003'})
  ];
  save(); renderAll();
  toast('Modo demonstração ativado ✓','ok');
}


/* ---------- RELATÓRIOS (CSV — abre no Excel) ---------- */
function toCSV(rows){ return rows.map(r=>r.map(c=>{ const s=String(c==null?'':c); return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(';')).join('\r\n'); }
function downloadCSV(name, rows){
  const blob=new Blob(['\ufeff'+toCSV(rows)],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=name+'-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Relatório exportado ✓','ok');
}
function reportGuests(){
  const rows=[['Nome','Grupo/Família','Faixa','Bebe','Confirmação','Acompanhantes','Titular']];
  const ag={adulto:'Adulto',crianca:'Criança',bebe:'Bebê',adolescente:'Adolescente'};
  const st={confirmado:'Confirmado',pendente:'Pendente',nao:'Não irá'};
  (state.guests||[]).forEach(g=>rows.push([g.name,g.group,ag[g.ageGroup]||'Adulto',g.drinks?'Sim':'Não',st[g.status]||'',g.companions||0,g.isHead?'Sim':'']));
  downloadCSV('convidados',rows);
}
function reportSuppliers(){
  const rows=[['Fornecedor','Categoria','Contato','Telefone','Valor','Pago','Falta','Situação']];
  const st={cotacao:'Cotação',contratado:'Contratado',pago:'Pago'};
  (state.suppliers||[]).forEach(s=>rows.push([s.name,s.category,s.contact,s.phone,toBRL(s.value||0),toBRL(s.paid||0),toBRL(Math.max(0,(s.value||0)-(s.paid||0))),st[s.status]||'']));
  downloadCSV('fornecedores',rows);
}
function reportTasks(){
  const rows=[['Tarefa','Responsável','Prazo','Prioridade','Situação','Categoria']];
  const st={todo:'A fazer',doing:'Em andamento',done:'Concluído'}; const pr={baixa:'Baixa',media:'Média',alta:'Alta'};
  (state.tasks||[]).forEach(t=>rows.push([t.title,t.owner,t.due?fmtDate(t.due):'',pr[t.priority]||'',st[t.status]||'',t.category]));
  downloadCSV('tarefas',rows);
}

/* ═══════════════════════════════════════════════════════════════════════
   CONVITES DIGITAIS — link por família com abertura de envelope + RSVP.
   O convidado abre convite.html#token, confirma, e a resposta volta ao app.
   ═══════════════════════════════════════════════════════════════════════ */
function inviteUrl(inv){ const base=location.origin+location.pathname.replace(/index\.html?$/,''); return `${base}convite.html#${inv.token}`; }

/* Publica o payload público do convite (dados do casamento + nomes da família). */
function buildInvitePayload(inv, familia){
  const s=state.settings||{};
  return {
    token:inv.token, kind:'invite',
    coupleA:s.coupleA||'', coupleB:s.coupleB||'',
    event:s.eventName||'Nosso Casamento',
    date:s.eventDate||'', time:s.eventTime||'', place:s.eventPlace||'',
    mapUrl:s.eventMapUrl||'', dresscode:s.eventDress||'', giftUrl:s.eventGiftUrl||'',
    message:s.inviteMessage||'', photoUrl:s.invitePhotoUrl||'',
    familyName:inv.familyName||'', guestNames:(familia||[]).map(g=>g.name),
    active:inv.active!==false
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   ACESSOS ADMIN — links de visualização completa do sistema
   Cerimonialista/wedding planner abre admin.html#TOKEN e vê tudo em
   tempo real, no formato original do app, com edições bloqueadas.
   ═══════════════════════════════════════════════════════════════════════ */
const ADMIN_SCOPES = [
  {key:'financeiro',   label:'💰 Financeiro (itens, valores, aportes, saldo)'},
  {key:'convidados',   label:'👥 Convidados (lista completa)'},
  {key:'convites',     label:'💌 Convites e RSVP'},
  {key:'cronograma',   label:'📅 Cronograma do dia'},
  {key:'tarefas',      label:'✅ Tarefas (checklist)'},
  {key:'fornecedores', label:'🏢 Fornecedores (com contatos)'},
];

function adminAccessUrl(a){
  const base = location.origin + location.pathname.replace(/index\.html?$/, '');
  return base + 'admin.html#' + a.token;
}

function renderAdminAccesses(){
  const wrap = el('admin-list'); if(!wrap) return;
  const list = state.adminAccess || [];
  if(!list.length){
    wrap.innerHTML = '<div class="inv-empty">Nenhum acesso admin criado. Clique em "+ Novo acesso" para dar à cerimonialista acesso completo ao sistema (somente visualização).</div>';
    return;
  }
  wrap.innerHTML = '';
  list.forEach(a=>{
    const card = document.createElement('div');
    card.className = 'inv-card';
    const scopesTxt = (a.scopes||[]).map(s=>{ const sc=ADMIN_SCOPES.find(x=>x.key===s); return sc?sc.label.replace(/^[^A-Z]+/,'').split(' (')[0]:s; }).join(' · ');
    const statusBadge = a.active===false
      ? '<span class="inv-b nao">✕ Desativado</span>'
      : '<span class="inv-b sim">● Ativo</span>';
    card.innerHTML = `
      <div class="inv-top">
        <span class="inv-fam">${escapeHtml(a.name||'Acesso sem nome')}</span>
        ${statusBadge}
      </div>
      <div class="inv-members">${escapeHtml(scopesTxt || 'nenhum acesso liberado')}</div>
      ${a.expires ? `<div class="inv-members" style="color:var(--warn)">⏳ Expira em ${escapeHtml(a.expires)}</div>` : ''}
      <div class="inv-actions">
        <button class="btn-sm" data-act="copy">Copiar link</button>
        <button class="btn-sm" data-act="edit">Permissões</button>
        <button class="btn-sm" data-act="toggle">${a.active===false?'Ativar':'Desativar'}</button>
        <button class="icon-btn" data-act="del" title="Remover acesso">✕</button>
      </div>`;
    card.querySelector('[data-act=copy]').addEventListener('click', ()=>{
      copyToClipboard(adminAccessUrl(a), 'Link admin copiado ✓');
    });
    card.querySelector('[data-act=edit]').addEventListener('click', ()=> editAdminAccess(a));
    card.querySelector('[data-act=toggle]').addEventListener('click', async ()=>{
      a.active = a.active === false;
      save(); renderAdminAccesses();
      try{ if(a.active===false && window.unpublishAdminAccess){ /* mantém doc mas com active:false */
        publishAdminAccess(a);
      } else if(window.publishAdminAccess){ publishAdminAccess(a); }
      }catch{}
      toast(a.active?'Acesso ativado':'Acesso desativado', 'ok');
    });
    card.querySelector('[data-act=del]').addEventListener('click', async ()=>{
      if(await confirmDialog('Remover acesso','O link deixará de funcionar imediatamente. Continuar?', {danger:true, confirmText:'Remover'})){
        try{ if(window.unpublishAdminAccess) window.unpublishAdminAccess(a.token); }catch{}
        state.adminAccess = state.adminAccess.filter(x=>x.token!==a.token);
        save(); renderAdminAccesses();
        toast('Acesso removido');
      }
    });
    wrap.appendChild(card);
  });
}

async function editAdminAccess(existing){
  const isNew = !existing;
  const fields = [
    {key:'name', label:'Nome / empresa', value:existing?existing.name:'', placeholder:'ex.: Ana Cerimonial'},
    {key:'expires', label:'Expira em (opcional, deixe vazio para nunca)', type:'date', value:existing?(existing.expires||''):''},
  ];
  // Toggle por escopo
  ADMIN_SCOPES.forEach(sc=>{
    fields.push({
      key: 'scope_'+sc.key,
      label: sc.label,
      type: 'select', options: ['Não','Sim'],
      value: existing && (existing.scopes||[]).includes(sc.key) ? 'Sim' : 'Não'
    });
  });
  const data = await modal({
    title: isNew ? 'Novo acesso admin' : 'Editar acesso',
    message: 'Este link dá à pessoa acesso completo ao sistema, em tempo real, exatamente como você o vê — mas somente para visualização. Ela não pode editar, adicionar ou excluir nada.',
    fields,
    confirmText: isNew ? 'Criar acesso' : 'Salvar alterações'
  });
  if(!data) return;
  const scopes = ADMIN_SCOPES.filter(sc => data['scope_'+sc.key]==='Sim').map(sc=>sc.key);
  if(!scopes.length){ toast('Selecione ao menos uma seção para liberar', 'warn'); return; }

  state.adminAccess = state.adminAccess || [];
  if(existing){
    existing.name = data.name; existing.scopes = scopes; existing.expires = data.expires || null;
    save(); renderAdminAccesses();
    try{ if(window.publishAdminAccess) window.publishAdminAccess(existing); }catch{}
    toast('Acesso atualizado ✓', 'ok');
  } else {
    const nova = {
      token: genToken(),
      name: data.name || 'Cerimonialista',
      scopes,
      expires: data.expires || null,
      active: true,
      createdAt: new Date().toISOString()
    };
    state.adminAccess.push(nova);
    save(); renderAdminAccesses();
    try{ if(window.publishAdminAccess) window.publishAdminAccess(nova); }catch{}
    toast('Acesso criado ✓ Link copiado.', 'ok');
    copyToClipboard(adminAccessUrl(nova), '');
  }
}

function renderInvites(){
  const wrap=el('inv-list'); if(!wrap) return;
  // agrupa convidados por família (titular)
  const groups={};
  (state.guests||[]).forEach(g=>{ if(g.group){ (groups[g.group]=groups[g.group]||[]).push(g); } });
  const nomes=Object.keys(groups).sort();
  if(!nomes.length){ wrap.innerHTML='<div class="inv-empty">Cadastre convidados (com famílias) para gerar convites individuais.</div>'; return; }
  state.invites=state.invites||[];
  wrap.innerHTML='';
  nomes.forEach(fam=>{
    let inv=state.invites.find(x=>x.familyName===fam);
    const membros=groups[fam];
    const titular=membros.find(m=>m.isHead)||membros[0];
    const resp=inv && inv._answer; // resposta cacheada
    const card=document.createElement('div'); card.className='inv-card';
    const statusBadge = resp==='sim'?'<span class="inv-b sim">✓ Confirmou</span>'
      : resp==='pensando'?'<span class="inv-b pensando">⏳ Vai pensar</span>'
      : resp==='nao'?'<span class="inv-b nao">✕ Não vai</span>'
      : (inv?'<span class="inv-b none">Aguardando resposta</span>':'<span class="inv-b none">Sem convite</span>');
    card.innerHTML=`<div class="inv-top"><span class="inv-fam">${escapeHtml(fam)}</span>${statusBadge}</div>
      <div class="inv-members">${membros.map(m=>escapeHtml(m.name)).join(' · ')}</div>
      <div class="inv-actions">${inv
        ? `<button class="btn-sm" data-act="copy">Copiar link</button>
           <button class="btn-sm" data-act="wa">Enviar no WhatsApp</button>
           <button class="btn-sm" data-act="check">Ver resposta</button>
           <button class="icon-btn" data-act="del" title="Remover convite">✕</button>`
        : `<button class="btn-sm primary" data-act="create">Gerar convite</button>`}</div>`;
    if(inv){
      card.querySelector('[data-act=copy]').addEventListener('click',()=>{ copyToClipboard(inviteUrl(inv), 'Link do convite copiado ✓'); });
      card.querySelector('[data-act=wa]').addEventListener('click',()=>{
        const txt=encodeURIComponent(`Olá! Você está convidado(a) para o nosso casamento 💍\nAbra seu convite e confirme presença: ${inviteUrl(inv)}`);
        const phone=(titular.phone||'').replace(/\D/g,'');
        window.open(phone?`https://wa.me/55${phone}?text=${txt}`:`https://wa.me/?text=${txt}`,'_blank');
      });
      card.querySelector('[data-act=check]').addEventListener('click',()=>checkRSVP(inv));
      card.querySelector('[data-act=del]').addEventListener('click',async ()=>{ if(await confirmDialog('Remover convite','O link deixará de funcionar. Continuar?',{danger:true,confirmText:'Remover'})){ try{ unpublishInvite(inv.token); }catch{} state.invites=state.invites.filter(x=>x.token!==inv.token); save(); renderInvites(); toast('Convite removido'); } });
    } else {
      card.querySelector('[data-act=create]').addEventListener('click',()=>{
        const nova={ token:genToken(), familyName:fam, active:true, createdAt:new Date().toISOString() };
        state.invites.push(nova); save();
        try{ publishInvite(nova, membros); }catch{}
        renderInvites(); toast('Convite gerado ✓','ok');
        copyToClipboard(inviteUrl(nova));
      });
    }
    wrap.appendChild(card);
  });
}

/* Busca a resposta do convidado no Firestore e atualiza o status no app. */
async function checkRSVP(inv){
  if(typeof window.fetchRSVP!=='function'){ toast('Sincronização de RSVP requer a conta na nuvem.','warn'); return; }
  toast('Buscando resposta…');
  const r=await window.fetchRSVP(inv.token);
  if(!r){ toast('Ainda sem resposta para este convite.','warn'); return; }
  inv._answer=r.answer;
  // aplica no status dos convidados da família
  const map={sim:'confirmado', pensando:'pendente', nao:'nao'};
  const novo=map[r.answer]||'pendente';
  (state.guests||[]).forEach(g=>{ if(g.group===inv.familyName) g.status=novo; });
  save(); renderInvites(); renderAll();
  toast(`Resposta: ${r.answer==='sim'?'Confirmou presença ✓':r.answer==='pensando'?'Vai pensar':'Não vai'}`, r.answer==='nao'?'warn':'ok');
}
async function checkAllRSVP(){
  if(typeof window.fetchRSVP!=='function'){ toast('Requer conta na nuvem ativa.','warn'); return; }
  let n=0; for(const inv of (state.invites||[])){ const r=await window.fetchRSVP(inv.token); if(r){ inv._answer=r.answer; const map={sim:'confirmado',pensando:'pendente',nao:'nao'}; (state.guests||[]).forEach(g=>{ if(g.group===inv.familyName) g.status=map[r.answer]||'pendente'; }); n++; } }
  save(); renderInvites(); renderAll(); toast(n?`${n} resposta(s) sincronizada(s) ✓`:'Nenhuma resposta nova','ok');
}
