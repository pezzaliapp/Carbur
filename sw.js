const CACHE='carbur-v11';
const SHELL=['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>
    Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  // dati prezzi (Worker su altro dominio, CSV MIMIT, proxy) sempre dalla rete, MAI cache:
  // prima l'URL del Worker (workers.dev) non era escluso e i prezzi restavano congelati
  if(new URL(u).origin!==self.location.origin||u.includes('exportCSV')||u.includes('corsproxy')){
    if(e.request.method!=='GET')return;
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const cp=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});
      return res;
    }).catch(()=>caches.match('./index.html')))
  );
});
