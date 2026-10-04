// src/features/emploi-du-temps/edtLocal.ts
//
// Préchargement LOCAL de la page de confection de l'emploi du temps.
//
// Problème : sur une connexion instable, chaque clic dans la grille
// (ouverture de la modale = disponibilités des enseignants, salles
// libres, offres de la spécialité…) partait vers Supabase, et la page
// entière refusait de s'ouvrir hors ligne.
//
// Solution : au chargement d'un groupe (cycle/semestre + semaine), on
// récupère EN UNE PASSE (requêtes à plat, en parallèle, jamais de
// jointure imbriquée PostgREST) tout ce dont la confection a besoin, et
// on le range dans la base locale (Dexie, table edtSnapshots). Ensuite :
//  - la grille et la modale ne lisent QUE ce snapshot (zéro réseau) ;
//  - les modifications restent un brouillon local (inchangé) ;
//  - seul "Enregistrer" écrit en base, comme avant.
// Si le réseau tombe, le dernier snapshot du groupe reste utilisable.

import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { getDernieresCampagnesParEnseignant } from '@/features/disponibilites/api';
import {
  getSeancesGroupees,
  getHeuresValideesPourPdf,
  getHeuresValideesTroncPourPdf,
  recupererToutesLesLignes,
  type SeanceGroupee,
  type OffreDeSpecialite,
  type EnseignantDisponible,
} from './api';

export interface SalleLocale {
  id: string;
  code_salle: string;
  capacite: number;
}

interface SalleOccupee {
  id: string;
  jour: string;
  creneau: string;
  salle_id: string | null;
}

// Tout est stocké sous forme de tableaux/objets simples (pas de Map/Set
// directement) pour rester indépendant de la sérialisation d'IndexedDB.
export interface SnapshotEDT {
  cle: string;
  enregistreLe: number;
  seances: SeanceGroupee[];
  emploiParSpecialite: [string, string][];
  specialitesParTronc: [string, string[]][];
  ueVersTronc: [string, { troncCommunId: string; nom: string }][];
  statutParSpecialite: [string, string][];
  offresParSpecialite: [string, OffreDeSpecialite[]][];
  toutesSalles: SalleLocale[];
  sallesParDefaut: [string, SalleLocale | null][];
  // "jour|creneau" → enseignants disponibles (dernière campagne de chacun)
  dispoParCreneau: Record<string, EnseignantDisponible[]>;
  // Occupation des salles toute la semaine, toutes spécialités confondues
  sallesOccupees: SalleOccupee[];
  heures: [string, number][];
}

export function cleSnapshot(specialiteIds: string[], semaine: string): string {
  return `${[...specialiteIds].sort().join(',')}|${semaine}`;
}

// ── Stockage local (jamais bloquant : un échec IndexedDB = pas de cache)
export async function lireSnapshot(cle: string): Promise<SnapshotEDT | null> {
  try {
    return ((await db.edtSnapshots.get(cle)) as SnapshotEDT | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function sauverSnapshot(snap: SnapshotEDT): Promise<void> {
  try {
    await db.edtSnapshots.put(snap);
    // Ménage : on ne garde que les 15 snapshots les plus récents.
    const tous = (await db.edtSnapshots.orderBy('enregistreLe').keys()) as number[];
    if (tous.length > 15) {
      const anciens = (await db.edtSnapshots
        .orderBy('enregistreLe')
        .limit(tous.length - 15)
        .primaryKeys()) as string[];
      await db.edtSnapshots.bulkDelete(anciens);
    }
  } catch {
    // Pas grave : l'écran fonctionne quand même avec les données en mémoire.
  }
}

export async function supprimerSnapshot(cle: string): Promise<void> {
  try {
    await db.edtSnapshots.delete(cle);
  } catch {
    // idem
  }
}

// Petit cache JSON (cycles, spécialités d'un cycle/semestre) pour pouvoir
// rouvrir la page hors ligne.
export function lireCacheJson<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

export function ecrireCacheJson(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // quota plein / navigation privée — sans importance
  }
}

// ── Lecture locale pour la modale ───────────────────────────────────
export function sallesLibresLocal(
  snap: SnapshotEDT,
  jour: string,
  creneau: string,
  seanceIdAExclure: string | null
): SalleLocale[] {
  const occupees = new Set(
    snap.sallesOccupees
      .filter(
        (o) =>
          o.jour === jour &&
          o.creneau === creneau &&
          o.salle_id &&
          o.id !== seanceIdAExclure
      )
      .map((o) => o.salle_id as string)
  );
  return snap.toutesSalles.filter((s) => !occupees.has(s.id));
}

// ── Préchargement réseau (une passe, requêtes à plat) ───────────────
function enLots<T>(liste: T[], taille = 100): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) {
    lots.push(liste.slice(i, i + taille));
  }
  return lots;
}

async function lireParLots<T>(
  ids: string[],
  requete: (lot: string[]) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const resultats = await Promise.all(
    enLots(ids).map(async (lot) => {
      const { data, error } = await requete(lot);
      if (error) throw error;
      return data ?? [];
    })
  );
  return resultats.flat();
}

export async function prechargerSnapshotGroupe(
  specialiteIds: string[],
  semaine: string
): Promise<SnapshotEDT> {
  // Offres + UE + attribution active + nom de l'enseignant, pour TOUTES
  // les spécialités du groupe, en 4 requêtes à plat (au lieu d'une
  // requête d'attribution PAR offre, comme listOffresDeSpecialite).
  async function chargerOffres(): Promise<[string, OffreDeSpecialite[]][]> {
    const offres = await lireParLots<any>(specialiteIds, (lot) =>
      supabase.from('offres').select('id, ue_id, specialite_id').in('specialite_id', lot)
    );
    const ueIds = Array.from(new Set(offres.map((o) => o.ue_id as string)));
    const offreIds = offres.map((o) => o.id as string);
    const [ues, attributions] = await Promise.all([
      lireParLots<any>(ueIds, (lot) =>
        supabase.from('ues').select('id, nom, volume_horaire').in('id', lot)
      ),
      lireParLots<any>(offreIds, (lot) =>
        supabase
          .from('attributions')
          .select('offre_id, enseignant_id')
          .in('offre_id', lot)
          .eq('statut', 'actif')
      ),
    ]);
    const enseignantIds = Array.from(
      new Set(attributions.map((a) => a.enseignant_id as string).filter(Boolean))
    );
    const enseignants = await lireParLots<any>(enseignantIds, (lot) =>
      supabase.from('enseignants').select('id, nom').in('id', lot)
    );

    const ueParId = new Map(ues.map((u) => [u.id as string, u]));
    const enseignantParId = new Map(enseignants.map((e) => [e.id as string, e.nom as string]));
    const attributionParOffre = new Map<string, string>();
    for (const a of attributions) {
      if (!attributionParOffre.has(a.offre_id)) {
        attributionParOffre.set(a.offre_id, a.enseignant_id);
      }
    }

    const parSpecialite = new Map<string, OffreDeSpecialite[]>();
    for (const spId of specialiteIds) parSpecialite.set(spId, []);
    for (const o of offres) {
      const ue = ueParId.get(o.ue_id);
      if (!ue) continue;
      const enseignantId = attributionParOffre.get(o.id) ?? null;
      parSpecialite.get(o.specialite_id)?.push({
        offreId: o.id,
        ueId: ue.id,
        ueNom: ue.nom,
        volumeHoraire: ue.volume_horaire ?? null,
        enseignantAttribueId: enseignantId,
        enseignantAttribueNom: enseignantId ? enseignantParId.get(enseignantId) ?? null : null,
      });
    }
    return Array.from(parSpecialite.entries());
  }

  // Enseignants disponibles par créneau, chacun jugé sur SA dernière
  // campagne (même règle que getEnseignantsDisponibles).
  async function chargerDisponibilites(): Promise<Record<string, EnseignantDisponible[]>> {
    const campagnesParEnseignant = await getDernieresCampagnesParEnseignant();
    if (campagnesParEnseignant.size === 0) return {};
    const campagneIds = Array.from(new Set(campagnesParEnseignant.values()));
    const lignes = (
      await Promise.all(
        enLots(campagneIds, 50).map((lot) =>
          recupererToutesLesLignes<any>((debut, fin) =>
            supabase
              .from('disponibilites')
              .select('enseignant_id, campagne_id, jour, creneau')
              .in('campagne_id', lot)
              .eq('disponible', true)
              .range(debut, fin)
          )
        )
      )
    ).flat();
    const retenues = lignes.filter(
      (d) => campagnesParEnseignant.get(d.enseignant_id) === d.campagne_id
    );
    const enseignantIds = Array.from(new Set(retenues.map((d) => d.enseignant_id as string)));
    const enseignants = await lireParLots<any>(enseignantIds, (lot) =>
      supabase.from('enseignants').select('id, nom, matricule').in('id', lot)
    );
    const enseignantParId = new Map(enseignants.map((e) => [e.id as string, e]));

    const resultat: Record<string, EnseignantDisponible[]> = {};
    for (const d of retenues) {
      const e = enseignantParId.get(d.enseignant_id);
      if (!e) continue;
      const cle = `${d.jour}|${d.creneau}`;
      (resultat[cle] ??= []).push({ id: e.id, nom: e.nom, matricule: e.matricule });
    }
    return resultat;
  }

  const [
    donnees,
    statuts,
    offresParSpecialite,
    sallesBrutes,
    dispoParCreneau,
    occupation,
  ] = await Promise.all([
    getSeancesGroupees(specialiteIds, semaine, { forcerRafraichissement: true }),
    lireParLots<any>(specialiteIds, (lot) =>
      supabase
        .from('emplois_du_temps')
        .select('specialite_id, statut')
        .in('specialite_id', lot)
        .eq('semaine', semaine)
    ),
    chargerOffres(),
    supabase
      .from('salles')
      .select('id, code_salle, capacite, specialite_par_defaut_id')
      .order('code_salle')
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as any[];
      }),
    chargerDisponibilites(),
    recupererToutesLesLignes<any>((debut, fin) =>
      supabase
        .from('seances_edt')
        .select('id, jour, creneau, salle_id')
        .eq('semaine', semaine)
        .range(debut, fin)
    ),
  ]);

  const toutesSalles: SalleLocale[] = sallesBrutes.map((s) => ({
    id: s.id,
    code_salle: s.code_salle,
    capacite: s.capacite,
  }));
  const sallesParDefaut: [string, SalleLocale | null][] = specialiteIds.map((spId) => {
    const brute = sallesBrutes.find((s) => s.specialite_par_defaut_id === spId);
    return [
      spId,
      brute ? { id: brute.id, code_salle: brute.code_salle, capacite: brute.capacite } : null,
    ];
  });

  // Heures déjà validées (affichage "X/Yh" dans la grille) — dépendent
  // des séances chargées juste au-dessus.
  const offreIds = Array.from(
    new Set(donnees.seances.filter((s) => s.offreId).map((s) => s.offreId as string))
  );
  const troncIds = Array.from(
    new Set(donnees.seances.filter((s) => s.troncCommunId).map((s) => s.troncCommunId as string))
  );
  const [heuresOffres, heuresTroncs] = await Promise.all([
    offreIds.length > 0
      ? getHeuresValideesPourPdf(offreIds)
      : Promise.resolve(new Map<string, number>()),
    troncIds.length > 0
      ? getHeuresValideesTroncPourPdf(troncIds)
      : Promise.resolve(new Map<string, number>()),
  ]);

  return {
    cle: cleSnapshot(specialiteIds, semaine),
    enregistreLe: Date.now(),
    seances: donnees.seances,
    emploiParSpecialite: Array.from(donnees.emploiParSpecialite.entries()),
    specialitesParTronc: Array.from(donnees.specialitesParTronc.entries()).map(
      ([k, v]) => [k, Array.from(v)] as [string, string[]]
    ),
    ueVersTronc: Array.from(donnees.ueVersTronc.entries()),
    statutParSpecialite: statuts.map((e) => [e.specialite_id, e.statut] as [string, string]),
    offresParSpecialite,
    toutesSalles,
    sallesParDefaut,
    dispoParCreneau,
    sallesOccupees: occupation.map((o) => ({
      id: o.id,
      jour: o.jour,
      creneau: o.creneau,
      salle_id: o.salle_id ?? null,
    })),
    heures: Array.from(new Map([...heuresOffres, ...heuresTroncs]).entries()),
  };
}