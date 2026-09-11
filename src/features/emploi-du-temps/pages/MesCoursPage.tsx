// src/features/emploi-du-temps/pages/MesCoursPage.tsx
import { Loader2, FileText, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { listMesCours, lireMesCoursDepuisCache, type MonCours } from '../api';

// Écran Scénario 6, étape 10 — l'enseignant consulte ses propres cours
// (jour, créneau, salle) une fois l'emploi du temps validé, ainsi que le
// document signé.
export default function MesCoursPage() {
  const user = useAuthStore((s) => s.user);

  const {
    data: cours,
    loading,
    depuisCache,
  } = useCacheSupabase<MonCours>(
    () =>
      user ? lireMesCoursDepuisCache(user.matricule) : Promise.resolve([]),
    () => (user ? listMesCours(user.matricule) : Promise.resolve([]))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (cours.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="font-extrabold text-lg text-gray-900 mb-1">
          Aucun cours pour l'instant
        </p>
        <p className="text-sm text-gray-400">
          Tes cours apparaîtront ici dès qu'un emploi du temps sera validé.
        </p>
      </div>
    );
  }

  // Regroupement par semaine
  const parSemaine = new Map<string, MonCours[]>();
  for (const c of cours) {
    const liste = parSemaine.get(c.semaine) ?? [];
    liste.push(c);
    parSemaine.set(c.semaine, liste);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Mes cours</p>
      <p className="text-sm text-gray-400 mb-2">
        Tes créneaux, semaine par semaine.
      </p>
      {depuisCache && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-4">
          <WifiOff size={12} /> Données locales — en attente de rafraîchissement
        </p>
      )}

      <div className="flex flex-col gap-5">
        {Array.from(parSemaine.entries()).map(([semaine, listeCours]) => (
          <div key={semaine}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="font-extrabold text-sm text-gray-900">
                Semaine du {new Date(semaine).toLocaleDateString('fr-FR')}
              </p>
              {listeCours[0].pdfSigneUrl && (
                <a
                  href={listeCours[0].pdfSigneUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600"
                >
                  <FileText size={13} /> Document signé
                </a>
              )}
            </div>
            <div className="bg-white rounded-[20px] overflow-hidden">
              {listeCours.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">
                      {c.ueNom}
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.salleCode ?? 'Salle à confirmer'}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-gray-500 shrink-0">
                    {c.jour} · {c.creneau}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
