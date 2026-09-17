// src/features/seances/components/RapportSeanceForm.tsx
import { useEffect, useState } from 'react';
import { Loader2, ListChecks, Layers, GraduationCap, X, Plus } from 'lucide-react';
import type { TypeCursus } from '@/types';
import { televerserFichier, urlPubliqueR2 } from '@/lib/r2';
import { processSyncQueue } from '@/lib/sync';
import {
  listEtudiants,
  lireEtudiantsDepuisCache,
  type Etudiant,
} from '@/features/referentiel/etudiants/api';
import { listPointsCles, type PointCle } from '@/features/referentiel/ues/api';
import {
  getGroupesSpecialitesTronc,
  listPointsClesTronc,
} from '@/features/referentiel/troncs-communs/api';
import {
  getRapportPourSeance,
  getAppelExistant,
  getPointsAbordesExistants,
  enregistrerRapportEnFile,
  retirerImageCahierTexte,
} from '../api';

// Une spécialité concernée par le rapport, avec son semestre — TOUJOURS
// connu directement depuis l'offre de la séance, plus besoin de le
// déduire ni de le demander à l'enseignant (avant : un "niveau" dérivé
// du semestre, avec un repli manuel si la déduction échouait — plus
// nécessaire, le semestre est une donnée déjà présente, jamais à
// deviner). Pour une UE simple, un seul élément ; pour un tronc commun,
// un par spécialité du groupe (chacune gardant son propre semestre).
interface GroupeCible {
  specialiteId: string;
  specialiteNom: string;
  semestre: string;
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

  const [rapportId, setRapportId] = useState<string | null>(null);

  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [presences, setPresences] = useState<Record<string, boolean>>({});
  const [chargementEtudiants, setChargementEtudiants] = useState(false);

  const [pointsCles, setPointsCles] = useState<PointCle[]>([]);
  const [pointsAbordes, setPointsAbordes] = useState<Record<string, boolean>>(
    {}
  );

  const [imagesExistantes, setImagesExistantes] = useState<
    { key: string; nom: string }[]
  >([]);
  const [nouvellesPhotos, setNouvellesPhotos] = useState<File[]>([]);
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null);

  const [enregistrement, setEnregistrement] = useState(false);
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Brouillon local du rapport — clé de secours pour survivre à un
  // rechargement de page hors ligne, AVANT même le premier clic sur
  // "Enregistrer" (ex: l'enseignant coche des présences, la page se
  // recharge par accident, la connexion n'est pas revenue). Contient
  // aussi l'id du rapport, généré côté client dès le départ.
  const cleBrouillon = `rapport-brouillon:${seanceId}`;
  function lireBrouillon(): {
    rapportId: string;
    presences: Record<string, boolean>;
    pointsAbordes: Record<string, boolean>;
  } | null {
    try {
      const brut = localStorage.getItem(cleBrouillon);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  }
  function ecrireBrouillon(patch: {
    rapportId: string;
    presences?: Record<string, boolean>;
    pointsAbordes?: Record<string, boolean>;
  }) {
    try {
      const actuel = lireBrouillon();
      localStorage.setItem(
        cleBrouillon,
        JSON.stringify({
          rapportId: patch.rapportId,
          presences: patch.presences ?? actuel?.presences ?? {},
          pointsAbordes: patch.pointsAbordes ?? actuel?.pointsAbordes ?? {},
        })
      );
    } catch {
      // Pas grave — pire cas, le brouillon local n'est pas mis à jour,
      // mais la file de synchronisation (db.syncQueue), elle, contient
      // toujours l'écriture réelle une fois "Enregistrer" cliqué.
    }
  }

  // Les groupes (spécialité + niveau déduit) et les points clés viennent
  // soit du tronc commun (partagés par tout le groupe), soit de l'UE
  // seule — selon le cas.
  useEffect(() => {
    async function initialiser() {
      if (troncCommunId) {
        const groupesTronc = await getGroupesSpecialitesTronc(troncCommunId);
        setGroupes(
          groupesTronc
            .filter((g) => !!g.semestre)
            .map((g) => ({
              specialiteId: g.specialiteId,
              specialiteNom: g.specialiteNom,
              semestre: g.semestre as string,
            }))
        );
        listPointsClesTronc(troncCommunId).then(setPointsCles);
      } else if (ueId && specialiteId && specialiteNom && semestre) {
        setGroupes([{ specialiteId, specialiteNom, semestre }]);
        listPointsCles(ueId).then(setPointsCles);
      } else {
        setGroupes([]);
      }
    }
    initialiser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seanceId, ueId, troncCommunId]);

  // Rapport déjà commencé pour cette séance : brouillon local d'abord
  // (instantané, fonctionne hors ligne), réseau ensuite pour compléter
  // (photos déjà envoyées — ça, ça ne peut venir que du serveur). Si
  // rien nulle part, on génère un nouvel id CÔTÉ CLIENT
  // (crypto.randomUUID()) — pas besoin d'un aller-retour réseau pour en
  // obtenir un, et le même id sert directement à l'écriture finale, en
  // ligne comme hors ligne.
  useEffect(() => {
    let annule = false;

    async function initialiserRapport() {
      const brouillon = lireBrouillon();
      if (brouillon) {
        if (!annule) {
          setRapportId(brouillon.rapportId);
          setPointsAbordes(brouillon.pointsAbordes);
        }
      }

      if (navigator.onLine) {
        try {
          const r = await getRapportPourSeance(seanceId);
          if (annule) return;
          if (r) {
            // Un rapport existe déjà côté serveur (créé ici même
            // précédemment, ou depuis un autre appareil) — on garde SON
            // id comme référence, et on complète avec ce que le brouillon
            // local n'a pas (les photos, notamment, qui n'existent que
            // côté serveur une fois vraiment envoyées).
            setRapportId(r.id);
            setImagesExistantes(
              r.cahierTexteKeys.map((key, i) => ({
                key,
                nom: r.cahierTexteNoms[i] ?? key,
              }))
            );
            const abordes = await getPointsAbordesExistants(r.id);
            if (!annule && !brouillon) {
              setPointsAbordes(
                Object.fromEntries(Array.from(abordes).map((id) => [id, true]))
              );
            }
            return;
          }
        } catch {
          // Réseau indisponible au moment de l'appel — pas grave, on
          // continue avec le brouillon local (ou un nouvel id ci-dessous).
        }
      }

      if (!brouillon && !annule) {
        setRapportId(crypto.randomUUID());
      }
    }

    initialiserRapport();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seanceId]);

  // Le semestre de chaque groupe est TOUJOURS connu directement (offre
  // de la séance) — plus de déduction ni de repli manuel à gérer, donc
  // plus de cas "aucun niveau déductible" à traiter. Prêt dès que la
  // liste des groupes est chargée et non vide.
  const groupesEffectifs = groupes;
  const pretAFaireAppel =
    groupesEffectifs !== null && groupesEffectifs.length > 0;

  // Union des étudiants de toutes les spécialités concernées, dès que
  // les groupes (et leur semestre) sont connus. Cache local d'abord
  // (affichage instantané, ça marche même en salle de classe avec un
  // mauvais signal), réseau ensuite pour confirmer/rafraîchir — même
  // pattern stale-while-revalidate que le reste de l'app (MesCoursPage,
  // MesUEsPage...), qui manquait ici.
  useEffect(() => {
    if (!pretAFaireAppel || !groupesEffectifs) return;
    let annule = false;
    setChargementEtudiants(true);

    async function initialiserPresences(tousEtudiants: Etudiant[]) {
      // Le brouillon local (déjà coché par l'enseignant, potentiellement
      // hors ligne) prime sur l'appel réseau — sinon un rechargement de
      // page hors ligne perdrait les présences déjà cochées.
      const brouillon = lireBrouillon();
      if (brouillon && Object.keys(brouillon.presences).length > 0) {
        if (!annule) setPresences(brouillon.presences);
        return;
      }
      const appelExistant =
        rapportId && navigator.onLine ? await getAppelExistant(rapportId) : {};
      if (annule) return;
      const initial: Record<string, boolean> = {};
      for (const e of tousEtudiants)
        initial[e.id] = appelExistant[e.id] ?? true;
      setPresences(initial);
    }

    async function charger() {
      // 1. Cache local d'abord.
      try {
        const listesLocales = await Promise.all(
          groupesEffectifs!.map((g) =>
            lireEtudiantsDepuisCache(g.specialiteId, g.semestre)
          )
        );
        const fusionLocale = new Map<string, Etudiant>();
        for (const liste of listesLocales)
          for (const e of liste) fusionLocale.set(e.id, e);
        const etudiantsLocaux = Array.from(fusionLocale.values());
        if (!annule && etudiantsLocaux.length > 0) {
          setEtudiants(etudiantsLocaux);
          await initialiserPresences(etudiantsLocaux);
        }
      } catch {
        // Pas grave, on retombe sur le réseau ci-dessous.
      }

      // 2. Réseau ensuite, pour confirmer/rafraîchir.
      if (!navigator.onLine) {
        if (!annule) setChargementEtudiants(false);
        return;
      }
      try {
        const listes = await Promise.all(
          groupesEffectifs!.map((g) => listEtudiants(g.specialiteId, g.semestre))
        );
        const fusion = new Map<string, Etudiant>();
        for (const liste of listes) for (const e of liste) fusion.set(e.id, e);
        const tousEtudiants = Array.from(fusion.values());
        if (!annule) {
          setEtudiants(tousEtudiants);
          await initialiserPresences(tousEtudiants);
        }
      } finally {
        if (!annule) setChargementEtudiants(false);
      }
    }

    charger();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pretAFaireAppel, JSON.stringify(groupesEffectifs)]);

  function togglePresence(id: string) {
    setPresences((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function togglePointAborde(id: string) {
    setPointsAbordes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const MAX_PHOTOS = 5;
  const totalPhotos = imagesExistantes.length + nouvellesPhotos.length;

  function handleAjouterPhotos(fichiers: FileList | null) {
    if (!fichiers) return;
    setErreurPhotos(null);
    const aAjouter = Array.from(fichiers);
    const placesRestantes = MAX_PHOTOS - totalPhotos;
    if (aAjouter.length > placesRestantes) {
      setErreurPhotos(
        `Maximum ${MAX_PHOTOS} photos — ${placesRestantes > 0 ? `il ne reste que ${placesRestantes} place${placesRestantes > 1 ? 's' : ''}` : 'la limite est déjà atteinte'}.`
      );
    }
    setNouvellesPhotos((prev) => [
      ...prev,
      ...aAjouter.slice(0, placesRestantes),
    ]);
  }

  function retirerNouvellePhoto(index: number) {
    setNouvellesPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function retirerPhotoExistante(index: number) {
    if (!rapportId) return;
    try {
      await retirerImageCahierTexte(rapportId, index + 1);
      setImagesExistantes((prev) => prev.filter((_, i) => i !== index));
    } catch (err) {
      setErreurPhotos(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    }
  }

  async function handleEnregistrer() {
    if (!pretAFaireAppel || !groupesEffectifs || !rapportId) {
      setErreur('Impossible de déterminer le semestre de cette séance.');
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);
    setErreurPhotos(null);
    try {
      // Un seul champ "niveau" en base (nom de colonne historique) : on y
      // met désormais la liste dédupliquée des SEMESTRES réellement
      // concernés (généralement un seul, même pour un tronc commun — les
      // spécialités regroupées sont en pratique sur le même semestre).
      // Toujours connu directement, jamais saisi par l'enseignant.
      const semestresEnregistres = Array.from(
        new Set(groupesEffectifs.map((g) => g.semestre))
      ).join(', ');

      const presencesAEnvoyer = etudiants.map((e) => ({
        etudiantId: e.id,
        present: presences[e.id] ?? true,
      }));
      const pointIdsAEnvoyer = Object.entries(pointsAbordes)
        .filter(([, coche]) => coche)
        .map(([pointId]) => pointId);

      // Écriture TOUJOURS en file d'attente locale — jamais d'attente
      // réseau, jamais d'échec sec. Résout dès que c'est écrit
      // localement (db.syncQueue), que le réseau soit là ou pas ; la
      // synchronisation réelle se fait en tâche de fond.
      await enregistrerRapportEnFile({
        rapportId,
        seanceId,
        enseignantMatricule,
        niveau: semestresEnregistres,
        presences: presencesAEnvoyer,
        pointIds: pointIdsAEnvoyer,
      });

      // Brouillon local mis à jour avec ce qui vient d'être "enregistré"
      // — survit à un rechargement de page même hors ligne, tant que la
      // synchronisation réelle n'a pas encore eu lieu.
      ecrireBrouillon({
        rapportId,
        presences,
        pointsAbordes,
      });

      setSucces(true);

      // L'envoi des photos reste séparé et isolé : un échec ici (le cas
      // le plus fragile — fichiers volumineux, sensible à une connexion
      // faible) ne remet plus en cause le succès de l'appel et des points
      // abordés, déjà enregistrés ci-dessus.
      if (nouvellesPhotos.length > 0) {
        if (!navigator.onLine) {
          // Pas la peine de tenter : ni le rapport (encore en file), ni
          // les photos, ne peuvent atteindre le serveur sans réseau.
          setErreurPhotos(
            `Rapport enregistré localement. ${nouvellesPhotos.length} photo${
              nouvellesPhotos.length > 1 ? 's' : ''
            } à envoyer dès le retour de la connexion — reviens sur cet écran à ce moment-là.`
          );
        } else {
          // Attend que le rapport soit VRAIMENT arrivé côté serveur avant
          // de tenter l'envoi des photos — sinon la fonction Edge qui
          // signe l'URL d'upload (elle vérifie que ce rapport existe et
          // appartient à cet enseignant) le refuse, puisque l'écriture du
          // rapport ci-dessus part en tâche de fond et peut ne pas encore
          // avoir abouti au moment où l'upload démarre. C'était la cause
          // de l'essentiel des échecs de photos.
          await processSyncQueue().catch(() => {});

          const photosEnEchec: File[] = [];
          const nouvellesEntrees: { key: string; nom: string }[] = [];
          // En série (pas en parallèle) — plusieurs photos envoyées en
          // même temps se partagent la même bande passante limitée, ce
          // qui augmente le risque de timeout sur une connexion faible
          // plutôt que de le réduire.
          for (const photo of nouvellesPhotos) {
            try {
              const entree = await televerserFichier(
                'cahier-texte',
                rapportId,
                photo
              );
              nouvellesEntrees.push(entree);
            } catch {
              photosEnEchec.push(photo);
            }
          }
          if (nouvellesEntrees.length > 0) {
            setImagesExistantes((prev) => [...prev, ...nouvellesEntrees]);
          }
          // Seules les photos en échec restent à renvoyer — pas besoin
          // de tout recommencer.
          setNouvellesPhotos(photosEnEchec);
          if (photosEnEchec.length > 0) {
            setErreurPhotos(
              `Rapport enregistré. ${photosEnEchec.length} photo${
                photosEnEchec.length > 1 ? 's' : ''
              } sur ${nouvellesPhotos.length} n'a/ont pas pu être envoyée${
                photosEnEchec.length > 1 ? 's' : ''
              } (connexion faible) — réessaie l'envoi un peu plus tard.`
            );
          }
        }
      }
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

      {groupes.length > 0 && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3.5 py-2.5 mb-4">
          <Layers size={14} className="text-gray-400 shrink-0" />
          <p className="text-sm font-semibold text-gray-700">
            {groupes.length > 1 ? 'Semestres' : 'Semestre'} :{' '}
            <span className="font-bold">
              {Array.from(new Set(groupes.map((g) => g.semestre))).join(', ')}
            </span>
          </p>
        </div>
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
              Aucun étudiant enregistré pour ce semestre — demande à l'admin de
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
            Cahier de texte — photos ({totalPhotos}/{MAX_PHOTOS})
          </label>

          {(imagesExistantes.length > 0 || nouvellesPhotos.length > 0) && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {imagesExistantes.map((img, i) => (
                <div key={img.key} className="relative aspect-square">
                  <img
                    src={urlPubliqueR2(img.key)}
                    alt={img.nom}
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => retirerPhotoExistante(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {nouvellesPhotos.map((f, i) => (
                <div key={i} className="relative aspect-square">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="w-full h-full object-cover rounded-xl opacity-80"
                  />
                  <button
                    type="button"
                    onClick={() => retirerNouvellePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalPhotos < MAX_PHOTOS && (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 cursor-pointer hover:border-red-300 mb-1">
              <Plus size={16} className="text-gray-400 shrink-0" />
              <span className="text-sm font-bold text-gray-500">
                Ajouter des photos
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleAjouterPhotos(e.target.files)}
                className="hidden"
              />
            </label>
          )}
          {erreurPhotos && (
            <p className="text-xs font-semibold text-red-600 mb-3">
              {erreurPhotos}
            </p>
          )}
          <div className="mb-4" />

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
              Rapport enregistré — synchronisé automatiquement dès que la
              connexion est disponible.
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