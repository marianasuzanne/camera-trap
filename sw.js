/* Camera Trap — Service Worker (offline-first) */
const CACHE = 'camera-trap-v1';

/* App shell + bibliotecas externas necessárias para funcionar off-line.
   Os arquivos de CDN são cacheados no primeiro acesso (com internet);
   depois disso o app abre e funciona sem conexão. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // addAll falha se um único recurso falhar; cacheamos individualmente
      Promise.allSettled(PRECACHE.map(u => c.add(u).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear chamadas de IA (Gemini) nem Firebase/Firestore — sempre rede.
  if (/generativelanguage\.googleapis\.com|firebase|firestore|googleapis\.com\/.*identitytoolkit/.test(url.href)) {
    return; // deixa o navegador lidar (precisa de internet)
  }

  // Navegação: tenta rede, cai para o index.html cacheado (modo off-line).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Demais recursos (libs, tiles do mapa, etc): cache-first com atualização em segundo plano.
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(resp => {
        if (resp && resp.status === 200 && (url.protocol === 'https:' || url.protocol === 'http:')) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
