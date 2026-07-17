// English Lab SW — cache-first so lessons work offline after first load
const C = "englab-v2";
const ASSETS = ["./","index.html","styles.css","app.js","data.js","manifest.json","icon-192.png","icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if(e.request.method==="GET" && res.ok && new URL(e.request.url).origin===location.origin){
      const cp = res.clone(); caches.open(C).then(c=>c.put(e.request, cp));
    }
    return res;
  }).catch(()=>caches.match("index.html"))));
});
