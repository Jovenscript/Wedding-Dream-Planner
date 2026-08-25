/* EventFlow Service Worker — cache offline dos arquivos do app.
   Estratégia: network-first para HTML (pega atualizações) e stale-while-revalidate
   para CSS/JS — serve do cache na hora e revalida em segundo plano, então o
   arquivo novo entra sozinho na visita seguinte mesmo se alguém esquecer de
   bumpar CACHE. (O cache-first anterior servia JS velho para sempre: HTML novo
   + js/convidados.js velho deixava a aba "Sorteio" fora do ALL_VIEWS e o clique
   caía no fallback do Orçamento.)
   AO ADICIONAR UM ARQUIVO NOVO: bumpe CACHE e inclua o caminho em ASSETS. */
const CACHE='eventflow-v3';
const ASSETS=['./','./index.html','./login.html','./css/style.css',
  './js/config.js','./js/utils.js','./js/state.js','./js/ui.js','./js/orcamento.js',
  './js/pdf.js','./js/convidados.js','./js/alerts.js','./js/modules.js',
  './js/sorteio.js','./js/app.js','./js/firebase-sync.js','./js/auth.js',
  './manifest.webmanifest'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET') return;                        // só GET entra em cache
  if(url.origin!==location.origin) return;                    // não intercepta CDN/Firebase
  if(e.request.mode==='navigate' || url.pathname.endsWith('.html')){
    e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  // CSS/JS: stale-while-revalidate.
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(res=>{
      if(res && res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); }
      return res;
    });
    if(hit){ net.catch(()=>{}); return hit; }                 // responde já, atualiza atrás
    return net;                                               // primeiro acesso: rede
  }));
});
