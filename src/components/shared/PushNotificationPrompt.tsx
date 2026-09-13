// src/components/shared/PushNotificationPrompt.tsx
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  pushDisponible,
  permissionDejaDemandee,
  activerNotificationsPush,
} from '@/lib/pushNotifications';

const CLE_MASQUE = 'gestion-pedagogique:notifs-push-masque';

// Bandeau discret proposant d'activer les notifications push sur cet
// appareil — n'apparaît que si le navigateur les supporte, que la
// permission n'a jamais été demandée, et que l'utilisateur ne l'a pas
// déjà écarté.
export default function PushNotificationPrompt() {
  const user = useAuthStore((s) => s.user);
  const [visible, setVisible] = useState(false);
  const [activation, setActivation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!pushDisponible()) return;
    if (permissionDejaDemandee()) return;
    if (localStorage.getItem(CLE_MASQUE)) return;
    setVisible(true);
  }, [user]);

  async function handleActiver() {
    if (!user) return;
    setActivation(true);
    setErreur(null);
    try {
      await activerNotificationsPush(user.id);
      setVisible(false);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Impossible d'activer."
      );
    } finally {
      setActivation(false);
    }
  }

  function handlePlusTard() {
    localStorage.setItem(CLE_MASQUE, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="print:hidden fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 z-40">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
          <Bell size={16} className="text-red-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            Activer les notifications ?
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Reçois tes rappels et notifications directement sur cet
            appareil, même l'app fermée.
          </p>
          {erreur && (
            <p className="text-xs font-semibold text-red-600 mt-1.5">
              {erreur}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleActiver}
              disabled={activation}
              className="bg-red-600 rounded-full px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {activation ? 'Activation...' : 'Activer'}
            </button>
            <button
              onClick={handlePlusTard}
              className="text-xs font-bold text-gray-400 hover:text-gray-600"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={handlePlusTard}
          className="text-gray-300 hover:text-gray-500 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}