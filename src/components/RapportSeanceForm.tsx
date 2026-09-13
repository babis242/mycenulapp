// src/features/seances/components/RapportSeanceForm.tsx
import { useEffect, useState } from 'react';
import { Loader2, Camera, ListChecks } from 'lucide-react';
import { NIVEAUX_PAR_CYCLE } from '@/constants/enums';
import type { Cycle } from '@/types';
import { televerserFichier } from '@/lib/r2';
import {
  listEtudiants,
  type Etudiant,
} from '@/features/referentiel/etudiants/api';
import { listPointsCles, type PointCle } from '@/features/referentiel/ues/api';
import {
  getRapportPourSeance,
  creerOuRecupererRapport,
  getAppelExistant,
  enregistrerAppel,
  getPointsAbordesExistants,
  enregistrerPointsAbordes,
} from '../api';

// Filet de sécurité si le cycle de la spécialité ne correspond à aucune
// clé connue — même principe que EtudiantsPage.
const NIVEAUX_PAR_DEFAUT = ['Niveau 1', 'Niveau 2', 'Niveau 3'];

interface RapportSeanceFormProps {
  seanceId: string;
  ueId: string | null;
  specialiteId: string | null;
  cycle: string | null;
  enseignantMatricule: string;
  // Un titre différent selon qui remplit (enseignant vs personnel) —
  // le reste du formulaire est identique.
  titre?: string;
  sousTitre?: string;
}

// Rapport de séance (Scénario 13) — appel des étudiants, points abordés
// durant le cours (parmi les points clés de l'UE) et cahier de texte.
// Utilisé tel quel par l'enseignant (Ma séance) et par le personnel
// (Saisie manuelle), qui peut le remplir à la place d'un enseignant
// n'ayant pas pu ouvrir sa séance.
export default function RapportSeanceForm({
  seanceId,
  ueId,
  specialiteId,
  cycle,
  enseignantMatricule,
  titre = 'Rapport de séance',
  sousTitre = 'Appel, points abordés et cahier de texte, à faire à chaque cours.',
}: RapportSeanceFormProps) {
  const [niveau, setNiveau] = useState('');
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

  const niveaux = cycle
    ? (NIVEAUX_PAR_CYCLE[cycle as Cycle] ?? NIVEAUX_PAR_DEFAUT)
    : NIVEAUX_PAR_DEFAUT;

  // Rapport déjà commencé pour cette séance, s'il existe, + points clés
  // de l'UE (indépendants du niveau, chargés dès le départ).
  useEffect(() => {
    getRapportPourSeance(seanceId).then(async (r) => {
      if (r) {
        setRapportId(r.id);
        setNiveau(r.niveau);
        setCahierTexteNom(r.cahierTexteNom);
        const abordes = await getPointsAbordesExistants(r.id);
        setPointsAbordes(
          Object.fromEntries(Array.from(abordes).map((id) => [id, true]))
        );
      }
    });
    if (ueId) {
      listPointsCles(ueId).then(setPointsCles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seanceId, ueId]);

  // Liste des étudiants + appel déjà saisi, dès qu'un niveau est choisi.
  useEffect(() => {
    if (!niveau || !specialiteId) return;
    setChargementEtudiants(true);
    listEtudiants(specialiteId, niveau)
      .then(async (liste) => {
        setEtudiants(liste);
        const appelExistant = rapportId
          ? await getAppelExistant(rapportId)
          : {};
        const initial: Record<string, boolean> = {};
        for (const e of liste) initial[e.id] = appelExistant[e.id] ?? true;
        setPresences(initial);
      })
      .finally(() => setChargementEtudiants(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveau, specialiteId]);

  function togglePresence(id: string) {
    setPresences((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function togglePointAborde(id: string) {
    setPointsAbordes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleEnregistrer() {
    if (!niveau) {
      setErreur('Choisis le niveau de la classe.');
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);
    try {
      const id = await creerOuRecupererRapport(
        seanceId,
        enseignantMatricule,
        niveau
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

  return (
    <div className="bg-white rounded-[20px] p-6">
      <p className="font-extrabold text-gray-900 mb-1">{titre}</p>
      <p className="text-xs text-gray-400 mb-4">{sousTitre}</p>

      <label className="text-xs font-bold text-gray-500 mb-1.5 block">
        Niveau de la classe
      </label>
      <select
        value={niveau}
        onChange={(e) => setNiveau(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none mb-4"
      >
        <option value="">Choisir...</option>
        {niveaux.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      {niveau && (
        <>
          {ueId && (
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                <ListChecks size={13} className="text-red-600" />
                Points abordés durant le cours
              </label>
              {pointsCles.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Aucun point clé défini pour cette UE.
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
                      <span className="text-sm text-gray-700">
                        {p.libelle}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Appel
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