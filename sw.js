/* ============================================================================
   SW.JS — Service Worker do app (funciona sem internet depois da 1ª abertura)
   - Arquivos do sistema: tenta a internet primeiro (pega sempre a versão nova) e,
     sem conexão, usa a cópia guardada no aparelho.
   - Bibliotecas externas (Tailwind, jsPDF, SweetAlert...): guardadas após o 1º uso.
   - Firebase/Google (login e sincronização) NUNCA passam por aqui.
   Atualização automática: ao publicar mudanças no GitHub, basta abrir o app com internet (cerca de 1 a 2 min depois).
   Não é preciso limpar cache. Só mude o número em VERSAO se quiser descartar também as bibliotecas externas guardadas.
   ============================================================================ */
const VERSAO = 'v4';
const CACHE_APP = 'dgad-app-' + VERSAO;
const CACHE_EXT = 'dgad-ext-' + VERSAO;

const ARQUIVOS = [
  './', 'index.html', 'carro.html', 'moto.html', 'caminhão-ônibus.html', 'sucata.html',
  'controle_carga.html', 'suporte.html', 'auto_apreensao_sucata.html', 'auto_infracao.html',
  'termo_interdicao_fiel_depositario.html',
  'armazem.js', 'nuvem.js', 'firebase-config.js', 'pwa.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'banner oficial.jpg', 'carro.png', 'moto.png', 'caminhao-onibus.png', 'sucata.png', 'carga.png',
  'suporte.png', 'apreensao.png', 'infracao.png', 'fiel depositario.png', 'brasao.png',
];

const EXTERNOS_PRE = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
];

const HOSTS_EXTERNOS = [
  'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'upload.wikimedia.org', 'fonts.googleapis.com', 'fonts.gstatic.com', 'code.jquery.com'
];

async function guardarExterno(cache, url) {
  try {
    const r = await fetch(url, { mode: 'cors' });          // CORS: serve também a quem pede em modo CORS
    if (r && r.ok) return cache.put(url, r);
  } catch (_) {}
  try {
    const r = await fetch(url, { mode: 'no-cors' });
    if (r) return cache.put(url, r);
  } catch (_) {}
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const app = await caches.open(CACHE_APP);
    await Promise.allSettled(ARQUIVOS.map(async (a) => {
      const r = await fetch(new Request(a, { cache: 'reload' }));
      if (r && r.ok) await app.put(a === './' ? new Request('./') : new Request(a), r);
    }));
    const ext = await caches.open(CACHE_EXT);
    await Promise.allSettled(EXTERNOS_PRE.map((u) => guardarExterno(ext, u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('dgad-') && n !== CACHE_APP && n !== CACHE_EXT).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function comTempo(p, ms) {
  return new Promise((ok, erro) => {
    const t = setTimeout(() => erro(new Error('tempo esgotado')), ms);
    p.then((v) => { clearTimeout(t); ok(v); }, (x) => { clearTimeout(t); erro(x); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Mesmo endereço do app: internet primeiro, cópia local como reserva
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_APP);
      try {
        // 'no-cache' = sempre pergunta ao servidor se o arquivo mudou (ignora os 10 min de cache do GitHub Pages)
        const rede = fetch(req, { cache: 'no-cache' }).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; });
        e.waitUntil(rede.catch(() => {}));
        return await comTempo(rede, 6000);
      } catch (_) {
        const c = await cache.match(req, { ignoreSearch: true });
        if (c) return c;
        if (req.mode === 'navigate') {
          const idx = await cache.match('index.html');
          if (idx) return idx;
        }
        return new Response('SEM CONEXÃO', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Bibliotecas externas conhecidas: usa a cópia guardada e atualiza por trás
  if (HOSTS_EXTERNOS.indexOf(url.hostname) !== -1) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_EXT);
      const guardado = await cache.match(req);
      const rede = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (guardado) { e.waitUntil(rede); return guardado; }
      const r = await rede;
      return r || new Response('', { status: 504 });
    })());
  }
  // Qualquer outro endereço (Firebase, Google...) segue direto para a internet
});
