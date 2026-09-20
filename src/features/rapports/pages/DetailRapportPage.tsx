// src/features/rapports/pages/DetailRapportPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  Users,
  Image as ImageIcon,
  TrendingUp,
  ListChecks,
  CheckCircle2,
  Circle,
  MinusCircle,
} from 'lucide-react';
import { urlPubliqueR2 } from '@/lib/r2';
import { getDetailRapportAdmin, type DetailRapportAdmin } from '../api';

function badgeEtatPoint(etat: 'non_aborde' | 'partiel' | 'fini') {
  if (etat === 'fini')
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-green-600">
        <CheckCircle2 size={14} /> Fini
      </span>
    );
  if (etat === 'partiel')
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
        <MinusCircle size={14} /> Pas fini
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
      <Circle size={14} /> Non abordé
    </span>
  );
}

// Détail complet d'un rapport de séance (admin) — appel, points abordés
// (fini/partiel/non abordé), cahier de texte, contenu, et les taux de
// couverture de l'UE/tronc commun concerné.
export default function DetailRapportPage() {
  const { rapportId } = useParams<{ rapportId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DetailRapportAdmin | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!rapportId) return;
    let annule = false;
    getDetailRapportAdmin(rapportId)
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
  }, [rapportId]);

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/rapports')}
        className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-4"
      >
        <ArrowLeft size={15} /> Retour aux rapports
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
          Rapport introuvable.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <p className="font-extrabold text-2xl text-gray-900">
              {detail.ueNom}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {detail.enseignantNom} · {detail.semestre}
              {detail.specialiteNoms.length > 0 &&
                ` · ${detail.specialiteNoms.join(', ')}`}
            </p>
            <p className="text-sm text-gray-400">
              {detail.jour} · {detail.creneau} · Semaine du{' '}
              {detail.semaine
                ? new Date(detail.semaine).toLocaleDateString('fr-FR')
                : '—'}
            </p>
          </div>

          {(detail.tauxCouverture.quantitatif !== null ||
            detail.tauxCouverture.qualitatif !== null) && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white rounded-[20px] p-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-gray-400 mb-1">
                  <TrendingUp size={12} /> Couverture quantitative (UE)
                </p>
                <p className="font-extrabold text-2xl text-gray-900">
                  {detail.tauxCouverture.quantitatif ?? '—'}
                  {detail.tauxCouverture.quantitatif !== null && '%'}
                </p>
              </div>
              <div className="bg-white rounded-[20px] p-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-gray-400 mb-1">
                  <ListChecks size={12} /> Couverture qualitative (UE)
                </p>
                <p className="font-extrabold text-2xl text-gray-900">
                  {detail.tauxCouverture.qualitatif ?? '—'}
                  {detail.tauxCouverture.qualitatif !== null && '%'}
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-[20px] p-5 mb-4">
            <p className="flex items-center gap-1.5 font-extrabold text-gray-900 mb-3">
              <Users size={15} /> Appel (
              {detail.presences.filter((p) => p.present).length}/
              {detail.presences.length} présents)
            </p>
            {detail.presences.length === 0 ? (
              <p className="text-sm text-gray-300">Aucun appel enregistré.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {detail.presences.map((p, i) => (
                  <p
                    key={i}
                    className={`text-sm truncate ${
                      p.present
                        ? 'text-gray-700'
                        : 'text-red-500 line-through'
                    }`}
                  >
                    {p.etudiantNom}
                  </p>
                ))}
              </div>
            )}
          </div>

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

          {detail.contenu && (
            <div className="bg-white rounded-[20px] p-5 mb-4">
              <p className="font-extrabold text-gray-900 mb-2">Contenu</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {detail.contenu}
              </p>
            </div>
          )}

          <div className="bg-white rounded-[20px] p-5">
            <p className="flex items-center gap-1.5 font-extrabold text-gray-900 mb-3">
              <ImageIcon size={15} /> Cahier de texte (
              {detail.cahierTexteKeys.length})
            </p>
            {detail.cahierTexteKeys.length === 0 ? (
              <p className="text-sm text-gray-300">
                Aucune photo déposée.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {detail.cahierTexteKeys.map((key, i) => (
                  <a
                    key={key}
                    href={urlPubliqueR2(key)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-xl overflow-hidden bg-gray-50"
                  >
                    <img
                      src={urlPubliqueR2(key)}
                      alt={detail.cahierTexteNoms[i] ?? `Photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}