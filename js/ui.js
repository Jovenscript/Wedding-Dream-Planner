/* ═════════════════════════════════════════════════════════════════════
   ui.js — componentes reutilizáveis de interface
   O QUE: toast() (avisos), modal() (diálogo com campos: texto, dinheiro,
   número, data, select, textarea), confirmDialog() e attachMoney()
   (input de moeda com foco-cru / blur-formatado).
   POR QUÊ: um único modal para o app inteiro = comportamento e visual
   idênticos em pagamento, edição de aporte, convidado e custo.
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════ Toast ═══════════ */
const toastStack = el('toast-stack');
function toast(msg, kind='ok'){
  const t = document.createElement('div'); t.className = 'toast '+(kind||'');
  t.innerHTML = `<span class="dot"></span><span>${escapeHtml(msg)}</span>`;
  toastStack.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 2800);
}

/* ═══════════ Modal reutilizável (confirmação + campos) ═══════════ */
const mBackdrop = el('modal-backdrop');
function modal(opts){
  return new Promise(resolve=>{
    const { title='', message='', fields=[], note='', confirmText='Confirmar', cancelText='Cancelar', danger=false, validate, dynamicNote } = opts;
    mBackdrop.innerHTML = '';
    const box  = document.createElement('div'); box.className='modal';
    const head = document.createElement('div'); head.className='modal-head'; head.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
    const body = document.createElement('div'); body.className='modal-body';
    if(message){ const p=document.createElement('p'); p.style.cssText='font-size:14px;color:var(--ink-muted);line-height:1.55'; p.textContent=message; body.appendChild(p); }
    if(opts.html){ const hd=document.createElement('div'); hd.innerHTML=opts.html; body.appendChild(hd); }
    const values = {}, inputs = {};
    fields.forEach(f=>{
      const wrap = document.createElement('div');
      const lab  = document.createElement('label'); lab.className='field-label'; lab.textContent=f.label; wrap.appendChild(lab);
      let inp;
      if(f.type==='select'){
        inp = document.createElement('select'); inp.className='field';
        (f.options||[]).forEach(o=>{ const op=document.createElement('option'); op.value=o; op.textContent=o; inp.appendChild(op); });
        inp.value = f.value || (f.options&&f.options[0]) || ''; values[f.key]=inp.value;
        inp.addEventListener('change', ()=>{ values[f.key]=inp.value; refreshNote(); });
      } else if(f.type==='money'){
        inp = document.createElement('input'); inp.type='text'; inp.className='money'; inp.setAttribute('inputmode','decimal');
        const initN = round2(f.value); inp.value = initN?toBRL(initN):''; inp.dataset.raw = String(initN); values[f.key]=inp.value;
        inp.addEventListener('focus', ()=>{ const n=parseMoneyToNumber(inp.dataset.raw); inp.value = n?String(round2(n)).replace('.',','):''; setTimeout(()=>placeCaretAtEnd(inp),0); });
        inp.addEventListener('input', ()=>{ inp.dataset.raw=String(parseMoneyToNumber(inp.value)); values[f.key]=inp.value; refreshNote(); });
        inp.addEventListener('blur',  ()=>{ const n=parseMoneyToNumber(inp.value); inp.dataset.raw=String(n); inp.value = n?toBRL(n):''; values[f.key]=inp.value; });
      } else if(f.type==='number'){
        inp = document.createElement('input'); inp.type='number'; inp.className='field'; inp.min='0'; inp.step=f.step||'1'; inp.value=String(f.value??''); inp.style.width='100%'; values[f.key]=inp.value;
        inp.addEventListener('input', ()=>{ values[f.key]=inp.value; });
      } else if(f.type==='date'){
        inp = document.createElement('input'); inp.type='date'; inp.className='field'; inp.value=f.value||''; inp.style.width='100%'; values[f.key]=inp.value;
        inp.addEventListener('input', ()=>{ values[f.key]=inp.value; });
      } else if(f.type==='textarea'){
        inp = document.createElement('textarea'); inp.className='field'; inp.rows=3; inp.value=f.value||''; values[f.key]=inp.value;
        inp.addEventListener('input', ()=>{ values[f.key]=inp.value; });
      } else {
        inp = document.createElement('input'); inp.type='text'; inp.className='name-input'; inp.value=f.value||''; values[f.key]=inp.value;
        inp.addEventListener('input', ()=>{ values[f.key]=inp.value; });
      }
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter' && f.type!=='select' && f.type!=='textarea'){ e.preventDefault(); doConfirm(); } });
      inputs[f.key]=inp; wrap.appendChild(inp); body.appendChild(wrap);
    });
    let noteEl=null;
    if(note){ noteEl=document.createElement('div'); noteEl.className='modal-note'; noteEl.textContent=note; body.appendChild(noteEl); }
    let dynEl=null;
    if(dynamicNote){ dynEl=document.createElement('div'); dynEl.className='modal-note'; dynEl.style.display='none'; body.appendChild(dynEl); }
    const errEl=document.createElement('div'); errEl.className='modal-note warn'; errEl.style.display='none'; body.appendChild(errEl);
    function refreshNote(){ if(!dynamicNote||!dynEl) return; const r=dynamicNote(values); if(r&&r.text){ dynEl.style.display=''; dynEl.className='modal-note'+(r.warn?' warn':''); dynEl.textContent=r.text; } else { dynEl.style.display='none'; } errEl.style.display='none'; }
    const foot = document.createElement('div'); foot.className='modal-foot';
    const cancel = document.createElement('button'); cancel.className='ghost'; cancel.textContent=cancelText;
    const ok = document.createElement('button'); ok.className = danger?'danger':''; ok.textContent=confirmText;
    foot.appendChild(cancel); foot.appendChild(ok);
    box.appendChild(head); box.appendChild(body); box.appendChild(foot); mBackdrop.appendChild(box);
    function onKey(e){ if(e.key==='Escape') close(null); }
    function onBackdrop(ev){ if(ev.target===mBackdrop) close(null); }
    function close(val){ mBackdrop.classList.remove('show'); setTimeout(()=>{ mBackdrop.innerHTML=''; },200); document.removeEventListener('keydown',onKey); mBackdrop.removeEventListener('click',onBackdrop); resolve(val); }
    function doConfirm(){ if(validate){ const err=validate(values); if(err){ errEl.textContent=err; errEl.style.display=''; return; } } close({...values}); }
    if(opts.hideCancel) cancel.style.display='none';
    cancel.addEventListener('click', ()=>close(null));
    ok.addEventListener('click', doConfirm);
    document.addEventListener('keydown', onKey);
    mBackdrop.addEventListener('click', onBackdrop);
    mBackdrop.classList.add('show'); refreshNote();
    const firstKey = fields[0] && fields[0].key; if(firstKey) setTimeout(()=>inputs[firstKey].focus(), 60);
  });
}
async function confirmDialog(title, message, { danger=true, confirmText='Confirmar', cancelText='Cancelar', note='' }={}){
  const r = await modal({ title, message, note, danger, confirmText, cancelText });
  return !!r;
}

/* ═══════════ Money input inline (coluna Total) ═══════════ */
function attachMoney(inp, getNum, commit){
  inp.dataset.formatted='true'; inp.value=toBRL(getNum());
  inp.addEventListener('focus', ()=>{
    if(inp.dataset.formatted==='true'){
      const n=getNum(); inp.value = n?String(round2(n)).replace('.',','):'';
      inp.dataset.formatted='false'; setTimeout(()=>placeCaretAtEnd(inp),0);
    }
  });
  inp.addEventListener('blur', ()=>{
    const n=Math.max(0, parseMoneyToNumber(inp.value));
    commit(n);
    inp.value=toBRL(getNum()); inp.dataset.formatted='true';
  });
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } });
}
