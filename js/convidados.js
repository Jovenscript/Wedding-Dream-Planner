/* ═════════════════════════════════════════════════════════════════════
   convidados.js — vista Convidados + inteligência de consumo
   O QUE: cadastro/edição de convidados (perfil: faixa etária + bebe
   álcool), guestStats() (conta PESSOAS confirmadas por perfil),
   custos do evento (fixos × variáveis), varCalc() (público-alvo ×
   consumo × margem), explicações (explainVar/explainAll), sincronização
   com o orçamento (syncVarLinkedItems cria itens "auto"), WhatsApp,
   importação/exportação Excel/CSV e o wiring initConvidadosUI().
   FLUXO EM TEMPO REAL: qualquer mudança → save() + renderAll() →
   guestStats recontada → estimativas e itens auto refeitos na hora.
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════════════ Convidados ═══════════════════ */
const G_STATUS={ confirmado:{label:'Confirmado',cls:'ok',ord:0}, pendente:{label:'Pendente',cls:'warn',ord:1}, nao:{label:'Não irá',cls:'off',ord:2} };
const DEFAULT_INVITE='Oi, {nome}! 💌 Queremos você com a gente no nosso evento. Em breve enviamos todos os detalhes. Um abraço!';

function normStatus(s){ s=String(s||'').toLowerCase().trim(); if(s.startsWith('conf')||s==='sim'||s==='ok') return 'confirmado'; if(s.startsWith('n')) return 'nao'; return 'pendente'; }
function normAge(a){ a=String(a||'').toLowerCase(); if(a.startsWith('crian')) return 'crianca'; if(a.startsWith('adol')||a.startsWith('menor')) return 'adolescente'; return 'adulto'; }
function normDrinks(d, age){ if(typeof d==='boolean') return age==='adulto'?d:false; const s=String(d||'').toLowerCase().trim(); if(age!=='adulto') return false; if(['sim','s','true','1','x','yes'].includes(s)) return true; if(['nao','não','n','false','0','no'].includes(s)) return false; return true; }
function normGuest(g){ g=g||{}; const ageGroup=normAge(g.ageGroup); return { id:g.id||uid(), name:String(g.name||'').trim()||'Convidado', phone:String(g.phone||'').trim(), whats:String(g.whats||g.phone||'').trim(), email:String(g.email||'').trim(), group:String(g.group||'').trim(), companions:Math.max(0,Math.min(20,Math.round(Number(g.companions)||0))), ageGroup, drinks:normDrinks(g.drinks, ageGroup), status:normStatus(g.status), notes:String(g.notes||'').trim() }; }
function normVar(v){ v=v||{}; const mode=(v.mode==='fixo')?'fixo':'var'; const aud=['todos','bebem','nao-bebem'].includes(v.audience)?v.audience:'todos'; return { id:v.id||uid(), name:String(v.name||'').trim()||'Item', category:String(v.category||'Outros').trim(), mode, unit:String(v.unit||'Pessoa').trim(), unitValue:Math.max(0,round2(v.unitValue)), perGuest:Math.max(0,Number(String(v.perGuest??'').toString().replace(',','.'))||0), qty:Math.max(1,Math.round(Number(v.qty)||1)), audience:aud, useMargin:!!v.useMargin, notes:String(v.notes||'').trim(), sync:!!v.sync }; }

/* Custos padrão do evento (sugeridos uma única vez; edite/apague à vontade) */
/* Referências de consumo (eventos de ~5-7h, valores médios de buffets e fornecedores;
   tudo editável em cada item e nos Parâmetros do Evento) */
function seedEventList(){ return [
  {name:'Janta',               category:'Alimentação', mode:'var',  unit:'Pessoa',  unitValue:65,  perGuest:1,   audience:'todos'},
  {name:'Chope Cherokee',      category:'Bebidas',     mode:'var',  unit:'Litro',   unitValue:23,  perGuest:1,   audience:'bebem',     useMargin:true},
  {name:'Refrigerante (lata)', category:'Bebidas',     mode:'var',  unit:'Lata',    unitValue:8,   perGuest:2,   audience:'nao-bebem', useMargin:true},
  {name:'Água (garrafa)',      category:'Bebidas',     mode:'var',  unit:'Garrafa', unitValue:5,   perGuest:1,   audience:'todos',     useMargin:true},
  {name:'Docinhos',            category:'Doces & Bolo',mode:'var',  unit:'Unidade', unitValue:0,   perGuest:7,   audience:'todos',     useMargin:true, notes:'Informe o preço por unidade para ver o total (referência: 6 a 8 docinhos por pessoa).'},
  {name:'Bolo',                category:'Doces & Bolo',mode:'var',  unit:'Quilo',   unitValue:0,   perGuest:0.1, audience:'todos',     useMargin:true, notes:'Informe o preço por quilo (referência: 80 a 120 g por pessoa).'},
  {name:'Garçom',              category:'Serviços',    mode:'fixo', unit:'Unidade', unitValue:220, qty:3},
  {name:'Zeladora dos banheiros', category:'Serviços', mode:'fixo', unit:'Unidade', unitValue:300, qty:1},
  {name:'Café',                category:'Alimentação', mode:'fixo', unit:'Unidade', unitValue:350, qty:1},
  {name:'ECAD',                category:'Outros',      mode:'fixo', unit:'Unidade', unitValue:800, qty:1}
]; }
/* Lista inicial de convidados de Carol & Marlon. Entra UMA única vez
   (flag settings.seedGuests) e somente se a lista estiver vazia — quem já
   importou a planilha não ganha duplicados. Fornecedores entram como
   CONFIRMADOS porque estarão no evento e consomem alimentação/bebidas. */
function seedGuestNames(){ return [
  ['CAROLINE','Noivos','confirmado'],['MARLON','Noivos','confirmado'],
  ['Ilton'],['Sonia'],['Daniele'],['Ezequiel'],['Sofia'],['Sérgio'],['Márcia Eing'],['Suelen'],
  ['Matheus Siqueira'],['Vinicius'],['Giovani'],['Wagner'],['Zé'],['Vilma'],['Antônio Arthur (Tunico)'],
  ['Denise','Família Denise'],['Marido Denise','Família Denise'],
  ['Helena'],['Danilo'],['Juliete'],['Gustavo'],['Ana Júlia'],['Rosa Gutowski'],['Índio'],['Bruno'],
  ['Milena'],['Jeferson'],
  ['Mariane','Família Mariane'],['Filho 1 Mariane','Família Mariane'],['Filho 2 Mariane','Família Mariane'],
  ['Madalena'],['Eduardo'],['Jaqueline'],['Edlucia'],['Leonora'],['João'],['Ronaldo'],['Sônia Olivato'],
  ['Rafael'],['Natália'],['Vitória'],
  ['Reginaldo Tessaro','Família Tessaro'],['Márcia Fanhani'],['Giovana'],['Gersino'],['Rodrigo'],['Érica'],
  ['Mauro'],['Lourdes'],['Gilberto'],['Carla'],['Amanda Tesky'],['Bianca'],
  ['Mário Tessaro','Família Tessaro'],['Maria Zulato'],['Eliandro'],['Moacir'],['Olívia'],['Maria'],['Amador'],
  ['Ana Tessaro','Família Tessaro'],['Valter'],['Carine'],['Marciano'],['Sarah'],['Lucas'],['Cleide'],
  ['Betinho'],['Julia'],['Goreti'],['Vanderlei'],['Hélio'],['Elfi'],['Amarildo'],['Cristiane'],
  ['Josias'],['Rosinha'],['Rosângela'],['Mário Antônio'],['Emily'],['Michael'],['Maitê'],['Reginaldo Arruda'],
  ['Ana'],['Samuel'],['Matheus Augusto'],['Amélia'],['Rose'],['Ademir'],['Thalita'],['Willian'],['Patrick'],
  ['Edvaldo'],['Genildes'],['Isabela'],
  ['Harley','Família Harley'],['Filho do Harley','Família Harley'],
  ['Jean'],['Camila'],['Douglas'],['Nenê'],['Madu'],['Ilda'],['Carlos'],['Claudiane'],['Théo'],['Stefany'],
  ['Ana Lívia'],['Bruno Filipp'],['Jaque'],['Lívia'],['Luisa'],['Cesário'],['Suzana'],
  ['Cardoso','Família Cardoso'],['Namorada Cardoso','Família Cardoso'],
  ['João Paulo'],['Andressa'],['Lívia'],['Claudete'],['Gilmar'],['Léo'],['Matheus Pereira'],['Taíse'],
  ['Fábio'],['Noah'],['Gael'],['Ronan'],['Gabi'],
  ['Fornecedor 1','Fornecedores','confirmado'],['Fornecedor 2','Fornecedores','confirmado'],
  ['Fornecedor 3','Fornecedores','confirmado'],['Fornecedor 4','Fornecedores','confirmado'],
  ['Fornecedor 5','Fornecedores','confirmado'],['Fornecedor 6','Fornecedores','confirmado']
]; }
function seedGuests(list, settings){
  if(settings.seedGuests) return list;
  settings.seedGuests=true;
  if(list.length) return list; // já tem convidados (ex.: importados) — não duplica
  seedGuestNames().forEach(([name,group,status])=>list.push(normGuest({name, group:group||'', status:status||'pendente'})));
  return list;
}

/* Quem já tinha os seeds da versão anterior ganha os perfis/margens uma única vez */
function upgradeSmartSeeds(list, settings){
  if(settings.seedSmartV2) return list;
  settings.seedSmartV2=true;
  const tweak={
    'chope cherokee':      {audience:'bebem',     useMargin:true, oldPer:0.5, newPer:1},
    'refrigerante (lata)': {audience:'nao-bebem', useMargin:true, oldPer:1,   newPer:2},
    'água (garrafa)':      {audience:'todos',     useMargin:true},
    'janta':               {audience:'todos',     useMargin:false}
  };
  list.forEach(v=>{ const t=tweak[v.name.toLowerCase()]; if(!t) return; v.audience=t.audience; v.useMargin=t.useMargin; if(t.newPer!==undefined && Math.abs(v.perGuest-t.oldPer)<0.001) v.perGuest=t.newPer; });
  const have=new Set(list.map(v=>v.name.toLowerCase()));
  seedEventList().filter(s=>s.category==='Doces & Bolo').forEach(s=>{ if(!have.has(s.name.toLowerCase())) list.push(normVar({...s, sync:false})); });
  return list;
}
function seedEventCosts(list, settings){
  if(settings.seedEventCosts) return list;
  settings.seedEventCosts=true;
  const have=new Set(list.map(v=>v.name.toLowerCase()));
  seedEventList().forEach(s=>{ if(!have.has(s.name.toLowerCase())) list.push(normVar({...s, sync:false})); });
  return list;
}

function onlyDigits(s){ return String(s||'').replace(/\D+/g,''); }
function waNumber(s){ let d=onlyDigits(s); if(!d) return ''; if(d.length===10||d.length===11) d='55'+d; return d; }
function fmtPhone(s){ const d=onlyDigits(s); if(d.length===11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; if(d.length===10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; if(d.length===13&&d.startsWith('55')) return `(${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`; return s||''; }
function inviteMsgFor(g){ const t=(state.settings.inviteMsg||DEFAULT_INVITE); return t.replaceAll('{nome}', (g.name||'').split(' ')[0]); }
async function copyText(txt,okMsg){ try{ await navigator.clipboard.writeText(txt); toast(okMsg||'Copiado'); }catch{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); toast(okMsg||'Copiado'); }catch{ toast('Não consegui copiar.','warn'); } ta.remove(); } }

/* Conta PESSOAS confirmadas (titular + acompanhantes) separadas por perfil.
   É a fonte que alimenta todas as estimativas de consumo — acompanhantes
   herdam a faixa etária e o "bebe álcool" do titular. */
function guestStats(){
  let conf=0,pend=0,nao=0;
  const mk=()=>({people:0,drinkers:0,kids:0,teens:0});
  const C=mk(), P=mk();   // C = confirmados · P = pendentes (ainda contam no planejamento)
  state.guests.forEach(g=>{
    const n=1+(g.companions||0);
    if(g.status==='nao'){ nao+=n; return; }          // cancelou → sai da conta na hora
    const b = g.status==='confirmado' ? C : P;
    b.people+=n;
    if(g.ageGroup==='crianca') b.kids+=n;
    else if(g.ageGroup==='adolescente') b.teens+=n;
    else if(g.drinks!==false) b.drinkers+=n;         // acompanhantes herdam o perfil do titular
    if(g.status==='confirmado') conf+=n; else pend+=n;
  });
  /* BASE DE PLANEJAMENTO das estimativas (p*):
     'lista' (padrão) → todo mundo exceto quem marcou "não irá"; os números
     começam cheios e DIMINUEM a cada cancelamento.
     'confirmados' → só quem confirmou; começa em zero e sobe. */
  const useAll = smartCfg().basis !== 'confirmados';
  const S = useAll ? {people:C.people+P.people, drinkers:C.drinkers+P.drinkers, kids:C.kids+P.kids, teens:C.teens+P.teens} : C;
  const pMinors=S.kids+S.teens;
  return {
    conf, pend, nao, total: conf+pend+nao, entries: state.guests.length, basisAll: useAll,
    // planejamento (alimenta chope, refri, água, comida, bolo, docinhos):
    pPeople:S.people, pDrinkers:S.drinkers, pNonDrinkers:Math.max(0,S.people-S.drinkers),
    pKids:S.kids, pTeens:S.teens, pMinors, pAdults:Math.max(0,S.people-pMinors),
    // confirmados (KPIs de confirmação):
    drinkers:C.drinkers, nonDrinkers:Math.max(0,conf-C.drinkers),
    kids:C.kids, teens:C.teens, minors:C.kids+C.teens, adults:Math.max(0,conf-C.kids-C.teens)
  };
}
function smartCfg(){ const s=(state.settings&&state.settings.smart)||{}; return { margin: isFinite(Number(s.margin))?Math.max(0,Math.min(100,Number(s.margin))):10, hours: isFinite(Number(s.hours))?Math.max(1,Number(s.hours)):6, basis: s.basis==='confirmados'?'confirmados':'lista' }; }
function audienceCount(st, aud){ return aud==='bebem'?(st.pDrinkers??st.drinkers) : aud==='nao-bebem'?(st.pNonDrinkers??st.nonDrinkers) : (st.pPeople??st.conf); }
const AUD_LABEL={ 'todos':'todos os confirmados', 'bebem':'adultos que consomem álcool', 'nao-bebem':'menores + adultos que não consomem álcool' };
const UNIT_CEIL=['Lata','Garrafa','Unidade','Caixa'];
function varCalc(v, stats){
  const st = (typeof stats==='number') ? {conf:stats, pPeople:stats, pDrinkers:stats, pNonDrinkers:0} : stats;
  if(v.mode==='fixo'){
    const qty=Math.max(1,Math.round(v.qty||1));
    const total=round2(qty*(v.unitValue||0));
    return { qty, base:qty, target:0, marginPct:0, total, per: (st.pPeople??st.conf)>0?round2(total/(st.pPeople??st.conf)):0 };
  }
  const target=audienceCount(st, v.audience||'todos');
  const base=round2(target*(v.perGuest||0));
  const marginPct=v.useMargin ? smartCfg().margin : 0;
  let qty=base*(1+marginPct/100);
  qty = UNIT_CEIL.includes(v.unit) ? Math.ceil(qty-1e-9) : round2(qty);
  const total=round2(qty*(v.unitValue||0));
  return { qty, base, target, marginPct, total, per: (st.pPeople??st.conf)>0?round2(total/(st.pPeople??st.conf)):0 };
}
/* Narrativa geral: junta o perfil dos confirmados com TODAS as estimativas,
   no formato pedido ("Foram considerados X adultos, Y crianças..."). */
function explainAll(){
  const s=guestStats();
  const varsOn=state.varCosts.filter(v=>v.mode!=='fixo');
  const fq=n=>String(n).replace('.',',');
  const parts=varsOn.map(v=>{ const c=varCalc(v,s); return `${fq(c.qty)} ${unitAbbr(v.unit)} de ${v.name}`; });
  const baseTxt = s.basisAll ? 'toda a lista (exceto quem marcou “não irá”)' : 'somente os confirmados';
  const intro=`Base de planejamento: <strong>${baseTxt}</strong> — <strong>${s.pAdults} adultos</strong>, <strong>${s.pKids} crianças</strong> e <strong>${s.pTeens} adolescentes</strong> (${s.pPeople} pessoas, incluindo acompanhantes). Dessas, <strong>${s.pDrinkers}</strong> consomem bebida alcoólica e ${s.pNonDrinkers} não consomem. Com os consumos configurados e margem de ${fq(smartCfg().margin)}%, as estimativas são (cancelamentos reduzem tudo na hora):`;
  const rows=state.varCosts.map(v=>{ const c=varCalc(v,s); const fixo=v.mode==='fixo';
    return `<tr><th>${escapeHtml(v.name)}</th><td>${fixo?`${c.qty} × ${toBRL(v.unitValue)}`:`${fq(c.qty)} ${escapeHtml(unitAbbr(v.unit))} <span style="color:var(--ink-faint)">(${AUD_LABEL[v.audience||'todos']})</span>`}</td><td style="text-align:right;white-space:nowrap">${(v.unitValue>0||fixo)?toBRL(c.total):'—'}</td></tr>`; }).join('');
  const table=`<div class="prev-scroll"><table class="prev-table"><thead><tr><th>Item</th><th>Estimativa</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  modal({ title:'Detalhes do cálculo', html:`<p style="font-size:13.5px;color:var(--ink-muted);line-height:1.65">${intro}</p>${table}<div class="modal-note">Cada linha tem o próprio botão “Cálculo” com a fórmula completa. Tudo recalcula em tempo real quando você confirma convidados, muda faixa etária ou marca quem bebe.</div>`, confirmText:'Entendi', hideCancel:true });
}
function explainVar(id){
  const v=state.varCosts.find(x=>x.id===id); if(!v) return;
  const s=guestStats(), c=varCalc(v,s), ab=unitAbbr(v.unit), fq=n=>String(n).replace('.',',');
  let paras, rows;
  if(v.mode==='fixo'){
    paras=`Custo fixo do evento: não depende da quantidade de convidados. São ${c.qty} × ${toBRL(v.unitValue)}.`;
    rows=[['Fórmula',`${c.qty} × ${toBRL(v.unitValue)} = ${toBRL(c.total)}`],['Quantidade',`${c.qty} ${escapeHtml(v.unit.toLowerCase())}(s)`],['Custo de cada um',toBRL(v.unitValue)],['Total',toBRL(c.total)],['Impacto por convidado', s.conf>0?toBRL(c.per):'—']];
  } else {
    const baseTxt = s.basisAll ? `toda a lista, exceto quem marcou “não irá” (confirmados + pendentes)` : `somente os confirmados`;
    paras=`A base de planejamento atual é <strong>${baseTxt}</strong>: ${s.pPeople} pessoa(s), incluindo acompanhantes. Dessas, ${s.pDrinkers} consomem bebida alcoólica e ${s.pNonDrinkers} não consomem (${s.pMinors} menores). Este item é calculado para <strong>${AUD_LABEL[v.audience||'todos']}</strong> — ${c.target} pessoa(s) — usando o consumo médio configurado${c.marginPct?` e uma margem de segurança de ${fq(c.marginPct)}% para reduzir o risco de faltar`:''}. Cada “não irá” reduz os números na hora.`;
    rows=[
      ['Público', `${AUD_LABEL[v.audience||'todos']} → ${c.target} pessoa(s)`],
      ['Consumo médio', `${fq(v.perGuest)} ${ab}/pessoa (editável)`],
      ['Base', `${c.target} × ${fq(v.perGuest)} = ${fq(c.base)} ${ab}`],
      ['Margem de segurança', c.marginPct?`${fq(c.marginPct)}% → recomendado ${fq(c.qty)} ${ab}`:'não aplicada'],
      ['Quantidade final', `${fq(c.qty)} ${ab}`],
      ['Valor unitário', v.unitValue>0?toBRL(v.unitValue):'— (informe no item)'],
      ['Total', v.unitValue>0?`${fq(c.qty)} × ${toBRL(v.unitValue)} = ${toBRL(c.total)}`:'—'],
      ['Média por convidado', s.conf>0&&v.unitValue>0?toBRL(c.per):'—']
    ];
  }
  const table=`<div class="prev-scroll" style="max-height:none"><table class="prev-table">${rows.map(r=>`<tr><th style="width:44%">${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</table></div>`;
  const nota=v.mode==='fixo'?'':`<div class="modal-note">Acompanhantes herdam o perfil do titular. Convidados sem perfil definido contam como adultos que consomem álcool — ajuste tocando no nome de cada um. Consumos e margem ficam em “Parâmetros do Evento” e no botão Editar de cada item.</div>`;
  modal({ title:`Detalhes do cálculo — ${v.name}`, html:`<p style="font-size:13.5px;color:var(--ink-muted);line-height:1.6">${paras}</p>${table}${nota}`, confirmText:'Entendi', hideCancel:true });
}

/* Sincronização: custo variável ↔ item automático no orçamento */
function syncVarLinkedItems(){
  const gsx=guestStats();
  state.varCosts.forEach(v=>{
    let it=state.items.find(x=>x.varId===v.id);
    if(v.sync){
      const {total}=varCalc(v,gsx);
      if(!it){ it={id:uid(), varId:v.id, name:v.name, category:v.category, total, paid:0, paidAt:null}; state.items.push(it); }
      else { it.name=v.name; it.category=v.category; if(Math.abs((it.total||0)-total)>0.004){ it.total=total; if(state.settings.strict && (it.paid||0)>it.total) it.paid=it.total; } }
    } else if(it){ if((it.paid||0)>0){ delete it.varId; } else { state.items=state.items.filter(x=>x!==it); } }
  });
  state.items=state.items.filter(it=>!it.varId || state.varCosts.some(v=>v.id===it.varId && v.sync));
}

/* ── CRUD convidados ── */
function addGuestFromForm(){
  const name=(el('g-name').value||'').trim();
  if(!name){ el('g-name').focus(); toast('Informe o nome do convidado.','warn'); return; }
  const g=normGuest({ name, phone:el('g-phone').value, group:el('g-group').value, companions:el('g-comp').value, ageGroup:el('g-age').value, status:el('g-status').value });
  state.guests.push(g);
  logHist('ajuste', `Convidado adicionado — ${g.name}`, 0);
  el('g-name').value=''; el('g-phone').value=''; el('g-comp').value='0'; el('g-status').value='pendente'; el('g-age').value='adulto';
  save(); renderAll(); toast(`${g.name} adicionado`); el('g-name').focus();
}
async function editGuest(id){
  const g=state.guests.find(x=>x.id===id); if(!g) return;
  const res=await modal({
    title:`Editar — ${g.name}`,
    fields:[
      {key:'name',  label:'Nome completo', value:g.name},
      {key:'phone', label:'Telefone', value:g.phone},
      {key:'whats', label:'WhatsApp (se for outro número)', value:g.whats},
      {key:'email', label:'E-mail (opcional)', value:g.email},
      {key:'group', label:'Família / grupo', value:g.group},
      {key:'companions', label:'Acompanhantes', type:'number', value:g.companions},
      {key:'ageGroup', label:'Faixa etária', type:'select', options:['Adulto','Adolescente','Criança'], value:g.ageGroup==='crianca'?'Criança':(g.ageGroup==='adolescente'?'Adolescente':'Adulto')},
      {key:'drinks', label:'Consome bebida alcoólica?', type:'select', options:['Sim','Não'], value:g.drinks?'Sim':'Não'},
      {key:'status', label:'Confirmação', type:'select', options:['Pendente','Confirmado','Não irá'], value:G_STATUS[g.status].label},
      {key:'notes', label:'Observações', type:'textarea', value:g.notes}
    ],
    confirmText:'Salvar',
    validate:v=>{ if(!(v.name||'').trim()) return 'O nome não pode ficar vazio.'; return null; }
  });
  if(!res) return;
  Object.assign(g, normGuest({ ...g, ...res, whats:res.whats||res.phone }));
  save(); renderAll(); toast('Convidado atualizado');
}
async function removeGuest(id){
  const g=state.guests.find(x=>x.id===id); if(!g) return;
  const ok=await confirmDialog('Remover convidado', `Remover “${g.name}” da lista?`, {confirmText:'Remover'});
  if(!ok) return;
  state.guests=state.guests.filter(x=>x.id!==id);
  logHist('ajuste', `Convidado removido — ${g.name}`, 0);
  save(); renderAll(); toast('Convidado removido');
}
async function editInviteMsg(){
  const res=await modal({
    title:'Mensagem de convite',
    message:'Use {nome} para inserir o primeiro nome do convidado automaticamente.',
    fields:[{key:'msg', label:'Mensagem', type:'textarea', value:state.settings.inviteMsg||DEFAULT_INVITE}],
    confirmText:'Salvar'
  });
  if(!res) return;
  state.settings.inviteMsg=(res.msg||'').trim()||DEFAULT_INVITE;
  save(); toast('Mensagem salva');
}

/* ── CRUD custos variáveis ── */
function addVarFromForm(){
  const name=(el('vc-name').value||'').trim();
  if(!name){ el('vc-name').focus(); toast('Dê um nome ao item.','warn'); return; }
  const priceEl=el('vc-price'); const mode=el('vc-mode').value;
  const v=normVar({ name, category:el('vc-cat').value, mode, unit:el('vc-unit').value, unitValue:parseMoneyToNumber(priceEl.dataset.raw||priceEl.value), perGuest:el('vc-per').value, qty:el('vc-qty').value, sync:false });
  if(v.unitValue<=0){ priceEl.focus(); toast('Informe o valor unitário.','warn'); return; }
  if(v.mode==='var' && v.perGuest<=0){ el('vc-per').focus(); toast('Informe o consumo médio por pessoa.','warn'); return; }
  state.varCosts.push(v);
  logHist('ajuste', `Custo do evento adicionado — ${v.name}`, 0);
  el('vc-name').value=''; priceEl.value=''; priceEl.dataset.raw='0'; el('vc-per').value=''; el('vc-qty').value='1';
  save(); renderAll(); toast(`${v.name} adicionado`);
}
async function editVar(id){
  const v=state.varCosts.find(x=>x.id===id); if(!v) return;
  const cats=['Alimentação','Bebidas','Doces & Bolo','Descartáveis','Lembranças','Serviços','Estrutura','Outros'];
  const units=['Pessoa','Litro','Garrafa','Lata','Unidade','Quilo','Caixa'];
  const res=await modal({
    title:`Editar — ${v.name}`,
    fields:[
      {key:'name',  label:'Nome', value:v.name},
      {key:'mode',  label:'Tipo', type:'select', options:['Variável (por pessoa)','Fixo (do evento)'], value:v.mode==='fixo'?'Fixo (do evento)':'Variável (por pessoa)'},
      {key:'category', label:'Categoria', type:'select', options:cats, value:cats.includes(v.category)?v.category:'Outros'},
      {key:'unit',  label:'Unidade', type:'select', options:units, value:units.includes(v.unit)?v.unit:'Unidade'},
      {key:'unitValue', label:'Valor unitário', type:'money', value:v.unitValue},
      {key:'audience', label:'Quem consome (se variável)', type:'select', options:['Todos os confirmados','Só quem bebe álcool','Quem não bebe (inclui menores)'], value:v.audience==='bebem'?'Só quem bebe álcool':(v.audience==='nao-bebem'?'Quem não bebe (inclui menores)':'Todos os confirmados')},
      {key:'useMargin', label:'Aplicar margem de segurança?', type:'select', options:['Sim','Não'], value:v.useMargin?'Sim':'Não'},
      {key:'perGuest', label:'Consumo por pessoa (se variável)', type:'number', step:'0.01', value:v.perGuest},
      {key:'qty', label:'Quantidade (se fixo)', type:'number', value:v.qty||1},
      {key:'notes', label:'Observações', type:'textarea', value:v.notes}
    ],
    confirmText:'Salvar',
    validate:r=>{
      if(!(r.name||'').trim()) return 'Dê um nome ao item.';
      const fixo=String(r.mode).startsWith('Fixo');
      if(!fixo && !(Number(String(r.perGuest).replace(',','.'))>0)) return 'Informe o consumo por pessoa.';
      return null;
    }
  });
  if(!res) return;
  const audMap={'Só quem bebe álcool':'bebem','Quem não bebe (inclui menores)':'nao-bebem'};
  Object.assign(v, normVar({ ...v, name:res.name, mode:String(res.mode).startsWith('Fixo')?'fixo':'var', category:res.category, unit:res.unit, unitValue:parseMoneyToNumber(res.unitValue), audience:audMap[res.audience]||'todos', useMargin:res.useMargin==='Sim', perGuest:res.perGuest, qty:res.qty, notes:res.notes }));
  logHist('ajuste', `Custo do evento editado — ${v.name}`, 0);
  save(); renderAll(); toast('Custo atualizado');
}
async function removeVar(id){
  const v=state.varCosts.find(x=>x.id===id); if(!v) return;
  const linked=state.items.find(x=>x.varId===v.id);
  const msg = linked ? `Remover “${v.name}”? O item automático dele no orçamento também será removido${(linked.paid||0)>0?` (o valor pago de ${toBRL(linked.paid)} volta ao saldo)`:''}.` : `Remover “${v.name}”?`;
  const ok=await confirmDialog('Remover custo', msg, {confirmText:'Remover'});
  if(!ok) return;
  state.varCosts=state.varCosts.filter(x=>x.id!==id);
  state.items=state.items.filter(x=>x.varId!==v.id);
  logHist('exclusao', `Custo por convidado removido — ${v.name}`, linked?(linked.paid||0):0);
  save(); renderAll(); toast('Custo removido');
}
function toggleVarSync(id,on){
  const v=state.varCosts.find(x=>x.id===id); if(!v) return;
  v.sync=!!on;
  logHist('ajuste', v.sync?`Custo sincronizado ao orçamento — ${v.name}`:`Sincronização removida — ${v.name}`, 0);
  save(); renderAll();
  toast(v.sync?`“${v.name}” agora aparece no orçamento e acompanha as confirmações`:`“${v.name}” saiu do orçamento automático`);
}

/* ── Render da vista de convidados ── */
let gFilter='all', gGroup='all', gSort='name', gSearch='';
function unitAbbr(u){ return ({'Litro':'L','Garrafa':'gf','Lata':'lata','Unidade':'un','Quilo':'kg','Caixa':'cx','Pessoa':'pessoa'})[u]||u; }
function renderGuestView(c){
  const s=guestStats();
  el('gk-total').textContent=s.total; el('gk-conf').textContent=s.conf; el('gk-pend').textContent=s.pend; el('gk-nao').textContent=s.nao;
  el('gk-conf-sub').textContent = s.conf>0 ? `${s.drinkers} bebem · ${s.nonDrinkers} não bebem` : '';
  el('g-smart-line').innerHTML = s.pPeople>0
    ? `Planejando para <strong>${s.pPeople} pessoas</strong> ${s.basisAll?'(toda a lista, menos quem marcou “não irá”)':'(somente confirmados)'}: <strong>${s.pAdults} adultos</strong> (${s.pDrinkers} bebem), <strong>${s.pTeens} adolescentes</strong> e <strong>${s.pKids} crianças</strong> — incluindo acompanhantes. ${s.basisAll?'Cada cancelamento reduz chope, refrigerante, água, comida, bolo e docinhos automaticamente.':'Cada confirmação soma nas estimativas automaticamente.'}`
    : 'Adicione pessoas à lista para ver as estimativas — tudo recalcula sozinho a cada mudança.';
  const pct=s.total>0?clamp(s.conf/s.total*100,0,100):0;
  el('g-bar').style.width=pct+'%';
  el('g-bar-legend').textContent=`${pct.toFixed(0)}% confirmado (${s.conf} de ${s.total})`;

  let food=0,drink=0,other=0,fixTot=0,varTot=0;
  state.varCosts.forEach(v=>{ const t=varCalc(v,s).total; if(v.category==='Alimentação') food+=t; else if(v.category==='Bebidas') drink+=t; else other+=t; if(v.mode==='fixo') fixTot+=t; else varTot+=t; });
  const evTotal=round2(food+drink+other);
  el('gk-food').textContent=toBRL(food); el('gk-drink').textContent=toBRL(drink); el('gk-other').textContent=toBRL(other); el('gk-var').textContent=toBRL(evTotal);
  const pctOrc = c.totalExpense>0 ? `${clamp(evTotal/c.totalExpense*100,0,999).toFixed(0)}% do orçamento` : '';
  el('gk-var-sub').textContent = `${toBRL(varTot)} variáveis · ${toBRL(fixTot)} fixos${pctOrc?` · ${pctOrc}`:''}`;

  // grupos no filtro + datalist
  const groups=[...new Set(state.guests.map(g=>g.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const gf=el('g-group-filter'); const cur=gf.value;
  gf.innerHTML='<option value="all">Todos os grupos</option>'+groups.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
  gf.value=groups.includes(cur)?cur:'all'; gGroup=gf.value;
  el('g-group-list').innerHTML=groups.map(g=>`<option value="${escapeHtml(g)}">`).join('');

  // lista filtrada + ordenada
  let rows=state.guests.slice();
  if(gFilter!=='all') rows=rows.filter(g=>g.status===gFilter);
  if(gGroup!=='all') rows=rows.filter(g=>g.group===gGroup);
  if(gSearch){ const q=gSearch.toLowerCase(); rows=rows.filter(g=>[g.name,g.group,g.phone,g.whats,g.email,g.notes].join(' ').toLowerCase().includes(q)); }
  rows.sort((a,b)=>{
    if(gSort==='status') return (G_STATUS[a.status].ord-G_STATUS[b.status].ord)||a.name.localeCompare(b.name,'pt-BR');
    if(gSort==='group') return (a.group||'\uffff').localeCompare(b.group||'\uffff','pt-BR')||a.name.localeCompare(b.name,'pt-BR');
    return a.name.localeCompare(b.name,'pt-BR');
  });

  const tbody=el('g-tbody'); tbody.innerHTML='';
  if(!rows.length){ tbody.innerHTML=`<tr><td colspan="6"><div class="empty">${state.guests.length? 'Nenhum convidado com esses filtros.':'Nenhum convidado ainda. Adicione no campo acima ou importe uma planilha Excel.'}</div></td></tr>`; return; }
  rows.forEach(g=>{
    const tr=document.createElement('tr');
    const wnum=waNumber(g.whats||g.phone);
    const tdName=document.createElement('td');
    const prof=[]; if(g.ageGroup==='crianca') prof.push('Criança'); else if(g.ageGroup==='adolescente') prof.push('Adolescente'); else if(g.drinks===false) prof.push('Não bebe álcool');
    const subTxt=[...prof, g.notes].filter(Boolean).join(' · ');
    tdName.innerHTML=`<button class="linklike" style="all:unset;cursor:pointer;font-weight:600;color:var(--ink)" title="Editar convidado">${escapeHtml(g.name)}</button>${subTxt?`<div class="g-sub">${escapeHtml(subTxt)}</div>`:''}`;
    tdName.querySelector('button').addEventListener('click',()=>editGuest(g.id));
    tr.appendChild(tdName);

    const tdC=document.createElement('td');
    tdC.innerHTML=`<div class="g-contact"><span class="ph">${escapeHtml(fmtPhone(g.whats||g.phone))||'<span style="color:var(--ink-faint)">sem telefone</span>'}</span>${g.email?`<span class="em">${escapeHtml(g.email)}</span>`:''}</div>`;
    tr.appendChild(tdC);

    const tdG=document.createElement('td'); tdG.innerHTML=g.group?`<span class="pill">${escapeHtml(g.group)}</span>`:'<span style="color:var(--ink-faint)">—</span>'; tr.appendChild(tdG);
    const tdA=document.createElement('td'); tdA.textContent=g.companions?`+${g.companions}`:'—'; tr.appendChild(tdA);

    const tdS=document.createElement('td');
    const sel=document.createElement('select'); sel.className='field slim'; sel.setAttribute('aria-label','Status de '+g.name);
    [['pendente','Pendente'],['confirmado','Confirmado'],['nao','Não irá']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; sel.appendChild(o); });
    sel.value=g.status;
    sel.addEventListener('change',()=>{ g.status=sel.value; logHist('ajuste',`Confirmação — ${g.name}: ${G_STATUS[g.status].label}`,0); save(); renderAll(); });
    tdS.appendChild(sel); tr.appendChild(tdS);

    const tdAct=document.createElement('td'); const acts=document.createElement('div'); acts.className='row-actions';
    const wa=document.createElement('a'); wa.className='wa-btn'+(wnum?'':' is-disabled');
    wa.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.2L2 22l4.93-1.58A9.9 9.9 0 1 0 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-2.93.94.96-2.86-.2-.3a8.13 8.13 0 1 1 6.6 3.53Zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.5.11-.11.24-.28.37-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.65.3-.22.24-.85.83-.85 2.03s.87 2.36 1 2.52c.12.16 1.72 2.62 4.16 3.68.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.46-.28Z"/></svg><span>WhatsApp</span>`;
    if(wnum){ wa.href=`https://wa.me/${wnum}?text=${encodeURIComponent(inviteMsgFor(g))}`; wa.target='_blank'; wa.rel='noopener'; } else wa.title='Cadastre um telefone para abrir o WhatsApp';
    acts.appendChild(wa);
    const cp=document.createElement('button'); cp.className='icon-btn'; cp.title='Copiar telefone'; cp.setAttribute('aria-label','Copiar telefone de '+g.name); cp.textContent='☎'; cp.addEventListener('click',()=>{ if(!g.phone&&!g.whats){ toast('Sem telefone cadastrado.','warn'); return;} copyText(fmtPhone(g.phone||g.whats),'Telefone copiado'); }); acts.appendChild(cp);
    const cm=document.createElement('button'); cm.className='icon-btn'; cm.title='Copiar mensagem de convite'; cm.setAttribute('aria-label','Copiar convite para '+g.name); cm.textContent='✉'; cm.addEventListener('click',()=>copyText(inviteMsgFor(g),'Convite copiado')); acts.appendChild(cm);
    const del=document.createElement('button'); del.className='icon-btn'; del.title='Remover convidado'; del.setAttribute('aria-label','Remover '+g.name); del.textContent='✕'; del.addEventListener('click',()=>removeGuest(g.id)); acts.appendChild(del);
    tdAct.appendChild(acts); tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });

  renderVarList(s, c);
}
function renderVarList(gsx, c){
  const people=gsx.pPeople??gsx.conf;
  const list=el('vc-list'); list.innerHTML='';
  if(!state.varCosts.length){ list.innerHTML=`<div class="empty">Nenhum custo por convidado ainda. Cadastre alimentação, bebidas, doces, lembranças… e veja tudo calculado sozinho.</div>`; return; }
  const fmtQ=n=>String(n).replace('.',',');
  state.varCosts.forEach(v=>{
    const {qty,total,per,target,marginPct}=varCalc(v,gsx);
    const fixo=v.mode==='fixo';
    const row=document.createElement('div'); row.className='vc-row';
    const badge=fixo?'<span class="pill" style="margin-left:6px;background:var(--ivory-deep)">Fixo</span>':'';
    const audTxt = v.audience==='bebem'?'só quem bebe':(v.audience==='nao-bebem'?'quem não bebe':'todos');
    const meta = fixo
      ? `${toBRL(v.unitValue)} por ${escapeHtml(v.unit.toLowerCase())} · quantidade fixa`
      : `${v.unitValue>0?toBRL(v.unitValue)+' por '+escapeHtml(v.unit.toLowerCase())+' · ':''}${fmtQ(v.perGuest)} ${escapeHtml(unitAbbr(v.unit))}/pessoa · ${audTxt}${v.useMargin?` · +${fmtQ(smartCfg().margin)}% margem`:''}`;
    row.innerHTML=
      `<div class="vc-main"><div class="vc-name editable" title="Editar custo">${escapeHtml(v.name)} <span class="pill" style="margin-left:6px">${escapeHtml(v.category)}</span>${badge}</div>`+
      `<div class="vc-meta">${meta}${v.notes?` · ${escapeHtml(v.notes)}`:''}</div></div>`+
      `<div class="vc-calc">`+
      (fixo
        ? `<div class="vc-num"><div class="l">Quantidade</div><div class="v vc-qty-slot"></div></div>`
        : `<div class="vc-num"><div class="l">Necessário</div><div class="v">${fmtQ(qty)} ${escapeHtml(unitAbbr(v.unit))}</div></div>`)+
      `<div class="vc-num"><div class="l">${fixo?'Cada um':'Por convidado'}</div><div class="v">${fixo?toBRL(v.unitValue):(people>0?toBRL(per):'—')}</div></div>`+
      `<div class="vc-num"><div class="l">${fixo?'Total':'Total ('+target+' pessoas)'}</div><div class="v">${v.unitValue>0||fixo?toBRL(total):'—'}</div></div>`+
      `</div>`;
    row.querySelector('.vc-name').addEventListener('click',()=>editVar(v.id));
    if(fixo){
      const slot=row.querySelector('.vc-qty-slot');
      const q=document.createElement('input'); q.type='number'; q.min='1'; q.step='1'; q.value=String(v.qty||1);
      q.className='field slim'; q.style.width='70px'; q.setAttribute('aria-label','Quantidade de '+v.name);
      q.addEventListener('change',()=>{ const n=Math.max(1,Math.round(Number(q.value)||1)); if(n!==v.qty){ v.qty=n; save(); renderAll(); } });
      slot.appendChild(q);
    }
    const lab=document.createElement('label'); lab.className='sync-toggle'; lab.title='Cria um item automático na aba Orçamento'+(fixo?'':' que acompanha as confirmações');
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=!!v.sync; chk.addEventListener('change',()=>toggleVarSync(v.id,chk.checked));
    lab.appendChild(chk); lab.appendChild(document.createTextNode('No orçamento'));
    row.appendChild(lab);
    const inf=document.createElement('button'); inf.className='btn-sm ghost'; inf.textContent='Cálculo'; inf.title='Ver detalhes do cálculo'; inf.setAttribute('aria-label','Ver detalhes do cálculo de '+v.name); inf.addEventListener('click',()=>explainVar(v.id)); row.appendChild(inf);
    const ed=document.createElement('button'); ed.className='btn-sm ghost'; ed.textContent='Editar'; ed.title='Editar custo'; ed.addEventListener('click',()=>editVar(v.id)); row.appendChild(ed);
    const del=document.createElement('button'); del.className='icon-btn'; del.title='Remover custo'; del.setAttribute('aria-label','Remover '+v.name); del.textContent='✕'; del.addEventListener('click',()=>removeVar(v.id)); row.appendChild(del);
    list.appendChild(row);
  });
}

/* ── Import / Export (Excel + CSV) ── */
let __xlsxLoading=null;
function loadXLSX(){
  if(window.XLSX) return Promise.resolve();
  if(__xlsxLoading) return __xlsxLoading;
  __xlsxLoading=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=res; s.onerror=()=>rej(new Error('cdn')); document.head.appendChild(s); });
  return __xlsxLoading;
}
function guestRowsForExport(){
  const AGE={adulto:'Adulto',adolescente:'Adolescente',crianca:'Criança'};
  return state.guests.map(g=>({ 'Nome':g.name, 'Telefone':g.phone, 'WhatsApp':g.whats, 'E-mail':g.email, 'Grupo':g.group, 'Acompanhantes':g.companions, 'Faixa etária':AGE[g.ageGroup]||'Adulto', 'Bebe álcool':g.drinks?'Sim':'Não', 'Status':G_STATUS[g.status].label, 'Observações':g.notes }));
}
async function exportGuestsXLSX(){
  if(!state.guests.length){ toast('A lista está vazia.','warn'); return; }
  toast('Preparando Excel…');
  try{
    await loadXLSX();
    const ws=XLSX.utils.json_to_sheet(guestRowsForExport());
    ws['!cols']=[{wch:28},{wch:16},{wch:16},{wch:26},{wch:16},{wch:14},{wch:13},{wch:11},{wch:12},{wch:32}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Convidados');
    XLSX.writeFile(wb,'Convidados-'+((state.settings.eventName||'Evento').replace(/[^\w]+/g,'-'))+'.xlsx');
    toast('Excel exportado','ok');
  }catch(e){ console.error(e); toast('Falha ao gerar o Excel. Verifique a conexão.','warn'); }
}
function exportGuestsCSV(){
  if(!state.guests.length){ toast('A lista está vazia.','warn'); return; }
  const rows=guestRowsForExport();
  const heads=Object.keys(rows[0]);
  const esc=v=>{ v=String(v==null?'':v); return /[";\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v; };
  const csv='\ufeff'+heads.join(';')+'\n'+rows.map(r=>heads.map(h=>esc(r[h])).join(';')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='Convidados-'+((state.settings.eventName||'Evento').replace(/[^\w]+/g,'-'))+'.csv'; a.click(); URL.revokeObjectURL(url);
  toast('CSV exportado','ok');
}
async function importGuestsXLSX(file){
  toast('Lendo planilha…');
  try{
    await loadXLSX();
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{defval:''});
    if(!raw.length){ toast('A planilha está vazia.','warn'); return; }
    const norm=k=>String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const mapKey=(r,names)=>{ for(const k of Object.keys(r)){ if(names.includes(norm(k))) return r[k]; } return ''; };
    const parsed=[], invalid=[];
    raw.forEach((r,i)=>{
      const g=normGuest({
        name: mapKey(r,['nome','nome completo','convidado']),
        phone: mapKey(r,['telefone','fone','celular']),
        whats: mapKey(r,['whatsapp','whats','zap']),
        email: mapKey(r,['e-mail','email']),
        group: mapKey(r,['grupo','familia','familia ou grupo','família']),
        companions: mapKey(r,['acompanhantes','acomp','acompanhante','qtd acompanhantes']),
        ageGroup: (function(){
          const fx=mapKey(r,['faixa etaria','faixa','idade','categoria']);
          if(String(fx).trim()) return fx;
          const mark=x=>['x','sim','s','1','true','yes'].includes(String(x).toLowerCase().trim());
          if(mark(mapKey(r,['crianca']))) return 'crianca';
          if(mark(mapKey(r,['adolescente']))) return 'adolescente';
          return 'adulto';
        })(),
        drinks: mapKey(r,['bebe alcool','bebe','alcool','bebida alcoolica','consome bebida alcoolica','consome alcool']),
        status: (function(){
          const st=mapKey(r,['status','confirmacao','confirmação']);
          if(String(st).trim()) return st;
          const cf=String(mapKey(r,['confirmado'])).toLowerCase().trim();
          if(['x','sim','s','1','true','yes'].includes(cf)) return 'confirmado';
          return 'pendente';
        })(),
        notes: mapKey(r,['observacoes','observações','obs','observacao'])
      });
      if(!String(mapKey(r,['nome','nome completo','convidado'])).trim()){ invalid.push(i+2); return; }
      parsed.push(g);
    });
    if(!parsed.length){ toast('Nenhuma linha válida — a planilha precisa de uma coluna “Nome”.','warn'); return; }
    const dupe=g=>state.guests.some(x=>x.name.toLowerCase()===g.name.toLowerCase() && onlyDigits(x.phone||x.whats)===onlyDigits(g.phone||g.whats));
    const news=parsed.filter(g=>!dupe(g));
    const prevRows=parsed.slice(0,8).map(g=>`<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(fmtPhone(g.whats||g.phone)||'—')}</td><td>${escapeHtml(g.group||'—')}</td><td>${G_STATUS[g.status].label}</td></tr>`).join('');
    const ok=await modal({
      title:'Importar convidados',
      message:`${parsed.length} convidado(s) encontrados na planilha · ${news.length} novos serão adicionados${parsed.length-news.length?` · ${parsed.length-news.length} já existem e serão ignorados`:''}${invalid.length?` · ${invalid.length} linha(s) sem nome ignoradas (linhas ${invalid.slice(0,5).join(', ')}${invalid.length>5?'…':''})`:''}.`,
      html:`<div class="prev-scroll"><table class="prev-table"><thead><tr><th>Nome</th><th>Contato</th><th>Grupo</th><th>Status</th></tr></thead><tbody>${prevRows}</tbody></table></div>${parsed.length>8?`<div class="modal-note">Mostrando 8 de ${parsed.length}.</div>`:''}`,
      confirmText:news.length?`Importar ${news.length}`:'Fechar'
    });
    if(!ok||!news.length) return;
    state.guests.push(...news);
    logHist('ajuste', `Importação de convidados — ${news.length} adicionados`, 0);
    save(); renderAll(); toast(`${news.length} convidado(s) importados`,'ok');
  }catch(e){ console.error(e); toast('Não consegui ler a planilha. Confira se é um .xlsx válido.','warn'); }
}

/* ── Troca de vistas (Orçamento ⇄ Convidados) ── */
function switchView(v){
  const isG=v==='convidados';
  el('view-convidados').hidden=!isG;
  el('view-orcamento').hidden=isG;
  document.querySelectorAll('.nav .tab').forEach(t=>{
    const act=t.dataset.view===v;
    t.classList.toggle('active',act);
    if(act) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
  if(location.hash!=='#'+v) history.replaceState(null,'','#'+v);
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── Wiring: convidados ── */
/* Liga busca, filtros, formulários, importação/exportação e a troca de abas.
   Chamado pelo app.js após initState(). */
function initConvidadosUI(){
  el('g-add').addEventListener('click', addGuestFromForm);
  ['g-name','g-phone','g-group'].forEach(id=>el(id).addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); addGuestFromForm(); } }));
  el('g-search').addEventListener('input', ()=>{ gSearch=el('g-search').value.trim(); renderGuestView(compute()); });
  document.querySelectorAll('[data-gstatus]').forEach(ch=>ch.addEventListener('click',()=>{ document.querySelectorAll('[data-gstatus]').forEach(x=>x.classList.remove('active')); ch.classList.add('active'); gFilter=ch.dataset.gstatus; renderGuestView(compute()); }));
  el('g-group-filter').addEventListener('change',()=>{ gGroup=el('g-group-filter').value; renderGuestView(compute()); });
  el('g-sort').addEventListener('change',()=>{ gSort=el('g-sort').value; renderGuestView(compute()); });
  el('g-msg').addEventListener('click', editInviteMsg);
  el('g-export-xlsx').addEventListener('click', exportGuestsXLSX);
  el('g-export-csv').addEventListener('click', exportGuestsCSV);
  el('g-import').addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f) importGuestsXLSX(f); e.target.value=''; });

  el('vc-add').addEventListener('click', addVarFromForm);
  const vp=el('vc-price'); vp.dataset.raw='0';
  vp.addEventListener('focus', ()=>{ const n=parseMoneyToNumber(vp.dataset.raw); vp.value=n?String(round2(n)).replace('.',','):''; setTimeout(()=>placeCaretAtEnd(vp),0); });
  vp.addEventListener('input', ()=>{ vp.dataset.raw=String(parseMoneyToNumber(vp.value)); });
  vp.addEventListener('blur',  ()=>{ const n=parseMoneyToNumber(vp.value); vp.dataset.raw=String(n); vp.value=n?toBRL(n):''; });
  ['vc-name','vc-per','vc-qty'].forEach(id=>el(id).addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); addVarFromForm(); } }));
  el('vc-mode').addEventListener('change',()=>{ const fixo=el('vc-mode').value==='fixo'; el('vc-per').style.display=fixo?'none':''; el('vc-qty').style.display=fixo?'':'none'; });
  const sm=el('smart-margin'), sh=el('smart-hours'), sb=el('smart-basis'); const cfg0=smartCfg(); sm.value=cfg0.margin; sh.value=cfg0.hours; sb.value=cfg0.basis;
  sb.addEventListener('change',()=>{ state.settings.smart=state.settings.smart||{}; state.settings.smart.basis=sb.value; save(); renderAll(); toast(sb.value==='lista'?'Planejando pela lista inteira — cancelamentos reduzem as estimativas':'Planejando só pelos confirmados'); });
  sm.addEventListener('change',()=>{ state.settings.smart=state.settings.smart||{}; state.settings.smart.margin=Math.max(0,Math.min(100,Number(sm.value)||0)); sm.value=state.settings.smart.margin; save(); renderAll(); toast('Margem atualizada — estimativas recalculadas'); });
  sh.addEventListener('change',()=>{ state.settings.smart=state.settings.smart||{}; state.settings.smart.hours=Math.max(1,Math.min(24,Number(sh.value)||6)); sh.value=state.settings.smart.hours; save(); });

  document.querySelectorAll('.nav .tab[data-view]').forEach(t=>t.addEventListener('click',e=>{ e.preventDefault(); switchView(t.dataset.view); }));
  el('btn-pdf').addEventListener('click', ()=>window.__genFinancePDF());
  el('btn-explain').addEventListener('click', explainAll);
  switchView(location.hash==='#convidados'?'convidados':'orcamento');
}
