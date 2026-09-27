// src/features/emploi-du-temps/pages/MesCoursSemainePage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  FileText,
  WifiOff,
  TrendingUp,
  ListChecks,
  CalendarDays,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { getTauxCouverture, type TauxCouverture } from '@/features/seances/api';
import { bornesCreneau } from '@/lib/creneaux';
import {
  listMesCours,
  lireMesCoursDepuisCache,
  semaineCibleCoursDeLaSemaine,
  type MonCours,
} from '../api';

const JOURS_INDEX: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
  Dimanche: 6,
};

// "21/09 au 26/09" à partir du lundi (format "AAAA-MM-JJ").
function formatSemaineTitre(semaineISO: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCDate()).padStart(2, '0')}/${String(
      dt.getUTCMonth() + 1
    ).padStart(2, '0')}`;
  const lundi = new Date(Date.UTC(y, m - 1, d));
  const samedi = new Date(Date.UTC(y, m - 1, d + 5));
  return `${fmt(lundi)} au ${fmt(samedi)}`;
}

// Écran dédié : contrairement à "Mes cours" (toutes les semaines, passées
// et futures), cet écran ne montre QUE la semaine en cours — ou, à partir
// du samedi soir/dimanche, déjà la semaine prochaine (cf.
// semaineCibleCoursDeLaSemaine dans l'api) — pour un coup d'œil rapide
// "qu'est-ce que j'ai cette semaine ?" sans avoir à faire défiler.
export default function MesCoursSemainePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const {
    data: tousLesCours,
    loading,
    depuisCache,
  } = useCacheSupabase<MonCours>(
    () =>
      user ? lireMesCoursDepuisCache(user.matricule) : Promise.resolve([]),
    () => (user ? listMesCours(user.matricule) : Promise.resolve([]))
  );

  const [semaineCible, setSemaineCible] = useState<string | null>(null);
  const [estSemaineProchaine, setEstSemaineProchaine] = useState(false);

  useEffect(() => {
    let annule = false;
    semaineCibleCoursDeLaSemaine().then((res) => {
      if (!annule) {
        setSemaineCible(res.semaine);
        setEstSemaineProchaine(res.estSemaineProchaine);
      }
    });
    return () => {
      annule = true;
    };
  }, []);

  const coursSemaine = semaineCible
    ? tousLesCours
        .filter((c) => c.semaine === semaineCible)
        .sort((a, b) => {
          const parJour = (JOURS_INDEX[a.jour] ?? 0) - (JOURS_INDEX[b.jour] ?? 0);
          if (parJour !== 0) return parJour;
          return (
            (bornesCreneau(a.creneau)?.debut ?? 0) -
            (bornesCreneau(b.creneau)?.debut ?? 0)
          );
        })
    : [];

  // Taux de couverture par UE — même logique que "Mes cours", mais
  // recalculée seulement sur les UEs de la semaine affichée ici.
  const [tauxParUe, setTauxParUe] = useState<Map<string, TauxCouverture>>(
    new Map()
  );
  useEffect(() => {
    const ueIds = Array.from(
      new Set(
        coursSemaine.map((c) => c.ueId).filter((id): id is string => !!id)
      )
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
  }, [JSON.stringify(coursSemaine.map((c) => c.ueId))]);

  if (loading || semaineCible === null) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Mes cours de la semaine
      </p>
      <p className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
        <CalendarDays size={14} className="text-gray-300 shrink-0" />
        {estSemaineProchaine ? 'Semaine prochaine' : 'Cette semaine'} · du{' '}
        {formatSemaineTitre(semaineCible)}
      </p>
      {estSemaineProchaine && (
        <p className="text-xs font-bold text-amber-600 mb-3">
          La semaine en cours touche à sa fin — voici déjà ton planning de
          la semaine prochaine.
        </p>
      )}
      {depuisCache && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-4">
          <WifiOff size={12} /> Données locales — en attente de
          rafraîchissement
        </p>
      )}

      {coursSemaine.length === 0 ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
          Aucun cours programmé pour cette semaine.
        </div>
      ) : (
        <div className="bg-white rounded-[20px] overflow-hidden">
          {coursSemaine.map((c) => {
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
                    {c.jour} · {c.creneau} ·{' '}
                    {c.salleCode ?? 'Salle à confirmer'}
                  </p>
                </div>
                {taux &&
                  (taux.quantitatif !== null || taux.qualitatif !== null) && (
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
      )}

      {coursSemaine[0]?.pdfSigneUrl && (
        <a
          href={coursSemaine[0].pdfSigneUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-red-600 mt-4"
        >
          <FileText size={13} /> Document signé de cette semaine
        </a>
      )}
    </div>
  );
}