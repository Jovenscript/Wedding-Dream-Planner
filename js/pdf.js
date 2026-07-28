/* ═════════════════════════════════════════════════════════════════════
   pdf.js — Relatório Financeiro executivo
   O QUE: gera o PDF (capa Carol & Marlon, KPIs, gráficos desenhados em
   canvas, tabelas e resumo) com jsPDF carregado sob demanda do CDN.
   POR QUÊ canvas próprio: zero dependência de libs de gráfico — as cores
   espelham os tokens do CSS para o PDF "ser" o sistema impresso.
   EXPÕE: window.__genFinancePDF (botão "Relatório PDF" no painel).
   ═════════════════════════════════════════════════════════════════════ */

/* ═══════════════════ Relatório Financeiro em PDF ═══════════════════ */
(function(){
  const JSPDF_SRC='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  let loading=null;
  function loadJsPDF(){
    if(window.jspdf&&window.jspdf.jsPDF) return Promise.resolve();
    if(loading) return loading;
    loading=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=JSPDF_SRC; s.onload=res; s.onerror=()=>rej(new Error('cdn')); document.head.appendChild(s); });
    return loading;
  }

  // Paleta (RGB) espelhando as CSS custom properties do sistema
  const C={
    olive:[107,123,74], oliveLight:[138,154,96], oliveDark:[74,86,51], oliveMist:[232,237,224],
    gold:[201,168,76], goldLight:[240,217,138],
    ivory:[250,248,243], ivoryDeep:[242,238,229], white:[255,255,255],
    ink:[28,31,22], inkMuted:[107,110,98], inkFaint:[168,170,159],
    ok:[61,122,69], warn:[160,106,30], danger:[139,46,46], mist:[224,229,214], zebra:[247,245,239]
  };
  const rgb=a=>`rgb(${a[0]},${a[1]},${a[2]})`, rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
  const brlShort=v=>{ v=Math.abs(v); if(v>=1000) return (v/1000).toFixed(v>=10000?0:1)+'k'; return String(Math.round(v)); };
  const tsOf=iso=>{ const d=new Date(String(iso).length<=10?iso+'T00:00:00':iso); return d.getTime(); };

  // ---------- Gráficos: Canvas 2D → PNG ----------
  function mkCanvas(w,h){ const s=2, c=document.createElement('canvas'); c.width=w*s; c.height=h*s; const ctx=c.getContext('2d'); ctx.scale(s,s); return {c,ctx,w,h}; }

  function chartDoughnut(paid,pending){
    const {c,ctx,w}=mkCanvas(300,210);
    const cx=w/2, cy=94, R=70, r=43, total=(paid+pending)||1;
    let a0=-Math.PI/2;
    [{v:paid,col:C.olive},{v:pending,col:C.mist}].forEach(s=>{ const a1=a0+(s.v/total)*Math.PI*2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,a0,a1); ctx.closePath(); ctx.fillStyle=rgb(s.col); ctx.fill(); a0=a1; });
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=rgb(C.white); ctx.fill();
    ctx.textAlign='center'; ctx.fillStyle=rgb(C.oliveDark); ctx.font="600 30px Georgia, serif";
    ctx.fillText(Math.round((paid/total)*100)+'%',cx,cy+5);
    ctx.font="10px Arial"; ctx.fillStyle=rgb(C.inkFaint); ctx.fillText('pago',cx,cy+21);
    ctx.textAlign='left'; ctx.font="12px Arial"; const ly=188;
    ctx.fillStyle=rgb(C.olive); ctx.fillRect(46,ly,11,11); ctx.fillStyle=rgb(C.inkMuted); ctx.fillText('Pago',62,ly+10);
    ctx.fillStyle=rgb(C.mist); ctx.fillRect(150,ly,11,11); ctx.fillStyle=rgb(C.inkMuted); ctx.fillText('Pendente',166,ly+10);
    return c.toDataURL('image/png');
  }

  function chartCatBars(pairs){
    const {c,ctx,w}=mkCanvas(300,210);
    const data=pairs.slice(0,7), max=Math.max(1,...data.map(d=>d.value));
    if(!data.length){ ctx.fillStyle=rgb(C.inkFaint); ctx.textAlign='center'; ctx.font="12px Arial"; ctx.fillText('Sem valores lançados.',w/2,100); return c.toDataURL('image/png'); }
    const padL=8, top=10, rowH=27, labW=84, barMax=w-padL-labW-14;
    ctx.textAlign='left';
    data.forEach((d,i)=>{ const y=top+i*rowH;
      ctx.font="11px Arial"; ctx.fillStyle=rgb(C.inkMuted);
      const nm=d.label.length>13?d.label.slice(0,12)+'…':d.label; ctx.fillText(nm,padL,y+13);
      const bx=padL+labW, bw=Math.max(3,(d.value/max)*barMax);
      ctx.fillStyle=rgb(C.oliveMist); ctx.fillRect(bx,y+3,barMax,12);
      const g=ctx.createLinearGradient(bx,0,bx+bw,0); g.addColorStop(0,rgb(C.olive)); g.addColorStop(1,rgb(C.oliveLight));
      ctx.fillStyle=g; ctx.fillRect(bx,y+3,bw,12);
    });
    return c.toDataURL('image/png');
  }

  function chartLine(series){
    const {c,ctx,w,h}=mkCanvas(620,230);
    const padL=52, padR=16, padT=18, padB=32;
    const all=series.flatMap(s=>s.points);
    if(!all.length){ ctx.fillStyle=rgb(C.inkFaint); ctx.textAlign='center'; ctx.font="13px Arial"; ctx.fillText('Sem dados datados ainda — lançamentos futuros preenchem este gráfico.',w/2,h/2); return c.toDataURL('image/png'); }
    const tmin=Math.min(...all.map(p=>p.t)), tmaxR=Math.max(...all.map(p=>p.t)), tmax=tmaxR===tmin?tmin+1:tmaxR;
    const vmax=Math.max(1,...all.map(p=>p.v));
    const X=t=>padL+((t-tmin)/(tmax-tmin))*(w-padL-padR), Y=v=>h-padB-(v/vmax)*(h-padT-padB);
    ctx.strokeStyle=rgba(C.mist,.9); ctx.lineWidth=1; ctx.fillStyle=rgb(C.inkFaint); ctx.font="10px Arial"; ctx.textAlign='right';
    for(let i=0;i<=4;i++){ const v=vmax*i/4, y=Y(v); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke(); ctx.fillText('R$'+brlShort(v),padL-6,y+3); }
    ctx.textAlign='center';
    ctx.fillText(fmtDate(new Date(tmin).toISOString()),padL+14,h-11);
    if(tmaxR!==tmin) ctx.fillText(fmtDate(new Date(tmaxR).toISOString()),w-padR-14,h-11);
    series.forEach(s=>{ if(!s.points.length) return; const pts=s.points.slice().sort((a,b)=>a.t-b.t);
      ctx.beginPath(); ctx.moveTo(X(pts[0].t),Y(0)); pts.forEach(p=>ctx.lineTo(X(p.t),Y(p.v))); ctx.lineTo(X(pts[pts.length-1].t),Y(0)); ctx.closePath();
      ctx.fillStyle=rgba(s.color,.10); ctx.fill();
      ctx.beginPath(); pts.forEach((p,i)=> i?ctx.lineTo(X(p.t),Y(p.v)):ctx.moveTo(X(p.t),Y(p.v))); ctx.strokeStyle=rgb(s.color); ctx.lineWidth=2.2; ctx.stroke();
      pts.forEach(p=>{ ctx.beginPath(); ctx.arc(X(p.t),Y(p.v),2.6,0,Math.PI*2); ctx.fillStyle=rgb(s.color); ctx.fill(); });
    });
    if(series.length>1){ ctx.textAlign='left'; ctx.font="11px Arial"; let lx=padL;
      series.forEach(s=>{ ctx.fillStyle=rgb(s.color); ctx.fillRect(lx,4,10,10); ctx.fillStyle=rgb(C.inkMuted); ctx.fillText(s.name,lx+14,13); lx+=ctx.measureText(s.name).width+42; });
    }
    return c.toDataURL('image/png');
  }

  // ---------- Montagem do PDF ----------
  async function generate(){
    const btn=el('btn-pdf'); if(btn) btn.disabled=true;
    toast('Gerando relatório…','ok');
    try{
      await loadJsPDF();
      const { jsPDF }=window.jspdf;
      const doc=new jsPDF({unit:'pt',format:'a4'});
      const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
      const M=42, CW=PW-M*2;
      let y=0;
      const c=compute();
      const fill=a=>doc.setFillColor(a[0],a[1],a[2]);
      const draw=a=>doc.setDrawColor(a[0],a[1],a[2]);
      const txt=a=>doc.setTextColor(a[0],a[1],a[2]);

      // — helpers de layout (declarados antes do uso) —
      function ensure(hN){ if(y+hN>PH-46){ doc.addPage(); y=M+6; } }
      function sectionTitle(t){ ensure(38); doc.setFont('times','bold'); doc.setFontSize(15); txt(C.oliveDark); doc.text(t,M,y+4); const tw=doc.getTextWidth(t); draw(C.goldLight); doc.setLineWidth(1); doc.line(M+tw+12,y,PW-M,y); y+=24; }
      function cardFrame(x,yy,w,hh,title){ fill(C.white); draw(C.oliveMist); doc.setLineWidth(.8); doc.roundedRect(x,yy,w,hh,8,8,'FD'); doc.setFont('helvetica','bold'); doc.setFontSize(8.5); txt(C.oliveDark); doc.text(title,x+10,yy+15); draw(C.goldLight); doc.setLineWidth(.6); doc.line(x+10,yy+19,x+w-10,yy+19); }
      function progBar(label,pct,col,valTxt){ ensure(28); doc.setFont('helvetica','normal'); doc.setFontSize(8.5); txt(C.inkMuted); doc.text(label,M,y); doc.text(valTxt,PW-M,y,{align:'right'}); const by=y+5, bh=8; fill(C.oliveMist); doc.roundedRect(M,by,CW,bh,4,4,'F'); const fw=Math.max(2,Math.min(1,pct/100)*CW); fill(col); doc.roundedRect(M,by,fw,bh,4,4,'F'); y=by+bh+16; }
      function table(title, cols, rows, o){
        o=o||{}; sectionTitle(title);
        const colX=[]; let acc=M; cols.forEach(cc=>{ colX.push(acc); acc+=cc[1]*CW; });
        const rowH=18, headH=20;
        function header(){ fill(C.oliveDark); doc.roundedRect(M,y,CW,headH,4,4,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(8.2); txt(C.ivory); cols.forEach((cc,i)=>{ const al=cc[2]==='r'?'right':'left'; doc.text(cc[0], cc[2]==='r'?colX[i]+cc[1]*CW-8:colX[i]+8, y+13, {align:al}); }); y+=headH; }
        if(!rows.length){ header(); fill(C.ivory); doc.rect(M,y,CW,rowH,'F'); doc.setFont('helvetica','italic'); doc.setFontSize(8.5); txt(C.inkFaint); doc.text('Nenhum registro.',M+8,y+12); y+=rowH+12; return; }
        header();
        rows.forEach((r,ri)=>{
          if(y+rowH>PH-46){ doc.addPage(); y=M+6; header(); }
          if(ri%2){ fill(C.zebra); doc.rect(M,y,CW,rowH,'F'); }
          cols.forEach((cc,i)=>{
            const val=String(r[i]==null?'':r[i]); const cw=cc[1]*CW-16; const al=cc[2]==='r'?'right':'left';
            if(o.statusCol===i){ const map={'Quitado':C.ok,'Parcial':C.warn,'Em aberto':C.warn,'Sem valor':C.inkFaint}; txt(map[val]||C.ink); doc.setFont('helvetica','bold'); }
            else if(cc[2]==='r'){ txt(C.oliveDark); doc.setFont('helvetica','normal'); }
            else { txt(C.ink); doc.setFont('helvetica','normal'); }
            doc.setFontSize(8.4);
            let s=val; while(doc.getTextWidth(s)>cw && s.length>1) s=s.slice(0,-2); if(s!==val) s=s.slice(0,-1)+'…';
            doc.text(s, cc[2]==='r'?colX[i]+cc[1]*CW-8:colX[i]+8, y+12, {align:al});
          });
          y+=rowH;
        });
        y+=12;
      }
      function footer(){ const n=doc.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); draw(C.mist); doc.setLineWidth(.5); doc.line(M,PH-30,PW-M,PH-30); doc.setFont('helvetica','normal'); doc.setFontSize(8); txt(C.inkFaint); doc.text((state.settings.eventName||'EventFlow')+' · Relatório financeiro',M,PH-18); doc.text('Página '+i+' de '+n,PW-M,PH-18,{align:'right'}); } }

      // — CAPA —
      const bandH=132;
      fill(C.oliveDark); doc.rect(0,0,PW,bandH,'F');
      fill(C.olive); doc.rect(0,bandH-6,PW,6,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); txt(C.goldLight); doc.text('R E L A T Ó R I O   F I N A N C E I R O',M,50);
      doc.setFont('times','bold'); doc.setFontSize(34); txt(C.ivory); doc.text(state.settings.eventName||'Meu Evento',M,86);
      doc.setFont('helvetica','normal'); doc.setFontSize(11); txt([226,231,215]); doc.text('Orçamento, investimentos e pagamentos do evento',M,106);
      doc.setFontSize(9); txt([211,217,197]); doc.text('Emitido em '+fmtDateTime(Date.now()),PW-M,50,{align:'right'});
      y=bandH+26;

      // — KPIs —
      const kpis=[
        ['Total previsto', toBRL(c.totalExpense)], ['Já pago', toBRL(c.totalPaid)],
        ['Falta pagar', toBRL(c.pending)], ['Saldo em caixa', toBRL(c.saldo)],
        ['Recursos investidos', toBRL(c.totalFunds)], ['Falta arrecadar', toBRL(c.faltaArrecadar)],
        ['% concluído', c.pctPago.toFixed(0)+'%'], ['% coberto', c.pctGarantido.toFixed(0)+'%']
      ];
      const cols4=4, gap=10, cardW=(CW-gap*3)/cols4, cardH=52;
      kpis.forEach((k,i)=>{ const col=i%cols4, row=Math.floor(i/cols4), x=M+col*(cardW+gap), yy=y+row*(cardH+gap);
        fill(C.ivory); draw(C.oliveMist); doc.setLineWidth(.8); doc.roundedRect(x,yy,cardW,cardH,7,7,'FD');
        fill(C.olive); doc.roundedRect(x,yy,3.2,cardH,2,2,'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.2); txt(C.inkFaint); doc.text(k[0].toUpperCase(),x+11,yy+18);
        doc.setFont('times','bold'); doc.setFontSize(15); txt((k[0]==='Saldo em caixa'&&c.saldo<0)?C.danger:C.oliveDark); doc.text(k[1],x+11,yy+39);
      });
      y+=2*(cardH+gap)+6;

      progBar('Progresso dos pagamentos',c.pctPago,C.olive,c.pctPago.toFixed(0)+'% pago');
      progBar('Orçamento garantido pelos recursos',c.pctGarantido,C.gold,c.pctGarantido.toFixed(0)+'% garantido');
      y+=4;

      // — GRÁFICOS —
      sectionTitle('Visão gráfica');
      const catPairs=Object.entries(state.items.reduce((m,it)=>{ if((it.total||0)>0){ const k=it.category||'Outros'; m[k]=(m[k]||0)+it.total; } return m; },{})).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
      const gW=(CW-16)/2, gH=150;
      ensure(gH+6);
      cardFrame(M,y,gW,gH,'Pago x pendente'); doc.addImage(chartDoughnut(c.totalPaid,c.pending),'PNG',M+8,y+24,gW-16,gH-30);
      cardFrame(M+gW+16,y,gW,gH,'Distribuição por categoria'); doc.addImage(chartCatBars(catPairs),'PNG',M+gW+24,y+24,gW-16,gH-30);
      y+=gH+16;

      const payEvents=state.history.filter(h=>h.kind==='pagamento'||h.kind==='estorno').map(h=>({t:h.ts,v:-h.delta})).filter(p=>isFinite(p.t)).sort((a,b)=>a.t-b.t);
      let cum=0; const paySeries=payEvents.map(e=>({t:e.t,v:(cum+=e.v)})); if(!paySeries.length && c.totalPaid>0) paySeries.push({t:Date.now(),v:c.totalPaid});
      const fundRaw=state.funds.map(f=>({t:tsOf(f.date),v:f.amount})).filter(p=>isFinite(p.t)).sort((a,b)=>a.t-b.t);
      cum=0; const fundSeries=fundRaw.map(e=>({t:e.t,v:(cum+=e.v)}));

      const lgH=150;
      ensure(lgH+6); cardFrame(M,y,CW,lgH,'Evolução dos pagamentos (acumulado)'); doc.addImage(chartLine([{name:'Pago',color:C.olive,points:paySeries}]),'PNG',M+8,y+24,CW-16,lgH-30); y+=lgH+16;
      ensure(lgH+6); cardFrame(M,y,CW,lgH,'Evolução do orçamento — entradas x pagamentos'); doc.addImage(chartLine([{name:'Recursos (entradas)',color:C.gold,points:fundSeries},{name:'Pagamentos',color:C.olive,points:paySeries}]),'PNG',M+8,y+24,CW-16,lgH-30); y+=lgH+18;

      // — TABELAS —
      const items=state.items.slice().sort((a,b)=>(b.total||0)-(a.total||0));
      table('Fornecedores e itens',
        [['Item',0.30,'l'],['Categoria',0.20,'l'],['Valor',0.18,'r'],['Status',0.16,'l'],['Pagamento',0.16,'l']],
        items.map(it=>{ const st=statusOf(it); return [it.name||'—', it.category||'—', toBRL(it.total||0), st.label, it.paidAt?fmtDate(new Date(it.paidAt).toISOString()):'—']; }),
        {statusCol:3});

      table('Histórico de entradas (recursos)',
        [['Descrição',0.40,'l'],['Tipo',0.24,'l'],['Valor',0.18,'r'],['Data',0.18,'l']],
        state.funds.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(f=>[f.name,f.type,toBRL(f.amount),fmtDate(f.date)]));

      table('Pagamentos realizados',
        [['Item',0.46,'l'],['Valor pago',0.28,'r'],['Data',0.26,'l']],
        items.filter(it=>(it.paid||0)>0).map(it=>[it.name,toBRL(it.paid||0),it.paidAt?fmtDate(new Date(it.paidAt).toISOString()):'—']));

      const kindLabel={aporte:'Aporte',pagamento:'Pagamento',estorno:'Estorno',ajuste:'Ajuste',exclusao:'Exclusão'};
      table('Histórico financeiro completo',
        [['Tipo',0.16,'l'],['Descrição',0.50,'l'],['Valor',0.16,'r'],['Data / hora',0.18,'l']],
        state.history.slice(0,120).map(h=>[kindLabel[h.kind]||h.kind, h.desc, h.delta?((h.delta>0?'+':'')+toBRL(h.delta)):'—', fmtDateTime(h.ts)]));

      // — RESUMO FINAL —
      sectionTitle('Resumo financeiro');
      const lines=[
        ['Total previsto para o casamento', toBRL(c.totalExpense)],
        ['Total já pago', toBRL(c.totalPaid)+'  ('+c.pctPago.toFixed(0)+'%)'],
        ['Total ainda pendente', toBRL(c.pending)],
        ['Recursos investidos / disponíveis', toBRL(c.totalFunds)+'  (cobre '+c.pctGarantido.toFixed(0)+'%)'],
        ['Saldo em caixa', toBRL(c.saldo)],
        ['Ainda falta arrecadar', toBRL(c.faltaArrecadar)]
      ];
      const boxH=lines.length*22+16; ensure(boxH+8);
      fill(C.ivory); draw(C.oliveMist); doc.setLineWidth(.8); doc.roundedRect(M,y,CW,boxH,8,8,'FD');
      let ly=y+22;
      lines.forEach((l,i)=>{ doc.setFont('helvetica','normal'); doc.setFontSize(10); txt(C.inkMuted); doc.text(l[0],M+16,ly);
        doc.setFont('times','bold'); doc.setFontSize(11); txt(C.oliveDark); doc.text(l[1],PW-M-16,ly,{align:'right'});
        if(i<lines.length-1){ draw(C.oliveMist); doc.setLineWidth(.4); doc.line(M+16,ly+7,PW-M-16,ly+7); } ly+=22; });
      y+=boxH+10;

      footer();
      doc.save('Relatorio-Financeiro-'+((state.settings.eventName||'Evento').replace(/[^\w]+/g,'-'))+'.pdf');
      toast('Relatório PDF gerado','ok');
    }catch(e){ console.error(e); toast('Não consegui gerar o PDF. Verifique a conexão e tente de novo.','warn'); }
    finally{ if(btn) btn.disabled=false; }
  }
  window.__genFinancePDF=generate;
})();
