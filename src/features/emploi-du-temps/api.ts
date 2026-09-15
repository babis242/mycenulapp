// src/features/emploi-du-temps/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import {
  arreterCampagne,
  getDerniereCampagne,
} from '@/features/disponibilites/api';
import { genererCodesPourEmploi } from '@/features/codes-journaliers/api';
import type { TypeCursus } from '@/types';

// ── Chargement de l'emploi du temps (vierge si nouveau) ────────────
// Nouvelle procédure : on ne génère plus rien automatiquement. Cas A
// (existe déjà) → on charge tel quel. Cas B (n'existe pas) → on arrête la
// collecte de disponibilités en cours (comme avant) et on crée un emploi du
// temps VIERGE, prêt à être rempli créneau par créneau à la main.

export interface EmploiExistant {
  id: string;
  statut: 'genere' | 'en_attente_validation' | 'valide';
}

export async function getEmploiExistant(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant | null> {
  const { data, error } = await supabase
    .from('emplois_du_temps')
    .select('id, statut')
    .eq('specialite_id', specialiteId)
    .eq('semaine', semaine)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function creerOuChargerEDT(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant> {
  const existant = await getEmploiExistant(specialiteId, semaine);
  if (existant) return existant;

  const campagne = await getDerniereCampagne();
  if (campagne && campagne.statut === 'active') {
    await arreterCampagne(campagne.id);
  }

  const { data, error } = await supabase
    .from('emplois_du_temps')
    .insert({ specialite_id: specialiteId, semaine, statut: 'genere' })
    .select('id, statut')
    .single();
  if (error) throw error;
  return data;
}

// ── UEs de la spécialité (pour le choix "quelle UE programmer") ───

export interface OffreDeSpecialite {
  offreId: string;
  ueId: string;
  ueNom: string;
  volumeHoraire: number | null;
  enseignantAttribueId: string | null;
  enseignantAttribueNom: string | null;
}

export async function listOffresDeSpecialite(
  specialiteId: string
): Promise<OffreDeSpecialite[]> {
  const { data: offresData } = await supabase
    .from('offres')
    .select('id, ue:ues(id, nom, volume_horaire)')
    .eq('specialite_id', specialiteId);

  const resultats: OffreDeSpecialite[] = [];
  for (const o of (offresData ?? []) as any[]) {
    const { data: attribution } = await supabase
      .from('attributions')
      .select('enseignant_id, enseignant:enseignants(nom)')
      .eq('offre_id', o.id)
      .eq('statut', 'actif')
      .maybeSingle();

    resultats.push({
      offreId: o.id,
      ueId: o.ue.id,
      ueNom: o.ue.nom,
      volumeHoraire: o.ue.volume_horaire ?? null,
      enseignantAttribueId: attribution?.enseignant_id ?? null,
      enseignantAttribueNom: (attribution as any)?.enseignant?.nom ?? null,
    });
  }
  return resultats;
}

// ── Enseignants disponibles à un créneau donné ──────────────────────
// Basé sur la dernière campagne de disponibilités (peu importe son statut
// actif/arrêtée — les réponses restent valables pour la construction de
// l'EDT).

export interface EnseignantDisponible {
  id: string;
  nom: string;
  matricule: string;
}

export async function getEnseignantsDisponibles(
  jour: string,
  creneau: string
): Promise<EnseignantDisponible[]> {
  const campagne = await getDerniereCampagne();
  if (!campagne) return [];

  const { data, error } = await supabase
    .from('disponibilites')
    .select('enseignant:enseignants(id, nom, matricule)')
    .eq('campagne_id', campagne.id)
    .eq('jour', jour)
    .eq('creneau', creneau)
    .eq('disponible', true);
  if (error) throw error;

  return ((data ?? []) as any[]).map((d) => d.enseignant).filter(Boolean);
}

export async function listTousLesEnseignants(): Promise<
  EnseignantDisponible[]
> {
  const { data, error } = await supabase
    .from('enseignants')
    .select('id, nom, matricule')
    .order('nom');
  if (error) throw error;
  return data ?? [];
}

export async function getSalleParDefautSpecialite(specialiteId: string) {
  const { data } = await supabase
    .from('salles')
    .select('id, code_salle, capacite')
    .eq('specialite_par_defaut_id', specialiteId)
    .maybeSingle();
  return data;
}

export async function listToutesLesSalles() {
  const { data } = await supabase
    .from('salles')
    .select('id, code_salle, capacite')
    .order('code_salle');
  return data ?? [];
}

// ── Détail des séances ──────────────────────────────────────────────

export interface SeanceDetail {
  id: string;
  offreId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  volumeHoraire: number | null;
  semestre: string | null;
  enseignantNom: string;
  salleCode: string | null;
  salleId: string | null;
  jour: string;
  creneau: string;
  statut: 'ok' | 'conflit';
}

export async function getSeances(
  emploiId: string,
  specialiteId: string,
  semaine: string
): Promise<SeanceDetail[]> {
  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, statut, offre_id, tronc_commun_id, salle_id,
      offre:offres(semestre, ue:ues(nom, volume_horaire)),
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom),
      salle:salles(code_salle)
    `
    )
    .eq('emploi_du_temps_id', emploiId);
  if (error) throw error;

  // Séances de tronc commun concernant cette spécialité pour cette
  // semaine — elles n'ont plus d'emploi_du_temps_id (une seule ligne
  // partagée par tout le groupe), retrouvées via troncs_communs_ues.
  const { data: offresSpe } = await supabase
    .from('offres')
    .select('ue_id')
    .eq('specialite_id', specialiteId);
  const ueIds = (offresSpe ?? []).map((o) => o.ue_id);

  let seancesTronc: any[] = [];
  if (ueIds.length > 0) {
    const { data: liens } = await supabase
      .from('troncs_communs_ues')
      .select('tronc_commun_id')
      .in('ue_id', ueIds);
    const troncIds = Array.from(
      new Set((liens ?? []).map((l) => l.tronc_commun_id))
    );
    if (troncIds.length > 0) {
      const { data: st, error: errTronc } = await supabase
        .from('seances_edt')
        .select(
          `
          id, jour, creneau, statut, offre_id, tronc_commun_id, salle_id,
          tronc_commun:troncs_communs(nom),
          enseignant:enseignants(nom),
          salle:salles(code_salle)
        `
        )
        .in('tronc_commun_id', troncIds)
        .eq('semaine', semaine);
      if (errTronc) throw errTronc;
      seancesTronc = st ?? [];
    }
  }

  return ([...(data ?? []), ...seancesTronc] as any[]).map((s) => {
    if (s.tronc_commun) {
      return {
        id: s.id,
        offreId: null,
        troncCommunId: s.tronc_commun_id,
        ueNom: s.tronc_commun.nom,
        volumeHoraire: null,
        semestre: null,
        enseignantNom: s.enseignant?.nom ?? '',
        salleCode: s.salle?.code_salle ?? null,
        salleId: s.salle_id,
        jour: s.jour,
        creneau: s.creneau,
        statut: s.statut,
      };
    }
    return {
      id: s.id,
      offreId: s.offre_id,
      troncCommunId: null,
      ueNom: s.offre?.ue?.nom ?? '',
      volumeHoraire: s.offre?.ue?.volume_horaire ?? null,
      semestre: s.offre?.semestre ?? null,
      enseignantNom: s.enseignant?.nom ?? '',
      salleCode: s.salle?.code_salle ?? null,
      salleId: s.salle_id,
      jour: s.jour,
      creneau: s.creneau,
      statut: s.statut,
    };
  });
}

// Heures déjà effectuées AVANT la semaine donnée (semaines validées
// antérieures) pour chaque offre — sert à afficher "XX/YYh (-ZZh)" dans le
// PDF, comme dans le modèle Cenulape. Une séance = 4h.
const JOUR_ORDRE: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
};
const CRENEAU_ORDRE: Record<string, number> = { '08h-12h': 0, '14h-17h': 1 };

// Durée programmée d'un créneau, utilisée tant que la séance n'a pas
// encore été fermée (duree_calculee null) — 08h-12h fait 4h, 14h-17h
// fait 3h (pas 4h comme les deux, erreur corrigée).
function dureeCreneauParDefaut(creneau: string): number {
  return creneau === '14h-17h' ? 3 : 4;
}

// Heures effectuées, PAR SÉANCE (pas un total plat pour toute l'UE) — la
// première séance programmée dans la semaine affiche sa propre durée,
// la suivante affiche le cumul (elle + les précédentes), etc. Les
// semaines déjà passées et validées comptent en bloc avant ce cumul.
export async function getHeuresEffectuees(
  offreIds: string[],
  semaineActuelle: string
): Promise<Map<string, number>> {
  if (offreIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select(
      'id, offre_id, jour, creneau, duree_calculee, emploi_du_temps:emplois_du_temps(statut, semaine)'
    )
    .in('offre_id', offreIds);

  const parOffre = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    const emploi = s.emploi_du_temps;
    if (!emploi) continue;
    const estPasseeEtValidee =
      emploi.semaine < semaineActuelle && emploi.statut === 'valide';
    const estSemaineActuelle = emploi.semaine === semaineActuelle;
    if (!estPasseeEtValidee && !estSemaineActuelle) continue;
    if (!parOffre.has(s.offre_id)) parOffre.set(s.offre_id, []);
    parOffre.get(s.offre_id)!.push({ ...s, estSemaineActuelle });
  }

  const resultat = new Map<string, number>();
  for (const liste of parOffre.values()) {
    let cumulPasse = 0;
    const seancesActuelles: any[] = [];
    for (const s of liste) {
      if (s.estSemaineActuelle) seancesActuelles.push(s);
      else cumulPasse += s.duree_calculee ?? dureeCreneauParDefaut(s.creneau);
    }
    seancesActuelles.sort((a, b) => {
      const diffJour = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      return (CRENEAU_ORDRE[a.creneau] ?? 0) - (CRENEAU_ORDRE[b.creneau] ?? 0);
    });
    let cumul = cumulPasse;
    for (const s of seancesActuelles) {
      cumul += s.duree_calculee ?? dureeCreneauParDefaut(s.creneau);
      resultat.set(s.id, cumul);
    }
  }
  return resultat;
}

// Même principe pour une UE de tronc commun — une séance de tronc commun
// n'a plus d'emploi du temps de spécialité (une seule ligne partagée),
// donc pas de statut "valide" direct : on compte simplement les
// créneaux déjà passés (semaine antérieure), au même forfait de 4h par
// créneau que pour une UE simple.
export async function getHeuresEffectueesTronc(
  troncCommunIds: string[],
  semaineActuelle: string
): Promise<Map<string, number>> {
  if (troncCommunIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select('id, tronc_commun_id, jour, creneau, duree_calculee, semaine')
    .in('tronc_commun_id', troncCommunIds)
    .lte('semaine', semaineActuelle);

  const parTronc = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    if (!parTronc.has(s.tronc_commun_id)) parTronc.set(s.tronc_commun_id, []);
    parTronc.get(s.tronc_commun_id)!.push(s);
  }

  const resultat = new Map<string, number>();
  for (const liste of parTronc.values()) {
    let cumulPasse = 0;
    const seancesActuelles: any[] = [];
    for (const s of liste) {
      if (s.semaine === semaineActuelle) seancesActuelles.push(s);
      else cumulPasse += s.duree_calculee ?? dureeCreneauParDefaut(s.creneau);
    }
    seancesActuelles.sort((a, b) => {
      const diffJour = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      return (CRENEAU_ORDRE[a.creneau] ?? 0) - (CRENEAU_ORDRE[b.creneau] ?? 0);
    });
    let cumul = cumulPasse;
    for (const s of seancesActuelles) {
      cumul += s.duree_calculee ?? dureeCreneauParDefaut(s.creneau);
      resultat.set(s.id, cumul);
    }
  }
  return resultat;
}

export async function listSallesLibres(
  jour: string,
  creneau: string,
  emploiId: string
) {
  const { data: sallesData } = await supabase
    .from('salles')
    .select('id, code_salle');
  const { data: occupees } = await supabase
    .from('seances_edt')
    .select('salle_id')
    .eq('emploi_du_temps_id', emploiId)
    .eq('jour', jour)
    .eq('creneau', creneau);
  const idsOccupes = new Set((occupees ?? []).map((o) => o.salle_id));
  return (sallesData ?? []).filter((s) => !idsOccupes.has(s.id));
}

// ── Lecture hors ligne (Palier 1 — consultation) ───────────────────
// Pas d'écriture ici : ouvrir/remplir/supprimer une séance reste
// strictement en ligne (conflits de salle vérifiés en direct, propagation
// aux troncs communs). Ces fonctions ne font que RE-LIRE depuis Dexie ce
// qui a déjà été synchronisé, pour pouvoir au moins consulter un EDT déjà
// généré quand la connexion est coupée.

export async function lireEmploiExistantDepuisCache(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant | null> {
  const emploi = await db.emploisDuTemps
    .where('specialite_id')
    .equals(specialiteId)
    .and((e: any) => e.semaine === semaine)
    .first();
  return emploi ? { id: (emploi as any).id, statut: (emploi as any).statut } : null;
}

export async function lireSeancesDepuisCache(
  emploiId: string,
  specialiteId: string,
  semaine: string
): Promise<SeanceDetail[]> {
  const [
    seancesSpe,
    offres,
    ues,
    troncsCommuns,
    enseignants,
    salles,
    troncsCommunsUes,
  ] = await Promise.all([
    db.seancesEDT.where('emploi_du_temps_id').equals(emploiId).toArray(),
    db.offres.toArray(),
    db.ues.toArray(),
    db.troncsCommuns.toArray(),
    db.enseignants.toArray(),
    db.salles.toArray(),
    db.troncsCommunsUes.toArray(),
  ]);

  // Séances de tronc commun de cette spécialité pour cette semaine —
  // plus d'emploi_du_temps_id, retrouvées via troncs_communs_ues.
  const ueIdsSpe = new Set(
    (offres as any[])
      .filter((o) => o.specialite_id === specialiteId)
      .map((o) => o.ue_id)
  );
  const troncIds = new Set(
    (troncsCommunsUes as any[])
      .filter((l) => ueIdsSpe.has(l.ue_id))
      .map((l) => l.tronc_commun_id)
  );
  const toutesLesSeances = await db.seancesEDT.toArray();
  const seancesTronc = (toutesLesSeances as any[]).filter(
    (s) =>
      s.tronc_commun_id &&
      troncIds.has(s.tronc_commun_id) &&
      s.semaine === semaine
  );

  const seances = [...seancesSpe, ...seancesTronc];

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));

  return (seances as any[]).map((s) => {
    const salle = s.salle_id ? salleParId.get(s.salle_id) : null;
    const enseignant = s.enseignant_id
      ? enseignantParId.get(s.enseignant_id)
      : null;

    if (s.tronc_commun_id) {
      const tronc = troncCommunParId.get(s.tronc_commun_id);
      return {
        id: s.id,
        offreId: null,
        troncCommunId: s.tronc_commun_id,
        ueNom: tronc?.nom ?? '',
        volumeHoraire: null,
        semestre: null,
        enseignantNom: enseignant?.nom ?? '',
        salleCode: salle?.code_salle ?? null,
        salleId: s.salle_id,
        jour: s.jour,
        creneau: s.creneau,
        statut: s.statut,
      } as SeanceDetail;
    }

    const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
    const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
    return {
      id: s.id,
      offreId: s.offre_id,
      troncCommunId: null,
      ueNom: ue?.nom ?? '',
      volumeHoraire: ue?.volume_horaire ?? null,
      semestre: offre?.semestre ?? null,
      enseignantNom: enseignant?.nom ?? '',
      salleCode: salle?.code_salle ?? null,
      salleId: s.salle_id,
      jour: s.jour,
      creneau: s.creneau,
      statut: s.statut,
    } as SeanceDetail;
  });
}

export async function lireOffresDeSpecialiteDepuisCache(
  specialiteId: string
): Promise<OffreDeSpecialite[]> {
  const [offres, ues, attributions, enseignants] = await Promise.all([
    db.offres.where('specialite_id').equals(specialiteId).toArray(),
    db.ues.toArray(),
    db.attributions.toArray(),
    db.enseignants.toArray(),
  ]);
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));

  return (offres as any[]).map((o) => {
    const ue = ueParId.get(o.ue_id);
    const attribution = (attributions as any[]).find(
      (a) => a.offre_id === o.id && a.statut === 'actif'
    );
    const enseignant = attribution
      ? enseignantParId.get(attribution.enseignant_id)
      : null;
    return {
      offreId: o.id,
      ueId: o.ue_id,
      ueNom: ue?.nom ?? '',
      volumeHoraire: ue?.volume_horaire ?? null,
      enseignantAttribueId: attribution?.enseignant_id ?? null,
      enseignantAttribueNom: enseignant?.nom ?? null,
    } as OffreDeSpecialite;
  });
}

export async function lireEnseignantsDisponiblesDepuisCache(
  jour: string,
  creneau: string
): Promise<EnseignantDisponible[]> {
  const campagnes = await db.campagnesDisponibilite.toArray();
  if (campagnes.length === 0) return [];
  // La plus récente, comme getDerniereCampagne côté réseau.
  const derniere = (campagnes as any[]).sort((a, b) =>
    b.date_lancement.localeCompare(a.date_lancement)
  )[0];

  const [dispos, enseignants] = await Promise.all([
    db.disponibilites
      .where('campagne_id')
      .equals(derniere.id)
      .and((d: any) => d.jour === jour && d.creneau === creneau && d.disponible)
      .toArray(),
    db.enseignants.toArray(),
  ]);
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));

  return (dispos as any[])
    .map((d) => enseignantParId.get(d.enseignant_id))
    .filter(Boolean)
    .map((e: any) => ({ id: e.id, nom: e.nom, matricule: e.matricule }));
}

export async function lireSalleParDefautDepuisCache(specialiteId: string) {
  const salle = await db.salles
    .where('specialite_par_defaut_id')
    .equals(specialiteId)
    .first();
  return salle
    ? {
        id: (salle as any).id,
        code_salle: (salle as any).code_salle,
        capacite: (salle as any).capacite,
      }
    : null;
}

export async function lireToutesLesSallesDepuisCache() {
  const salles = await db.salles.toArray();
  return (salles as any[])
    .map((s) => ({ id: s.id, code_salle: s.code_salle, capacite: s.capacite }))
    .sort((a, b) => a.code_salle.localeCompare(b.code_salle));
}

// ── Assignation manuelle d'une séance (cœur de la nouvelle procédure) ──
// Utilisée aussi bien pour une case vide que pour modifier une case déjà
// remplie. Si l'UE choisie appartient à un tronc commun, la séance est
// automatiquement propagée (créée/mise à jour) dans les emplois du temps
// de TOUTES les spécialités concernées par ce tronc commun — en créant
// leur emploi du temps s'il n'existe pas encore.

interface ParamsAssignation {
  emploiId: string;
  specialiteId: string;
  semaine: string;
  seanceIdExistante?: string | null;
  offreId: string;
  enseignantId: string;
  salleId: string | null;
  jour: string;
  creneau: string;
}

// Crée ou met à jour LA séance unique du tronc commun pour ce créneau —
// une seule ligne, partagée par toutes les spécialités du groupe (un
// seul code, un seul rapport), pas une par spécialité.
async function propagerVersGroupe(
  troncCommunId: string,
  semaine: string,
  jour: string,
  creneau: string,
  salleId: string | null,
  enseignantId: string
) {
  const { data: seanceExistante } = await supabase
    .from('seances_edt')
    .select('id')
    .eq('tronc_commun_id', troncCommunId)
    .eq('semaine', semaine)
    .eq('jour', jour)
    .eq('creneau', creneau)
    .maybeSingle();

  // Même contrôle que pour une séance simple : un enseignant ou une
  // salle ne peuvent être occupés qu'une seule fois par créneau, toutes
  // spécialités confondues.
  const { data: memeCreneauGlobal } = await supabase
    .from('seances_edt')
    .select('id, salle_id, enseignant_id')
    .eq('semaine', semaine)
    .eq('jour', jour)
    .eq('creneau', creneau);
  const idAExclure = seanceExistante?.id;
  const conflitEnseignant = (memeCreneauGlobal ?? []).some(
    (o) => o.id !== idAExclure && o.enseignant_id === enseignantId
  );
  const conflitSalle =
    !!salleId &&
    (memeCreneauGlobal ?? []).some(
      (o) => o.id !== idAExclure && o.salle_id === salleId
    );
  const statut: 'ok' | 'conflit' =
    !salleId || conflitEnseignant || conflitSalle ? 'conflit' : 'ok';

  if (seanceExistante) {
    const { error } = await supabase
      .from('seances_edt')
      .update({
        salle_id: salleId,
        enseignant_id: enseignantId,
        statut,
      })
      .eq('id', seanceExistante.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('seances_edt').insert({
      emploi_du_temps_id: null,
      tronc_commun_id: troncCommunId,
      semaine,
      jour,
      creneau,
      enseignant_id: enseignantId,
      salle_id: salleId,
      statut,
    });
    if (error) throw error;
  }
}

export async function assignerSeance(params: ParamsAssignation) {
  const {
    emploiId,
    specialiteId,
    semaine,
    seanceIdExistante,
    offreId,
    enseignantId,
    salleId,
    jour,
    creneau,
  } = params;

  const { data: offre, error: offreError } = await supabase
    .from('offres')
    .select('ue_id')
    .eq('id', offreId)
    .single();
  if (offreError || !offre) throw offreError ?? new Error('Offre introuvable.');
  const { data: lienTronc } = await supabase
    .from('troncs_communs_ues')
    .select('tronc_commun_id')
    .eq('ue_id', offre.ue_id)
    .maybeSingle();

  if (lienTronc) {
    await propagerVersGroupe(
      lienTronc.tronc_commun_id,
      semaine,
      jour,
      creneau,
      salleId,
      enseignantId
    );
    // Si on modifiait une ancienne séance "simple" (offre_id) sur cette
    // case et qu'elle devient une séance de groupe, on supprime l'ancienne
    // pour ne pas dupliquer la case.
    if (seanceIdExistante) {
      await supabase
        .from('seances_edt')
        .delete()
        .eq('id', seanceIdExistante)
        .is('tronc_commun_id', null);
    }
    return;
  }

  // Cas simple (pas de tronc commun) — un enseignant ou une salle ne
  // peuvent être occupés qu'une seule fois par créneau, TOUTES
  // spécialités confondues (recherche globale via semaine, plus
  // seulement dans le même emploi du temps).
  const { data: memeCreneauGlobal } = await supabase
    .from('seances_edt')
    .select('id, salle_id, enseignant_id')
    .eq('semaine', semaine)
    .eq('jour', jour)
    .eq('creneau', creneau);

  const conflitEnseignant = (memeCreneauGlobal ?? []).some(
    (o) => o.id !== seanceIdExistante && o.enseignant_id === enseignantId
  );
  const conflitSalle =
    !!salleId &&
    (memeCreneauGlobal ?? []).some(
      (o) => o.id !== seanceIdExistante && o.salle_id === salleId
    );

  const statut: 'ok' | 'conflit' =
    !salleId || conflitEnseignant || conflitSalle ? 'conflit' : 'ok';

  if (seanceIdExistante) {
    const { error } = await supabase
      .from('seances_edt')
      .update({
        offre_id: offreId,
        tronc_commun_id: null,
        enseignant_id: enseignantId,
        salle_id: salleId,
        semaine,
        statut,
      })
      .eq('id', seanceIdExistante);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('seances_edt').insert({
      emploi_du_temps_id: emploiId,
      offre_id: offreId,
      enseignant_id: enseignantId,
      salle_id: salleId,
      semaine,
      jour,
      creneau,
      statut,
    });
    if (error) throw error;
  }
  void specialiteId;
}

export async function supprimerSeance(seanceId: string) {
  const { error } = await supabase
    .from('seances_edt')
    .delete()
    .eq('id', seanceId);
  if (error) throw error;
}

// ── Scénario 6 — Validation et publication ────────────────────────

export async function uploaderDocumentSigne(
  emploiId: string,
  fichier: File
): Promise<string> {
  const extension = fichier.name.split('.').pop() ?? 'pdf';
  const chemin = `${emploiId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('documents-edt')
    .upload(chemin, fichier, {
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('documents-edt').getPublicUrl(chemin);
  const url = data.publicUrl;

  const { error } = await supabase
    .from('emplois_du_temps')
    .update({ pdf_signe_url: url })
    .eq('id', emploiId);
  if (error) throw error;

  return url;
}

// Même document signé pour tout un groupe d'emplois du temps (un cycle +
// semestre validés ensemble) — un seul envoi, appliqué à chacun.
export async function uploaderDocumentSigneGroupe(
  emploiIds: string[],
  fichier: File
): Promise<string> {
  const extension = fichier.name.split('.').pop() ?? 'pdf';
  const chemin = `groupe-${emploiIds[0]}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('documents-edt')
    .upload(chemin, fichier, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('documents-edt').getPublicUrl(chemin);
  const url = data.publicUrl;

  const { error } = await supabase
    .from('emplois_du_temps')
    .update({ pdf_signe_url: url })
    .in('id', emploiIds);
  if (error) throw error;

  return url;
}

// Valide l'emploi du temps (statut → 'valide', verrouillé) et notifie
// chaque enseignant concerné avec SES SEULS cours (jour, créneau, salle) —
// journal.md Scénario 6, étapes 7-8. Le rappel automatique la veille de
// chaque cours nécessite une tâche planifiée, pas encore en place.
export async function validerEDT(emploiId: string) {
  const { data: emploi } = await supabase
    .from('emplois_du_temps')
    .select('pdf_signe_url, specialite_id, semaine')
    .eq('id', emploiId)
    .maybeSingle();
  if (!emploi?.pdf_signe_url) {
    throw new Error('Le document signé doit être téléversé avant validation.');
  }

  const { error } = await supabase
    .from('emplois_du_temps')
    .update({ statut: 'valide' })
    .eq('id', emploiId);
  if (error) throw error;

  // Scénario 7 — génération automatique des codes d'ouverture/fermeture
  // pour toute la semaine qui vient d'être validée.
  await genererCodesPourEmploi(emploiId, emploi.specialite_id, emploi.semaine);

  const seances = await getSeances(emploiId, emploi.specialite_id, emploi.semaine);

  const { data: seancesSpe } = await supabase
    .from('seances_edt')
    .select(
      'enseignant_id, jour, creneau, offre:offres(ue:ues(nom)), salle:salles(code_salle)'
    )
    .eq('emploi_du_temps_id', emploiId);

  const { data: offresSpe } = await supabase
    .from('offres')
    .select('ue_id')
    .eq('specialite_id', emploi.specialite_id);
  const ueIds = (offresSpe ?? []).map((o) => o.ue_id);
  let seancesTronc: any[] = [];
  if (ueIds.length > 0) {
    const { data: liens } = await supabase
      .from('troncs_communs_ues')
      .select('tronc_commun_id')
      .in('ue_id', ueIds);
    const troncIds = Array.from(
      new Set((liens ?? []).map((l) => l.tronc_commun_id))
    );
    if (troncIds.length > 0) {
      const { data } = await supabase
        .from('seances_edt')
        .select(
          'enseignant_id, jour, creneau, tronc_commun:troncs_communs(nom), salle:salles(code_salle)'
        )
        .in('tronc_commun_id', troncIds)
        .eq('semaine', emploi.semaine);
      seancesTronc = data ?? [];
    }
  }
  const seancesData = [...(seancesSpe ?? []), ...seancesTronc];

  const parEnseignant = new Map<string, string[]>();
  for (const s of (seancesData ?? []) as any[]) {
    const ligne = `${s.offre?.ue?.nom ?? 'Cours'} — ${s.jour} ${s.creneau} — ${
      s.salle?.code_salle ?? 'salle à confirmer'
    }`;
    const liste = parEnseignant.get(s.enseignant_id) ?? [];
    liste.push(ligne);
    parEnseignant.set(s.enseignant_id, liste);
  }

  const enseignantIds = Array.from(parEnseignant.keys());
  if (enseignantIds.length === 0) return;

  const { data: enseignantsData } = await supabase
    .from('enseignants')
    .select('id, matricule')
    .in('id', enseignantIds);
  const matricules = (enseignantsData ?? []).map((e) => e.matricule);
  const { data: comptesData } = await supabase
    .from('comptes_utilisateurs')
    .select('id, matricule')
    .in('matricule', matricules);
  const enseignantParMatricule = new Map(
    (enseignantsData ?? []).map((e) => [e.matricule, e.id])
  );

  if (comptesData) {
    await supabase.from('notifications').insert(
      comptesData.map((c) => {
        const enseignantId = enseignantParMatricule.get(c.matricule);
        const cours = parEnseignant.get(enseignantId ?? '') ?? [];
        return {
          compte_id: c.id,
          titre: 'Emploi du temps publié',
          message: `Tes cours de la semaine : ${cours.join(' · ')}`,
          lien: '/mes-cours',
        };
      })
    );
  }

  return seances;
}

// ── "Mes cours" (enseignant) ───────────────────────────────────────

export interface MonCours {
  id: string;
  ueId: string | null;
  syllabusKey: string | null;
  attributionId: string | null;
  ueNom: string;
  jour: string;
  creneau: string;
  salleCode: string | null;
  semaine: string;
  pdfSigneUrl: string | null;
}

// Reconstruit "mes cours" depuis les tables Dexie brutes (pas de jointure
// côté cache local, contrairement à Supabase) — utilisée par MesCoursPage
// et par le tableau de bord enseignant.
export async function lireMesCoursDepuisCache(
  matricule: string
): Promise<MonCours[]> {
  const enseignant = await db.enseignants
    .where('matricule')
    .equals(matricule)
    .first();
  if (!enseignant) return [];

  const [seances, offres, ues, salles, emplois, troncsCommuns, attributions] =
    await Promise.all([
      db.seancesEDT.where('enseignant_id').equals(enseignant.id).toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.salles.toArray(),
      db.emploisDuTemps.toArray(),
      db.troncsCommuns.toArray(),
      db.attributions
        .where('enseignant_id')
        .equals(enseignant.id)
        .and((a: any) => a.statut === 'actif')
        .toArray(),
    ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));
  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const attributionParOffre = new Map(
    (attributions as any[]).map((a) => [a.offre_id, a.id])
  );

  return (seances as any[])
    .map((s) => {
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      if (!emploi || emploi.statut !== 'valide') return null;
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const salle = s.salle_id ? salleParId.get(s.salle_id) : null;
      return {
        id: s.id,
        ueId: ue?.id ?? null,
        syllabusKey: ue?.syllabus_key ?? null,
        attributionId: s.offre_id
          ? (attributionParOffre.get(s.offre_id) ?? null)
          : null,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '(tronc commun)',
        jour: s.jour,
        creneau: s.creneau,
        salleCode: salle?.code_salle ?? null,
        semaine: emploi.semaine,
        pdfSigneUrl: emploi.pdf_signe_url ?? null,
      } as MonCours;
    })
    .filter((c): c is MonCours => c !== null)
    .sort((a, b) => a.semaine.localeCompare(b.semaine));
}

export async function listMesCours(matricule: string): Promise<MonCours[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, offre_id,
      offre:offres(ue:ues(id, nom, syllabus_key)),
      salle:salles(code_salle),
      emploi_du_temps:emplois_du_temps(semaine, statut, pdf_signe_url)
    `
    )
    .eq('enseignant_id', enseignant.id);
  if (error) throw error;

  // Attribution active de cet enseignant, par offre — nécessaire pour
  // retrouver l'espace "support de cours" de chaque UE (Scénario 12).
  const { data: attributions } = await supabase
    .from('attributions')
    .select('id, offre_id')
    .eq('enseignant_id', enseignant.id)
    .eq('statut', 'actif');
  const attributionParOffre = new Map(
    (attributions ?? []).map((a) => [a.offre_id, a.id])
  );

  return ((data ?? []) as any[])
    .filter((s) => s.emploi_du_temps?.statut === 'valide')
    .map((s) => ({
      id: s.id,
      ueId: s.offre?.ue?.id ?? null,
      syllabusKey: s.offre?.ue?.syllabus_key ?? null,
      attributionId: s.offre_id
        ? (attributionParOffre.get(s.offre_id) ?? null)
        : null,
      ueNom: s.offre?.ue?.nom ?? '(tronc commun)',
      jour: s.jour,
      creneau: s.creneau,
      salleCode: s.salle?.code_salle ?? null,
      semaine: s.emploi_du_temps.semaine,
      pdfSigneUrl: s.emploi_du_temps.pdf_signe_url,
    }))
    .sort((a, b) => a.semaine.localeCompare(b.semaine));
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2 — Génération groupée par cycle + semestre + semaine.
// L'admin (ou le responsable, selon son périmètre) choisit un cycle +
// un semestre + une semaine, et confectionne d'un coup les emplois de
// TOUTES les spécialités concernées (même dans des écoles/filières
// différentes — un tronc commun peut les regrouper).
// ═══════════════════════════════════════════════════════════════════

export interface CycleOption {
  key: string; // "cycle::sousCycle"
  cycle: string;
  sousCycle: string | null;
  label: string;
}

export async function listCyclesDisponibles(
  perimetreSpecialiteIds: string[] | null
): Promise<CycleOption[]> {
  const { data, error } = await supabase
    .from('specialites')
    .select('id, cycle, sous_cycle');
  if (error) throw error;

  const vues = new Map<string, CycleOption>();
  for (const s of (data ?? []) as any[]) {
    if (perimetreSpecialiteIds && !perimetreSpecialiteIds.includes(s.id))
      continue;
    const key = `${s.cycle}::${s.sous_cycle ?? ''}`;
    if (!vues.has(key)) {
      vues.set(key, {
        key,
        cycle: s.cycle,
        sousCycle: s.sous_cycle ?? null,
        label: s.sous_cycle ? `${s.cycle} (${s.sous_cycle})` : s.cycle,
      });
    }
  }
  return Array.from(vues.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

export interface SpecialiteGroupe {
  id: string;
  nom: string;
  ecoleNom: string;
  filiereNom: string;
  typeCursus: TypeCursus;
}

// Spécialités correspondant à un cycle donné, ayant au moins une UE
// programmée pour le semestre donné, filtrées par périmètre.
export async function listSpecialitesDuCycleSemestre(
  cycle: string,
  sousCycle: string | null,
  semestre: string,
  perimetreSpecialiteIds: string[] | null
): Promise<SpecialiteGroupe[]> {
  let query = supabase
    .from('specialites')
    .select(
      `
      id, nom, type_cursus,
      filiere:filieres(nom, ecole:ecoles(nom)),
      offres(semestre)
    `
    )
    .eq('cycle', cycle);
  query = sousCycle
    ? query.eq('sous_cycle', sousCycle)
    : query.is('sous_cycle', null);
  const { data, error } = await query;
  if (error) throw error;

  const resultat: SpecialiteGroupe[] = [];
  for (const s of (data ?? []) as any[]) {
    if (perimetreSpecialiteIds && !perimetreSpecialiteIds.includes(s.id))
      continue;
    const aOffreCeSemestre = (s.offres ?? []).some(
      (o: any) => o.semestre === semestre
    );
    if (!aOffreCeSemestre) continue;
    resultat.push({
      id: s.id,
      nom: s.nom,
      ecoleNom: s.filiere?.ecole?.nom ?? '',
      filiereNom: s.filiere?.nom ?? '',
      typeCursus: s.type_cursus,
    });
  }
  return resultat.sort((a, b) => a.nom.localeCompare(b.nom));
}

export interface SeanceGroupee extends SeanceDetail {
  // null si séance de tronc commun (partagée, pas rattachée à une
  // seule spécialité) — utiliser specialitesParTronc pour savoir sous
  // quelles spécialités l'afficher.
  specialiteId: string | null;
}

export interface DonneesGroupees {
  seances: SeanceGroupee[];
  emploiParSpecialite: Map<string, string>;
  specialitesParTronc: Map<string, Set<string>>;
  // UE → tronc commun (id + nom) — pour savoir, dès la sélection dans le
  // sélecteur (avant tout enregistrement), qu'une UE choisie appartient
  // à un groupe, et propager localement vers les autres spécialités du
  // groupe déjà chargées dans cette session.
  ueVersTronc: Map<string, { troncCommunId: string; nom: string }>;
}

export async function getSeancesGroupees(
  specialiteIds: string[],
  semaine: string
): Promise<DonneesGroupees> {
  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id, specialite_id')
    .in('specialite_id', specialiteIds)
    .eq('semaine', semaine);
  const emploiParSpecialite = new Map(
    (emplois ?? []).map((e: any) => [e.specialite_id, e.id])
  );
  const emploiIds = (emplois ?? []).map((e: any) => e.id);

  let seancesSpe: any[] = [];
  if (emploiIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        `
        id, jour, creneau, statut, offre_id, tronc_commun_id, salle_id,
        offre:offres(specialite_id, semestre, ue:ues(nom, volume_horaire)),
        enseignant:enseignants(nom),
        salle:salles(code_salle)
      `
      )
      .in('emploi_du_temps_id', emploiIds);
    if (error) throw error;
    seancesSpe = data ?? [];
  }

  const { data: offresGroupe } = await supabase
    .from('offres')
    .select('ue_id, specialite_id')
    .in('specialite_id', specialiteIds);
  const specialiteParUe = new Map(
    (offresGroupe ?? []).map((o: any) => [o.ue_id, o.specialite_id])
  );
  const ueIds = Array.from(specialiteParUe.keys());

  let seancesTronc: any[] = [];
  const specialitesParTronc = new Map<string, Set<string>>();
  const ueVersTronc = new Map<string, { troncCommunId: string; nom: string }>();
  const volumeHoraireParTronc = new Map<string, number>();
  if (ueIds.length > 0) {
    const { data: liens } = await supabase
      .from('troncs_communs_ues')
      .select(
        'tronc_commun_id, ue_id, tronc_commun:troncs_communs(nom), ue:ues(volume_horaire)'
      )
      .in('ue_id', ueIds);
    for (const l of (liens ?? []) as any[]) {
      const specialiteId = specialiteParUe.get(l.ue_id);
      if (!specialiteId) continue;
      if (!specialitesParTronc.has(l.tronc_commun_id)) {
        specialitesParTronc.set(l.tronc_commun_id, new Set());
      }
      specialitesParTronc.get(l.tronc_commun_id)!.add(specialiteId);
      ueVersTronc.set(l.ue_id, {
        troncCommunId: l.tronc_commun_id,
        nom: l.tronc_commun?.nom ?? '',
      });
      // Toutes les UEs membres partagent le même volume horaire (créées
      // ensemble avec les mêmes caractéristiques) — on prend la première
      // valeur trouvée.
      if (!volumeHoraireParTronc.has(l.tronc_commun_id) && l.ue?.volume_horaire != null) {
        volumeHoraireParTronc.set(l.tronc_commun_id, l.ue.volume_horaire);
      }
    }
    const troncIds = Array.from(specialitesParTronc.keys());
    if (troncIds.length > 0) {
      const { data, error } = await supabase
        .from('seances_edt')
        .select(
          `
          id, jour, creneau, statut, tronc_commun_id, salle_id,
          tronc_commun:troncs_communs(nom),
          enseignant:enseignants(nom),
          salle:salles(code_salle)
        `
        )
        .in('tronc_commun_id', troncIds)
        .eq('semaine', semaine);
      if (error) throw error;
      seancesTronc = data ?? [];
    }
  }

  const resultatSpe: SeanceGroupee[] = seancesSpe.map((s) => ({
    id: s.id,
    offreId: s.offre_id,
    troncCommunId: null,
    ueNom: s.offre?.ue?.nom ?? '',
    volumeHoraire: s.offre?.ue?.volume_horaire ?? null,
    semestre: s.offre?.semestre ?? null,
    enseignantNom: s.enseignant?.nom ?? '',
    salleCode: s.salle?.code_salle ?? null,
    salleId: s.salle_id,
    jour: s.jour,
    creneau: s.creneau,
    statut: s.statut,
    specialiteId: s.offre?.specialite_id ?? null,
  }));

  const resultatTronc: SeanceGroupee[] = seancesTronc.map((s) => ({
    id: s.id,
    offreId: null,
    troncCommunId: s.tronc_commun_id,
    ueNom: s.tronc_commun?.nom ?? '',
    volumeHoraire: volumeHoraireParTronc.get(s.tronc_commun_id) ?? null,
    semestre: null,
    enseignantNom: s.enseignant?.nom ?? '',
    salleCode: s.salle?.code_salle ?? null,
    salleId: s.salle_id,
    jour: s.jour,
    creneau: s.creneau,
    statut: s.statut,
    specialiteId: null,
  }));

  return {
    seances: [...resultatSpe, ...resultatTronc],
    emploiParSpecialite,
    specialitesParTronc,
    ueVersTronc,
  };
}

// Trouve ou crée l'emploi du temps (vierge) d'une spécialité pour une
// semaine — utilisé à l'enregistrement groupé, une fois par spécialité
// qui n'en a pas encore.
export async function trouverOuCreerEmploi(
  specialiteId: string,
  semaine: string
): Promise<string> {
  const { data: existant } = await supabase
    .from('emplois_du_temps')
    .select('id')
    .eq('specialite_id', specialiteId)
    .eq('semaine', semaine)
    .maybeSingle();
  if (existant) return existant.id;

  const campagne = await getDerniereCampagne();
  if (campagne && campagne.statut === 'active') {
    await arreterCampagne(campagne.id);
  }

  const { data, error } = await supabase
    .from('emplois_du_temps')
    .insert({ specialite_id: specialiteId, semaine, statut: 'genere' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}