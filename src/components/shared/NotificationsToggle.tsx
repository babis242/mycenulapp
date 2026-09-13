// src/components/shared/NotificationsToggle.tsx
import { useEffect, useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  pushDisponible,
  activerNotificationsPush,
} from '@/lib/pushNotifications';

// Bouton permanent dans le menu (contrairement au bandeau, qui ne
// s'affiche qu'une fois et peut être fermé par erreur) — permet
// d'activer les notifications à tout moment, ou de voir que c'est déjà
// fait.
export default function NotificationsToggle() {
  const user = useAuthStore((s) => s.user);
  const [statut, setStatut] = useState<'inconnu' | 'actif' | 'inactif'>(
    'inconnu'
  );
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!pushDisponible()) {
      setStatut('inactif');
      return;
    }
    setStatut(Notification.permission === 'granted' ? 'actif' : 'inactif');
  }, []);

  if (!pushDisponible()) return null;

  async function handleClick() {
    if (!user || statut === 'actif') return;
    setEnCours(true);
    setErreur(null);
    try {
      await activerNotificationsPush(user.id);
      setStatut('actif');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={statut === 'actif' || enCours}
      title={erreur ?? undefined}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-bold text-white/75 hover:bg-white/10 transition-colors w-full text-left disabled:hover:bg-transparent"
    >
      {enCours ? (
        <Loader2 size={16} className="animate-spin" />
      ) : statut === 'actif' ? (
        <BellRing size={16} className="text-green-300" />
      ) : (
        <Bell size={16} />
      )}
      {statut === 'actif'
        ? 'Notifications activées'
        : erreur
          ? 'Réessayer'
          : 'Activer les notifications'}
    </button>
  );
}