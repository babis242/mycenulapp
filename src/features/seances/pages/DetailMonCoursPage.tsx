// src/features/seances/pages/DetailMonCoursPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  Users,
  TrendingUp,
  ListChecks,
  CheckCircle2,
  Circle,
  MinusCircle,
} from 'lucide-react';
import {
  getDetailCoursEnseignant,
  type DetailCoursEnseignant,
} from '../api';

function badgeEtatPoint(etat: 'non_aborde' | 'partiel' | 'fini') {
  if (etat === 'fini')
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 shrink-0">
        <CheckCircle2 size={14} /> Fini
      </span>
    );
  if (etat === 'partiel')
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 shrink-0">
        <MinusCircle size={14} /> Pas fini
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 shrink-0">
      <Circle size={14} /> Non abordé
    </span>
  );
}

// Écran "Mon cours" (enseignant) — clic sur un cours depuis "Mes cours" :
// les deux taux de couverture, l'état de chaque point clé, et la
// présence séance par séance sur ce cours précis.
export default function DetailMonCoursPage() {
  const { ueId } = useParams<{ ueId: string }>();
  const [searchParams] = useSearchParams();
  const troncCommunId = searchParams.get('tronc');
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DetailCoursEnseignant | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ueId && !troncCommunId) return;
    let annule = false;
    setChargement(true);
    getDetailCoursEnseignant(
      troncCommunId ? null : (ueId ?? null),
      troncCommunId
    )
      .then((d) => {
        if (!annule) setDetail(d);
      })
      .catch((err) => {
        if (!annule)
          setErreur(err instanceof Error ? err.message : 'Erreur de chargement.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ueId, troncCommunId]);

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/mes-cours')}
        className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-4"
      >
        <ArrowLeft size={15} /> Retour à mes cours
      </button>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : erreur ? (
        <div className="bg-white rounded-[20px] p-6 text-sm font-semibold text-red-600">
          {erreur}
        </div>
      ) : !detail ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
          Cours introuvable.
        </div>
      ) : (
        <>
          <p className="font-extrabold text-2xl text-gray-900 mb-6">
            {detail.ueNom}
          </p>

          {(detail.tauxCouverture.quantitatif !== null ||
            detail.tauxCouverture.qualitatif !== null) && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white rounded-[20px] p-5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 mb-1">
                  <TrendingUp size={13} /> Couverture quantitative
                </p>
                <p className="font-extrabold text-3xl text-gray-900">
                  {detail.tauxCouverture.quantitatif ?? '—'}
                  {detail.tauxCouverture.quantitatif !== null && '%'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  heures effectuées / volume horaire
                </p>
              </div>
              <div className="bg-white rounded-[20px] p-5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 mb-1">
                  <ListChecks size={13} /> Couverture qualitative
                </p>
                <p className="font-extrabold text-3xl text-gray-900">
                  {detail.tauxCouverture.qualitatif ?? '—'}
                  {detail.tauxCouverture.qualitatif !== null && '%'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  chapitres couverts (fini = 100%, partiel = 50%)
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-[20px] p-5 mb-4">
            <p className="flex items-center gap-1.5 font-extrabold text-gray-900 mb-3">
              <ListChecks size={15} /> Points abordés
            </p>
            {detail.points.length === 0 ? (
              <p className="text-sm text-gray-300">
                Aucun point clé défini pour cette UE.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.points.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <p className="text-sm text-gray-700">{p.libelle}</p>
                    {badgeEtatPoint(p.etat)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-[20px] p-5">
            <p className="flex items-center gap-1.5 font-extrabold text-gray-900 mb-3">
              <Users size={15} /> Présences, séance par séance
            </p>
            {detail.seances.length === 0 ? (
              <p className="text-sm text-gray-300">
                Aucune séance effectuée pour l'instant.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.seances.map((s) => (
                  <div
                    key={s.rapportId}
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0"
                  >
                    <p className="text-sm text-gray-700">
                      {s.jour} · {s.creneau}
                      <span className="text-gray-400">
                        {' '}
                        · Semaine du{' '}
                        {s.semaine
                          ? new Date(s.semaine).toLocaleDateString('fr-FR')
                          : '—'}
                      </span>
                    </p>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        s.nbTotal === 0
                          ? 'bg-gray-50 text-gray-400'
                          : s.nbPresents === s.nbTotal
                            ? 'bg-green-50 text-green-600'
                            : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {s.nbTotal === 0
                        ? 'Aucun appel'
                        : `${s.nbPresents}/${s.nbTotal} présents`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}