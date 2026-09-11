// src/features/heures/pages/MesHeuresPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/lib/db';
import {
  listMesHeuresMois,
  lireHeuresDepuisCache,
  moisEnCours,
  type LigneHeureSeance,
} from '../api';

function labelMois(anneeMois: string): string {
  const [y, m] = anneeMois.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(dateISO: string, jour: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${jour} ${date.getDate()} ${date.toLocaleDateString('fr-FR', {
    month: 'long',
  })}`;
}

// Écran 7.2 (ecrans_ui.md) — Scénario 9, vue enseignant : ses propres
// séances, jour par jour, avec l'heure d'ouverture et de fermeture de
// chacune (pas juste un total agrégé par UE).
export default function MesHeuresPage() {
  const user = useAuthStore((s) => s.user);
  const [mois, setMois] = useState(moisEnCours());
  const [seances, setSeances] = useState<LigneHeureSeance[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depuisCache, setDepuisCache] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setChargement(true);
    setErreur(null);

    async function charger() {
      let aDesDonneesLocales = false;
      // 1. Cache local d'abord.
      try {
        const enseignant = await db.enseignants
          .where('matricule')
          .equals(user!.matricule)
          .first();
        if (enseignant) {
          const local = await lireHeuresDepuisCache(mois, enseignant.id);
          if (!cancelled && local.length > 0) {
            setSeances(local);
            setDepuisCache(true);
            setChargement(false);
            aDesDonneesLocales = true;
          }
        }
      } catch {
        // pas grave, on retombe sur le réseau
      }

      // 2. Réseau ensuite.
      if (!navigator.onLine) {
        if (!cancelled) setChargement(false);
        return;
      }
      try {
        const frais = await listMesHeuresMois(user!.matricule, mois);
        if (!cancelled) {
          setSeances(frais);
          setDepuisCache(false);
          setErreur(null);
        }
      } catch (err) {
        if (!cancelled && !aDesDonneesLocales) {
          setErreur(
            err instanceof Error ? err.message : 'Erreur de chargement'
          );
        }
      } finally {
        if (!cancelled) setChargement(false);
      }
    }

    charger();
    return () => {
      cancelled = true;
    };
  }, [user?.matricule, mois]);

  const total = seances.reduce((acc, s) => acc + s.heures, 0);

  // Regroupement jour par jour, comme demandé.
  const parJour = new Map<string, LigneHeureSeance[]>();
  for (const s of seances) {
    const liste = parJour.get(s.date) ?? [];
    liste.push(s);
    parJour.set(s.date, liste);
  }
  const jours = Array.from(parJour.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Mes heures</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Tes séances effectuées, jour par jour.
          </p>
          {depuisCache && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1.5">
              <WifiOff size={12} /> Données locales — en attente de
              rafraîchissement
            </p>
          )}
        </div>
        <input
          type="month"
          value={mois}
          onChange={(e) => setMois(e.target.value)}
          className="bg-white rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 outline-none"
        />
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : erreur ? (
        <div className="bg-white rounded-[20px] p-6 text-sm font-semibold text-red-600">
          Impossible de charger tes heures : {erreur}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-[20px] p-6 text-center mb-5">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">
              {labelMois(mois)}
            </p>
            <p className="font-extrabold text-4xl text-red-600">{total}h</p>
            <p className="text-sm text-gray-400 mt-1">effectuées au total</p>
          </div>

          {jours.length === 0 ? (
            <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
              Aucune séance effectuée sur ce mois pour l'instant.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jours.map(([date, listeDuJour]) => (
                <div key={date}>
                  <p className="font-extrabold text-sm text-gray-900 mb-2">
                    {formatDateLabel(date, listeDuJour[0].jour)}
                  </p>
                  <div className="bg-white rounded-[20px] overflow-hidden">
                    {listeDuJour.map((s) => (
                      <div
                        key={s.seanceId}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">
                            {s.ueNom}
                          </p>
                          <p className="text-xs text-gray-400">
                            {s.creneau} · {formatHeure(s.heureOuverture)} →{' '}
                            {formatHeure(s.heureFermeture)}
                          </p>
                        </div>
                        <p className="text-sm font-mono font-bold text-gray-500 shrink-0">
                          {s.heures}h
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
