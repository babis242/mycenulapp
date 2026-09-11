import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Enregistre le service worker généré par vite-plugin-pwa. C'est lui qui
// précache le shell de l'app (JS/CSS/HTML) pour qu'elle ne soit plus
// re-téléchargée à chaque ouverture, et qui permette le lancement hors
// ligne. Contrairement à avant, une nouvelle version disponible ne
// recharge plus la page automatiquement (ça interrompait l'utilisateur en
// plein milieu d'une saisie, ressemblant à une déconnexion) — on propose
// juste la mise à jour via un bandeau (cf. UpdateBanner), déclenché ici
// par un évènement global.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
    (window as any).__appliquerMiseAJourPWA = () => updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
