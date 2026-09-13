// src/features/mes-ues/pages/MesUEsPage.tsx
import { useState } from 'react';
import {
  Loader2,
  FileText,
  UploadCloud,
  CheckCircle2,
  WifiOff,
  Pencil,
  ChevronDown,
  ListChecks,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { televerserFichier, urlPubliqueR2 } from '@/lib/r2';
import { extraireTextePdf } from '@/lib/pdfExtraction';
import {
  listPointsCles,
  type PointCle,
} from '@/features/referentiel/ues/api';
import { listPointsClesTronc } from '@/features/referentiel/troncs-communs/api';
import {
  listMesUEs,
  lireMesUEsDepuisCache,
  analyserSupportCours,
  type MonUE,
} from '../api';

// Sous ce seuil, un message (non bloquant) suggère à l'enseignant
// d'envoyer un support plus complet — jamais empêchant.
const SEUIL_COUVERTURE_FAIBLE = 60;

// Écran dédié (Scénario 12) — une carte par cours réellement enseigné :
// une UE simple, ou un tronc commun entier (toutes ses spécialités
// regroupées, syllabus et support de cours partagés une seule fois).
export default function MesUEsPage() {
  const user = useAuthStore((s) => s.user);
  const [enCoursEnvoi, setEnCoursEnvoi] = useState<string | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState<string | null>(null);
  const [erreurParUE, setErreurParUE] = useState<Record<string, string>>({});
  const [misAJour, setMisAJour] = useState<Record<string, MonUE>>({});
  const [pointsOuverts, setPointsOuverts] = useState<
    Record<string, PointCle[] | 'chargement'>
  >({});

  const {
    data: ues,
    loading,
    depuisCache,
  } = useCacheSupabase<MonUE>(
    () =>
      user ? lireMesUEsDepuisCache(user.matricule) : Promise.resolve([]),
    () => (user ? listMesUEs(user.matricule) : Promise.resolve([]))
  );

  const uesAffichees = ues.map((u) => misAJour[u.cle] ?? u);

  async function togglePointsCles(ue: MonUE) {
    if (pointsOuverts[ue.cle] !== undefined) {
      setPointsOuverts((prev) => {
        const next = { ...prev };
        delete next[ue.cle];
        return next;
      });
      return;
    }
    setPointsOuverts((prev) => ({ ...prev, [ue.cle]: 'chargement' }));
    const points = ue.troncCommunId
      ? await listPointsClesTronc(ue.troncCommunId)
      : await listPointsCles(ue.ueId!);
    setPointsOuverts((prev) => ({ ...prev, [ue.cle]: points }));
  }

  async function handleEnvoyerSupport(ue: MonUE, fichier: File | undefined) {
    if (!fichier) return;
    setErreurParUE((prev) => {
      const next = { ...prev };
      delete next[ue.cle];
      return next;
    });
    setEnCoursEnvoi(ue.cle);
    try {
      const { key, nom } = ue.troncCommunId
        ? await televerserFichier(
            'support-cours-tronc-commun',
            ue.troncCommunId,
            fichier
          )
        : await televerserFichier(
            'support-cours',
            ue.attributionIds[0],
            fichier
          );
      setMisAJour((prev) => ({
        ...prev,
        [ue.cle]: {
          ...ue,
          supportKey: key,
          supportNom: nom,
          supportUploadedAt: new Date().toISOString(),
          tauxCouverture: null,
        },
      }));

      // Analyse IA — purement informative, n'empêche jamais l'envoi même
      // si elle échoue (l'enseignant garde son support quoi qu'il arrive).
      setAnalyseEnCours(ue.cle);
      try {
        const texte = await extraireTextePdf(fichier);
        const { tauxCouverture } = await analyserSupportCours(
          ue.troncCommunId
            ? { troncCommunId: ue.troncCommunId }
            : { attributionId: ue.attributionIds[0] },
          texte
        );
        setMisAJour((prev) => ({
          ...prev,
          [ue.cle]: { ...prev[ue.cle], tauxCouverture },
        }));
      } catch (err) {
        console.warn('Analyse du support de cours indisponible :', err);
      } finally {
        setAnalyseEnCours(null);
      }
    } catch (err) {
      setErreurParUE((prev) => ({
        ...prev,
        [ue.cle]:
          err instanceof Error ? err.message : "Erreur lors de l'envoi.",
      }));
    } finally {
      setEnCoursEnvoi(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Mes UEs</p>
      <p className="text-sm text-gray-400 mb-2">
        Syllabus à consulter, support de cours à envoyer.
      </p>
      {depuisCache && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-4">
          <WifiOff size={12} /> Données locales — en attente de
          rafraîchissement
        </p>
      )}

      {uesAffichees.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center mt-4">
          <p className="font-bold text-gray-900 mb-1">
            Aucune UE attribuée pour l'instant
          </p>
          <p className="text-sm text-gray-400">
            Elles apparaîtront ici dès qu'un cours te sera attribué.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {uesAffichees.map((ue) => (
            <div key={ue.cle} className="bg-white rounded-[20px] p-5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-extrabold text-gray-900">{ue.ueNom}</p>
                <button
                  onClick={() => togglePointsCles(ue)}
                  className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-red-600 shrink-0"
                >
                  <ListChecks size={13} />
                  Contenu
                  <ChevronDown
                    size={13}
                    className={
                      pointsOuverts[ue.cle] !== undefined
                        ? 'rotate-180 transition-transform'
                        : 'transition-transform'
                    }
                  />
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {ue.specialiteNoms.map((nom) => (
                  <span
                    key={nom}
                    className="text-[11px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full"
                  >
                    {nom}
                  </span>
                ))}
              </div>

              {pointsOuverts[ue.cle] !== undefined && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3">
                  {pointsOuverts[ue.cle] === 'chargement' ? (
                    <Loader2 size={14} className="animate-spin text-gray-300" />
                  ) : (pointsOuverts[ue.cle] as PointCle[]).length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Aucun point clé renseigné pour cette UE.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {(pointsOuverts[ue.cle] as PointCle[]).map((p) => (
                        <li
                          key={p.id}
                          className="flex items-start gap-2 text-xs text-gray-600"
                        >
                          <span className="text-red-600 font-bold shrink-0">
                            ·
                          </span>
                          {p.libelle}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {ue.syllabusKey ? (
                  <a
                    href={urlPubliqueR2(ue.syllabusKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    <FileText size={14} /> Voir le syllabus
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-2 text-xs font-bold text-gray-300 cursor-not-allowed">
                    <FileText size={14} /> Syllabus indisponible
                  </span>
                )}

                {ue.supportKey ? (
                  <>
                    <a
                      href={urlPubliqueR2(ue.supportKey)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-green-50 rounded-full px-3.5 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
                    >
                      <CheckCircle2 size={14} /> Voir mon support
                    </a>
                    <label className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer">
                      {enCoursEnvoi === ue.cle ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Pencil size={14} />
                      )}
                      Modifier
                      <input
                        type="file"
                        className="hidden"
                        disabled={enCoursEnvoi === ue.cle}
                        onChange={(e) =>
                          handleEnvoyerSupport(ue, e.target.files?.[0])
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label className="flex items-center gap-1.5 bg-red-600 rounded-full px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 cursor-pointer">
                    {enCoursEnvoi === ue.cle ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <UploadCloud size={14} />
                    )}
                    Envoyer mon support de cours
                    <input
                      type="file"
                      className="hidden"
                      disabled={enCoursEnvoi === ue.cle}
                      onChange={(e) =>
                        handleEnvoyerSupport(ue, e.target.files?.[0])
                      }
                    />
                  </label>
                )}
              </div>

              {ue.supportUploadedAt && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Support envoyé le{' '}
                  {new Date(ue.supportUploadedAt).toLocaleDateString('fr-FR')}
                </p>
              )}
              {analyseEnCours === ue.cle && (
                <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" /> Analyse du
                  contenu en cours...
                </p>
              )}
              {ue.tauxCouverture != null && (
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                      ue.tauxCouverture >= SEUIL_COUVERTURE_FAIBLE
                        ? 'bg-green-50 text-green-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    Couverture du contenu : {ue.tauxCouverture}%
                  </span>
                  {ue.tauxCouverture < SEUIL_COUVERTURE_FAIBLE && (
                    <p className="text-xs font-semibold text-amber-600 mt-1.5">
                      Ce support ne couvre qu'une partie du programme —
                      pense à en envoyer un plus complet si possible.
                    </p>
                  )}
                </div>
              )}
              {erreurParUE[ue.cle] && (
                <p className="text-xs font-semibold text-red-600 mt-2">
                  {erreurParUE[ue.cle]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}