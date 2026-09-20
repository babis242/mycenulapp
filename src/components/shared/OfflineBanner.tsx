// src/components/shared/OfflineBanner.tsx
import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db } from '@/lib/db';
import { onSyncStateChange, synchroniserTout } from '@/lib/sync';

// Bandeau discret affiché quand l'app est hors ligne, ou quand des actions
// faites hors ligne attendent encore d'être envoyées à Supabase. N'affiche
// rien le reste du temps.
export default function OfflineBanner() {
  const enLigne = useOnlineStatus();
  const [enAttente, setEnAttente] = useState(0);
  const [abandonnees, setAbandonnees] = useState(0);
  const [derniereErreur, setDerniereErreur] = useState<string | null>(null);
  const [syncEnCours, setSyncEnCours] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    async function compter() {
      const actions = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'error', 'abandonnee'])
        .toArray();
      if (annule) return;
      const actives = actions.filter((a: any) => a.status !== 'abandonnee');
      setEnAttente(actives.length);
      setAbandonnees(
        actions.filter((a: any) => a.status === 'abandonnee').length
      );
      const enErreur = actions.find(
        (a: any) => a.status === 'error' || a.status === 'abandonnee'
      );
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

  // "Réessayer" redonne explicitement une chance aux actions abandonnées
  // (remise à zéro du compteur de tentatives) — l'abandon automatique
  // évite le martèlement en tâche de fond, mais une demande explicite de
  // l'utilisateur (ex : après qu'un admin a corrigé le souci côté
  // serveur) doit pouvoir relancer une dernière fois.
  async function handleReessayer() {
    const abandonneesActuelles = await db.syncQueue
      .where('status')
      .equals('abandonnee')
      .toArray();
    for (const a of abandonneesActuelles) {
      await db.syncQueue.update((a as any).id, {
        status: 'pending',
        tentatives: 0,
      });
    }
    synchroniserTout();
  }

  // Supprime définitivement les actions abandonnées — pour une entrée
  // durablement cassée (ex : un rapport dont la ligne correspondante
  // n'existe plus côté serveur), aucun nombre de tentatives ne la fera
  // jamais réussir. Sans ce bouton, elle resterait affichée comme
  // "bloquée" indéfiniment, sans aucun moyen de s'en débarrasser.
  async function handleVider() {
    if (
      !window.confirm(
        `Supprimer définitivement ${abandonnees} action${
          abandonnees > 1 ? 's' : ''
        } bloquée${
          abandonnees > 1 ? 's' : ''
        } ? Cette modification faite hors ligne ne sera jamais envoyée au serveur — si elle était importante, il faudra la refaire depuis le début.`
      )
    )
      return;
    setSuppressionEnCours(true);
    try {
      const abandonneesActuelles = await db.syncQueue
        .where('status')
        .equals('abandonnee')
        .toArray();
      for (const a of abandonneesActuelles) {
        await db.syncQueue.delete((a as any).id);
      }
      setAbandonnees(0);
      setDetailOuvert(false);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  if (enLigne && enAttente === 0 && abandonnees === 0) return null;

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
            {enAttente > 0 &&
              `${enAttente} action${enAttente > 1 ? 's' : ''} en attente de synchronisation`}
            {enAttente > 0 && abandonnees > 0 && ' · '}
            {abandonnees > 0 &&
              `${abandonnees} bloquée${abandonnees > 1 ? 's' : ''} après plusieurs échecs`}
            {!syncEnCours && (
              <button onClick={handleReessayer} className="underline ml-1">
                Réessayer
              </button>
            )}
            {abandonnees > 0 && !syncEnCours && (
              <button
                onClick={handleVider}
                disabled={suppressionEnCours}
                className="flex items-center gap-1 underline ml-1 disabled:opacity-50"
              >
                <Trash2 size={12} /> Vider
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