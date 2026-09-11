import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Cenulape — Centre Universitaire La Perle',
        short_name: 'Cenulape',
        description:
          'Gestion pédagogique — emplois du temps, disponibilités, codes journaliers et heures des enseignants du Cenulape.',
        theme_color: '#dc2626',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache tout le shell de l'app (JS/CSS/HTML/polices/images) —
        // c'est ce qui évite de re-télécharger l'appli à chaque ouverture.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Les appels Supabase (données, auth, edge functions) NE sont PAS
        // mis en cache ici : c'est la couche Dexie (src/lib/db.ts +
        // src/lib/sync.ts) qui gère les données hors ligne, avec un
        // contrôle fin (péremption, file de synchronisation). Les laisser
        // à Workbox risquerait de servir des données obsolètes sans qu'on
        // le maîtrise.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
  },
});
