/* ═════════════════════════════════════════════════════════════════════
   utils.js — ferramentas puras usadas por todos os módulos
   O QUE: formatação de moeda (toBRL/parseMoneyToNumber), datas, escapeHtml
   (contra XSS ao montar HTML), uid e o atalho el(id).
   POR QUÊ separado: são funções sem estado — qualquer módulo usa sem
   depender de ordem de inicialização.
   CARREGA: primeiro (depois de config.js). Não depende de ninguém.
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════ Fundo animado (pétalas douradas) — preservado ═══════════ */
(function(){
  const cvs = document.getElementById('bg'); if(!cvs) return;
  const ctx = cvs.getContext('2d'); let w, h, parts = [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize(){ w = cvs.width = innerWidth; h = cvs.height = innerHeight; }
  addEventListener('resize', resize); resize();
  function init(){
    parts = Array.from({length:22}, ()=>({
      x: Math.random()*w, y: Math.random()*h,
      s: 0.5+Math.random()*1.1, a: 0.08+Math.random()*0.18,
      vy: 0.15+Math.random()*0.4, vx: -0.2+Math.random()*0.4,
      rot: Math.random()*Math.PI*2, vrot: (-0.005+Math.random()*.01)
    }));
  }
  function petal(x,y,s,rot){ ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0,0,6*s,10*s,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  function paint(){ for(const p of parts){ ctx.globalAlpha=p.a; ctx.fillStyle='#C9A84C'; petal(p.x,p.y,p.s,p.rot); } }
  function tick(){ ctx.clearRect(0,0,w,h); for(const p of parts){ p.x+=p.vx; p.y+=p.vy; p.rot+=p.vrot; if(p.y>h+20){ p.y=-20; p.x=Math.random()*w; } } paint(); requestAnimationFrame(tick); }
  init(); if(reduce){ ctx.clearRect(0,0,w,h); paint(); } else { tick(); }
})();

/* ═══════════ Helpers ═══════════ */
const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const toBRL = n => fmtBRL.format(isFinite(n)?n:0);
function parseMoneyToNumber(str){
  if(typeof str==='number') return isFinite(str)?str:0;
  if(!str) return 0;
  const c = String(str).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.');
  const n = parseFloat(c);
  return isNaN(n)?0:n;
}
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
const round2 = n => Math.round((Number(n)||0)*100)/100;
function uid(){ try{ return crypto.randomUUID(); }catch{ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); } }
function todayISO(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function escapeHtml(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function placeCaretAtEnd(el){ const len=el.value.length; el.setSelectionRange(len,len); el.focus(); }
function fmtDateTime(ts){ const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmtDate(iso){ if(!iso) return ''; const d=new Date(String(iso).length<=10?iso+'T00:00:00':iso); if(isNaN(d)) return ''; const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; }
const el = id => document.getElementById(id);


/* Feedback sonoro sutil (Web Audio — sem arquivos externos). Um "tim" curto para
   sucesso e um tom grave para aviso. Respeita a preferência do usuário (settings.sound). */
let __audioCtx=null;
function playChime(kind){
  try{
    if(typeof state!=='undefined' && state.settings && state.settings.sound===false) return;
    __audioCtx = __audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const ctx=__audioCtx, now=ctx.currentTime;
    const notes = kind==='warn' ? [330] : kind==='ok' ? [660,880] : [520];
    notes.forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001, now+i*0.09);
      g.gain.exponentialRampToValueAtTime(0.06, now+i*0.09+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now+i*0.09+0.18);
      o.connect(g); g.connect(ctx.destination); o.start(now+i*0.09); o.stop(now+i*0.09+0.2);
    });
  }catch{}
}

/* Microinteração de recompensa: chuva de pétalas/confete douradas quando o
   usuário atinge um marco (ex.: orçamento 100% pago). Roda uma vez por marco. */
function celebrate(){
  try{
    const cvs=document.createElement('canvas'); cvs.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(cvs); const ctx=cvs.getContext('2d');
    const rz=()=>{ cvs.width=innerWidth; cvs.height=innerHeight; }; rz();
    const COL=['#C9A84C','#6B7B4A','#E8D9A0','#8a9a5b','#f0d98a'];
    const P=Array.from({length:120},()=>({x:Math.random()*cvs.width,y:-20-Math.random()*cvs.height*0.5,
      r:4+Math.random()*6, c:COL[Math.floor(Math.random()*COL.length)], vy:2+Math.random()*3,
      vx:-1+Math.random()*2, rot:Math.random()*6, vr:-0.1+Math.random()*0.2}));
    let t=0; const dur=160;
    (function tick(){ ctx.clearRect(0,0,cvs.width,cvs.height);
      P.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.c;
        ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6); ctx.restore(); });
      if(++t<dur){ requestAnimationFrame(tick); } else { cvs.remove(); }
    })();
  }catch{}
}