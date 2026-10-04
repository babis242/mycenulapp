// src/features/emploi-du-temps/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import {
  arreterCampagne,
  getDerniereCampagne,
  getDernieresCampagnesParEnseignant,
} from '@/features/disponibilites/api';
import { genererCodesPourEmploi } from '@/features/codes-journaliers/api';
import { heuresEffectueesPourSeance, seanceEstTerminee } from '@/lib/calculHeures';
import { bornesCreneau, tousLesCreneaux } from '@/lib/creneaux';
import { JOURS } from '@/constants/enums';
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
  // Chaque enseignant est jugé sur SA propre dernière campagne (celle à
  // laquelle il a réellement été rattaché), pas sur "la dernière
  // campagne" au sens global — voir le commentaire de
  // getDernieresCampagnesParEnseignant pour le bug que ça évite.
  const campagnesParEnseignant = await getDernieresCampagnesParEnseignant();
  if (campagnesParEnseignant.size === 0) return [];

  const { data, error } = await supabase
    .from('disponibilites')
    .select('enseignant_id, campagne_id, enseignant:enseignants(id, nom, matricule)')
    .eq('jour', jour)
    .eq('creneau', creneau)
    .eq('disponible', true);
  if (error) throw error;

  const resultats: EnseignantDisponible[] = [];
  for (const d of (data ?? []) as any[]) {
    if (
      d.enseignant &&
      campagnesParEnseignant.get(d.enseignant_id) === d.campagne_id
    ) {
      resultats.push(d.enseignant);
    }
  }
  return resultats;
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

// Salles réellement libres pour un créneau donné (semaine + jour +
// créneau), toutes spécialités/cycles confondus — même source de vérité
// que le contrôle de conflit fait côté serveur à l'enregistrement
// (assignerSeance/propagerVersGroupe ci-dessous interrogent aussi
// "seances_edt" filtré par semaine/jour/creneau, sans restriction de
// spécialité). Ça évite de proposer, dans la modale de programmation,
// une salle déjà prise par une autre spécialité au même moment — un
// conflit qui n'était détecté qu'APRÈS l'enregistrement jusqu'ici.
//
// "seanceIdAExclure" : l'id de la séance en cours de modification (le
// cas échéant) — sa propre salle actuelle ne doit pas se compter comme
// "occupée" par elle-même.
export async function getSallesLibresPourCreneau(
  semaine: string,
  jour: string,
  creneau: string,
  seanceIdAExclure?: string | null
) {
  const [{ data: toutesLesSalles }, { data: occupees }] = await Promise.all([
    supabase.from('salles').select('id, code_salle, capacite').order('code_salle'),
    supabase
      .from('seances_edt')
      .select('id, salle_id')
      .eq('semaine', semaine)
      .eq('jour', jour)
      .eq('creneau', creneau),
  ]);

  const sallesOccupeesIds = new Set(
    ((occupees ?? []) as any[])
      .filter((o) => o.id !== seanceIdAExclure && o.salle_id)
      .map((o) => o.salle_id as string)
  );

  return ((toutesLesSalles ?? []) as any[]).filter(
    (s) => !sallesOccupeesIds.has(s.id)
  );
}

// ── Détail des séances ──────────────────────────────────────────────

export interface SeanceDetail {
  id: string;
  offreId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  volumeHoraire: number | null;
  semestre: string | null;
  enseignantId: string | null;
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
      enseignant:enseignants(id, nom),
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
          enseignant:enseignants(id, nom),
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
        enseignantId: s.enseignant?.id ?? null,
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
      enseignantId: s.enseignant?.id ?? null,
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

// Durée PROGRAMMÉE d'un créneau — désormais gérée par
// heuresEffectueesPourSeance (lib/calculHeures.ts), qui applique aussi
// la règle de retard de l'école (marge de 15 min, puis 1h perdue par
// palier dépassé) plutôt qu'un simple forfait plat.

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
      'id, offre_id, jour, creneau, heure_ouverture, heure_fermeture, emploi_du_temps:emplois_du_temps(statut, semaine)'
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
    parOffre
      .get(s.offre_id)!
      .push({ ...s, estSemaineActuelle, semaine: emploi.semaine });
  }

  const resultat = new Map<string, number>();
  for (const liste of parOffre.values()) {
    let cumulPasse = 0;
    const seancesActuelles: any[] = [];
    for (const s of liste) {
      if (s.estSemaineActuelle) seancesActuelles.push(s);
      // Séance déjà passée : applique la règle de retard ET de
      // fermeture anticipée (voir lib/calculHeures.ts) à partir des
      // heures réelles d'ouverture et de fermeture — plus juste que la
      // durée nominale plate.
      else
        cumulPasse += heuresEffectueesPourSeance(
          s.semaine,
          s.jour,
          s.creneau,
          s.heure_ouverture,
          s.heure_fermeture
        );
    }
    seancesActuelles.sort((a, b) => {
      const diffJour = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      return (CRENEAU_ORDRE[a.creneau] ?? 0) - (CRENEAU_ORDRE[b.creneau] ?? 0);
    });
    let cumul = cumulPasse;
    for (const s of seancesActuelles) {
      // Semaine en cours : la séance peut ne pas encore avoir eu lieu
      // (ou être en cours) — pas d'heure d'ouverture/fermeture réelle
      // fiable à exploiter tant que ce n'est pas une semaine passée.
      // Utilise la règle quand même : si déjà ouverte/fermée, elle
      // s'applique normalement ; sinon elle retombe sur la durée
      // nominale (comportement de heuresEffectueesPourSeance sans heure
      // d'ouverture).
      cumul += heuresEffectueesPourSeance(
        s.semaine,
        s.jour,
        s.creneau,
        s.heure_ouverture ?? null,
        s.heure_fermeture ?? null
      );
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
    .select(
      'id, tronc_commun_id, jour, creneau, heure_ouverture, heure_fermeture, semaine'
    )
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
      else
        cumulPasse += heuresEffectueesPourSeance(
          s.semaine,
          s.jour,
          s.creneau,
          s.heure_ouverture,
          s.heure_fermeture
        );
    }
    seancesActuelles.sort((a, b) => {
      const diffJour = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      return (CRENEAU_ORDRE[a.creneau] ?? 0) - (CRENEAU_ORDRE[b.creneau] ?? 0);
    });
    let cumul = cumulPasse;
    for (const s of seancesActuelles) {
      cumul += heuresEffectueesPourSeance(
        s.semaine,
        s.jour,
        s.creneau,
        s.heure_ouverture ?? null,
        s.heure_fermeture ?? null
      );
      resultat.set(s.id, cumul);
    }
  }
  return resultat;
}

// Durée nominale d'un créneau (heures), depuis la table "creneaux" —
// même source que le reste de l'app, avec le même repli si un créneau a
// disparu du référentiel entre-temps.
function dureeNominaleCreneau(creneau: string): number {
  const bornes = bornesCreneau(creneau);
  if (bornes) return (bornes.fin - bornes.debut) / 60;
  return creneau === '14h-17h' ? 3 : 4;
}

// Durée (heures) du plus petit créneau existant — sert de seuil pour
// décider qu'une UE/tronc est "achevé" : voir estAcheve ci-dessous.
function dureeCreneauMinimale(): number {
  const durees = tousLesCreneaux().map(dureeNominaleCreneau);
  return durees.length > 0 ? Math.min(...durees) : 3;
}

// Règle demandée : une UE (ou un tronc) n'est PAS "achevé" simplement
// quand les heures effectuées atteignent/dépassent le volume horaire —
// elle l'est dès que son solde d'heures RESTANTES devient inférieur à la
// durée du plus petit créneau existant, puisqu'aucun créneau ne peut
// alors plus être programmé sans dépasser le volume horaire. Exemple
// avec les créneaux 08h-12h (4h) et 14h-17h (3h) : s'il reste 4h, on
// peut encore programmer un 08h-12h ; s'il reste 3h, on peut encore
// programmer un 14h-17h ; s'il reste moins de 3h, plus aucun créneau ne
// convient — le cours est achevé.
function estAcheve(heuresEffectuees: number, volumeHoraire: number | null): boolean {
  if (volumeHoraire == null) return false;
  return volumeHoraire - heuresEffectuees < dureeCreneauMinimale();
}

// ── Heures "validées" (= réellement effectuées) par séance ─────────
// Utilisé partout où on affiche "X/Yh" au fil de la programmation ou
// sur le PDF (GenererEDTPage ET ValidationEDTPage) : PAS lié au statut
// de validation de l'emploi du temps (genere / en_attente_validation /
// valide) — uniquement à la réalité de chaque créneau, quelle que soit
// sa semaine :
//   - Séance déjà ouverte par l'enseignant (heure_ouverture connue) :
//     heures RÉELLEMENT effectuées (règle de retard/fermeture
//     anticipée, cf. heuresEffectueesPourSeance).
//   - Séance jamais ouverte, et dont le créneau est déjà terminé
//     (seanceEstTerminee) : ABSENCE confirmée — 0h. AVANT : une séance
//     sans heure d'ouverture comptait toujours en durée nominale
//     complète, qu'elle soit une vraie absence ou simplement pas encore
//     arrivée — les deux cas étaient indiscernables et une absence
//     gonflait le total à tort.
//   - Séance jamais ouverte, mais dont le créneau n'est pas encore
//     terminé (à venir, ou en cours) : pas encore due — compte pour sa
//     durée nominale ("la séance programmée").
// Le résultat, par id de séance, est le CUMUL chronologique (toutes
// semaines confondues, triées semaine puis jour puis créneau) jusqu'à
// et y compris cette séance — donc chaque case de la grille affiche le
// total à ce point précis du parcours de l'UE.
function contributionSeance(
  s: { semaine: string; jour: string; creneau: string; heure_ouverture: string | null; heure_fermeture?: string | null },
  maintenant: Date
): number {
  if (s.heure_ouverture) {
    return heuresEffectueesPourSeance(
      s.semaine,
      s.jour,
      s.creneau,
      s.heure_ouverture,
      s.heure_fermeture ?? null
    );
  }
  if (seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant)) {
    return 0; // absence confirmée
  }
  return dureeNominaleCreneau(s.creneau); // pas encore due
}

function trierChronologiquement<T extends { semaine: string; jour: string; creneau: string }>(
  liste: T[]
): T[] {
  return [...liste].sort((a, b) => {
    if (a.semaine !== b.semaine) return a.semaine.localeCompare(b.semaine);
    const diffJour = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
    if (diffJour !== 0) return diffJour;
    return (CRENEAU_ORDRE[a.creneau] ?? 0) - (CRENEAU_ORDRE[b.creneau] ?? 0);
  });
}

export async function getHeuresValideesPourPdf(
  offreIds: string[]
): Promise<Map<string, number>> {
  if (offreIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select('id, offre_id, jour, creneau, heure_ouverture, heure_fermeture, semaine')
    .in('offre_id', offreIds);

  const maintenant = new Date(Date.now() + 60 * 60 * 1000); // Cameroun UTC+1

  const parOffre = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    if (!parOffre.has(s.offre_id)) parOffre.set(s.offre_id, []);
    parOffre.get(s.offre_id)!.push(s);
  }

  const resultat = new Map<string, number>();
  for (const liste of parOffre.values()) {
    let cumul = 0;
    for (const s of trierChronologiquement(liste)) {
      cumul += contributionSeance(s, maintenant);
      resultat.set(s.id, cumul);
    }
  }
  return resultat;
}

// Total d'heures validées par offre (dernier cumul chronologique, tous
// semaines confondues) — contrairement à getHeuresValideesPourPdf (qui
// renvoie le cumul par SÉANCE, pour l'affichage progressif dans le
// PDF), ici on ne veut que le total final par UE/offre, pour savoir si
// elle est "achevée" (total >= volume horaire) — utilisé par la
// campagne de disponibilités (features/disponibilites) pour ne
// proposer que les UEs pas encore achevées.
export async function getHeuresTotalesValideesParOffre(
  offreIds: string[]
): Promise<Map<string, number>> {
  if (offreIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select('id, offre_id, jour, creneau, heure_ouverture, heure_fermeture, semaine')
    .in('offre_id', offreIds);

  const maintenant = new Date(Date.now() + 60 * 60 * 1000); // Cameroun UTC+1

  const parOffre = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    if (!parOffre.has(s.offre_id)) parOffre.set(s.offre_id, []);
    parOffre.get(s.offre_id)!.push(s);
  }

  const resultat = new Map<string, number>();
  for (const [offreId, liste] of parOffre) {
    let cumul = 0;
    for (const s of trierChronologiquement(liste)) {
      cumul += contributionSeance(s, maintenant);
    }
    resultat.set(offreId, cumul);
  }
  return resultat;
}

// Même principe pour une UE de tronc commun.
export async function getHeuresValideesTroncPourPdf(
  troncCommunIds: string[]
): Promise<Map<string, number>> {
  if (troncCommunIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select(
      'id, tronc_commun_id, jour, creneau, heure_ouverture, heure_fermeture, semaine'
    )
    .in('tronc_commun_id', troncCommunIds);

  const maintenant = new Date(Date.now() + 60 * 60 * 1000);

  const parTronc = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    if (!parTronc.has(s.tronc_commun_id)) parTronc.set(s.tronc_commun_id, []);
    parTronc.get(s.tronc_commun_id)!.push(s);
  }

  const resultat = new Map<string, number>();
  for (const liste of parTronc.values()) {
    let cumul = 0;
    for (const s of trierChronologiquement(liste)) {
      cumul += contributionSeance(s, maintenant);
      resultat.set(s.id, cumul);
    }
  }
  return resultat;
}

// Équivalent de getHeuresTotalesValideesParOffre, mais pour un tronc
// commun (clé = tronc_commun_id au lieu de offre_id) — utilisé par la
// génération automatique pour savoir si le quota horaire d'un tronc
// commun est déjà achevé.
export async function getHeuresTotalesValideesParTronc(
  troncCommunIds: string[]
): Promise<Map<string, number>> {
  if (troncCommunIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select('id, tronc_commun_id, jour, creneau, heure_ouverture, heure_fermeture, semaine')
    .in('tronc_commun_id', troncCommunIds);

  const maintenant = new Date(Date.now() + 60 * 60 * 1000); // Cameroun UTC+1

  const parTronc = new Map<string, any[]>();
  for (const s of (data ?? []) as any[]) {
    if (!parTronc.has(s.tronc_commun_id)) parTronc.set(s.tronc_commun_id, []);
    parTronc.get(s.tronc_commun_id)!.push(s);
  }

  const resultat = new Map<string, number>();
  for (const [troncId, liste] of parTronc) {
    let cumul = 0;
    for (const s of trierChronologiquement(liste)) {
      cumul += contributionSeance(s, maintenant);
    }
    resultat.set(troncId, cumul);
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
        enseignantId: s.enseignant_id ?? null,
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
      enseignantId: s.enseignant_id ?? null,
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
  // Les deux lectures ci-dessous sont indépendantes (l'une cherche la
  // séance de tronc commun existante, l'autre vérifie les conflits
  // globaux du créneau) — elles partaient en série avant, chacune
  // attendant la précédente pour rien. En parallèle, on divise par ~2
  // le temps d'attente réseau de cette étape.
  const [{ data: seanceExistante }, { data: memeCreneauGlobal }] =
    await Promise.all([
      supabase
        .from('seances_edt')
        .select('id')
        .eq('tronc_commun_id', troncCommunId)
        .eq('semaine', semaine)
        .eq('jour', jour)
        .eq('creneau', creneau)
        .maybeSingle(),
      // Même contrôle que pour une séance simple : un enseignant ou une
      // salle ne peuvent être occupés qu'une seule fois par créneau,
      // toutes spécialités confondues. Nécessite l'index
      // idx_seances_edt_semaine_jour_creneau (voir migration SQL) pour
      // rester rapide quand la table grossit.
      supabase
        .from('seances_edt')
        .select('id, salle_id, enseignant_id')
        .eq('semaine', semaine)
        .eq('jour', jour)
        .eq('creneau', creneau),
    ]);

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

  // Deux requêtes simples et explicites plutôt qu'une jointure imbriquée
  // — celle-ci ne fonctionne que si PostgREST détecte une vraie
  // contrainte de clé étrangère entre troncs_communs_ues et ues ; sans
  // cette contrainte (un simple index ne suffit pas), la requête
  // réussissait silencieusement mais ne renvoyait jamais le lien vers le
  // tronc commun, sans la moindre erreur.
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
  const lienTroncId: string | null = lienTronc?.tronc_commun_id ?? null;

  if (lienTroncId) {
    await propagerVersGroupe(
      lienTroncId,
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
  // seulement dans le même emploi du temps). Nécessite l'index
  // idx_seances_edt_semaine_jour_creneau pour rester rapide.
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

// ── Enregistrement groupé (ÉTAPE 1 — optimisation) ──────────────────
// Remplace la boucle "une case modifiée = 4 à 6 requêtes séquentielles"
// (trouverOuCreerEmploi + assignerSeance appelés un par un dans un
// for...of) par un nombre CONSTANT de requêtes, quel que soit le nombre
// de cases modifiées :
//   1. une requête groupée pour créer les emplois du temps manquants,
//   2. une requête groupée pour résoudre offre → tronc commun pour
//      toutes les cases à la fois,
//   3. une requête "photo" de toute la semaine (conflits calculés
//      ensuite en mémoire, pas requête par requête),
//   4. au plus 3 requêtes d'écriture groupées (suppressions, séances
//      simples, séances de tronc commun).
// Avant : N cases → jusqu'à N×6 requêtes. Maintenant : toujours ~6-7
// requêtes, peu importe N.

// Garantit qu'un emploi du temps existe (même vide) pour chaque
// spécialité du groupe, pour cette semaine — en 1 lecture + au plus 1
// écriture groupée, au lieu d'une création par spécialité.
export async function garantirEmploisPourGroupe(
  specialiteIds: string[],
  semaine: string
): Promise<Map<string, string>> {
  if (specialiteIds.length === 0) return new Map();

  const { data: existants, error } = await supabase
    .from('emplois_du_temps')
    .select('id, specialite_id')
    .in('specialite_id', specialiteIds)
    .eq('semaine', semaine);
  if (error) throw error;

  const emploiParSpecialite = new Map<string, string>(
    (existants ?? []).map((e: any) => [e.specialite_id, e.id])
  );

  const manquantes = specialiteIds.filter(
    (id) => !emploiParSpecialite.has(id)
  );
  if (manquantes.length > 0) {
    // Une campagne de disponibilités active doit être arrêtée avant de
    // créer de nouveaux emplois du temps (comme trouverOuCreerEmploi) —
    // vérifié UNE FOIS pour tout le lot, pas par spécialité.
    const campagne = await getDerniereCampagne();
    if (campagne && campagne.statut === 'active') {
      await arreterCampagne(campagne.id);
    }

    const { data: crees, error: insError } = await supabase
      .from('emplois_du_temps')
      .insert(
        manquantes.map((specialite_id) => ({
          specialite_id,
          semaine,
          statut: 'genere',
        }))
      )
      .select('id, specialite_id');
    if (insError) throw insError;
    for (const e of (crees ?? []) as any[]) {
      emploiParSpecialite.set(e.specialite_id, e.id);
    }
  }

  return emploiParSpecialite;
}

export interface AssignationLot {
  specialiteId: string;
  offreId: string;
  enseignantId: string;
  salleId: string | null;
  jour: string;
  creneau: string;
  // id réel d'une séance existante à modifier, ou null pour une
  // nouvelle case (jamais un id "local-..." — le caller doit déjà avoir
  // filtré ça).
  seanceIdExistante: string | null;
}

export async function enregistrerChangementsEnLot(
  assignations: AssignationLot[],
  suppressions: string[],
  emploiParSpecialite: Map<string, string>,
  semaine: string
): Promise<void> {
  // Suppressions explicites (cases vidées par l'utilisateur) — un seul
  // aller-retour pour toutes, au lieu d'un par case supprimée.
  if (suppressions.length > 0) {
    const { error } = await supabase
      .from('seances_edt')
      .delete()
      .in('id', suppressions);
    if (error) throw error;
  }
  if (assignations.length === 0) return;

  // 1) Résout offre → UE → tronc commun pour TOUTES les offres du lot.
  //
  // AVANT : une seule requête avec jointure imbriquée
  // (offres -> ue:ues(troncs_communs_ues(tronc_commun_id))) — mais ce
  // type de jointure imbriquée ne fonctionne QUE si PostgREST détecte
  // une vraie contrainte de clé étrangère entre troncs_communs_ues et
  // ues. S'il n'y a qu'un index unique sans contrainte FK explicite (cas
  // possible), la requête réussit quand même, mais renvoie
  // silencieusement un lien vide pour CHAQUE offre — sans la moindre
  // erreur. Résultat : toute case programmée sur une UE de tronc commun
  // était alors traitée comme une UE de spécialité normale, jamais
  // propagée au groupe.
  // MAINTENANT : deux requêtes simples et explicites, sans jointure
  // imbriquée — fonctionnent quelle que soit la présence ou non d'une
  // contrainte FK, puisqu'elles filtrent juste sur des colonnes brutes.
  const offreIds = Array.from(new Set(assignations.map((a) => a.offreId)));
  const { data: offresData, error: offresError } = await supabase
    .from('offres')
    .select('id, ue_id')
    .in('id', offreIds);
  if (offresError) throw offresError;
  const ueIdParOffre = new Map<string, string>();
  for (const o of (offresData ?? []) as any[]) {
    ueIdParOffre.set(o.id, o.ue_id);
  }

  const ueIds = Array.from(new Set(Array.from(ueIdParOffre.values())));
  const troncParUe = new Map<string, string>();
  if (ueIds.length > 0) {
    const { data: liensTronc, error: liensError } = await supabase
      .from('troncs_communs_ues')
      .select('ue_id, tronc_commun_id')
      .in('ue_id', ueIds);
    if (liensError) throw liensError;
    for (const l of (liensTronc ?? []) as any[]) {
      troncParUe.set(l.ue_id, l.tronc_commun_id);
    }
  }

  const troncParOffre = new Map<string, string | null>();
  for (const [offreId, ueId] of ueIdParOffre) {
    troncParOffre.set(offreId, troncParUe.get(ueId) ?? null);
  }

  // 2) Photo de TOUTES les séances de cette semaine, toutes spécialités
  // confondues — une seule requête sert de base au calcul de conflit
  // pour l'ensemble du lot (au lieu d'une requête de conflit par case).
  const { data: semaineData, error: semaineError } = await supabase
    .from('seances_edt')
    .select('id, jour, creneau, salle_id, enseignant_id, tronc_commun_id')
    .eq('semaine', semaine);
  if (semaineError) throw semaineError;

  interface LigneEtat {
    id: string | null;
    salle_id: string | null;
    enseignant_id: string;
    tronc_commun_id: string | null;
  }
  const cle = (jour: string, creneau: string) => `${jour}|${creneau}`;
  const etatParCreneau = new Map<string, LigneEtat[]>();
  for (const s of (semaineData ?? []) as any[]) {
    const k = cle(s.jour, s.creneau);
    if (!etatParCreneau.has(k)) etatParCreneau.set(k, []);
    etatParCreneau.get(k)!.push({
      id: s.id,
      salle_id: s.salle_id,
      enseignant_id: s.enseignant_id,
      tronc_commun_id: s.tronc_commun_id,
    });
  }

  // 3) Calcul des conflits ET construction des lignes finales, en
  // mémoire — aucune requête réseau dans cette boucle. L'état en
  // mémoire est mis à jour au fil du traitement pour que les cases
  // suivantes du MÊME lot voient déjà les précédentes (même logique
  // qu'un traitement séquentiel, mais sans aller-retour réseau).
  const lignesSimplesParCle = new Map<string, any>();
  const lignesTroncParCle = new Map<string, any>();
  const idsASupprimerEnPlus: string[] = [];

  for (const a of assignations) {
    const troncId = troncParOffre.get(a.offreId) ?? null;
    const k = cle(a.jour, a.creneau);
    const lignesDuCreneau = etatParCreneau.get(k) ?? [];

    if (troncId) {
      const existante = lignesDuCreneau.find(
        (l) => l.tronc_commun_id === troncId
      );
      const idAExclure = existante?.id ?? null;
      const conflitEnseignant = lignesDuCreneau.some(
        (l) => l.id !== idAExclure && l.enseignant_id === a.enseignantId
      );
      const conflitSalle =
        !!a.salleId &&
        lignesDuCreneau.some(
          (l) => l.id !== idAExclure && l.salle_id === a.salleId
        );
      const statut: 'ok' | 'conflit' =
        !a.salleId || conflitEnseignant || conflitSalle ? 'conflit' : 'ok';

      const cleTronc = `${troncId}|${k}`;
      lignesTroncParCle.set(cleTronc, {
        ...(existante?.id ? { id: existante.id } : {}),
        tronc_commun_id: troncId,
        semaine,
        jour: a.jour,
        creneau: a.creneau,
        enseignant_id: a.enseignantId,
        salle_id: a.salleId,
        statut,
      });

      const sansAncienne = lignesDuCreneau.filter(
        (l) => l.tronc_commun_id !== troncId
      );
      sansAncienne.push({
        id: existante?.id ?? `en-attente-${cleTronc}`,
        salle_id: a.salleId,
        enseignant_id: a.enseignantId,
        tronc_commun_id: troncId,
      });
      etatParCreneau.set(k, sansAncienne);

      // Si on modifiait une ancienne séance "simple" sur cette case et
      // qu'elle devient une séance de groupe, l'ancienne doit disparaître.
      if (a.seanceIdExistante) idsASupprimerEnPlus.push(a.seanceIdExistante);
      continue;
    }

    // Cas simple (pas de tronc commun).
    const conflitEnseignant = lignesDuCreneau.some(
      (l) => l.id !== a.seanceIdExistante && l.enseignant_id === a.enseignantId
    );
    const conflitSalle =
      !!a.salleId &&
      lignesDuCreneau.some(
        (l) => l.id !== a.seanceIdExistante && l.salle_id === a.salleId
      );
    const statut: 'ok' | 'conflit' =
      !a.salleId || conflitEnseignant || conflitSalle ? 'conflit' : 'ok';

    const cleSimple =
      a.seanceIdExistante ??
      `nouvelle|${a.specialiteId}|${k}|${a.offreId}`;
    lignesSimplesParCle.set(cleSimple, {
      ...(a.seanceIdExistante ? { id: a.seanceIdExistante } : {}),
      emploi_du_temps_id: emploiParSpecialite.get(a.specialiteId) ?? null,
      offre_id: a.offreId,
      tronc_commun_id: null,
      enseignant_id: a.enseignantId,
      salle_id: a.salleId,
      semaine,
      jour: a.jour,
      creneau: a.creneau,
      statut,
    });

    const sansAncienne = lignesDuCreneau.filter(
      (l) => l.id !== a.seanceIdExistante
    );
    sansAncienne.push({
      id: a.seanceIdExistante ?? `en-attente-${cleSimple}`,
      salle_id: a.salleId,
      enseignant_id: a.enseignantId,
      tronc_commun_id: null,
    });
    etatParCreneau.set(k, sansAncienne);
  }

  // 4) Écriture : au plus 3 requêtes pour TOUT le lot, peu importe le
  // nombre de cases (au lieu d'une par case).
  if (idsASupprimerEnPlus.length > 0) {
    const { error } = await supabase
      .from('seances_edt')
      .delete()
      .in('id', idsASupprimerEnPlus);
    if (error) throw error;
  }

  const lignesSimples = Array.from(lignesSimplesParCle.values());
  if (lignesSimples.length > 0) {
    const { error } = await supabase
      .from('seances_edt')
      .upsert(lignesSimples, { onConflict: 'id' });
    if (error) throw error;
  }

  const lignesTronc = Array.from(lignesTroncParCle.values());
  if (lignesTronc.length > 0) {
    const { error } = await supabase
      .from('seances_edt')
      .upsert(lignesTronc, { onConflict: 'id' });
    if (error) throw error;
  }
}

// ── Génération automatique de l'emploi du temps (v2) ────────────────
// Reprise après une v1 retirée pour deux raisons : lenteur (un
// nettoyage lancé à CHAQUE chargement d'écran relisait tout
// l'historique de chaque UE/tronc du groupe) et un algorithme qui
// rescannait toute la grille de créneaux pour chaque item à chaque
// tour. Cette version :
//   - ne nettoie les séances devenues superflues (quota déjà achevé)
//     QU'AU MOMENT DE GÉNÉRER, jamais au chargement de la page ;
//   - borne le placement par item à SES seuls créneaux réellement
//     disponibles (déclarés par son enseignant), au lieu de rescanner
//     toute la grille à chaque tentative ;
//   - ignore complètement les salles (seule la disponibilité de
//     l'enseignant compte) ;
//   - résout la disponibilité de chaque enseignant sur SA propre
//     dernière campagne (pas "la dernière campagne" au sens global —
//     un enseignant peut avoir répondu à une campagne antérieure à une
//     autre campagne plus récente concernant un groupe différent).
//
// Contraintes dures : quota horaire non dépassé, créneau déclaré
// disponible par l'enseignant attitré, pas de double réservation
// enseignant, pas de double réservation spécialité, samedi après-midi
// toujours libre.
// Objectif (best-effort, pas une contrainte dure) : prioriser les
// troncs communs (le plus de filières d'abord), occuper le maximum de
// créneaux, garantir autant que possible au moins une séance à chaque
// UE en cours — sinon le signaler par spécialité avec la raison exacte.
export interface ItemNonPlace {
  nom: string;
  raison: string;
  // Spécialités concernées par cette UE/ce tronc non programmé — pour
  // pouvoir signaler, une fois une spécialité précise affichée sur
  // GenererEDTPage, les UE en cours qu'elle n'a pas pu obtenir.
  specialiteIds: string[];
}

export interface ResultatGenerationAuto {
  nbSeancesTroncPlacees: number;
  nbSeancesSpecialitesPlacees: number;
  nonPlacees: ItemNonPlace[];
}

// Supabase/PostgREST plafonne chaque requête à 1000 lignes par défaut —
// silencieusement (pas d'erreur, juste les lignes suivantes manquantes).
// Cette fonction récupère TOUTES les lignes, page par page.
export async function recupererToutesLesLignes<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const TAILLE_PAGE = 1000;
  const resultat: T[] = [];
  let debut = 0;
  for (;;) {
    const { data, error } = await requete(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    const lot = data ?? [];
    resultat.push(...lot);
    if (lot.length < TAILLE_PAGE) break;
    debut += TAILLE_PAGE;
  }
  return resultat;
}

// ── Nettoyage des séances devenues superflues (quota déjà achevé) ──
// Les heures "validées" comptent, pour une séance pas encore due
// (jamais ouverte, échéance pas encore passée), sa durée nominale
// complète par anticipation (cf. contributionSeance) — donc dès qu'une
// UE/tronc a atteint son volume horaire, toute séance PLANIFIÉE MAIS
// PAS ENCORE DUE au-delà de ce point est désormais inutile. Appelée
// UNIQUEMENT au moment de générer (jamais au chargement de l'écran,
// pour ne jamais ralentir la simple consultation) — voir le
// commentaire en tête de fichier sur la v1 retirée pour le détail du
// problème de performance que ça évite.
//
// PERF : on ne regarde d'abord que la semaine affichée (requête
// indexée et bornée) pour repérer les quelques UE/troncs qui ont, cette
// semaine précise, une séance pas encore due — ce n'est que pour ces
// candidats qu'on va chercher leur historique complet.
async function nettoyerSeancesQuotaAtteint(
  specialiteIds: string[],
  semaine: string
): Promise<number> {
  if (specialiteIds.length === 0) return 0;

  // Requêtes volontairement SANS jointure imbriquée (.select('ue:ues(...)'))
  // — ce type d'embed PostgREST peut, selon les contraintes de clé
  // étrangère réellement déclarées en base, renvoyer silencieusement un
  // lien vide (ue: null) sans la moindre erreur.
  const { data: offresData, error: offresError } = await supabase
    .from('offres')
    .select('id, ue_id')
    .in('specialite_id', specialiteIds);
  if (offresError) throw offresError;
  const offres = (offresData ?? []) as any[];
  if (offres.length === 0) return 0;

  const ueIds = Array.from(new Set(offres.map((o) => o.ue_id)));
  const { data: liensData, error: liensError } = await supabase
    .from('troncs_communs_ues')
    .select('ue_id, tronc_commun_id')
    .in('ue_id', ueIds);
  if (liensError) throw liensError;

  const troncIdParUe = new Map<string, string>();
  for (const l of (liensData ?? []) as any[]) {
    troncIdParUe.set(l.ue_id, l.tronc_commun_id);
  }
  const offresStandaloneIds = offres
    .filter((o) => !troncIdParUe.has(o.ue_id))
    .map((o) => o.id);
  const troncIds = Array.from(new Set(Array.from(troncIdParUe.values())));

  if (offresStandaloneIds.length === 0 && troncIds.length === 0) return 0;

  const orParts: string[] = [];
  if (offresStandaloneIds.length > 0) {
    orParts.push(`offre_id.in.(${offresStandaloneIds.join(',')})`);
  }
  if (troncIds.length > 0) {
    orParts.push(`tronc_commun_id.in.(${troncIds.join(',')})`);
  }
  const { data: semaineData, error: semaineError } = await supabase
    .from('seances_edt')
    .select('offre_id, tronc_commun_id, jour, creneau, heure_ouverture, semaine')
    .eq('semaine', semaine)
    .or(orParts.join(','));
  if (semaineError) throw semaineError;

  const maintenant = new Date(Date.now() + 60 * 60 * 1000); // Cameroun UTC+1
  const candidatsOffreIds = new Set<string>();
  const candidatsTroncIds = new Set<string>();
  for (const s of (semaineData ?? []) as any[]) {
    const pasEncoreDue =
      !s.heure_ouverture &&
      !seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant);
    if (!pasEncoreDue) continue;
    if (s.offre_id) candidatsOffreIds.add(s.offre_id);
    if (s.tronc_commun_id) candidatsTroncIds.add(s.tronc_commun_id);
  }
  if (candidatsOffreIds.size === 0 && candidatsTroncIds.size === 0) return 0;

  const ueIdsAVerifier = Array.from(
    new Set(
      offres
        .filter((o) => candidatsOffreIds.has(o.id))
        .map((o) => o.ue_id)
        .concat(
          Array.from(troncIdParUe.entries())
            .filter(([, troncId]) => candidatsTroncIds.has(troncId))
            .map(([ueId]) => ueId)
        )
    )
  );
  const { data: uesData, error: uesError } = await supabase
    .from('ues')
    .select('id, volume_horaire')
    .in('id', ueIdsAVerifier);
  if (uesError) throw uesError;
  const volumeParUe = new Map<string, number | null>(
    ((uesData ?? []) as any[]).map((u) => [u.id, u.volume_horaire ?? null])
  );

  const volumeParOffre = new Map<string, number | null>();
  for (const o of offres) {
    if (candidatsOffreIds.has(o.id)) {
      volumeParOffre.set(o.id, volumeParUe.get(o.ue_id) ?? null);
    }
  }
  const volumeParTronc = new Map<string, number | null>();
  for (const [ueId, troncId] of troncIdParUe) {
    if (candidatsTroncIds.has(troncId) && !volumeParTronc.has(troncId)) {
      volumeParTronc.set(troncId, volumeParUe.get(ueId) ?? null);
    }
  }

  let total = 0;
  const candidatsOffreIdsArr = Array.from(candidatsOffreIds);
  if (candidatsOffreIdsArr.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        'id, offre_id, jour, creneau, heure_ouverture, heure_fermeture, semaine'
      )
      .in('offre_id', candidatsOffreIdsArr);
    if (error) throw error;
    total += await supprimerSeancesExcedentaires(
      (data ?? []) as any[],
      (s) => s.offre_id,
      volumeParOffre
    );
  }

  const candidatsTroncIdsArr = Array.from(candidatsTroncIds);
  if (candidatsTroncIdsArr.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        'id, tronc_commun_id, jour, creneau, heure_ouverture, heure_fermeture, semaine'
      )
      .in('tronc_commun_id', candidatsTroncIdsArr);
    if (error) throw error;
    total += await supprimerSeancesExcedentaires(
      (data ?? []) as any[],
      (s) => s.tronc_commun_id,
      volumeParTronc
    );
  }

  return total;
}

async function supprimerSeancesExcedentaires(
  lignes: any[],
  cleDe: (s: any) => string,
  volumeParCle: Map<string, number | null>
): Promise<number> {
  const parCle = new Map<string, any[]>();
  for (const s of lignes) {
    const cle = cleDe(s);
    if (!cle) continue;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle)!.push(s);
  }

  const maintenant = new Date(Date.now() + 60 * 60 * 1000); // Cameroun UTC+1
  const idsASupprimer: string[] = [];

  for (const [cle, liste] of parCle) {
    const volumeHoraire = volumeParCle.get(cle);
    if (volumeHoraire == null) continue; // volume inconnu — impossible de juger "achevé"
    let cumul = 0;
    for (const s of trierChronologiquement(liste)) {
      const dejaAchevee = estAcheve(cumul, volumeHoraire);
      const pasEncoreDue =
        !s.heure_ouverture &&
        !seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant);
      if (dejaAchevee && pasEncoreDue) {
        idsASupprimer.push(s.id);
        continue; // superflue — ne compte pas dans le cumul, elle disparaît
      }
      cumul += contributionSeance(s, maintenant);
    }
  }

  if (idsASupprimer.length === 0) return 0;
  const { error } = await supabase
    .from('seances_edt')
    .delete()
    .in('id', idsASupprimer);
  if (error) throw error;
  return idsASupprimer.length;
}

export async function genererEmploiDuTempsAutomatique(
  specialiteIds: string[],
  semestre: string,
  semaine: string
): Promise<ResultatGenerationAuto> {
  const resultatVide: ResultatGenerationAuto = {
    nbSeancesTroncPlacees: 0,
    nbSeancesSpecialitesPlacees: 0,
    nonPlacees: [],
  };
  if (specialiteIds.length === 0) return resultatVide;

  // 0) Nettoyage — uniquement ici, jamais au chargement de la page.
  await nettoyerSeancesQuotaAtteint(specialiteIds, semaine);

  const joursDispo = JOURS;
  const creneauxDispo = tousLesCreneaux();
  if (creneauxDispo.length === 0) return resultatVide;

  // 1) Offres du groupe POUR CE SEMESTRE UNIQUEMENT (une spécialité peut
  // avoir des offres pour plusieurs semestres — sans ce filtre, des UE
  // d'un autre semestre se mélangent à celles demandées).
  const { data: offresData, error: offresError } = await supabase
    .from('offres')
    .select('id, ue_id, specialite_id')
    .in('specialite_id', specialiteIds)
    .eq('semestre', semestre);
  if (offresError) throw offresError;
  const offres = (offresData ?? []) as any[];
  if (offres.length === 0) return resultatVide;

  const ueIds = Array.from(new Set(offres.map((o) => o.ue_id)));
  const { data: uesData, error: uesError } = await supabase
    .from('ues')
    .select('id, nom, volume_horaire')
    .in('id', ueIds);
  if (uesError) throw uesError;
  const ueParId = new Map<string, { nom: string; volume_horaire: number | null }>(
    ((uesData ?? []) as any[]).map((u) => [
      u.id,
      { nom: u.nom, volume_horaire: u.volume_horaire ?? null },
    ])
  );

  // 2) Liens tronc commun pour les UE du groupe (sans jointure imbriquée).
  const { data: liensLocauxData, error: liensError } = await supabase
    .from('troncs_communs_ues')
    .select('ue_id, tronc_commun_id')
    .in('ue_id', ueIds);
  if (liensError) throw liensError;
  const troncIdParUeLocal = new Map<string, string>();
  for (const l of (liensLocauxData ?? []) as any[]) {
    troncIdParUeLocal.set(l.ue_id, l.tronc_commun_id);
  }
  const troncIdsLocaux = Array.from(new Set(Array.from(troncIdParUeLocal.values())));

  // 3) Pour chaque tronc concerné : son enseignant attitré (table
  // troncs_communs directement — pas de jointure) et le nombre de
  // filières distinctes qu'il regroupe (calculé sur TOUTES ses UE
  // sœurs, même hors du groupe actuellement chargé — un tronc commun
  // peut relier des spécialités d'autres cycles/écoles, sa vraie portée
  // doit être connue pour bien le prioriser).
  interface InfoTronc {
    nom: string;
    enseignantId: string | null;
    volumeHoraire: number | null;
    nbFilieres: number;
  }
  const infoParTronc = new Map<string, InfoTronc>();
  if (troncIdsLocaux.length > 0) {
    const { data: troncsData, error: troncsError } = await supabase
      .from('troncs_communs')
      .select('id, nom, enseignant_id')
      .in('id', troncIdsLocaux);
    if (troncsError) throw troncsError;

    const { data: soeursData, error: soeursError } = await supabase
      .from('troncs_communs_ues')
      .select('ue_id, tronc_commun_id')
      .in('tronc_commun_id', troncIdsLocaux);
    if (soeursError) throw soeursError;
    const ueIdsSoeursParTronc = new Map<string, Set<string>>();
    const ueIdsSoeurs = new Set<string>();
    for (const l of (soeursData ?? []) as any[]) {
      if (!ueIdsSoeursParTronc.has(l.tronc_commun_id)) {
        ueIdsSoeursParTronc.set(l.tronc_commun_id, new Set());
      }
      ueIdsSoeursParTronc.get(l.tronc_commun_id)!.add(l.ue_id);
      ueIdsSoeurs.add(l.ue_id);
    }

    const { data: offresSoeursData, error: offresSoeursError } = await supabase
      .from('offres')
      .select('ue_id, specialite_id')
      .in('ue_id', Array.from(ueIdsSoeurs));
    if (offresSoeursError) throw offresSoeursError;
    const specialiteIdsParUeSoeur = new Map<string, Set<string>>();
    const specialiteIdsSoeurs = new Set<string>();
    for (const o of (offresSoeursData ?? []) as any[]) {
      if (!specialiteIdsParUeSoeur.has(o.ue_id)) {
        specialiteIdsParUeSoeur.set(o.ue_id, new Set());
      }
      specialiteIdsParUeSoeur.get(o.ue_id)!.add(o.specialite_id);
      specialiteIdsSoeurs.add(o.specialite_id);
    }

    const { data: specialitesSoeursData, error: specialitesSoeursError } =
      await supabase
        .from('specialites')
        .select('id, filiere_id')
        .in('id', Array.from(specialiteIdsSoeurs));
    if (specialitesSoeursError) throw specialitesSoeursError;
    const filiereIdParSpecialite = new Map<string, string>(
      ((specialitesSoeursData ?? []) as any[]).map((s) => [s.id, s.filiere_id])
    );

    for (const t of (troncsData ?? []) as any[]) {
      const ueIdsSoeursDeCeTronc = ueIdsSoeursParTronc.get(t.id) ?? new Set();
      const filiereIds = new Set<string>();
      let volumeHoraire: number | null = null;
      for (const ueIdSoeur of ueIdsSoeursDeCeTronc) {
        if (volumeHoraire == null) {
          volumeHoraire = ueParId.get(ueIdSoeur)?.volume_horaire ?? null;
        }
        for (const specId of specialiteIdsParUeSoeur.get(ueIdSoeur) ?? []) {
          const filiereId = filiereIdParSpecialite.get(specId);
          if (filiereId) filiereIds.add(filiereId);
        }
      }
      infoParTronc.set(t.id, {
        nom: t.nom ?? '',
        enseignantId: t.enseignant_id ?? null,
        volumeHoraire,
        nbFilieres: filiereIds.size,
      });
    }
  }
  const heuresParTronc = await getHeuresTotalesValideesParTronc(troncIdsLocaux);

  // 4) Offres "spécialité seule" (UE sans tronc commun) + leur
  // enseignant attitré (attribution active).
  const offresStandalone = offres.filter((o) => !troncIdParUeLocal.has(o.ue_id));
  const offreIdsStandalone = offresStandalone.map((o) => o.id);
  let enseignantParOffre = new Map<string, string>();
  if (offreIdsStandalone.length > 0) {
    const { data: attributionsData, error: attribError } = await supabase
      .from('attributions')
      .select('offre_id, enseignant_id')
      .in('offre_id', offreIdsStandalone)
      .eq('statut', 'actif');
    if (attribError) throw attribError;
    enseignantParOffre = new Map(
      (attributionsData ?? []).map((a: any) => [a.offre_id, a.enseignant_id])
    );
  }
  const heuresParOffre = await getHeuresTotalesValideesParOffre(offreIdsStandalone);

  // 5) Construction de la liste des items à placer (avant de connaître
  // les disponibilités — elles ne sont interrogées que pour les
  // enseignants réellement concernés, voir étape 6).
  interface ItemAPlacer {
    type: 'tronc' | 'offre';
    id: string;
    nom: string;
    enseignantId: string;
    representantOffreId: string;
    representantSpecialiteId: string;
    volumeHoraire: number | null;
    heuresEffectuees: number;
    nbFilieres: number;
    specialitesDuGroupe: string[];
  }
  const items: ItemAPlacer[] = [];
  const ignorees: ItemNonPlace[] = [];

  for (const troncId of troncIdsLocaux) {
    const info = infoParTronc.get(troncId);
    if (!info) continue;
    const heuresEffectuees = heuresParTronc.get(troncId) ?? 0;
    if (estAcheve(heuresEffectuees, info.volumeHoraire)) {
      continue; // quota déjà achevé — on ne le programme pas
    }
    const offresDuTronc = offres.filter(
      (o) => troncIdParUeLocal.get(o.ue_id) === troncId
    );
    if (!info.enseignantId) {
      ignorees.push({
        nom: info.nom || 'Tronc commun',
        raison: 'Aucun enseignant attitré à ce tronc commun.',
        specialiteIds: offresDuTronc.map((o) => o.specialite_id),
      });
      continue;
    }
    const offreRepresentante = offresDuTronc[0];
    if (!offreRepresentante) continue;
    items.push({
      type: 'tronc',
      id: troncId,
      nom: info.nom || 'Tronc commun',
      enseignantId: info.enseignantId,
      representantOffreId: offreRepresentante.id,
      representantSpecialiteId: offreRepresentante.specialite_id,
      volumeHoraire: info.volumeHoraire,
      heuresEffectuees,
      nbFilieres: info.nbFilieres,
      specialitesDuGroupe: offresDuTronc.map((o) => o.specialite_id),
    });
  }

  for (const o of offresStandalone) {
    const heuresEffectuees = heuresParOffre.get(o.id) ?? 0;
    const volumeHoraire = ueParId.get(o.ue_id)?.volume_horaire ?? null;
    if (estAcheve(heuresEffectuees, volumeHoraire)) {
      continue; // quota déjà achevé
    }
    const enseignantId = enseignantParOffre.get(o.id);
    if (!enseignantId) {
      ignorees.push({
        nom: ueParId.get(o.ue_id)?.nom ?? 'UE',
        raison: 'Aucun enseignant attitré (attribution active manquante).',
        specialiteIds: [o.specialite_id],
      });
      continue;
    }
    items.push({
      type: 'offre',
      id: o.id,
      nom: ueParId.get(o.ue_id)?.nom ?? 'UE',
      enseignantId,
      representantOffreId: o.id,
      representantSpecialiteId: o.specialite_id,
      volumeHoraire,
      heuresEffectuees,
      nbFilieres: 0,
      specialitesDuGroupe: [o.specialite_id],
    });
  }

  // Spécialités seules EN PREMIER (priorité demandée par l'utilisateur),
  // troncs communs ensuite — le choix FIN de l'ordre des troncs entre eux
  // se fait par vague plus bas, selon la couverture des spécialités
  // encore non programmées (voir ordreVague), pas ici.
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tronc' ? 1 : -1;
    if (a.type === 'tronc') return b.nbFilieres - a.nbFilieres;
    return a.nom.localeCompare(b.nom);
  });

  if (items.length === 0) {
    return { ...resultatVide, nonPlacees: ignorees };
  }

  // 6) Disponibilités — UNIQUEMENT pour les enseignants des items
  // retenus (jamais toute l'école), chacun sur SA PROPRE dernière
  // campagne (pas "la dernière campagne" au sens global : un enseignant
  // peut avoir répondu à une campagne antérieure à une campagne plus
  // récente lancée entre-temps pour un groupe différent).
  const enseignantIdsConcernes = Array.from(
    new Set(items.map((item) => item.enseignantId))
  );
  const disponibleSet = new Set<string>(); // "enseignantId|jour|creneau"
  const enseignantsAyantRepondu = new Set<string>();
  const campagnesParEnseignant = await getDernieresCampagnesParEnseignant(
    enseignantIdsConcernes
  );
  if (campagnesParEnseignant.size > 0) {
    const disposData = await recupererToutesLesLignes<any>((debut, fin) =>
      supabase
        .from('disponibilites')
        .select('enseignant_id, campagne_id, jour, creneau, disponible')
        .in('enseignant_id', enseignantIdsConcernes)
        .range(debut, fin)
    );
    for (const d of disposData) {
      if (campagnesParEnseignant.get(d.enseignant_id) !== d.campagne_id) continue;
      enseignantsAyantRepondu.add(d.enseignant_id);
      if (d.disponible) {
        disponibleSet.add(`${d.enseignant_id}|${d.jour}|${d.creneau}`);
      }
    }
  }

  // 7) Photo de la semaine entière (toutes spécialités/troncs
  // confondus) — enseignant et spécialité seulement, PAS la salle
  // (demande explicite : la salle n'est jamais un critère de
  // placement, une salle est juste attribuée pour remplir le champ).
  const specialiteIdParOffreId = new Map<string, string>(
    offres.map((o) => [o.id, o.specialite_id])
  );
  const specialitesDuGroupeParTronc = new Map<string, Set<string>>();
  for (const o of offres) {
    const troncId = troncIdParUeLocal.get(o.ue_id);
    if (!troncId) continue;
    if (!specialitesDuGroupeParTronc.has(troncId)) {
      specialitesDuGroupeParTronc.set(troncId, new Set());
    }
    specialitesDuGroupeParTronc.get(troncId)!.add(o.specialite_id);
  }

  const semaineData = await recupererToutesLesLignes<any>((debut, fin) =>
    supabase
      .from('seances_edt')
      .select('jour, creneau, enseignant_id, tronc_commun_id, offre_id')
      .eq('semaine', semaine)
      .range(debut, fin)
  );

  const occupiedTeacherSlot = new Set<string>(); // "enseignantId|jour|creneau"
  const specialiteSlotOccupied = new Set<string>(); // "specialiteId|jour|creneau"

  for (const s of (semaineData ?? []) as any[]) {
    const cleCreneau = `${s.jour}|${s.creneau}`;
    if (s.enseignant_id) {
      occupiedTeacherSlot.add(`${s.enseignant_id}|${cleCreneau}`);
    }
    if (s.offre_id) {
      const specId = specialiteIdParOffreId.get(s.offre_id);
      if (specId) specialiteSlotOccupied.add(`${specId}|${cleCreneau}`);
    }
    if (s.tronc_commun_id) {
      const specs = specialitesDuGroupeParTronc.get(s.tronc_commun_id);
      if (specs) {
        for (const specId of specs) {
          specialiteSlotOccupied.add(`${specId}|${cleCreneau}`);
        }
      }
    }
  }

  // Spécialités déjà "programmées" cette semaine (au moins une séance,
  // tronc ou offre, déjà présente avant même de lancer la génération) —
  // sert de point de départ à l'objectif "maximum de spécialités
  // programmées" ci-dessous : on ne veut pas compter deux fois une
  // spécialité déjà couverte, mais bien prioriser celles qui ne le sont
  // pas encore.
  const specialitesCouvertes = new Set<string>();
  for (const cle of specialiteSlotOccupied) {
    specialitesCouvertes.add(cle.split('|')[0]);
  }

  // 8) Une salle "par défaut" par item — jamais un critère de blocage,
  // juste une valeur à renseigner (contrainte de schéma).
  const { data: sallesData, error: sallesError } = await supabase
    .from('salles')
    .select('id, specialite_par_defaut_id')
    .order('code_salle');
  if (sallesError) throw sallesError;
  const salles = (sallesData ?? []) as {
    id: string;
    specialite_par_defaut_id: string | null;
  }[];
  if (salles.length === 0) {
    return {
      ...resultatVide,
      nonPlacees: [
        { nom: 'Toutes les UE', raison: 'Aucune salle enregistrée.', specialiteIds },
        ...ignorees,
      ],
    };
  }
  const salleParDefautDeSpecialite = new Map<string, string>();
  for (const s of salles) {
    if (s.specialite_par_defaut_id) {
      salleParDefautDeSpecialite.set(s.specialite_par_defaut_id, s.id);
    }
  }
  const salleDeSecours = salles[0].id;
  function salleDeLItem(specialiteId: string): string {
    return salleParDefautDeSpecialite.get(specialiteId) ?? salleDeSecours;
  }

  // 9) Grille des créneaux (samedi après-midi toujours exclu).
  function estCreneauApresMidi(creneau: string): boolean {
    const bornes = bornesCreneau(creneau);
    if (bornes) return bornes.debut >= 12 * 60;
    const heureDebut = parseInt(creneau, 10);
    return !Number.isNaN(heureDebut) && heureDebut >= 12;
  }
  const slots: { jour: string; creneau: string }[] = [];
  for (const jour of joursDispo) {
    for (const creneau of creneauxDispo) {
      if (jour === 'Samedi' && estCreneauApresMidi(creneau)) continue;
      slots.push({ jour, creneau });
    }
  }

  // 10) CSP glouton PAR VAGUES, borné PAR ITEM : au lieu de rescanner
  // toute la grille de créneaux à chaque tentative de placement, chaque
  // item ne considère QUE ses propres créneaux réellement disponibles
  // (déclarés par son enseignant) — une liste en général bien plus
  // courte que la grille complète. À chaque vague, dans l'ordre de
  // priorité, chaque item dont le quota n'est pas atteint tente
  // d'obtenir UNE séance de plus parmi CETTE liste ; on répète les
  // vagues jusqu'à ce qu'une vague entière ne place plus rien (quota
  // atteint partout, ou plus aucun créneau/enseignant/spécialité libre
  // parmi les créneaux disponibles de chacun).
  const slotsDisponiblesParItem = new Map<string, { jour: string; creneau: string }[]>();
  for (const item of items) {
    slotsDisponiblesParItem.set(
      item.id,
      slots.filter((s) => disponibleSet.has(`${item.enseignantId}|${s.jour}|${s.creneau}`))
    );
  }

  const assignations: AssignationLot[] = [];
  let nbTroncPlacees = 0;
  let nbSpePlacees = 0;

  // Essaie les créneaux de `triesOrdonnes` DANS CET ORDRE (déjà trié par
  // pertinence par l'appelant — voir la boucle de vagues plus bas) et
  // revérifie l'occupation EN DIRECT à chaque tentative : un autre item
  // de la MÊME vague, traité juste avant, a pu entre-temps prendre l'un
  // de ces créneaux.
  function placerItem(
    item: ItemAPlacer,
    triesOrdonnes: { jour: string; creneau: string }[]
  ): boolean {
    const salleId = salleDeLItem(item.representantSpecialiteId);
    for (const { jour, creneau } of triesOrdonnes) {
      const cleCreneau = `${jour}|${creneau}`;
      if (occupiedTeacherSlot.has(`${item.enseignantId}|${cleCreneau}`)) continue;
      const specialiteOccupee = item.specialitesDuGroupe.some((specId) =>
        specialiteSlotOccupied.has(`${specId}|${cleCreneau}`)
      );
      if (specialiteOccupee) continue;

      assignations.push({
        specialiteId: item.representantSpecialiteId,
        offreId: item.representantOffreId,
        enseignantId: item.enseignantId,
        salleId,
        jour,
        creneau,
        seanceIdExistante: null,
      });
      occupiedTeacherSlot.add(`${item.enseignantId}|${cleCreneau}`);
      for (const specId of item.specialitesDuGroupe) {
        specialiteSlotOccupied.add(`${specId}|${cleCreneau}`);
      }
      return true;
    }
    return false;
  }

  const heuresProjetees = new Map<string, number>(
    items.map((item) => [item.id, item.heuresEffectuees])
  );
  const nbSeancesPlaceesParItem = new Map<string, number>();

  function quotaAtteint(item: ItemAPlacer): boolean {
    return estAcheve(heuresProjetees.get(item.id) ?? 0, item.volumeHoraire);
  }

  let progres = true;
  let vague = 0;
  // Borne de sécurité anti-boucle : le nombre maximal de séances qu'un
  // seul item pourrait obtenir est la taille de SA liste de créneaux
  // disponibles — jamais plus, donc ce plafond suffit toujours.
  const maxVagues =
    Math.max(0, ...Array.from(slotsDisponiblesParItem.values()).map((l) => l.length)) + 1;
  while (progres && vague < maxVagues) {
    progres = false;
    vague++;

    const itemsActifs = items.filter((item) => !quotaAtteint(item));
    if (itemsActifs.length === 0) break;

    // Pour CETTE vague : les créneaux encore réellement libres de
    // chaque item actif (dépend de l'occupation au début de la vague —
    // affiné en direct dans placerItem si un item précédent de la même
    // vague vient d'en prendre un).
    const libresParItem = new Map<string, { jour: string; creneau: string }[]>();
    for (const item of itemsActifs) {
      // Solde d'heures restantes à cet instant : un créneau plus long que
      // ce solde ferait dépasser le volume horaire (ex. : il ne reste que
      // 3h, le créneau 08h-12h de 4h n'est plus autorisé, seul un
      // créneau de 3h type 14h-17h convient encore).
      const resteItem =
        item.volumeHoraire == null
          ? Infinity
          : item.volumeHoraire - (heuresProjetees.get(item.id) ?? 0);
      const libres = (slotsDisponiblesParItem.get(item.id) ?? []).filter(
        ({ jour, creneau }) => {
          if (dureeNominaleCreneau(creneau) > resteItem) return false;
          const cle = `${jour}|${creneau}`;
          if (occupiedTeacherSlot.has(`${item.enseignantId}|${cle}`)) return false;
          return !item.specialitesDuGroupe.some((specId) =>
            specialiteSlotOccupied.has(`${specId}|${cle}`)
          );
        }
      );
      libresParItem.set(item.id, libres);
    }

    // Contention par créneau : combien d'items actifs pourraient encore
    // vouloir ce créneau — sert à choisir, pour un item donné, le
    // créneau le MOINS réclamé par les autres (heuristique LCV), pour
    // ne pas lui faire perdre un créneau rare dont un autre item n'a
    // aucune autre option.
    const demandeParSlot = new Map<string, number>();
    for (const libres of libresParItem.values()) {
      for (const { jour, creneau } of libres) {
        const cle = `${jour}|${creneau}`;
        demandeParSlot.set(cle, (demandeParSlot.get(cle) ?? 0) + 1);
      }
    }

    // Combien de spécialités NON ENCORE programmées (ni avant la
    // génération, ni par une séance déjà placée pendant cette
    // génération) un item ferait progresser s'il obtenait une séance —
    // sert à choisir, parmi plusieurs troncs à égalité, celui qui ouvre
    // le plus de spécialités encore à zéro séance (objectif demandé :
    // maximiser le nombre de spécialités programmées, les troncs étant
    // placés en fonction de cet objectif plutôt que de leur seul nombre
    // de filières).
    function nbSpecialitesNonCouvertes(item: ItemAPlacer): number {
      let n = 0;
      for (const specId of item.specialitesDuGroupe) {
        if (!specialitesCouvertes.has(specId)) n++;
      }
      return n;
    }

    // Ordre de passage de la vague : l'item le plus CONTRAINT (le moins
    // de créneaux encore valables) passe en premier (heuristique MRV) —
    // sinon un item très flexible peut "gaspiller" un créneau qu'un
    // autre, bien plus contraint, ne pouvait obtenir nulle part
    // ailleurs, ce qui laisse des cases vides évitables. À nombre de
    // créneaux égal : les SPÉCIALITÉS SEULES sont prioritaires sur les
    // troncs communs (règle demandée), et entre deux troncs, celui qui
    // ouvrirait le plus de spécialités encore non programmées passe
    // devant (objectif : maximiser le nombre de spécialités
    // programmées), le nombre de filières ne servant plus qu'à
    // départager un reliquat d'égalité.
    const ordreVague = [...itemsActifs].sort((a, b) => {
      const nbA = libresParItem.get(a.id)?.length ?? 0;
      const nbB = libresParItem.get(b.id)?.length ?? 0;
      if (nbA !== nbB) return nbA - nbB;
      if (a.type !== b.type) return a.type === 'tronc' ? 1 : -1;
      if (a.type === 'tronc') {
        const couvA = nbSpecialitesNonCouvertes(a);
        const couvB = nbSpecialitesNonCouvertes(b);
        if (couvA !== couvB) return couvB - couvA;
        return b.nbFilieres - a.nbFilieres;
      }
      return a.nom.localeCompare(b.nom);
    });

    ordreVague.forEach((item, idx) => {
      const libres = libresParItem.get(item.id) ?? [];
      if (libres.length === 0) return;
      const triesParDemandeCroissante = [...libres].sort((s1, s2) => {
        const d1 = demandeParSlot.get(`${s1.jour}|${s1.creneau}`) ?? 0;
        const d2 = demandeParSlot.get(`${s2.jour}|${s2.creneau}`) ?? 0;
        return d1 - d2;
      });
      // Légère rotation entre créneaux à contention égale, pour ne pas
      // toujours retenter exactement le même ordre d'une vague à
      // l'autre (répartition un peu plus régulière dans la semaine).
      const decalage = triesParDemandeCroissante.length > 0
        ? (idx + vague) % triesParDemandeCroissante.length
        : 0;
      const triesOrdonnes = [
        ...triesParDemandeCroissante.slice(decalage),
        ...triesParDemandeCroissante.slice(0, decalage),
      ];

      const place = placerItem(item, triesOrdonnes);
      if (!place) return;
      progres = true;
      for (const specId of item.specialitesDuGroupe) {
        specialitesCouvertes.add(specId);
      }
      heuresProjetees.set(
        item.id,
        (heuresProjetees.get(item.id) ?? 0) +
          dureeNominaleCreneau(assignations[assignations.length - 1].creneau)
      );
      nbSeancesPlaceesParItem.set(item.id, (nbSeancesPlaceesParItem.get(item.id) ?? 0) + 1);
      if (item.type === 'tronc') nbTroncPlacees++;
      else nbSpePlacees++;
    });
  }

  for (const item of items) {
    if ((nbSeancesPlaceesParItem.get(item.id) ?? 0) === 0 && !quotaAtteint(item)) {
      const raison = !enseignantsAyantRepondu.has(item.enseignantId)
        ? "L'enseignant attitré n'a pas encore renseigné ses disponibilités (aucun créneau ne peut lui être proposé)."
        : 'Aucun créneau déclaré disponible par son enseignant qui soit encore libre cette semaine (enseignant ou spécialité déjà occupés sur les créneaux où il est disponible).';
      ignorees.push({
        nom: item.nom,
        raison,
        specialiteIds: item.specialitesDuGroupe,
      });
    }
  }

  // 11) Persistance — réutilise exactement le même chemin que la
  // confection manuelle groupée.
  if (assignations.length > 0) {
    const emploiParSpecialite = await garantirEmploisPourGroupe(specialiteIds, semaine);
    await enregistrerChangementsEnLot(assignations, [], emploiParSpecialite, semaine);
    invaliderCacheSeancesGroupees(specialiteIds, semaine);
  }

  return {
    nbSeancesTroncPlacees: nbTroncPlacees,
    nbSeancesSpecialitesPlacees: nbSpePlacees,
    nonPlacees: ignorees,
  };
}

// ── Réinitialisation d'un groupe (cycle/semestre) pour une semaine ──
// Vide, pour CE groupe de spécialités et CETTE semaine uniquement,
// toutes les séances déjà programmées (cases "spécialité seule" ET
// séances de tronc commun partagées par ce groupe) — utile pour
// repartir d'une grille vide avant un nouvel essai de génération.
// Retourne le nombre de séances supprimées.
export async function reinitialiserEmploiDuTempsGroupe(
  specialiteIds: string[],
  semaine: string
): Promise<number> {
  if (specialiteIds.length === 0) return 0;

  const { data: offresData, error: offresError } = await supabase
    .from('offres')
    .select('id, ue_id')
    .in('specialite_id', specialiteIds);
  if (offresError) throw offresError;
  const ueIds = Array.from(
    new Set(((offresData ?? []) as any[]).map((o) => o.ue_id))
  );

  let troncIds: string[] = [];
  if (ueIds.length > 0) {
    const { data: liens, error: liensError } = await supabase
      .from('troncs_communs_ues')
      .select('tronc_commun_id')
      .in('ue_id', ueIds);
    if (liensError) throw liensError;
    troncIds = Array.from(
      new Set(((liens ?? []) as any[]).map((l) => l.tronc_commun_id))
    );
  }

  const { data: emploisData, error: emploisError } = await supabase
    .from('emplois_du_temps')
    .select('id')
    .in('specialite_id', specialiteIds)
    .eq('semaine', semaine);
  if (emploisError) throw emploisError;
  const emploiIds = ((emploisData ?? []) as any[]).map((e) => e.id);

  let total = 0;
  if (emploiIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .delete()
      .in('emploi_du_temps_id', emploiIds)
      .eq('semaine', semaine)
      .select('id');
    if (error) throw error;
    total += (data ?? []).length;
  }
  if (troncIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .delete()
      .in('tronc_commun_id', troncIds)
      .eq('semaine', semaine)
      .select('id');
    if (error) throw error;
    total += (data ?? []).length;
  }

  invaliderCacheSeancesGroupees(specialiteIds, semaine);
  return total;
}

// ── Scénario 5.5 (NOUVEAU) — Sélection des spécialités à envoyer en
// validation, persistée en base ─────────────────────────────────────
// Exploite le statut 'en_attente_validation' de emplois_du_temps.statut,
// qui existait déjà dans le type EmploiExistant mais n'était jusqu'ici
// jamais réellement utilisé (le code sautait directement de 'genere' à
// 'valide'). En s'appuyant sur ce champ déjà en base, la sélection faite
// sur GenererEDTPage survit à un rechargement de page, fonctionne sur un
// autre appareil/navigateur, et n'a besoin d'aucun mécanisme de
// transport fragile (URL, state de navigation, localStorage).
//
// - Les spécialités cochées (déjà à l'état 'genere', donc avec un EDT
//   généré) passent à 'en_attente_validation'.
// - Les spécialités du même groupe qui ne sont PAS cochées, mais qui
//   avaient été marquées 'en_attente_validation' lors d'un précédent
//   enregistrement, repassent à 'genere' (retirées de la validation).
// - Les emplois déjà 'valide' ne sont jamais touchés (verrouillés).
export async function definirSpecialitesEnAttenteValidation(
  specialiteIdsAInclure: string[],
  specialiteIdsDuGroupe: string[],
  semaine: string
): Promise<void> {
  if (specialiteIdsAInclure.length > 0) {
    const { error } = await supabase
      .from('emplois_du_temps')
      .update({ statut: 'en_attente_validation' })
      .in('specialite_id', specialiteIdsAInclure)
      .eq('semaine', semaine)
      .eq('statut', 'genere');
    if (error) throw error;
  }

  const specialiteIdsAExclure = specialiteIdsDuGroupe.filter(
    (id) => !specialiteIdsAInclure.includes(id)
  );
  if (specialiteIdsAExclure.length > 0) {
    const { error } = await supabase
      .from('emplois_du_temps')
      .update({ statut: 'genere' })
      .in('specialite_id', specialiteIdsAExclure)
      .eq('semaine', semaine)
      .eq('statut', 'en_attente_validation');
    if (error) throw error;
  }
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

// ── "Mes cours de la semaine" (enseignant) ─────────────────────────
// Détermine la semaine (lundi, format "AAAA-MM-JJ") à afficher sur cet
// écran : la semaine en cours, SAUF à partir du samedi 18h (heure
// Cameroun) et pendant tout le dimanche, où l'on bascule déjà sur la
// semaine prochaine — l'enseignant peut ainsi préparer son planning du
// lundi suivant dès le week-end plutôt que de voir un écran vide (la
// semaine en cours étant, à ce moment-là, déjà terminée ou sur le point
// de l'être).

// Repli si le serveur ne répond pas (hors ligne) — Cameroun = UTC+1
// fixe, pas de changement d'heure.
function maintenantCamerounSimple(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

// Heure fiable : demandée au serveur (RPC "heure_serveur", déjà utilisée
// ailleurs dans l'app pour la même raison) plutôt que celle, parfois
// fausse, de l'appareil — sinon la bascule de samedi/dimanche pourrait se
// déclencher au mauvais moment sur un téléphone mal réglé.
async function maintenantCamerounFiable(): Promise<Date> {
  try {
    const { data, error } = await supabase.rpc('heure_serveur');
    if (error || !data) return maintenantCamerounSimple();
    const heureServeur = new Date(data as string);
    if (Number.isNaN(heureServeur.getTime())) return maintenantCamerounSimple();
    return new Date(heureServeur.getTime() + 60 * 60 * 1000);
  } catch {
    return maintenantCamerounSimple();
  }
}

function lundiDeLaSemaineDe(reference: Date): string {
  const jour = reference.getUTCDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate() + decalage;
  const date = new Date(Date.UTC(y, m, d));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function decalerSemaineDe(semaineISO: string, nbSemaines: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + nbSemaines * 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const HEURE_BASCULE_SAMEDI = 18;

export async function semaineCibleCoursDeLaSemaine(): Promise<{
  semaine: string;
  estSemaineProchaine: boolean;
}> {
  const maintenant = await maintenantCamerounFiable();
  const jour = maintenant.getUTCDay(); // 0 = dimanche, 6 = samedi
  const heure = maintenant.getUTCHours();
  const semaineActuelle = lundiDeLaSemaineDe(maintenant);

  const basculeSurSemaineProchaine =
    jour === 0 || (jour === 6 && heure >= HEURE_BASCULE_SAMEDI);

  return basculeSurSemaineProchaine
    ? {
        semaine: decalerSemaineDe(semaineActuelle, 1),
        estSemaineProchaine: true,
      }
    : { semaine: semaineActuelle, estSemaineProchaine: false };
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
// Récupère des spécialités précises par leurs identifiants — sans
// filtrer par cycle/semestre (contrairement à
// listSpecialitesDuCycleSemestre) — utilisée quand une sélection
// explicite a déjà été faite (ex : "Génération EDT" → choix des
// spécialités à valider) : on ne veut pas risquer d'en perdre en route
// à cause d'un léger écart de libellé de semestre entre spécialités
// (ex: "S3" chez l'une, "S3&4" chez l'autre).
export async function listSpecialitesParIds(
  ids: string[]
): Promise<SpecialiteGroupe[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('specialites')
    .select(
      `
      id, nom, type_cursus,
      filiere:filieres(nom, ecole:ecoles(nom))
    `
    )
    .in('id', ids);
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      ecoleNom: s.filiere?.ecole?.nom ?? '',
      filiereNom: s.filiere?.nom ?? '',
      typeCursus: s.type_cursus,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

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

// Spécialités d'un cycle/semestre/semaine réellement ENVOYÉES en
// validation (emplois_du_temps.statut ∈ {en_attente_validation, valide})
// — même logique que ValidationEDTPage (base = seule source de vérité,
// aucune transmission fragile via URL/state/localStorage). Extraite ici
// pour être réutilisée telle quelle par toute page qui doit retrouver
// le même périmètre (ex : la page d'information WhatsApp des
// enseignants), sans dupliquer/faire dériver la logique.
export async function listSpecialitesEnvoyeesEnValidation(
  cycleKey: string,
  semestre: string,
  semaine: string,
  perimetreSpecialiteIds: string[] | null
): Promise<SpecialiteGroupe[]> {
  const [cycle, sousCycle] = cycleKey.split('::');
  const toutes = await listSpecialitesDuCycleSemestre(
    cycle,
    sousCycle || null,
    semestre,
    perimetreSpecialiteIds
  );
  if (toutes.length === 0) return [];
  const { data: emploisStatuts, error } = await supabase
    .from('emplois_du_temps')
    .select('specialite_id, statut')
    .in(
      'specialite_id',
      toutes.map((s) => s.id)
    )
    .eq('semaine', semaine)
    .in('statut', ['en_attente_validation', 'valide']);
  if (error) throw error;
  const idsEnvoyes = new Set(
    (emploisStatuts ?? []).map((e: any) => e.specialite_id)
  );
  return toutes.filter((s) => idsEnvoyes.has(s.id));
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

// ── Cache mémoire (ÉTAPE 3 — optimisation) ──────────────────────────
// Naviguer entre "Génération EDT" et "Validation", ou changer de semaine
// puis y revenir, rechargeait tout depuis zéro à chaque fois (5+
// requêtes). On garde en mémoire le dernier résultat par
// (spécialités, semaine), pendant une courte durée — assez pour couvrir
// un aller-retour de navigation, assez court pour rester à jour si
// quelqu'un d'autre modifie l'emploi du temps entre-temps. Ce cache vit
// en mémoire JS (pas localStorage/Dexie) : il disparaît naturellement à
// chaque rechargement complet de page, ce qui est le comportement voulu.
const DUREE_CACHE_MS = 30_000;
interface EntreeCacheGroupe {
  donnees: DonneesGroupees;
  expireA: number;
}
const cacheSeancesGroupees = new Map<string, EntreeCacheGroupe>();

function cleCacheGroupe(specialiteIds: string[], semaine: string): string {
  return `${[...specialiteIds].sort().join(',')}|${semaine}`;
}

// À appeler après toute écriture qui touche ce groupe (enregistrement de
// cases, upload du document signé, validation) — sans ça, la page
// afficherait des données périmées pendant jusqu'à 30 secondes après
// avoir soi-même modifié quelque chose.
export function invaliderCacheSeancesGroupees(
  specialiteIds: string[],
  semaine: string
): void {
  cacheSeancesGroupees.delete(cleCacheGroupe(specialiteIds, semaine));
}

export async function getSeancesGroupees(
  specialiteIds: string[],
  semaine: string,
  options?: { forcerRafraichissement?: boolean }
): Promise<DonneesGroupees> {
  const cle = cleCacheGroupe(specialiteIds, semaine);
  const entree = cacheSeancesGroupees.get(cle);
  if (
    !options?.forcerRafraichissement &&
    entree &&
    entree.expireA > Date.now()
  ) {
    return entree.donnees;
  }

  const donnees = await chargerSeancesGroupeesDepuisSupabase(
    specialiteIds,
    semaine
  );

  // Nettoyage léger : évite une croissance illimitée du cache sur une
  // session très longue (beaucoup de semaines/cycles consultés).
  if (cacheSeancesGroupees.size > 20) {
    const maintenant = Date.now();
    for (const [k, v] of cacheSeancesGroupees) {
      if (v.expireA <= maintenant) cacheSeancesGroupees.delete(k);
    }
  }

  cacheSeancesGroupees.set(cle, { donnees, expireA: Date.now() + DUREE_CACHE_MS });
  return donnees;
}

async function chargerSeancesGroupeesDepuisSupabase(
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
        enseignant:enseignants(id, nom),
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
    const troncsDetectes = new Set<string>();
    for (const l of (liens ?? []) as any[]) {
      const specialiteId = specialiteParUe.get(l.ue_id);
      if (specialiteId) {
        if (!specialitesParTronc.has(l.tronc_commun_id)) {
          specialitesParTronc.set(l.tronc_commun_id, new Set());
        }
        specialitesParTronc.get(l.tronc_commun_id)!.add(specialiteId);
      }
      troncsDetectes.add(l.tronc_commun_id);
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

    // Retrouve TOUTES les UE sœurs de ces troncs communs, y compris
    // celles dont la spécialité n'est PAS dans le cycle/semestre
    // actuellement chargé (ex : tronc commun entre deux spécialités de
    // cycles/filières différents, cas courant en pratique) — sans ça,
    // specialitesParTronc ne contenait que les spécialités déjà visibles
    // à l'écran, et la propagation restait invisible tant qu'on n'allait
    // pas charger séparément le cycle/semestre de l'autre spécialité.
    if (troncsDetectes.size > 0) {
      const { data: toutesLesUesDuTronc } = await supabase
        .from('troncs_communs_ues')
        .select('tronc_commun_id, ue_id')
        .in('tronc_commun_id', Array.from(troncsDetectes));
      const troncParUeSoeur = new Map(
        (toutesLesUesDuTronc ?? []).map((l: any) => [l.ue_id, l.tronc_commun_id])
      );
      const ueIdsSoeurs = Array.from(troncParUeSoeur.keys()).filter(
        (id) => !specialiteParUe.has(id)
      );
      if (ueIdsSoeurs.length > 0) {
        const { data: offresSoeurs } = await supabase
          .from('offres')
          .select('ue_id, specialite_id')
          .in('ue_id', ueIdsSoeurs);
        for (const o of (offresSoeurs ?? []) as any[]) {
          const troncId = troncParUeSoeur.get(o.ue_id);
          if (!troncId) continue;
          if (!specialitesParTronc.has(troncId)) {
            specialitesParTronc.set(troncId, new Set());
          }
          specialitesParTronc.get(troncId)!.add(o.specialite_id);
        }
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
          enseignant:enseignants(id, nom),
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
    enseignantId: s.enseignant?.id ?? null,
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
    enseignantId: s.enseignant?.id ?? null,
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

// ── Information des enseignants par WhatsApp (page Validation) ─────

export interface CoursWhatsApp {
  ueNom: string;
  jour: string;
  creneau: string;
  salleCode: string | null;
  // Une ou plusieurs spécialités concernées par ce cours (plusieurs pour
  // un cours de tronc commun, partagé entre spécialités).
  specialites: string[];
}

export interface EnseignantWhatsApp {
  enseignantId: string;
  nom: string;
  numeroWhatsapp: string | null;
  numeroCellulaire: string | null;
  cours: CoursWhatsApp[];
}

// Regroupe, pour le cycle/semestre/semaine actuellement affiché sur la
// page Validation, tous les cours programmés par enseignant — pour
// permettre à l'administration de générer un message WhatsApp
// personnalisé par enseignant (jour, créneau, salle, spécialité(s)
// concernée(s)). Réutilise getSeancesGroupees (déjà mis en cache 30s)
// plutôt que de refaire les requêtes de zéro.
export async function getInfosNotificationWhatsApp(
  specialiteIds: string[],
  semaine: string
): Promise<EnseignantWhatsApp[]> {
  if (specialiteIds.length === 0) return [];
  const donnees = await getSeancesGroupees(specialiteIds, semaine);
  if (donnees.seances.length === 0) return [];

  // Noms de toutes les spécialités concernées, directement ou via un
  // tronc commun (specialitesParTronc peut inclure des spécialités hors
  // du cycle/semestre actuellement affiché — cas normal d'un tronc
  // commun partagé entre filières).
  const idsSpecialites = new Set<string>();
  for (const s of donnees.seances) {
    if (s.specialiteId) idsSpecialites.add(s.specialiteId);
  }
  for (const ids of donnees.specialitesParTronc.values()) {
    for (const id of ids) idsSpecialites.add(id);
  }
  const { data: specialitesData } = await supabase
    .from('specialites')
    .select('id, nom')
    .in('id', Array.from(idsSpecialites));
  const nomParSpecialite = new Map(
    (specialitesData ?? []).map((s: any) => [s.id, s.nom as string])
  );

  // Coordonnées (WhatsApp/cellulaire) des enseignants concernés — pas
  // renvoyées par getSeancesGroupees (pensé pour l'affichage de la
  // grille, pas pour la prise de contact).
  const enseignantIds = Array.from(
    new Set(
      donnees.seances.map((s) => s.enseignantId).filter((v): v is string => !!v)
    )
  );
  const { data: enseignantsData } = await supabase
    .from('enseignants')
    .select('id, nom, numero_whatsapp, numero_cellulaire')
    .in('id', enseignantIds);
  const enseignantParId = new Map(
    (enseignantsData ?? []).map((e: any) => [e.id, e])
  );

  const parEnseignant = new Map<string, EnseignantWhatsApp>();
  for (const s of donnees.seances) {
    if (!s.enseignantId) continue; // séance pas encore attribuée — rien à notifier

    const specialitesConcernees = s.specialiteId
      ? [nomParSpecialite.get(s.specialiteId) ?? '']
      : Array.from(donnees.specialitesParTronc.get(s.troncCommunId ?? '') ?? [])
          .map((id) => nomParSpecialite.get(id) ?? '')
          .filter(Boolean);

    if (!parEnseignant.has(s.enseignantId)) {
      const e = enseignantParId.get(s.enseignantId);
      parEnseignant.set(s.enseignantId, {
        enseignantId: s.enseignantId,
        nom: e?.nom ?? s.enseignantNom,
        numeroWhatsapp: e?.numero_whatsapp ?? null,
        numeroCellulaire: e?.numero_cellulaire ?? null,
        cours: [],
      });
    }
    parEnseignant.get(s.enseignantId)!.cours.push({
      ueNom: s.ueNom,
      jour: s.jour,
      creneau: s.creneau,
      salleCode: s.salleCode,
      specialites: Array.from(new Set(specialitesConcernees)),
    });
  }

  // Tri chronologique des cours de chaque enseignant (jour, puis heure
  // de début réelle du créneau — supporte les créneaux personnalisés,
  // pas seulement 08h-12h/14h-17h).
  const JOUR_ORDRE_MSG: Record<string, number> = {
    Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5,
  };
  for (const e of parEnseignant.values()) {
    e.cours.sort((a, b) => {
      const diffJour = (JOUR_ORDRE_MSG[a.jour] ?? 0) - (JOUR_ORDRE_MSG[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      const debutA = bornesCreneau(a.creneau)?.debut ?? 0;
      const debutB = bornesCreneau(b.creneau)?.debut ?? 0;
      return debutA - debutB;
    });
  }

  return Array.from(parEnseignant.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom)
  );
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
// ── Attribution automatique des salles — TOUS les groupes ─────────────
// Travaille sur TOUTES les séances de la semaine (tous cycles, toutes
// écoles, toutes spécialités, tronc commun compris), créneau par
// créneau : attribuer cycle par cycle créait des conflits, chaque cycle
// ignorant ce que les autres avaient déjà pris. Pour chaque créneau :
//  0) les troncs de PLUS de 9 filières prennent l'amphi (salle de plus
//     grande capacité), puis la plus grande libre suivante s'il est pris ;
//  1) chaque UE de spécialité reçoit la salle PAR DÉFAUT de sa
//     spécialité, si elle est libre ;
//  2) les autres troncs, du plus grand regroupement de filières au plus
//     petit, prennent la plus grande salle libre (amphi exclu) ;
//  3) une UE de spécialité dont la salle par défaut est prise reçoit la
//     plus petite salle libre (amphi exclu).
// Les séances déjà ouvertes par l'enseignant (heure_ouverture connue) ne
// sont jamais déplacées : leur salle reste occupée. Écrit directement en
// base (le statut ok/conflit est recalculé comme à l'enregistrement).
export interface ResultatAttributionSalles {
  nbSeancesTraitees: number;
  nbModifiees: number;
  sansSalle: { nom: string; jour: string; creneau: string }[];
}

async function lireParLotsApi<T>(
  ids: string[],
  requete: (lot: string[]) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const lots: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) lots.push(ids.slice(i, i + 100));
  const resultats = await Promise.all(
    lots.map(async (lot) => {
      const { data, error } = await requete(lot);
      if (error) throw error;
      return data ?? [];
    })
  );
  return resultats.flat();
}

export async function attribuerSallesPourSemaine(
  semaine: string
): Promise<ResultatAttributionSalles> {
  const SEUIL_FILIERES_AMPHI = 9;
  const vide: ResultatAttributionSalles = {
    nbSeancesTraitees: 0,
    nbModifiees: 0,
    sansSalle: [],
  };

  // 1) Toutes les séances de la semaine (tri stable pour la pagination).
  const seances = await recupererToutesLesLignes<any>((debut, fin) =>
    supabase
      .from('seances_edt')
      .select(
        'id, jour, creneau, offre_id, tronc_commun_id, salle_id, enseignant_id, statut, heure_ouverture'
      )
      .eq('semaine', semaine)
      .order('id')
      .range(debut, fin)
  );
  if (seances.length === 0) return vide;

  // 2) Référentiels, à plat (jamais de jointure imbriquée).
  const offreIds = Array.from(
    new Set(seances.map((s) => s.offre_id).filter(Boolean) as string[])
  );
  const troncIds = Array.from(
    new Set(seances.map((s) => s.tronc_commun_id).filter(Boolean) as string[])
  );
  const [offres, liensTronc, troncs] = await Promise.all([
    lireParLotsApi<any>(offreIds, (lot) =>
      supabase.from('offres').select('id, ue_id, specialite_id').in('id', lot)
    ),
    lireParLotsApi<any>(troncIds, (lot) =>
      supabase
        .from('troncs_communs_ues')
        .select('tronc_commun_id, ue_id')
        .in('tronc_commun_id', lot)
    ),
    lireParLotsApi<any>(troncIds, (lot) =>
      supabase.from('troncs_communs').select('id, nom').in('id', lot)
    ),
  ]);

  const ueIdsOffres = Array.from(new Set(offres.map((o) => o.ue_id as string)));
  const ueIdsTroncs = Array.from(new Set(liensTronc.map((l) => l.ue_id as string)));
  const [ues, offresDesTroncs] = await Promise.all([
    lireParLotsApi<any>(ueIdsOffres, (lot) =>
      supabase.from('ues').select('id, nom').in('id', lot)
    ),
    lireParLotsApi<any>(ueIdsTroncs, (lot) =>
      supabase.from('offres').select('ue_id, specialite_id').in('ue_id', lot)
    ),
  ]);
  const specialiteIdsTous = Array.from(
    new Set([
      ...offres.map((o) => o.specialite_id as string),
      ...offresDesTroncs.map((o) => o.specialite_id as string),
    ])
  );
  const specialites = await lireParLotsApi<any>(specialiteIdsTous, (lot) =>
    supabase.from('specialites').select('id, filiere_id').in('id', lot)
  );

  const offreParId = new Map(offres.map((o) => [o.id as string, o]));
  const nomUeParId = new Map(ues.map((u) => [u.id as string, u.nom as string]));
  const nomTroncParId = new Map(troncs.map((t) => [t.id as string, t.nom as string]));
  const filiereParSpecialite = new Map(
    specialites.map((s) => [s.id as string, s.filiere_id as string])
  );
  const troncParUe = new Map(
    liensTronc.map((l) => [l.ue_id as string, l.tronc_commun_id as string])
  );
  // Par tronc : spécialités membres (toutes, hors groupe affiché
  // comprises) → nombre de filières distinctes.
  const specialitesParTronc = new Map<string, Set<string>>();
  for (const o of offresDesTroncs) {
    const troncId = troncParUe.get(o.ue_id);
    if (!troncId) continue;
    if (!specialitesParTronc.has(troncId)) specialitesParTronc.set(troncId, new Set());
    specialitesParTronc.get(troncId)!.add(o.specialite_id);
  }
  const nbFilieresDuTronc = (troncId: string): number => {
    const membres = specialitesParTronc.get(troncId);
    if (!membres) return 1;
    const filieres = new Set<string>();
    for (const specId of membres) {
      filieres.add(filiereParSpecialite.get(specId) ?? `spe:${specId}`);
    }
    return filieres.size;
  };

  // 3) Salles.
  const { data: sallesData, error: sallesError } = await supabase
    .from('salles')
    .select('id, capacite, specialite_par_defaut_id')
    .order('code_salle');
  if (sallesError) throw sallesError;
  const salles = (sallesData ?? []) as {
    id: string;
    capacite: number;
    specialite_par_defaut_id: string | null;
  }[];
  if (salles.length === 0) throw new Error('Aucune salle enregistrée.');
  const sallesParCapaciteDesc = [...salles].sort((a, b) => b.capacite - a.capacite);
  const amphiId = sallesParCapaciteDesc[0].id;
  const salleParDefaut = new Map<string, string>();
  for (const s of salles) {
    if (s.specialite_par_defaut_id && !salleParDefaut.has(s.specialite_par_defaut_id)) {
      salleParDefaut.set(s.specialite_par_defaut_id, s.id);
    }
  }

  // 4) Répartition créneau par créneau.
  const parCreneau = new Map<string, any[]>();
  for (const s of seances) {
    const cle = `${s.jour}|${s.creneau}`;
    if (!parCreneau.has(cle)) parCreneau.set(cle, []);
    parCreneau.get(cle)!.push(s);
  }

  const nomDe = (s: any): string =>
    s.tronc_commun_id
      ? nomTroncParId.get(s.tronc_commun_id) ?? 'Tronc commun'
      : nomUeParId.get(offreParId.get(s.offre_id)?.ue_id) ?? 'UE';

  const nouvelleSalle = new Map<string, string | null>();
  const nouveauStatut = new Map<string, 'ok' | 'conflit'>();
  const sansSalle: { nom: string; jour: string; creneau: string }[] = [];
  let nbTraitees = 0;

  for (const liste of parCreneau.values()) {
    // Séances déjà ouvertes : figées, leur salle reste prise.
    const figees = liste.filter((s) => !!s.heure_ouverture);
    const aTraiter = liste.filter((s) => !s.heure_ouverture);
    const prises = new Set<string>(
      figees.map((s) => s.salle_id as string | null).filter((v): v is string => !!v)
    );

    const troncs = aTraiter
      .filter((s) => s.tronc_commun_id)
      .sort(
        (a, b) =>
          nbFilieresDuTronc(b.tronc_commun_id) - nbFilieresDuTronc(a.tronc_commun_id) ||
          (specialitesParTronc.get(b.tronc_commun_id)?.size ?? 0) -
            (specialitesParTronc.get(a.tronc_commun_id)?.size ?? 0) ||
          nomDe(a).localeCompare(nomDe(b))
      );
    const troncsAmphi = troncs.filter(
      (s) => nbFilieresDuTronc(s.tronc_commun_id) > SEUIL_FILIERES_AMPHI
    );
    const troncsNormaux = troncs.filter(
      (s) => nbFilieresDuTronc(s.tronc_commun_id) <= SEUIL_FILIERES_AMPHI
    );
    const parSpecialite = aTraiter.filter((s) => !s.tronc_commun_id);

    const poser = (s: any, salleId: string | null) => {
      if (salleId) prises.add(salleId);
      nouvelleSalle.set(s.id, salleId);
    };

    // 0) Amphi pour les gros troncs.
    for (const s of troncsAmphi) {
      poser(s, sallesParCapaciteDesc.find((x) => !prises.has(x.id))?.id ?? null);
    }
    // 1) Salle par défaut de la spécialité.
    const sansDefaut: any[] = [];
    for (const s of parSpecialite) {
      const specId = offreParId.get(s.offre_id)?.specialite_id as string | undefined;
      const defaut = specId ? salleParDefaut.get(specId) : undefined;
      if (defaut && !prises.has(defaut)) poser(s, defaut);
      else sansDefaut.push(s);
    }
    // 2) Autres troncs : plus grande salle libre hors amphi.
    for (const s of troncsNormaux) {
      poser(
        s,
        sallesParCapaciteDesc.find((x) => x.id !== amphiId && !prises.has(x.id))?.id ?? null
      );
    }
    // 3) UE de spécialité sans défaut libre : plus petite salle libre.
    for (const s of sansDefaut) {
      poser(
        s,
        [...sallesParCapaciteDesc]
          .reverse()
          .find((x) => x.id !== amphiId && !prises.has(x.id))?.id ?? null
      );
    }

    // Statut : même règle qu'à l'enregistrement (pas de salle, ou
    // enseignant déjà pris sur ce créneau → conflit).
    for (const s of aTraiter) {
      nbTraitees++;
      const salleId = nouvelleSalle.get(s.id) ?? null;
      const conflitEnseignant = liste.some(
        (l) => l.id !== s.id && l.enseignant_id === s.enseignant_id
      );
      nouveauStatut.set(s.id, !salleId || conflitEnseignant ? 'conflit' : 'ok');
      if (!salleId) sansSalle.push({ nom: nomDe(s), jour: s.jour, creneau: s.creneau });
    }
  }

  // 5) Écriture : une mise à jour par couple (salle, statut) et par lot
  // de 100 séances — quelques requêtes seulement, pas une par séance.
  const groupes = new Map<string, { salleId: string | null; statut: string; ids: string[] }>();
  let nbModifiees = 0;
  for (const s of seances) {
    if (!nouvelleSalle.has(s.id)) continue;
    const salleId = nouvelleSalle.get(s.id) ?? null;
    const statut = nouveauStatut.get(s.id) ?? 'ok';
    if (salleId === s.salle_id && statut === s.statut) continue;
    nbModifiees++;
    const cleGroupe = `${salleId ?? 'aucune'}|${statut}`;
    if (!groupes.has(cleGroupe)) groupes.set(cleGroupe, { salleId, statut, ids: [] });
    groupes.get(cleGroupe)!.ids.push(s.id);
  }
  for (const g of groupes.values()) {
    for (let i = 0; i < g.ids.length; i += 100) {
      const { error } = await supabase
        .from('seances_edt')
        .update({ salle_id: g.salleId, statut: g.statut })
        .in('id', g.ids.slice(i, i + 100));
      if (error) throw error;
    }
  }

  // Toutes les grilles en cache de cette semaine sont périmées.
  cacheSeancesGroupees.clear();

  return { nbSeancesTraitees: nbTraitees, nbModifiees, sansSalle };
}