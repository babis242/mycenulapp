// src/features/emploi-du-temps/pages/GenererEDTPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  WifiOff,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { JOURS, CRENEAUX, SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCyclesDisponibles,
  listSpecialitesDuCycleSemestre,
  getSeancesGroupees,
  trouverOuCreerEmploi,
  assignerSeance,
  supprimerSeance,
  listOffresDeSpecialite,
  getEnseignantsDisponibles,
  getSalleParDefautSpecialite,
  listToutesLesSalles,
  getHeuresEffectuees,
  getHeuresEffectueesTronc,
  type CycleOption,
  type SpecialiteGroupe,
  type SeanceGroupee,
  type OffreDeSpecialite,
  type EnseignantDisponible,
} from '../api';

interface Salle {
  id: string;
  code_salle: string;
  capacite: number;
}

function lundiDeLaSemaine(): string {
  const d = new Date();
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ModalCellule {
  specialiteId: string;
  jour: string;
  creneau: string;
  seanceIdExistante: string | null;
  offreId: string;
  salleId: string;
}

// "set" pour remplir/modifier une case, "delete" pour en retirer une
// déjà confirmée. specialiteId sert à retrouver/créer le bon emploi du
// temps de cette spécialité à l'enregistrement (une UE de tronc commun
// se propage quand même à tout son groupe, peu importe cette valeur).
type ChangementCellule =
  | {
      action: 'set';
      specialiteId: string;
      jour: string;
      creneau: string;
      offreId: string;
      enseignantId: string;
      salleId: string | null;
      seanceIdExistante: string | null;
      estTronc: boolean;
      troncCommunId?: string;
      troncNom?: string;
    }
  | {
      action: 'delete';
      seanceId: string;
      jour: string;
      creneau: string;
      specialiteId: string;
    };

// Applique un changement local à la liste groupée — sert à la fois pour
// l'affichage optimiste immédiat et pour rejouer un brouillon retrouvé
// dans le navigateur au rechargement de la page.
function appliquerChangement(
  liste: SeanceGroupee[],
  c: ChangementCellule,
  offres: OffreDeSpecialite[],
  salles: Salle[],
  specialitesParTronc: Map<string, Set<string>>
): SeanceGroupee[] {
  if (c.action === 'delete') {
    return liste.filter((s) => s.id !== c.seanceId);
  }
  const offre = offres.find((o) => o.offreId === c.offreId);
  const salle = c.salleId ? salles.find((s) => s.id === c.salleId) : null;

  if (c.estTronc && c.troncCommunId) {
    // Une seule entité partagée : on retire l'ancienne occurrence de la
    // même case pour ce tronc commun (si déjà présente), puis on ajoute
    // la nouvelle.
    const sansAncienne = liste.filter(
      (s) =>
        !(
          s.troncCommunId === c.troncCommunId &&
          s.jour === c.jour &&
          s.creneau === c.creneau
        )
    );
    const nouvelle: SeanceGroupee = {
      id: c.seanceIdExistante ?? `local-tronc-${c.troncCommunId}-${c.jour}-${c.creneau}`,
      offreId: null,
      troncCommunId: c.troncCommunId,
      specialiteId: null,
      ueNom: c.troncNom ?? offre?.ueNom ?? '',
      volumeHoraire: null,
      semestre: null,
      enseignantNom: offre?.enseignantAttribueNom ?? '',
      salleCode: salle?.code_salle ?? null,
      salleId: c.salleId,
      jour: c.jour,
      creneau: c.creneau,
      statut: 'ok',
    };
    return [...sansAncienne, nouvelle];
  }

  const nouvelle: SeanceGroupee = {
    id:
      c.seanceIdExistante ??
      `local-${c.specialiteId}-${c.jour}-${c.creneau}-${c.offreId}`,
    offreId: c.offreId,
    troncCommunId: null,
    specialiteId: c.specialiteId,
    ueNom: offre?.ueNom ?? '',
    volumeHoraire: offre?.volumeHoraire ?? null,
    semestre: null,
    enseignantNom: offre?.enseignantAttribueNom ?? '',
    salleCode: salle?.code_salle ?? null,
    salleId: c.salleId,
    jour: c.jour,
    creneau: c.creneau,
    statut: 'ok',
  };
  const sansAncienne = c.seanceIdExistante
    ? liste.filter((s) => s.id !== c.seanceIdExistante)
    : liste;
  void specialitesParTronc;
  return [...sansAncienne, nouvelle];
}

// Écran Scénario 5 (refonte) — Construction manuelle groupée de l'EDT :
// on choisit un cycle + un semestre + une semaine, et on confectionne
// d'un coup les emplois de TOUTES les spécialités concernées (même dans
// des écoles/filières différentes — un tronc commun peut les regrouper).
// 100% local pendant la confection (brouillon dans le navigateur),
// envoyé en base d'un coup au clic sur "Enregistrer".
export default function GenererEDTPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const enLigne = useOnlineStatus();

  const perimetreIds =
    user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [semestre, setSemestre] = useState('');
  const [semaine, setSemaine] = useState(lundiDeLaSemaine());

  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const [specialiteAffichee, setSpecialiteAffichee] = useState('');

  const [seances, setSeances] = useState<SeanceGroupee[]>([]);
  const [heuresEffectuees, setHeuresEffectuees] = useState<
    Map<string, number>
  >(new Map());
  const [specialitesParTronc, setSpecialitesParTronc] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [ueVersTronc, setUeVersTronc] = useState<
    Map<string, { troncCommunId: string; nom: string }>
  >(new Map());
  const [emploiParSpecialite, setEmploiParSpecialite] = useState<
    Map<string, string>
  >(new Map());

  const [toutesSalles, setToutesSalles] = useState<Salle[]>([]);
  const [offresParSpecialite, setOffresParSpecialite] = useState<
    Map<string, OffreDeSpecialite[]>
  >(new Map());
  const [salleParDefautParSpecialite, setSalleParDefautParSpecialite] =
    useState<Map<string, Salle | null>>(new Map());

  const [changements, setChangements] = useState<ChangementCellule[]>([]);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [selectionValidationOuverte, setSelectionValidationOuverte] =
    useState(false);
  const [specialitesPourValidation, setSpecialitesPourValidation] = useState<
    Set<string>
  >(new Set());

  const [chargement, setChargement] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<string | null>(
    null
  );

  const [modal, setModal] = useState<ModalCellule | null>(null);
  const [enseignantsDispoModal, setEnseignantsDispoModal] = useState<
    EnseignantDisponible[]
  >([]);

  // ── Chargement initial des cycles disponibles (selon périmètre) ──
  useEffect(() => {
    if (!enLigne) return;
    listCyclesDisponibles(perimetreIds).then(setCycles);
    listToutesLesSalles().then(setToutesSalles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne]);

  // ── Spécialités du cycle + semestre choisis ───────────────────────
  useEffect(() => {
    if (!cycleKey || !semestre || !enLigne) {
      setSpecialites([]);
      setSpecialiteAffichee('');
      return;
    }
    const [cycle, sousCycle] = cycleKey.split('::');
    listSpecialitesDuCycleSemestre(
      cycle,
      sousCycle || null,
      semestre,
      perimetreIds
    ).then((liste) => {
      setSpecialites(liste);
      setSpecialiteAffichee((prev) =>
        liste.some((s) => s.id === prev) ? prev : liste[0]?.id ?? ''
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre, enLigne]);

  // ── Chargement du groupe (réactif — pas de bouton "Charger") ──────
  useEffect(() => {
    if (specialites.length === 0 || !semaine || !enLigne) {
      setSeances([]);
      setChangements([]);
      return;
    }
    chargerGroupe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialites, semaine, enLigne]);

  async function chargerGroupe() {
    setChargement(true);
    setErreurChargement(null);
    try {
      const specialiteIds = specialites.map((s) => s.id);
      const donnees = await getSeancesGroupees(specialiteIds, semaine);
      setEmploiParSpecialite(donnees.emploiParSpecialite);
      setSpecialitesParTronc(donnees.specialitesParTronc);
      setUeVersTronc(donnees.ueVersTronc);

      // Rejoue un éventuel brouillon local pas encore envoyé en base.
      const cleDraft = `edt-groupe-brouillon:${cycleKey}:${semestre}:${semaine}`;
      const brut = localStorage.getItem(cleDraft);
      let seancesAffichees = donnees.seances;
      let changementsCharges: ChangementCellule[] = [];
      const offresCache = new Map(offresParSpecialite);
      if (brut) {
        try {
          changementsCharges = JSON.parse(brut);
          // Les offres de chaque spécialité concernée par le brouillon
          // doivent être chargées pour recalculer l'affichage optimiste.
          const specialitesAChager = new Set(
            changementsCharges
              .filter((c) => c.action === 'set')
              .map((c: any) => c.specialiteId as string)
          );
          for (const spId of specialitesAChager) {
            if (!offresCache.has(spId)) {
              offresCache.set(spId, await listOffresDeSpecialite(spId));
            }
          }
          for (const c of changementsCharges) {
            seancesAffichees = appliquerChangement(
              seancesAffichees,
              c,
              offresCache.get((c as any).specialiteId) ?? [],
              toutesSalles,
              donnees.specialitesParTronc
            );
          }
          setOffresParSpecialite(offresCache);
        } catch {
          localStorage.removeItem(cleDraft);
        }
      }
      setSeances(seancesAffichees);
      setChangements(changementsCharges);

      const offreIds = Array.from(
        new Set(
          seancesAffichees
            .filter((s) => s.offreId)
            .map((s) => s.offreId as string)
        )
      );
      const troncIds = Array.from(
        new Set(
          seancesAffichees
            .filter((s) => s.troncCommunId)
            .map((s) => s.troncCommunId as string)
        )
      );
      const [heuresOffres, heuresTroncs] = await Promise.all([
        offreIds.length > 0
          ? getHeuresEffectuees(offreIds, semaine)
          : Promise.resolve(new Map<string, number>()),
        troncIds.length > 0
          ? getHeuresEffectueesTronc(troncIds, semaine)
          : Promise.resolve(new Map<string, number>()),
      ]);
      setHeuresEffectuees(new Map([...heuresOffres, ...heuresTroncs]));
    } catch (err) {
      setErreurChargement(
        err instanceof Error ? err.message : 'Erreur de chargement.'
      );
    } finally {
      setChargement(false);
    }
  }

  // ── Sauvegarde silencieuse du brouillon (rapide, locale) ──────────
  useEffect(() => {
    if (!cycleKey || !semestre || !semaine) return;
    const cleDraft = `edt-groupe-brouillon:${cycleKey}:${semestre}:${semaine}`;
    if (changements.length === 0) {
      localStorage.removeItem(cleDraft);
    } else {
      localStorage.setItem(cleDraft, JSON.stringify(changements));
    }
  }, [changements, cycleKey, semestre, semaine]);

  async function ouvrirModal(
    jour: string,
    creneau: string,
    seanceExistante?: SeanceGroupee
  ) {
    if (!specialiteAffichee) return;
    setModal({
      specialiteId: specialiteAffichee,
      jour,
      creneau,
      seanceIdExistante: seanceExistante?.id ?? null,
      offreId: seanceExistante?.offreId ?? '',
      salleId:
        seanceExistante?.salleId ??
        salleParDefautParSpecialite.get(specialiteAffichee)?.id ??
        '',
    });

    if (!offresParSpecialite.has(specialiteAffichee)) {
      const offres = await listOffresDeSpecialite(specialiteAffichee);
      setOffresParSpecialite((prev) =>
        new Map(prev).set(specialiteAffichee, offres)
      );
    }
    if (!salleParDefautParSpecialite.has(specialiteAffichee)) {
      const defaut = await getSalleParDefautSpecialite(specialiteAffichee);
      setSalleParDefautParSpecialite((prev) =>
        new Map(prev).set(specialiteAffichee, defaut)
      );
    }
    const dispo = await getEnseignantsDisponibles(jour, creneau);
    setEnseignantsDispoModal(dispo);
  }

  function offreChoisie(): OffreDeSpecialite | null {
    if (!modal) return null;
    const offres = offresParSpecialite.get(modal.specialiteId) ?? [];
    return offres.find((o) => o.offreId === modal.offreId) ?? null;
  }

  function handleEnregistrerModal() {
    const offre = offreChoisie();
    if (!modal || !offre?.enseignantAttribueId) return;

    const lienTronc = ueVersTronc.get(offre.ueId);

    const changement: ChangementCellule = lienTronc
      ? {
          action: 'set',
          specialiteId: modal.specialiteId,
          jour: modal.jour,
          creneau: modal.creneau,
          offreId: modal.offreId,
          enseignantId: offre.enseignantAttribueId,
          salleId: modal.salleId || null,
          seanceIdExistante: modal.seanceIdExistante,
          estTronc: true,
          troncCommunId: lienTronc.troncCommunId,
          troncNom: lienTronc.nom,
        }
      : {
          action: 'set',
          specialiteId: modal.specialiteId,
          jour: modal.jour,
          creneau: modal.creneau,
          offreId: modal.offreId,
          enseignantId: offre.enseignantAttribueId,
          salleId: modal.salleId || null,
          seanceIdExistante: modal.seanceIdExistante,
          estTronc: false,
        };

    setSeances((prev) =>
      appliquerChangement(
        prev,
        changement,
        offresParSpecialite.get(modal.specialiteId) ?? [],
        toutesSalles,
        specialitesParTronc
      )
    );

    // Si l'UE choisie est un tronc commun, étend localement le groupe
    // aux spécialités déjà chargées dans cette session (propagation
    // visible immédiatement sur leurs propres grilles).
    if (lienTronc) {
      setSpecialitesParTronc((prev) => {
        const copie = new Map(prev);
        const ensemble = new Set(copie.get(lienTronc.troncCommunId) ?? []);
        ensemble.add(modal.specialiteId);
        copie.set(lienTronc.troncCommunId, ensemble);
        return copie;
      });
    }

    setChangements((prev) => {
      const cleCellule = lienTronc
        ? (c: ChangementCellule) =>
            c.action === 'set' &&
            c.estTronc &&
            c.troncCommunId === lienTronc.troncCommunId &&
            c.jour === modal.jour &&
            c.creneau === modal.creneau
        : (c: ChangementCellule) =>
            c.action === 'set' &&
            !c.estTronc &&
            c.specialiteId === modal.specialiteId &&
            c.jour === modal.jour &&
            c.creneau === modal.creneau;
      return [...prev.filter((c) => !cleCellule(c)), changement];
    });
    setModal(null);
  }

  function handleSupprimer() {
    if (!modal?.seanceIdExistante) return;
    if (!window.confirm('Retirer cette séance ?')) return;

    const idCible = modal.seanceIdExistante;
    const estLocalePasEncoreEnvoyee = idCible.startsWith('local-');
    const specialiteId = modal.specialiteId;

    setChangements((prev) => {
      const sansCelleCi = prev.filter(
        (c) =>
          !(
            c.action === 'set' &&
            c.jour === modal.jour &&
            c.creneau === modal.creneau &&
            ((c.estTronc &&
              seances.find((s) => s.id === idCible)?.troncCommunId ===
                c.troncCommunId) ||
              (!c.estTronc && c.specialiteId === specialiteId))
          )
      );
      return estLocalePasEncoreEnvoyee
        ? sansCelleCi
        : [
            ...sansCelleCi,
            {
              action: 'delete',
              seanceId: idCible,
              jour: modal.jour,
              creneau: modal.creneau,
              specialiteId,
            },
          ];
    });
    setSeances((prev) => prev.filter((s) => s.id !== idCible));
    setModal(null);
  }

  async function handleAllerValidation() {
    if (changements.length === 0) {
      ouvrirSelectionValidation();
      return;
    }
    setEnvoiEnCours(true);
    setErreurChargement(null);
    try {
      const emplois = new Map(emploiParSpecialite);
      for (const c of changements) {
        if (c.action === 'delete') {
          await supprimerSeance(c.seanceId);
          continue;
        }
        let emploiId = emplois.get(c.specialiteId);
        if (!emploiId) {
          emploiId = await trouverOuCreerEmploi(c.specialiteId, semaine);
          emplois.set(c.specialiteId, emploiId);
        }
        await assignerSeance({
          emploiId,
          specialiteId: c.specialiteId,
          semaine,
          seanceIdExistante: c.seanceIdExistante?.startsWith('local-')
            ? null
            : c.seanceIdExistante,
          offreId: c.offreId,
          enseignantId: c.enseignantId,
          salleId: c.salleId,
          jour: c.jour,
          creneau: c.creneau,
        });
      }
      localStorage.removeItem(
        `edt-groupe-brouillon:${cycleKey}:${semestre}:${semaine}`
      );
      setChangements([]);
      // Défaut de conception corrigé : ne pas envoyer automatiquement
      // TOUTES les spécialités du cycle/semestre vers la validation —
      // certaines peuvent ne pas être prêtes. L'admin choisit lesquelles
      // passent en PDF/validation maintenant.
      ouvrirSelectionValidation();
    } catch (err) {
      setErreurChargement(
        err instanceof Error
          ? `Erreur lors de l'enregistrement : ${err.message}`
          : "Erreur lors de l'enregistrement."
      );
      await chargerGroupe();
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function ouvrirSelectionValidation() {
    setSpecialitesPourValidation(new Set(specialites.map((s) => s.id)));
    setSelectionValidationOuverte(true);
  }

  // Correction : la sélection faite dans la modale est désormais
  // transmise via l'état de navigation (location.state), pas encodée
  // dans l'URL — plus robuste (aucun souci de caractères spéciaux comme
  // le "&" de "S3&4", aucune limite de longueur d'URL, aucun risque de
  // troncature). Le paramètre "specialites" dans l'URL reste géré côté
  // ValidationEDTPage comme simple repli pour un accès direct/rechargement.
  function confirmerSelectionValidation() {
    if (specialitesPourValidation.size === 0) return;
    const specialiteIds = Array.from(specialitesPourValidation);
    navigate(
      `/emploi-du-temps/validation?cycle=${encodeURIComponent(
        cycleKey
      )}&semestre=${encodeURIComponent(semestre)}&semaine=${semaine}`,
      { state: { specialiteIds } }
    );
  }

  const specialiteCourante = specialites.find(
    (s) => s.id === specialiteAffichee
  );
  const semestresDisponibles = Array.from(
    new Set(
      Object.values(SEMESTRES_PAR_TYPE_CURSUS).flatMap((liste) => liste)
    )
  );

  // Séances visibles pour la spécialité actuellement affichée : les
  // siennes en propre + celles de tronc commun dont elle est membre.
  const seancesAffichees = seances.filter(
    (s) =>
      s.specialiteId === specialiteAffichee ||
      (s.troncCommunId &&
        specialitesParTronc.get(s.troncCommunId)?.has(specialiteAffichee))
  );

  if (!enLigne) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="font-extrabold text-2xl text-gray-900 mb-4">
          Emploi du temps
        </p>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Connexion nécessaire pour confectionner l'emploi du temps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Emploi du temps
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Choisis un cycle, un semestre et une semaine — toutes les
        spécialités concernées se chargent automatiquement.
      </p>

      <div className="bg-white rounded-[20px] p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <select
          value={cycleKey}
          onChange={(e) => {
            setCycleKey(e.target.value);
            setSemestre('');
          }}
          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
        >
          <option value="">Cycle...</option>
          {cycles.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={semestre}
          onChange={(e) => setSemestre(e.target.value)}
          disabled={!cycleKey}
          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
        >
          <option value="">Semestre...</option>
          {semestresDisponibles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Semaine (lundi)
          </label>
          <input
            type="date"
            value={semaine}
            onChange={(e) => setSemaine(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
          />
        </div>
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : erreurChargement ? (
        <p className="text-sm font-bold text-red-600 mb-4">
          {erreurChargement}
        </p>
      ) : specialites.length === 0 ? (
        cycleKey && semestre ? (
          <div className="bg-amber-50 rounded-xl px-4 py-3.5">
            <p className="text-sm font-bold text-amber-700">
              Aucune spécialité accessible pour ce cycle et ce semestre.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-[20px] p-8 text-center text-sm text-gray-400">
            Choisis un cycle et un semestre pour commencer.
          </div>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <select
              value={specialiteAffichee}
              onChange={(e) => setSpecialiteAffichee(e.target.value)}
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:border-red-600 bg-white"
            >
              {specialites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} — {s.ecoleNom}
                </option>
              ))}
            </select>

            <button
              onClick={handleAllerValidation}
              disabled={envoiEnCours}
              className="flex items-center gap-2 text-red-600 font-bold hover:underline text-sm disabled:opacity-50 disabled:no-underline"
            >
              {envoiEnCours && <Loader2 size={14} className="animate-spin" />}
              {changements.length > 0
                ? `Enregistrer et aller à la validation (${changements.length}) →`
                : 'Aller à la validation →'}
            </button>
          </div>
          {changements.length > 0 && (
            <p className="text-xs font-semibold text-amber-600 mb-4">
              {changements.length} modification
              {changements.length > 1 ? 's' : ''} non enregistrée
              {changements.length > 1 ? 's' : ''} — gardée
              {changements.length > 1 ? 's' : ''} sur cet appareil, pour
              toutes les spécialités du cycle/semestre, envoyée
              {changements.length > 1 ? 's' : ''} en base au clic
              ci-dessus.
            </p>
          )}

          <div className="bg-white rounded-[20px] overflow-x-auto mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50 w-24">
                    Jour
                  </th>
                  {CRENEAUX.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOURS.map((jour) => (
                  <tr key={jour}>
                    <td className="px-3 py-3 font-bold text-gray-900 border-b border-gray-50 align-top">
                      {jour}
                    </td>
                    {CRENEAUX.map((creneau) => {
                      const cellules = seancesAffichees.filter(
                        (s) => s.jour === jour && s.creneau === creneau
                      );
                      const modifieeEnAttente = changements.some(
                        (c) => c.jour === jour && c.creneau === creneau
                      );
                      return (
                        <td
                          key={creneau}
                          className="px-2 py-2 border-b border-gray-50 align-top relative"
                        >
                          {modifieeEnAttente && (
                            <span
                              title="Modification non encore enregistrée"
                              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400"
                            />
                          )}
                          {cellules.length === 0 ? (
                            <button
                              onClick={() => ouvrirModal(jour, creneau)}
                              title="Programmer ce créneau"
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {cellules.map((s) => (
                                <div
                                  key={s.id}
                                  className={`rounded-xl px-3 py-2 ${
                                    s.statut === 'conflit'
                                      ? 'bg-red-50 border border-red-200'
                                      : 'bg-gray-50'
                                  }`}
                                >
                                  <p className="font-bold text-xs text-gray-900 truncate">
                                    {s.ueNom}
                                  </p>
                                  <p className="text-[11px] text-gray-400 truncate mb-1.5">
                                    {s.enseignantNom} ·{' '}
                                    {s.salleCode ?? 'Aucune salle'}
                                  </p>
                                  {s.volumeHoraire != null && (
                                    <p className="text-[11px] font-bold text-red-600 mb-1.5">
                                      {heuresEffectuees.get(s.id) ?? 0}/
                                      {s.volumeHoraire}h
                                    </p>
                                  )}
                                  {s.statut === 'conflit' && (
                                    <p className="text-[10px] text-red-600 font-bold mb-1.5">
                                      ⚠ Conflit de salle
                                    </p>
                                  )}
                                  <button
                                    onClick={() =>
                                      ouvrirModal(jour, creneau, s)
                                    }
                                    className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-red-600"
                                  >
                                    <Pencil size={11} /> Modifier
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[20px] p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-extrabold text-gray-900">
                  {modal.jour} · {modal.creneau}
                </p>
                <p className="text-xs text-gray-400">
                  {specialiteCourante?.nom}
                </p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="text-gray-300 hover:text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  UE
                </label>
                {(() => {
                  const offres =
                    offresParSpecialite.get(modal.specialiteId) ?? [];
                  const disponibles = offres.filter((o) =>
                    enseignantsDispoModal.some(
                      (e) => e.id === o.enseignantAttribueId
                    )
                  );
                  const autres = offres.filter(
                    (o) =>
                      !enseignantsDispoModal.some(
                        (e) => e.id === o.enseignantAttribueId
                      )
                  );

                  function ligneUE(o: OffreDeSpecialite) {
                    const selectionnee = modal?.offreId === o.offreId;
                    return (
                      <button
                        key={o.offreId}
                        type="button"
                        disabled={!o.enseignantAttribueId}
                        onClick={() =>
                          setModal((prev) =>
                            prev ? { ...prev, offreId: o.offreId } : prev
                          )
                        }
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          selectionnee
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'bg-white border-gray-200 hover:border-red-300'
                        }`}
                      >
                        <span className="text-sm font-bold truncate">
                          {o.ueNom}
                        </span>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            selectionnee ? 'text-white/80' : 'text-gray-400'
                          }`}
                        >
                          {o.enseignantAttribueNom ?? 'Sans enseignant'}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                      {disponibles.length > 0 && (
                        <>
                          <p className="text-[11px] font-bold text-green-600 uppercase tracking-wide px-1 mt-1">
                            Enseignant disponible à ce créneau
                          </p>
                          {disponibles.map(ligneUE)}
                        </>
                      )}
                      {autres.length > 0 && (
                        <>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-1 mt-2">
                            Autres UEs du semestre ({autres.length})
                          </p>
                          {autres.map(ligneUE)}
                        </>
                      )}
                      {offres.length === 0 && (
                        <p className="text-xs text-gray-400 px-1">
                          Chargement...
                        </p>
                      )}
                    </div>
                  );
                })()}
                <p className="text-[11px] text-gray-400 mt-1.5">
                  L'enseignant est celui déjà attribué à cette UE
                  (Répartition).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  Salle
                </label>
                <select
                  value={modal.salleId}
                  onChange={(e) =>
                    setModal((prev) =>
                      prev ? { ...prev, salleId: e.target.value } : prev
                    )
                  }
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                >
                  <option value="">Aucune</option>
                  {toutesSalles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code_salle}{' '}
                      {s.id ===
                      salleParDefautParSpecialite.get(modal.specialiteId)?.id
                        ? '(par défaut)'
                        : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={handleEnregistrerModal}
                disabled={!modal.offreId}
                className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Enregistrer
              </button>
              {modal.seanceIdExistante && (
                <button
                  onClick={handleSupprimer}
                  className="flex items-center gap-2 text-sm font-bold text-red-600 hover:underline"
                >
                  <Trash2 size={14} /> Retirer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectionValidationOuverte && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <p className="font-extrabold text-base text-gray-900">
                Spécialités à valider
              </p>
              <button
                onClick={() => setSelectionValidationOuverte(false)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3 shrink-0">
              Choisis lesquelles passer en PDF/validation maintenant —
              les autres restent en brouillon, à valider plus tard.
            </p>

            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 mb-4">
              {specialites.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={specialitesPourValidation.has(s.id)}
                    onChange={() =>
                      setSpecialitesPourValidation((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {s.nom}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.ecoleNom}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <button
              onClick={confirmerSelectionValidation}
              disabled={specialitesPourValidation.size === 0}
              className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
            >
              Continuer vers la validation ({specialitesPourValidation.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}