// src/features/emploi-du-temps/pages/MesCoursPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText, WifiOff, TrendingUp, ListChecks } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { getTauxCouverture, type TauxCouverture } from '@/features/seances/api';
import { listMesCours, lireMesCoursDepuisCache, type MonCours } from '../api';

// Écran Scénario 6, étape 10 — l'enseignant consulte ses propres cours
// (jour, créneau, salle) une fois l'emploi du temps validé, ainsi que le
// document signé. Le syllabus et le support de cours (Scénario 12) ont
// leur propre écran dédié : "Mes UEs".
export default function MesCoursPage() {
  const navigate = useNavigate();
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

  // Taux de couverture par UE — une seule requête par UE distincte
  // (pas par séance : plusieurs séances de la même UE partagent le même
  // taux), reconstruits dès que la liste des cours change.
  const [tauxParUe, setTauxParUe] = useState<Map<string, TauxCouverture>>(
    new Map()
  );
  useEffect(() => {
    const ueIds = Array.from(
      new Set(cours.map((c) => c.ueId).filter((id): id is string => !!id))
    );
    if (ueIds.length === 0) return;
    let annule = false;
    Promise.all(
      ueIds.map((id) =>
        getTauxCouverture(id, null).then((taux) => [id, taux] as const)
      )
    ).then((paires) => {
      if (!annule) setTauxParUe(new Map(paires));
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cours.map((c) => c.ueId))]);

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
          <WifiOff size={12} /> Données locales — en attente de
          rafraîchissement
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
              {listeCours.map((c) => {
                const taux = c.ueId ? tauxParUe.get(c.ueId) : null;
                return (
                  <div
                    key={c.id}
                    onClick={() => c.ueId && navigate(`/mon-cours/${c.ueId}`)}
                    className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 ${
                      c.ueId ? 'cursor-pointer hover:bg-gray-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">
                        {c.ueNom}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.salleCode ?? 'Salle à confirmer'} · {c.jour} ·{' '}
                        {c.creneau}
                      </p>
                    </div>
                    {taux &&
                      (taux.quantitatif !== null ||
                        taux.qualitatif !== null) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {taux.quantitatif !== null && (
                            <span
                              title="Couverture quantitative (heures effectuées / volume horaire)"
                              className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-50 rounded-full px-2 py-1"
                            >
                              <TrendingUp size={11} />
                              {taux.quantitatif}%
                            </span>
                          )}
                          {taux.qualitatif !== null && (
                            <span
                              title="Couverture qualitative (chapitres couverts)"
                              className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-50 rounded-full px-2 py-1"
                            >
                              <ListChecks size={11} />
                              {taux.qualitatif}%
                            </span>
                          )}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}