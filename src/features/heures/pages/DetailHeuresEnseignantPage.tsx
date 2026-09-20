// src/features/heures/pages/DetailHeuresEnseignantPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { formatHeureCameroun } from '@/lib/formatHeureCameroun';
import { getEnseignant } from '@/features/referentiel/enseignants/api';
import {
  listHeuresDetailEnseignant,
  listAbsencesMois,
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

function formatDateLabel(dateISO: string, jour: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${jour} ${date.getDate()} ${date.toLocaleDateString('fr-FR', {
    month: 'long',
  })}`;
}

const formatHeure = formatHeureCameroun;

// Détail complet des heures d'un enseignant précis (admin/responsable) :
// toutes les heures d'arrivée et de fin réelles, les retards exacts, le
// cumul, et toutes les statistiques — accessible en cliquant sur un
// enseignant depuis "Voir les états".
export default function DetailHeuresEnseignantPage() {
  const { enseignantId } = useParams<{ enseignantId: string }>();
  const navigate = useNavigate();

  const [nomEnseignant, setNomEnseignant] = useState('');
  const [mois, setMois] = useState(moisEnCours());
  const [seances, setSeances] = useState<LigneHeureSeance[]>([]);
  const [stats, setStats] = useState<StatsHeures | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!enseignantId) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    Promise.all([
      getEnseignant(enseignantId),
      listHeuresDetailEnseignant(enseignantId, mois),
      listAbsencesMois(mois, enseignantId),
    ])
      .then(([enseignant, detail, absences]) => {
        if (annule) return;
        setNomEnseignant(enseignant?.nom ?? '');
        setSeances(detail);
        setStats(calculerStats(detail, absences.length));
      })
      .catch((err) =>
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement.')
      )
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [enseignantId, mois]);

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
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/heures')}
        className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-4"
      >
        <ArrowLeft size={15} /> Retour aux états
      </button>

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            {nomEnseignant || 'Détail des heures'}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Toutes ses séances, ses retards et ses statistiques.
          </p>
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
          {erreur}
        </div>
      ) : (
        <>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">
            {labelMois(mois)}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-[20px] p-4 text-center">
              <p className="font-extrabold text-2xl text-red-600">
                {stats?.totalHeures ?? 0}h
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Total effectué</p>
            </div>
            <div className="bg-white rounded-[20px] p-4 text-center">
              <p className="font-extrabold text-2xl text-gray-900">
                {stats?.nombreSeances ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Séances</p>
            </div>
            <div className="bg-white rounded-[20px] p-4 text-center">
              <p className="font-extrabold text-2xl text-amber-600">
                {stats?.nombreRetards ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Retards (&gt;15 min)</p>
            </div>
            <div className="bg-white rounded-[20px] p-4 text-center">
              <p className="font-extrabold text-2xl text-gray-900">
                {stats?.cumulRetardMinutes ?? 0} min
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Cumul de retard</p>
            </div>
            <div className="bg-white rounded-[20px] p-4 text-center">
              <p className="font-extrabold text-2xl text-red-600">
                {stats?.nombreAbsences ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Absences</p>
            </div>
          </div>

          {(stats?.heuresPerduesPourRetard ?? 0) > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-700">
                {stats!.heuresPerduesPourRetard}h perdue
                {stats!.heuresPerduesPourRetard > 1 ? 's' : ''} ce mois-ci à
                cause de retards dépassant la marge de 15 min.
              </p>
            </div>
          )}

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
                          <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                            {s.creneau} · {formatHeure(s.heureOuverture)} →{' '}
                            {formatHeure(s.heureFermeture)}
                            {s.enRetard && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                                +{s.retardMinutes} min de retard
                              </span>
                            )}
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