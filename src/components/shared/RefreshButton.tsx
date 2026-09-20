// src/components/shared/RefreshButton.tsx
import { useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';

// Bouton persistant (toujours visible, contrairement à UpdateBanner qui
// n'apparaît que lorsque le service worker a lui-même détecté une
// nouvelle version) — force une vérification de mise à jour PWA
// immédiate, puis recharge la page. Utile si le service worker n'a pas
// encore eu l'occasion de vérifier tout seul (ex : app restée ouverte
// longtemps, ou rouverte depuis l'écran d'accueil sans navigation
// réseau entre-temps).
interface RefreshButtonProps {
  className?: string;
  style?: CSSProperties;
}

export default function RefreshButton({ className, style }: RefreshButtonProps) {
  const [enCours, setEnCours] = useState(false);

  async function handleClick() {
    setEnCours(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      // Force le service worker à revérifier s'il existe une nouvelle
      // version côté serveur (sans ça, il ne revérifie que
      // périodiquement tout seul) — puis recharge dans tous les cas,
      // pour repartir sur un état propre même si aucune mise à jour
      // n'était disponible.
      if (registration) await registration.update();
    } catch {
      // Pas grave — on recharge quand même juste en dessous.
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={enCours}
      className={className}
      style={style}
      aria-label="Actualiser l'application"
      title="Actualiser l'application"
    >
      <RefreshCw
        size={18}
        className={`text-red-600 ${enCours ? 'animate-spin' : ''}`}
      />
    </button>
  );
}