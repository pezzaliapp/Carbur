const CACHE='carbur-v12';
const SHELL=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>{
  // cache:'reload' = scarica sempre dalla rete, mai una copia vecchia dalla cache HTTP
  e.waitUntil(caches.open(CACHE)
    .then(c=>Promise.all(SHELL.map(u=>fetch(new Request(u,{cache:'reload'})).then(r=>r.ok&&c.put(u,r)))))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>
    Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // dati e librerie esterne (GitHub raw, Worker, mappe): sempre dalla rete, mai cache
  if(url.origin!==self.location.origin){
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
    return;
  }
  // file dell'app: prima la rete (versione sempre aggiornata), cache solo se offline
  e.respondWith(
    fetch(new Request(e.request.url,{cache:'no-cache'})).then(res=>{
      if(res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{}); }
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
