// src/features/heures/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import {
  heuresEffectueesPourSeance,
  estEnRetard,
  retardMinutes as calculerRetardMinutes,
  seanceEstTerminee,
} from '@/lib/calculHeures';
import { bornesCreneau } from '@/lib/creneaux';

// "YYYY-MM" → bornes [début du mois, début du mois suivant[ (ISO date,
// comparées à heure_ouverture qui porte la date réelle du cours).
function bornesDuMois(anneeMois: string): { debut: string; fin: string } {
  const [y, m] = anneeMois.split('-').map(Number);
  const debut = new Date(y, m - 1, 1);
  const fin = new Date(y, m, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  return { debut: fmt(debut), fin: fmt(fin) };
}

function versDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

export function moisEnCours(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Une ligne = une séance fermée (un créneau réellement effectué), pas un
// agrégat — nécessaire pour voir le détail jour par jour, heure d'arrivée
// et de fermeture (le fichier détaillé ET l'app doivent montrer chaque
// entrée, pas juste un total par UE).
//
// Transparence : heureOuverture/heureFermeture sont les VRAIES heures
// réelles (celles enregistrées à l'ouverture/fermeture de la séance),
// pas une heure normalisée — l'enseignant doit pouvoir voir exactement à
// quelle heure il est arrivé et a terminé. Seul `heures` applique la
// règle de la marge de 15 min (voir lib/calculHeures.ts).
export interface LigneHeureSeance {
  seanceId: string;
  enseignantId: string;
  enseignantNom: string;
  ueNom: string;
  specialiteId: string;
  jour: string;
  date: string; // YYYY-MM-DD, dérivée de heure_ouverture réelle
  creneau: string;
  heureOuverture: string; // ISO — heure réelle d'ouverture
  heureFermeture: string; // ISO — heure réelle de fermeture
  heures: number; // durée nominale moins les heures perdues pour retard
  enRetard: boolean; // true si le retard dépasse la marge de 15 min
  retardMinutes: number; // retard exact en minutes (0 si à l'heure/en avance)
}

// Une absence = une séance programmée, jamais ouverte, jamais annulée, et
// dont le créneau est déjà terminé (sans ça, une séance simplement pas
// encore arrivée serait comptée à tort comme une absence).
export interface LigneAbsence {
  seanceId: string;
  enseignantId: string;
  enseignantNom: string;
  ueNom: string;
  jour: string;
  semaine: string;
  creneau: string;
}

export interface LigneHeureTotal {
  enseignantId: string;
  enseignantNom: string;
  totalHeures: number;
}

// Statistiques agrégées pour un enseignant sur une période — vue
// détaillée admin (par enseignant) et "Mes statistiques" (enseignant).
export interface StatsHeures {
  totalHeures: number;
  nombreSeances: number;
  nombreRetards: number; // nb de séances avec retard > 15 min
  cumulRetardMinutes: number; // somme des minutes de retard (toutes séances confondues, y compris < 15 min)
  heuresPerduesPourRetard: number; // total des heures effectivement perdues
  nombreAbsences: number; // séances programmées jamais ouvertes ni annulées, créneau terminé
}

// Durée nominale d'un créneau (indépendante du jour/de la semaine) —
// utilisée uniquement pour calculer les heures perdues dans les stats.
function dureeNominaleCreneau(creneau: string): number {
  const bornes = bornesCreneau(creneau);
  if (bornes) return (bornes.fin - bornes.debut) / 60;
  return creneau === '14h-17h' ? 3 : 4;
}

export function calculerStats(
  detail: LigneHeureSeance[],
  nombreAbsences = 0
): StatsHeures {
  let totalHeures = 0;
  let nombreRetards = 0;
  let cumulRetardMinutes = 0;
  let heuresPerduesPourRetard = 0;
  for (const d of detail) {
    totalHeures += d.heures;
    cumulRetardMinutes += d.retardMinutes;
    if (d.enRetard) nombreRetards++;
    heuresPerduesPourRetard += dureeNominaleCreneau(d.creneau) - d.heures;
  }
  return {
    totalHeures,
    nombreSeances: detail.length,
    nombreRetards,
    cumulRetardMinutes,
    heuresPerduesPourRetard,
    nombreAbsences,
  };
}

// Construit les champs dérivés de la règle de retard (heures effectuées,
// indicateur de retard, retard exact en minutes) — évite de répéter
// cette logique dans les 4 fonctions ci-dessous. Les heures affichées
// (ouverture/fermeture) restent les vraies heures réelles, gérées
// directement par chaque fonction à partir des colonnes de seances_edt.
function derivesRetard(
  semaine: string,
  jour: string,
  creneau: string,
  heureOuvertureReelle: string,
  heureFermetureReelle: string | null
) {
  return {
    heures: heuresEffectueesPourSeance(
      semaine,
      jour,
      creneau,
      heureOuvertureReelle,
      heureFermetureReelle
    ),
    enRetard: estEnRetard(semaine, jour, creneau, heureOuvertureReelle),
    retardMinutes: calculerRetardMinutes(semaine, jour, creneau, heureOuvertureReelle),
  };
}

// Reconstruit le détail heures depuis le cache Dexie — mêmes règles que
// listHeuresDetailMois/listMesHeuresMois, sans jointure Supabase.
// `enseignantId` filtre sur un seul enseignant (vue "Mes heures") ; omis,
// renvoie tout le monde (vue globale Admin/Responsable).
//
// Nettoyage : une séance dont l'enseignant n'existe plus (supprimé du
// référentiel) est exclue — ni des anciennes séances "fantômes" pour un
// enseignant qui n'est plus dans le système.
export async function lireHeuresDepuisCache(
  anneeMois: string,
  enseignantId?: string
): Promise<LigneHeureSeance[]> {
  const { debut, fin } = bornesDuMois(anneeMois);
  const [seances, offres, ues, enseignants, emplois, troncsCommuns] =
    await Promise.all([
      db.seancesEDT.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.enseignants.toArray(),
      db.emploisDuTemps.toArray(),
      db.troncsCommuns.toArray(),
    ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));

  return (seances as any[])
    .filter((s) => s.heure_fermeture != null && s.heure_ouverture)
    .filter((s) => s.heure_ouverture >= debut && s.heure_ouverture < fin)
    .filter((s) => !enseignantId || s.enseignant_id === enseignantId)
    .filter((s) => enseignantParId.has(s.enseignant_id)) // enseignant supprimé -> exclu
    .map((s) => {
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = enseignantParId.get(s.enseignant_id);
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      const derives = derivesRetard(s.semaine, s.jour, s.creneau, s.heure_ouverture, s.heure_fermeture ?? null);
      return {
        seanceId: s.id,
        enseignantId: s.enseignant_id,
        enseignantNom: enseignant?.nom ?? '',
        ueNom: troncCommun?.nom ?? ue?.nom ?? '(UE inconnue)',
        specialiteId: emploi?.specialite_id ?? '',
        jour: s.jour,
        date: versDateISO(s.heure_ouverture),
        creneau: s.creneau,
        heureOuverture: s.heure_ouverture,
        heureFermeture: s.heure_fermeture,
        heures: derives.heures,
        enRetard: derives.enRetard,
        retardMinutes: derives.retardMinutes,
      } as LigneHeureSeance;
    })
    .sort(
      (a, b) =>
        a.enseignantNom.localeCompare(b.enseignantNom) ||
        a.date.localeCompare(b.date) ||
        a.creneau.localeCompare(b.creneau)
    );
}

const SELECT_DETAIL = `
  id, jour, creneau, semaine, heure_ouverture, heure_fermeture,
  enseignant_id,
  enseignant:enseignants(nom),
  offre:offres(ue:ues(nom)),
  tronc_commun:troncs_communs(nom),
  emploi_du_temps:emplois_du_temps(specialite_id)
`;

// Nettoyage : une ligne dont la jointure "enseignant" ne renvoie rien
// (l'enseignant a été supprimé du référentiel depuis) est écartée —
// jamais affichée ni comptée dans les stats/totaux.
function ligneDepuisSupabase(s: any): LigneHeureSeance | null {
  if (!s.enseignant?.nom) return null;
  const derives = derivesRetard(s.semaine, s.jour, s.creneau, s.heure_ouverture, s.heure_fermeture ?? null);
  return {
    seanceId: s.id,
    enseignantId: s.enseignant_id,
    enseignantNom: s.enseignant.nom,
    ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '(UE inconnue)',
    specialiteId: s.emploi_du_temps?.specialite_id ?? '',
    jour: s.jour,
    date: versDateISO(s.heure_ouverture),
    creneau: s.creneau,
    heureOuverture: s.heure_ouverture,
    heureFermeture: s.heure_fermeture,
    heures: derives.heures,
    enRetard: derives.enRetard,
    retardMinutes: derives.retardMinutes,
  };
}

// Détail séance par séance, pour tous les enseignants, sur le mois donné —
// Admin et Responsable (vue globale, écran 7.1 + export "détail"). Le
// filtrage par périmètre de spécialités se fait côté appelant (via
// specialiteId), puisque seule la page sait quel rôle consulte.
export async function listHeuresDetailMois(
  anneeMois: string
): Promise<LigneHeureSeance[]> {
  const { debut, fin } = bornesDuMois(anneeMois);

  const { data, error } = await supabase
    .from('seances_edt')
    .select(SELECT_DETAIL)
    .not('heure_fermeture', 'is', null)
    .gte('heure_ouverture', debut)
    .lt('heure_ouverture', fin);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map(ligneDepuisSupabase)
    .filter((l): l is LigneHeureSeance => l !== null)
    .sort(
      (a, b) =>
        a.enseignantNom.localeCompare(b.enseignantNom) ||
        a.date.localeCompare(b.date) ||
        a.creneau.localeCompare(b.creneau)
    );
}

// Détail séance par séance pour UN SEUL enseignant — page de détail
// admin (clic sur un enseignant depuis "Voir les états").
export async function listHeuresDetailEnseignant(
  enseignantId: string,
  anneeMois: string
): Promise<LigneHeureSeance[]> {
  const { debut, fin } = bornesDuMois(anneeMois);

  const { data, error } = await supabase
    .from('seances_edt')
    .select(SELECT_DETAIL)
    .eq('enseignant_id', enseignantId)
    .not('heure_fermeture', 'is', null)
    .gte('heure_ouverture', debut)
    .lt('heure_ouverture', fin);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map(ligneDepuisSupabase)
    .filter((l): l is LigneHeureSeance => l !== null)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.creneau.localeCompare(b.creneau)
    );
}

// Absences du mois — séances programmées, jamais ouvertes, jamais
// annulées, et dont le créneau est déjà terminé. `enseignantId` omis :
// toutes (vue admin) ; renseigné : un seul enseignant.
export async function listAbsencesMois(
  anneeMois: string,
  enseignantId?: string
): Promise<LigneAbsence[]> {
  const { debut, fin } = bornesDuMois(anneeMois);

  let requete = supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, semaine, enseignant_id,
      enseignant:enseignants(nom),
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom)
    `
    )
    .is('heure_ouverture', null)
    .eq('annulee', false)
    .gte('semaine', debut)
    .lt('semaine', fin);
  if (enseignantId) requete = requete.eq('enseignant_id', enseignantId);

  const { data, error } = await requete;
  if (error) throw error;

  const maintenant = new Date();
  return ((data ?? []) as any[])
    .filter((s) => !!s.enseignant?.nom) // enseignant supprimé -> exclu
    .filter((s) => seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant))
    .map((s) => ({
      seanceId: s.id,
      enseignantId: s.enseignant_id,
      enseignantNom: s.enseignant.nom,
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '(UE inconnue)',
      jour: s.jour,
      semaine: s.semaine,
      creneau: s.creneau,
    }));
}

// Version Dexie (hors ligne) de listAbsencesMois — mêmes règles.
export async function lireAbsencesDepuisCache(
  anneeMois: string,
  enseignantId?: string
): Promise<LigneAbsence[]> {
  const { debut, fin } = bornesDuMois(anneeMois);
  const [seances, offres, ues, enseignants, troncsCommuns] = await Promise.all([
    db.seancesEDT.toArray(),
    db.offres.toArray(),
    db.ues.toArray(),
    db.enseignants.toArray(),
    db.troncsCommuns.toArray(),
  ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const maintenant = new Date();

  return (seances as any[])
    .filter((s) => !s.heure_ouverture && !s.annulee)
    .filter((s) => s.semaine >= debut && s.semaine < fin)
    .filter((s) => !enseignantId || s.enseignant_id === enseignantId)
    .filter((s) => enseignantParId.has(s.enseignant_id))
    .filter((s) => seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant))
    .map((s) => {
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = enseignantParId.get(s.enseignant_id);
      return {
        seanceId: s.id,
        enseignantId: s.enseignant_id,
        enseignantNom: enseignant?.nom ?? '',
        ueNom: troncCommun?.nom ?? ue?.nom ?? '(UE inconnue)',
        jour: s.jour,
        semaine: s.semaine,
        creneau: s.creneau,
      } as LigneAbsence;
    });
}

// Totaux par enseignant (sans détail) — dérivés du détail ci-dessus.
export async function listHeuresTotalMois(
  anneeMois: string
): Promise<LigneHeureTotal[]> {
  const detail = await listHeuresDetailMois(anneeMois);
  return totauxDepuisDetail(detail);
}

export function totauxDepuisDetail(
  detail: LigneHeureSeance[]
): LigneHeureTotal[] {
  const parEnseignant = new Map<string, LigneHeureTotal>();
  for (const d of detail) {
    const existant = parEnseignant.get(d.enseignantId);
    if (existant) existant.totalHeures += d.heures;
    else
      parEnseignant.set(d.enseignantId, {
        enseignantId: d.enseignantId,
        enseignantNom: d.enseignantNom,
        totalHeures: d.heures,
      });
  }
  return Array.from(parEnseignant.values()).sort((a, b) =>
    a.enseignantNom.localeCompare(b.enseignantNom)
  );
}

// Vue personnelle de l'enseignant (écran 7.2) — ses propres séances,
// jour par jour, avec heure d'ouverture et de fermeture de chacune.
export async function listMesHeuresMois(
  matricule: string,
  anneeMois: string
): Promise<LigneHeureSeance[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  return listHeuresDetailEnseignant(enseignant.id, anneeMois);
}

// Absences personnelles de l'enseignant, symétrique à listMesHeuresMois.
export async function listMesAbsencesMois(
  matricule: string,
  anneeMois: string
): Promise<LigneAbsence[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  return listAbsencesMois(anneeMois, enseignant.id);
}