// src/features/seances/components/RapportSeanceForm.tsx
import { useEffect, useState } from 'react';
import { Loader2, Camera, ListChecks, Layers, GraduationCap } from 'lucide-react';
import { niveauDeSemestre } from '@/constants/enums';
import type { TypeCursus } from '@/types';
import { televerserFichier } from '@/lib/r2';
import {
  listEtudiants,
  type Etudiant,
} from '@/features/referentiel/etudiants/api';
import { listPointsCles, type PointCle } from '@/features/referentiel/ues/api';
import {
  getGroupesSpecialitesTronc,
  listPointsClesTronc,
} from '@/features/referentiel/troncs-communs/api';
import {
  getRapportPourSeance,
  creerOuRecupererRapport,
  getAppelExistant,
  enregistrerAppel,
  getPointsAbordesExistants,
  enregistrerPointsAbordes,
} from '../api';

// Une spécialité concernée par le rapport, avec son niveau déduit (ou
// null si non déductible — cas rare, ex. semestre non reconnu). Pour une
// UE simple, un seul élément ; pour un tronc commun, un par spécialité du
// groupe (chacune gardant sa propre offre/semestre).
interface GroupeCible {
  specialiteId: string;
  specialiteNom: string;
  niveau: string | null;
}

interface RapportSeanceFormProps {
  seanceId: string;
  ueId: string | null;
  troncCommunId: string | null;
  specialiteId: string | null;
  specialiteNom: string | null;
  typeCursus: TypeCursus | null;
  semestre: string | null;
  enseignantMatricule: string;
  titre?: string;
  sousTitre?: string;
}

const NIVEAUX_PAR_DEFAUT = ['Niveau 1', 'Niveau 2', 'Niveau 3'];

// Rapport de séance (Scénario 13) — appel des étudiants, points abordés
// durant le cours et cahier de texte. Pour un tronc commun, les étudiants
// de TOUTES les spécialités concernées sont réunis automatiquement, et
// les points clés/le syllabus viennent du groupe (pas d'une UE isolée).
export default function RapportSeanceForm({
  seanceId,
  ueId,
  troncCommunId,
  specialiteId,
  specialiteNom,
  typeCursus,
  semestre,
  enseignantMatricule,
  titre = 'Rapport de séance',
  sousTitre = 'Appel, points abordés et cahier de texte, à faire à chaque cours.',
}: RapportSeanceFormProps) {
  const [groupes, setGroupes] = useState<GroupeCible[] | null>(null);
  const [niveauManuel, setNiveauManuel] = useState('');

  const [rapportId, setRapportId] = useState<string | null>(null);

  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [presences, setPresences] = useState<Record<string, boolean>>({});
  const [chargementEtudiants, setChargementEtudiants] = useState(false);

  const [pointsCles, setPointsCles] = useState<PointCle[]>([]);
  const [pointsAbordes, setPointsAbordes] = useState<Record<string, boolean>>(
    {}
  );

  const [cahierTexteNom, setCahierTexteNom] = useState<string | null>(null);
  const [fichierCahier, setFichierCahier] = useState<File | null>(null);

  const [enregistrement, setEnregistrement] = useState(false);
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Les groupes (spécialité + niveau déduit) et les points clés viennent
  // soit du tronc commun (partagés par tout le groupe), soit de l'UE
  // seule — selon le cas.
  useEffect(() => {
    async function initialiser() {
      if (troncCommunId) {
        const groupesTronc = await getGroupesSpecialitesTronc(troncCommunId);
        setGroupes(
          groupesTronc.map((g) => ({
            specialiteId: g.specialiteId,
            specialiteNom: g.specialiteNom,
            niveau: g.semestre ? niveauDeSemestre(g.typeCursus, g.semestre) : null,
          }))
        );
        listPointsClesTronc(troncCommunId).then(setPointsCles);
      } else if (ueId && specialiteId && specialiteNom && typeCursus && semestre) {
        setGroupes([
          {
            specialiteId,
            specialiteNom,
            niveau: niveauDeSemestre(typeCursus, semestre),
          },
        ]);
        listPointsCles(ueId).then(setPointsCles);
      } else {
        setGroupes([]);
      }
    }
    initialiser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seanceId, ueId, troncCommunId]);

  // Rapport déjà commencé pour cette séance, s'il existe.
  useEffect(() => {
    getRapportPourSeance(seanceId).then(async (r) => {
      if (r) {
        setRapportId(r.id);
        setNiveauManuel(r.niveau);
        setCahierTexteNom(r.cahierTexteNom);
        const abordes = await getPointsAbordesExistants(r.id);
        setPointsAbordes(
          Object.fromEntries(Array.from(abordes).map((id) => [id, true]))
        );
      }
    });
  }, [seanceId]);

  // Aucun niveau déductible sur aucun groupe (rare) : secours manuel,
  // appliqué à toutes les spécialités concernées.
  const toutesResolues = groupes?.every((g) => g.niveau) ?? false;
  const groupesEffectifs: GroupeCible[] | null = groupes
    ? toutesResolues
      ? groupes
      : groupes.map((g) => ({ ...g, niveau: g.niveau ?? (niveauManuel || null) }))
    : null;
  const pretAFaireAppel =
    groupesEffectifs !== null &&
    groupesEffectifs.length > 0 &&
    groupesEffectifs.every((g) => g.niveau);

  // Union des étudiants de toutes les spécialités concernées, dès que
  // chaque groupe a un niveau connu.
  useEffect(() => {
    if (!pretAFaireAppel || !groupesEffectifs) return;
    setChargementEtudiants(true);
    Promise.all(
      groupesEffectifs.map((g) => listEtudiants(g.specialiteId, g.niveau!))
    )
      .then(async (listes) => {
        const fusion = new Map<string, Etudiant>();
        for (const liste of listes) for (const e of liste) fusion.set(e.id, e);
        const tousEtudiants = Array.from(fusion.values());
        setEtudiants(tousEtudiants);

        const appelExistant = rapportId
          ? await getAppelExistant(rapportId)
          : {};
        const initial: Record<string, boolean> = {};
        for (const e of tousEtudiants)
          initial[e.id] = appelExistant[e.id] ?? true;
        setPresences(initial);
      })
      .finally(() => setChargementEtudiants(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pretAFaireAppel, JSON.stringify(groupesEffectifs)]);

  function togglePresence(id: string) {
    setPresences((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function togglePointAborde(id: string) {
    setPointsAbordes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleEnregistrer() {
    if (!pretAFaireAppel || !groupesEffectifs) {
      setErreur('Choisis le niveau de la classe.');
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);
    try {
      // Un seul champ "niveau" en base : on y met la liste dédupliquée des
      // niveaux réellement concernés (généralement un seul, même pour un
      // tronc commun — les spécialités regroupées sont en pratique au
      // même niveau).
      const niveauEnregistre = Array.from(
        new Set(groupesEffectifs.map((g) => g.niveau).filter(Boolean))
      ).join(', ');

      const id = await creerOuRecupererRapport(
        seanceId,
        enseignantMatricule,
        niveauEnregistre
      );
      setRapportId(id);

      await enregistrerAppel(
        id,
        etudiants.map((e) => ({
          etudiantId: e.id,
          present: presences[e.id] ?? true,
        }))
      );

      await enregistrerPointsAbordes(
        id,
        Object.entries(pointsAbordes)
          .filter(([, coche]) => coche)
          .map(([pointId]) => pointId)
      );

      if (fichierCahier) {
        const { nom } = await televerserFichier(
          'cahier-texte',
          id,
          fichierCahier
        );
        setCahierTexteNom(nom);
        setFichierCahier(null);
      }

      setSucces(true);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      );
    } finally {
      setEnregistrement(false);
    }
  }

  if (groupes === null) {
    return (
      <div className="bg-white rounded-[20px] p-6 flex items-center justify-center py-10 text-gray-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] p-6">
      <p className="font-extrabold text-gray-900 mb-1">{titre}</p>
      <p className="text-xs text-gray-400 mb-4">{sousTitre}</p>

      {groupes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <GraduationCap size={14} className="text-gray-400 shrink-0" />
          {groupes.map((g) => (
            <span
              key={g.specialiteId}
              className="text-xs font-bold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full"
            >
              {g.specialiteNom}
            </span>
          ))}
        </div>
      )}

      {toutesResolues ? (
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3.5 py-2.5 mb-4">
          <Layers size={14} className="text-gray-400 shrink-0" />
          <p className="text-sm font-semibold text-gray-700">
            {groupes.length > 1 ? 'Niveaux' : 'Niveau'} :{' '}
            <span className="font-bold">
              {Array.from(new Set(groupes.map((g) => g.niveau))).join(', ')}
            </span>{' '}
            <span className="text-xs text-gray-400 font-normal">
              (déduit du semestre)
            </span>
          </p>
        </div>
      ) : (
        <>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Niveau de la classe{' '}
            <span className="text-gray-300 font-normal">
              (non déductible automatiquement)
            </span>
          </label>
          <select
            value={niveauManuel}
            onChange={(e) => setNiveauManuel(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none mb-4"
          >
            <option value="">Choisir...</option>
            {NIVEAUX_PAR_DEFAUT.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </>
      )}

      {pretAFaireAppel && (
        <>
          <div className="mb-4">
            <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
              <ListChecks size={13} className="text-red-600" />
              Points abordés durant le cours
            </label>
            {pointsCles.length === 0 ? (
              <p className="text-xs text-gray-400">
                Aucun point clé défini.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {pointsCles.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-start gap-2.5 py-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={pointsAbordes[p.id] ?? false}
                      onChange={() => togglePointAborde(p.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-sm text-gray-700">{p.libelle}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Appel{' '}
            {groupes.length > 1 && (
              <span className="text-gray-300 font-normal">
                (toutes spécialités confondues)
              </span>
            )}
          </label>
          {chargementEtudiants ? (
            <div className="flex items-center justify-center py-6 text-gray-300">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : etudiants.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">
              Aucun étudiant enregistré pour ce niveau — demande à l'admin de
              les ajouter (Référentiel → Étudiants).
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 mb-4 max-h-64 overflow-y-auto -mx-1 px-1">
              {etudiants.map((e) => {
                const present = presences[e.id] ?? true;
                return (
                  <label
                    key={e.id}
                    className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={() => togglePresence(e.id)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-semibold text-gray-800 flex-1 truncate">
                      {e.nom_complet}
                    </span>
                    <span
                      className={`text-xs font-bold shrink-0 ${
                        present ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {present ? 'Présent' : 'Absent'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Cahier de texte (photo ou vidéo)
          </label>
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-red-300 mb-4">
            <Camera size={18} className="text-gray-400 shrink-0" />
            <span className="text-sm font-bold text-gray-500 truncate">
              {fichierCahier?.name ?? cahierTexteNom ?? 'Choisir un fichier'}
            </span>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFichierCahier(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>

          <button
            onClick={handleEnregistrer}
            disabled={enregistrement}
            className="w-full flex items-center justify-center gap-2 bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {enregistrement && <Loader2 size={15} className="animate-spin" />}
            Enregistrer le rapport
          </button>

          {succes && (
            <p className="text-xs font-semibold text-green-600 mt-3 text-center">
              Rapport enregistré.
            </p>
          )}
          {erreur && (
            <p className="text-xs font-semibold text-red-600 mt-3 text-center">
              {erreur}
            </p>
          )}
        </>
      )}
    </div>
  );
}