// src/components/shared/UpdateBanner.tsx
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Écoute l'évènement déclenché par main.tsx quand le service worker a
// détecté une nouvelle version — propose la mise à jour au lieu de
// recharger la page automatiquement (un rechargement silencieux au
// mauvais moment ressemble à une déconnexion pour l'utilisateur).
export default function UpdateBanner() {
  const [disponible, setDisponible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setDisponible(true);
    window.addEventListener('pwa-update-available', onUpdate);
    return () => window.removeEventListener('pwa-update-available', onUpdate);
  }, []);

  if (!disponible) return null;

  return (
    <div className="print:hidden flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gray-900">
      <RefreshCw size={13} />
      Nouvelle version disponible
      <button
        onClick={() => (window as any).__appliquerMiseAJourPWA?.()}
        className="underline ml-1"
      >
        Mettre à jour
      </button>
    </div>
  );
}
