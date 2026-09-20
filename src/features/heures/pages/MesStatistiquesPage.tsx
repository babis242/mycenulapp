// src/features/heures/pages/MesStatistiquesPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/lib/db';
import {
  listMesHeuresMois,
  lireHeuresDepuisCache,
  listMesAbsencesMois,
  lireAbsencesDepuisCache,
  calculerStats,
  moisEnCours,
  type LigneHeureSeance,
  type StatsHeures,
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

// Écran "Mes statistiques" — vue synthétique pour l'enseignant : total
// d'heures effectuées, nombre de séances, nombre de retards et cumul de
// retard, sur le mois choisi. Complète "Mes heures" (qui montre le
// détail jour par jour) avec une vue d'ensemble chiffrée.
export default function MesStatistiquesPage() {
  const user = useAuthStore((s) => s.user);
  const [mois, setMois] = useState(moisEnCours());
  const [stats, setStats] = useState<StatsHeures | null>(null);
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
      try {
        const enseignant = await db.enseignants
          .where('matricule')
          .equals(user!.matricule)
          .first();
        if (enseignant) {
          const [local, absencesLocales] = await Promise.all([
            lireHeuresDepuisCache(mois, enseignant.id),
            lireAbsencesDepuisCache(mois, enseignant.id),
          ]);
          if (!cancelled && local.length > 0) {
            setStats(calculerStats(local, absencesLocales.length));
            setDepuisCache(true);
            setChargement(false);
            aDesDonneesLocales = true;
          }
        }
      } catch {
        // pas grave, on retombe sur le réseau
      }

      if (!navigator.onLine) {
        if (!cancelled) setChargement(false);
        return;
      }
      try {
        const [frais, absences]: [LigneHeureSeance[], any[]] = await Promise.all([
          listMesHeuresMois(user!.matricule, mois),
          listMesAbsencesMois(user!.matricule, mois),
        ]);
        if (!cancelled) {
          setStats(calculerStats(frais, absences.length));
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

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            Mes statistiques
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Ton activité en un coup d'œil.
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
          Impossible de charger tes statistiques : {erreur}
        </div>
      ) : (
        <>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">
            {labelMois(mois)}
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="font-extrabold text-3xl text-red-600">
                {stats?.totalHeures ?? 0}h
              </p>
              <p className="text-xs text-gray-400 mt-1">Total effectué</p>
            </div>
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="font-extrabold text-3xl text-gray-900">
                {stats?.nombreSeances ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">Séances effectuées</p>
            </div>
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="font-extrabold text-3xl text-amber-600">
                {stats?.nombreRetards ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Retards (&gt; 15 min)
              </p>
            </div>
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="font-extrabold text-3xl text-gray-900">
                {stats?.cumulRetardMinutes ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Minutes de retard cumulées
              </p>
            </div>
            <div className="bg-white rounded-[20px] p-5 text-center col-span-2">
              <p className="font-extrabold text-3xl text-red-600">
                {stats?.nombreAbsences ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Absences (séance jamais ouverte, ni annulée)
              </p>
            </div>
          </div>

          {(stats?.heuresPerduesPourRetard ?? 0) > 0 ? (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-700">
                {stats!.heuresPerduesPourRetard}h perdue
                {stats!.heuresPerduesPourRetard > 1 ? 's' : ''} ce mois-ci à
                cause de retards dépassant la marge de 15 min. Consulte "Mes
                heures" pour voir le détail séance par séance.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[20px] p-5 text-center text-sm font-semibold text-gray-400">
              Aucune heure perdue pour retard ce mois-ci.
            </div>
          )}
        </>
      )}
    </div>
  );
}