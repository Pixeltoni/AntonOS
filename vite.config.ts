import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Eindeutige Kennung pro Build; die App vergleicht sie mit version.json, um Updates zu erkennen
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const version = env.GITHUB_SHA?.slice(0, 7) ?? String(Date.now());

function versionFile(): Plugin {
  return {
    name: 'antonos-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
    },
  };
}

/**
 * Service Worker für die App-Version: hält alle Dateien dieses Builds offline bereit.
 * Der Cache-Name enthält die Build-Kennung, alte Caches werden beim Update gelöscht.
 */
function serviceWorker(): Plugin {
  return {
    name: 'antonos-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'version.json');
      const precache = ['./', ...files.map((f) => `./${f}`), './manifest.webmanifest', './icons/a-192.png', './icons/a-512.png', './icons/a-apple-touch.png', './icons/a-favicon.png'];
      const source = `/* AntonOS Service Worker – automatisch erzeugt (vite.config.ts) */
const CACHE = 'antonos-${version}';
const PRECACHE = ${JSON.stringify([...new Set(precache)])};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('antonos-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fremde Dienste (Cloud-Sync, Spotify, Bilder) nie zwischenspeichern
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;

  // Seitenaufrufe: zuerst Netz (für Updates), offline die gespeicherte App
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || caches.match(req))),
    );
    return;
  }

  // Dateien des Builds: aus dem Cache, sonst laden und merken
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

// Tippen auf eine Mitteilung öffnet AntonOS (bzw. holt es in den Vordergrund)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) {
        if (target !== './' && 'navigate' in open) open.navigate(target);
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), versionFile(), serviceWorker()],
  build: {
    rollupOptions: {
      output: {
        // Bibliotheken in eigene Dateien: Sie ändern sich selten, darum muss nach einem
        // Update meist nur der App-Code neu geladen werden statt des ganzen Pakets.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // QR-Erkennung nur bei Bedarf laden (Wecker auf dem iPhone)
          if (id.includes('/jsqr/')) return 'jsqr';
          if (id.includes('@supabase') || id.includes('iceberg-js') || id.includes('tslib')) return 'supabase';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
