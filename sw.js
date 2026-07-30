/* EventFlow Service Worker — cache offline dos arquivos do app.
   Estratégia: network-first para HTML (pega atualizações), cache-first para CSS/JS. */
const CACHE='eventflow-v1';
const ASSETS=['./','./index.html','./login.html','./css/style.css',
  './js/config.js','./js/utils.js','./js/state.js','./js/ui.js','./js/orcamento.js',
  './js/pdf.js','./js/convidados.js','./js/app.js','./js/firebase-sync.js','./js/auth.js',
  './manifest.webmanifest'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  if(url.origin!==location.origin) return;                    // não intercepta CDN/Firebase
  if(e.request.mode==='navigate' || url.pathname.endsWith('.html')){
    e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return res; })));
});
