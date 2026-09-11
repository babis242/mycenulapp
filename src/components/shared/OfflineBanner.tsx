// src/components/shared/OfflineBanner.tsx
import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db } from '@/lib/db';
import { onSyncStateChange, synchroniserTout } from '@/lib/sync';

// Bandeau discret affiché quand l'app est hors ligne, ou quand des actions
// faites hors ligne attendent encore d'être envoyées à Supabase. N'affiche
// rien le reste du temps.
export default function OfflineBanner() {
  const enLigne = useOnlineStatus();
  const [enAttente, setEnAttente] = useState(0);
  const [derniereErreur, setDerniereErreur] = useState<string | null>(null);
  const [syncEnCours, setSyncEnCours] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(false);

  useEffect(() => {
    let annule = false;
    async function compter() {
      const actions = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'error'])
        .toArray();
      if (annule) return;
      setEnAttente(actions.length);
      const enErreur = actions.find((a: any) => a.status === 'error');
      setDerniereErreur(enErreur?.error ?? null);
    }
    compter();
    const interval = setInterval(compter, 5000);
    const unsub = onSyncStateChange((etat) =>
      setSyncEnCours(etat === 'syncing')
    );
    return () => {
      annule = true;
      clearInterval(interval);
      unsub();
    };
  }, []);

  if (enLigne && enAttente === 0) return null;

  return (
    <div className="print:hidden">
      <div
        className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white ${
          enLigne ? 'bg-amber-500' : 'bg-gray-800'
        }`}
      >
        {enLigne ? (
          <>
            {syncEnCours ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {enAttente} action{enAttente > 1 ? 's' : ''} en attente de
            synchronisation
            {!syncEnCours && (
              <button
                onClick={() => synchroniserTout()}
                className="underline ml-1"
              >
                Réessayer
              </button>
            )}
            {derniereErreur && !syncEnCours && (
              <button
                onClick={() => setDetailOuvert((v) => !v)}
                className="flex items-center gap-1 underline ml-1"
              >
                <AlertTriangle size={12} /> Voir l'erreur
              </button>
            )}
          </>
        ) : (
          <>
            <WifiOff size={13} />
            Hors ligne — tu consultes les dernières données enregistrées sur cet
            appareil
          </>
        )}
      </div>
      {detailOuvert && derniereErreur && (
        <div className="bg-gray-900 text-red-300 text-xs font-mono px-4 py-2 break-words">
          {derniereErreur}
        </div>
      )}
    </div>
  );
}
