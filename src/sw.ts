// src/sw.ts
/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

// Précache tout le shell de l'app — injecté automatiquement au build par
// vite-plugin-pwa (injectManifest) à partir de globPatterns.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Repli SPA classique : toute navigation sert index.html (React Router
// prend le relais côté client) — équivalent à navigateFallback en mode
// generateSW, à refaire ici manuellement en injectManifest.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// ── Notifications push ──────────────────────────────────────────
// Le corps de la notification est envoyé par l'Edge Function
// envoyer-push (déclenchée par un Database Webhook sur la table
// notifications) — voir supabase/functions/envoyer-push/index.ts.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: { titre?: string; message?: string; lien?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { titre: 'Cenulape', message: event.data.text() };
  }

  const titre = payload.titre ?? 'Cenulape';
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: payload.message ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { lien: payload.lien ?? '/' },
    })
  );
});

// Au clic : ramène au premier onglet déjà ouvert (et navigue vers le
// lien de la notification), sinon en ouvre un nouveau.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const lien = (event.notification.data as { lien?: string })?.lien ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) (client as WindowClient).navigate(lien);
            return;
          }
        }
        return self.clients.openWindow(lien);
      })
  );
});