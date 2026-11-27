// src/features/mes-ues/pages/MesUEsPage.tsx
import { useState } from 'react';
import {
  Loader2,
  FileText,
  WifiOff,
  ChevronDown,
  ListChecks,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { televerserFichier, urlPubliqueR2, verifierDocument } from '@/lib/r2';
import DepotDocument from '../components/DepotDocument';
import {
  listPointsCles,
  type PointCle,
} from '@/features/referentiel/ues/api';
import { listPointsClesTronc } from '@/features/referentiel/troncs-communs/api';
import {
  listMesUEs,
  lireMesUEsDepuisCache,
  type MonUE,
} from '../api';

// Écran dédié (Scénario 12) — une carte par cours réellement enseigné :
// une UE simple, ou un tronc commun entier (toutes ses spécialités
// regroupées, syllabus et support de cours partagés une seule fois).
export default function MesUEsPage() {
  const user = useAuthStore((s) => s.user);
  const [enCoursEnvoi, setEnCoursEnvoi] = useState<string | null>(null);
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

  // Envoi d'un document (support de cours ou fiche de progression) :
  // vérification du format, envoi, mise à jour de la carte. C'est tout.
  async function handleEnvoyer(
    ue: MonUE,
    type: 'support' | 'fiche',
    fichier: File
  ) {
    const id = `${ue.cle}:${type}`;
    const refus = verifierDocument(fichier);
    if (refus) {
      setErreurParUE((prev) => ({ ...prev, [id]: refus }));
      return;
    }
    setErreurParUE((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEnCoursEnvoi(id);
    try {
      const purpose = ue.troncCommunId
        ? type === 'support'
          ? 'support-cours-tronc-commun'
          : 'fiche-progression-tronc-commun'
        : type === 'support'
          ? 'support-cours'
          : 'fiche-progression';
      const { key, nom } = await televerserFichier(
        purpose,
        ue.troncCommunId ?? ue.attributionIds[0],
        fichier
      );
      const maintenant = new Date().toISOString();
      setMisAJour((prev) => {
        const base = prev[ue.cle] ?? ue;
        return {
          ...prev,
          [ue.cle]:
            type === 'support'
              ? {
                  ...base,
                  supportKey: key,
                  supportNom: nom,
                  supportUploadedAt: maintenant,
                }
              : {
                  ...base,
                  ficheKey: key,
                  ficheNom: nom,
                  ficheUploadedAt: maintenant,
                },
        };
      });
    } catch (err) {
      setErreurParUE((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Erreur lors de l'envoi.",
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
        Syllabus à consulter, support de cours et fiche de progression à envoyer.
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

              </div>

              <div className="flex flex-col gap-2 mt-3">
                <DepotDocument
                  titre="Support de cours"
                  cleFichier={ue.supportKey}
                  nomFichier={ue.supportNom}
                  dateEnvoi={ue.supportUploadedAt}
                  enCours={enCoursEnvoi === `${ue.cle}:support`}
                  erreur={erreurParUE[`${ue.cle}:support`]}
                  onChoisir={(f) => handleEnvoyer(ue, 'support', f)}
                />
                <DepotDocument
                  titre="Fiche de progression"
                  cleFichier={ue.ficheKey}
                  nomFichier={ue.ficheNom}
                  dateEnvoi={ue.ficheUploadedAt}
                  enCours={enCoursEnvoi === `${ue.cle}:fiche`}
                  erreur={erreurParUE[`${ue.cle}:fiche`]}
                  onChoisir={(f) => handleEnvoyer(ue, 'fiche', f)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}