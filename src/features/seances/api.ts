// src/features/seances/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { TypeCursus, Creneau } from '@/types';

// Le Cameroun est en UTC+1 (WAT) toute l'année, pas de changement
// d'heure — donc un simple décalage fixe suffit, pas besoin d'une
// bibliothèque de fuseaux horaires. TOUJOURS utiliser cette heure pour
// "maintenant", jamais l'heure/date de l'appareil (souvent mal réglée,
// ou dans un autre fuseau si l'enseignant est en déplacement).
function maintenantCameroun(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

// À utiliser avec les méthodes getUTCxxx() du Date renvoyé ci-dessus
// (jamais getHours()/getDay() "locaux", qui réinterprètent selon le
// fuseau de l'appareil et annuleraient le décalage qu'on vient d'ajouter).

function lundiDeLaSemaine(reference = maintenantCameroun()): string {
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

function decalerSemaine(semaineISO: string, nbSemaines: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + nbSemaines * 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Les N dernières semaines (lundis), semaine actuelle incluse — utilisé
// pour la Saisie manuelle, dont la fenêtre de recherche doit couvrir
// large (jusqu'à 1 mois en arrière).
function dernieresSemaines(nb: number): string[] {
  const actuelle = lundiDeLaSemaine();
  return Array.from({ length: nb }, (_, i) => decalerSemaine(actuelle, -i));
}

const NOMS_JOURS = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
];

function jourDAujourdhui(): string | null {
  const nom = NOMS_JOURS[maintenantCameroun().getUTCDay()];
  return nom === 'Dimanche' ? null : nom;
}

// Bornes (en minutes depuis minuit, heure du Cameroun) de chaque créneau.
const BORNES_CRENEAU: Record<Creneau, { debut: number; fin: number }> = {
  '08h-12h': { debut: 8 * 60, fin: 12 * 60 },
  '14h-17h': { debut: 14 * 60, fin: 17 * 60 },
};

// Fenêtre élargie : ouvrable dès 3h avant le début programmé, encore
// fermable jusqu'à 1h après la fin programmée — sinon un enseignant en
// avance ou un peu en retard ne retrouverait jamais son cours dans "Ma
// séance". Renvoie null si l'heure actuelle ne tombe dans la fenêtre
// élargie d'aucun créneau.
const MARGE_AVANT_MIN = 3 * 60;
const MARGE_APRES_MIN = 1 * 60;

function creneauActuel(): Creneau | null {
  const maintenant = maintenantCameroun();
  const minutes = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  for (const [creneau, bornes] of Object.entries(BORNES_CRENEAU) as [
    Creneau,
    { debut: number; fin: number },
  ][]) {
    if (
      minutes >= bornes.debut - MARGE_AVANT_MIN &&
      minutes <= bornes.fin + MARGE_APRES_MIN
    ) {
      return creneau;
    }
  }
  return null;
}

// ── Flux normal enseignant (écrans 6.1 / 6.2) ──────────────────────

export interface SeanceDuMoment {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  salleCode: string | null;
  jour: string;
  creneau: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
  specialiteId: string | null;
  specialiteNom: string | null;
  typeCursus: TypeCursus | null;
  semestre: string | null;
}

// Le cours du moment pour l'enseignant connecté : celui prévu aujourd'hui,
// sur le créneau en cours, dans une semaine déjà validée. Ne renvoie rien
// en dehors des heures de cours ou un dimanche.
export async function getSeanceDuMoment(
  matricule: string
): Promise<SeanceDuMoment | null> {
  const jour = jourDAujourdhui();
  if (!jour) return null;

  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return null;

  const semaine = lundiDeLaSemaine();
  const creneau = creneauActuel();
  if (!creneau) return null;

  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id, specialite_id, specialite:specialites(nom, type_cursus)')
    .eq('semaine', semaine)
    .eq('statut', 'valide');
  const emploiIds = (emplois ?? []).map((e) => e.id);
  const specialiteParEmploi = new Map(
    (emplois ?? []).map((e: any) => [
      e.id,
      {
        specialiteId: e.specialite_id as string,
        specialiteNom: (e.specialite?.nom as string) ?? null,
        typeCursus: (e.specialite?.type_cursus as TypeCursus) ?? null,
      },
    ])
  );

  // Séance de spécialité (via emplois du temps validés) OU séance de
  // tronc commun (partagée, plus rattachée à un seul emploi du temps) —
  // recherchées séparément, elles ne se rattachent pas à la semaine de
  // la même façon.
  let s: any = null;

  if (emploiIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        `
        id, jour, creneau, heure_ouverture, heure_fermeture, emploi_du_temps_id,
        tronc_commun_id,
        offre:offres(semestre, ue:ues(id, nom)),
        tronc_commun:troncs_communs(nom),
        salle:salles(code_salle)
      `
      )
      .eq('enseignant_id', enseignant.id)
      .eq('jour', jour)
      .eq('creneau', creneau)
      .eq('annulee', false)
      .in('emploi_du_temps_id', emploiIds)
      .order('id')
      .limit(1);
    if (error) throw error;
    s = data?.[0] ?? null;
  }

  if (!s) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        `
        id, jour, creneau, heure_ouverture, heure_fermeture, emploi_du_temps_id,
        tronc_commun_id,
        tronc_commun:troncs_communs(nom),
        salle:salles(code_salle)
      `
      )
      .eq('enseignant_id', enseignant.id)
      .eq('jour', jour)
      .eq('creneau', creneau)
      .eq('semaine', semaine)
      .eq('annulee', false)
      .not('tronc_commun_id', 'is', null)
      .order('id')
      .limit(1);
    if (error) throw error;
    s = data?.[0] ?? null;
  }

  if (!s) return null;

  const specialiteInfo = specialiteParEmploi.get(s.emploi_du_temps_id);
  return {
    id: s.id,
    ueId: s.offre?.ue?.id ?? null,
    troncCommunId: s.tronc_commun_id ?? null,
    ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
    specialiteId: specialiteInfo?.specialiteId ?? null,
    specialiteNom: specialiteInfo?.specialiteNom ?? null,
    typeCursus: specialiteInfo?.typeCursus ?? null,
    semestre: s.offre?.semestre ?? null,
    salleCode: s.salle?.code_salle ?? null,
    jour: s.jour,
    creneau: s.creneau,
    heureOuverture: s.heure_ouverture,
    heureFermeture: s.heure_fermeture,
  };
}

// Le code n'est jamais lu côté client : la fonction RPC "security definer"
// le vérifie elle-même côté base et renvoie une erreur explicite sinon.
export async function ouvrirSeance(
  seanceId: string,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('ouvrir_seance', {
    p_seance_id: seanceId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  const ligne = Array.isArray(data) ? data[0] : data;
  return ligne?.heure_ouverture;
}

export async function fermerSeance(
  seanceId: string,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('fermer_seance', {
    p_seance_id: seanceId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  const ligne = Array.isArray(data) ? data[0] : data;
  return ligne?.heure_fermeture;
}

// ── Flux de secours — saisie manuelle (écran 6.3) ──────────────────

export interface SeanceRecherche {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  enseignantNom: string;
  enseignantMatricule: string | null;
  specialiteId: string | null;
  specialiteNom: string | null;
  typeCursus: TypeCursus | null;
  semestre: string | null;
  jour: string;
  creneau: string;
  semaine: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
}

// Recherche parmi les EDT validés de la semaine en cours et de la
// précédente (pour rattraper un oubli de la veille) — Admin, Responsable,
// Secrétaire.
// Reconstruit la même recherche depuis le cache Dexie — utilisée hors
// ligne (le cas d'usage même de cet écran : l'app était injoignable, la
// secrétaire a noté les heures sur papier, et rattrape ça maintenant,
// éventuellement encore hors ligne).
export async function lireSeancesPourSaisieManuelleDepuisCache(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaines = dernieresSemaines(5);

  const [emplois, seancesToutes, offres, ues, enseignants, troncsCommuns, specialites] =
    await Promise.all([
      db.emploisDuTemps
        .where('semaine')
        .anyOf(semaines)
        .and((e: any) => e.statut === 'valide')
        .toArray(),
      db.seancesEDT.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.enseignants.toArray(),
      db.troncsCommuns.toArray(),
      db.specialites.toArray(),
    ]);
  if (emplois.length === 0 && !troncsCommuns.length) return [];

  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));

  const q = recherche.trim().toLowerCase();
  return (seancesToutes as any[])
    .filter(
      (s) =>
        emploiParId.has(s.emploi_du_temps_id) ||
        (s.tronc_commun_id && semaines.includes(s.semaine))
    )
    .map((s) => {
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = s.enseignant_id
        ? enseignantParId.get(s.enseignant_id)
        : null;
      const specialite = emploi?.specialite_id
        ? specialiteParId.get(emploi.specialite_id)
        : null;
      return {
        id: s.id,
        ueId: ue?.id ?? null,
        troncCommunId: s.tronc_commun_id ?? null,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '',
        enseignantNom: enseignant?.nom ?? '',
        enseignantMatricule: enseignant?.matricule ?? null,
        specialiteId: emploi?.specialite_id ?? null,
        specialiteNom: specialite?.nom ?? null,
        typeCursus: specialite?.type_cursus ?? null,
        semestre: offre?.semestre ?? null,
        jour: s.jour,
        creneau: s.creneau,
        semaine: emploi?.semaine ?? s.semaine ?? '',
        heureOuverture: s.heure_ouverture ?? null,
        heureFermeture: s.heure_fermeture ?? null,
      } as SeanceRecherche;
    })
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

// ── Rapport de séance (Scénario 13) ────────────────────────────

export interface RapportSeance {
  id: string;
  seanceId: string;
  niveau: string;
  contenu: string | null;
  cahierTexteKeys: string[];
  cahierTexteNoms: string[];
}

export async function getRapportPourSeance(
  seanceId: string
): Promise<RapportSeance | null> {
  const { data, error } = await supabase
    .from('rapports_seances')
    .select(
      'id, seance_edt_id, niveau, contenu, cahier_texte_keys, cahier_texte_noms'
    )
    .eq('seance_edt_id', seanceId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const r = data[0];
  return {
    id: r.id,
    seanceId: r.seance_edt_id,
    niveau: r.niveau,
    contenu: r.contenu,
    cahierTexteKeys: r.cahier_texte_keys ?? [],
    cahierTexteNoms: r.cahier_texte_noms ?? [],
  };
}

// Retire une photo du cahier de texte (index 1-based, dans l'ordre
// d'envoi) — le fichier reste sur R2 (pas critique de le supprimer), la
// photo disparaît juste de la liste du rapport.
export async function retirerImageCahierTexte(
  rapportId: string,
  index1Based: number
): Promise<void> {
  const { error } = await supabase.rpc('retirer_image_cahier_texte', {
    p_rapport_id: rapportId,
    p_index: index1Based,
  });
  if (error) throw new Error(error.message);
}

// Crée le rapport s'il n'existe pas encore pour cette séance, ou renvoie
// celui déjà en place (en mettant à jour le niveau si l'enseignant l'a
// changé entre-temps).
export async function creerOuRecupererRapport(
  seanceId: string,
  matricule: string,
  niveau: string
): Promise<string> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) throw new Error('Enseignant introuvable.');

  const existant = await getRapportPourSeance(seanceId);
  if (existant) {
    if (existant.niveau !== niveau) {
      await supabase
        .from('rapports_seances')
        .update({ niveau })
        .eq('id', existant.id);
    }
    return existant.id;
  }

  const { data, error } = await supabase
    .from('rapports_seances')
    .insert({ seance_edt_id: seanceId, enseignant_id: enseignant.id, niveau })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getAppelExistant(
  rapportId: string
): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('appels_etudiants')
    .select('etudiant_id, present')
    .eq('rapport_id', rapportId);
  const map: Record<string, boolean> = {};
  for (const ligne of data ?? []) map[ligne.etudiant_id] = ligne.present;
  return map;
}

// Remplace l'appel existant par le nouveau — simple et robuste vu le
// faible volume (une classe par séance).
export async function enregistrerAppel(
  rapportId: string,
  presences: { etudiantId: string; present: boolean }[]
): Promise<void> {
  await supabase.from('appels_etudiants').delete().eq('rapport_id', rapportId);
  if (presences.length === 0) return;
  const { error } = await supabase.from('appels_etudiants').insert(
    presences.map((p) => ({
      rapport_id: rapportId,
      etudiant_id: p.etudiantId,
      present: p.present,
    }))
  );
  if (error) throw error;
}

export async function getPointsAbordesExistants(
  rapportId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('rapports_points_abordes')
    .select('point_cle_id')
    .eq('rapport_id', rapportId);
  return new Set((data ?? []).map((l) => l.point_cle_id));
}

// Remplace intégralement les points abordés — même principe que l'appel :
// chaque enregistrement fournit la liste complète, jamais un ajout partiel.
export async function enregistrerPointsAbordes(
  rapportId: string,
  pointIds: string[]
): Promise<void> {
  await supabase
    .from('rapports_points_abordes')
    .delete()
    .eq('rapport_id', rapportId);
  if (pointIds.length === 0) return;
  const { error } = await supabase.from('rapports_points_abordes').insert(
    pointIds.map((point_cle_id) => ({ rapport_id: rapportId, point_cle_id }))
  );
  if (error) throw error;
}

export async function enregistrerContenuRapport(
  rapportId: string,
  contenu: string
): Promise<void> {
  const { error } = await supabase
    .from('rapports_seances')
    .update({ contenu })
    .eq('id', rapportId);
  if (error) throw error;
}

export async function rechercherSeancesPourSaisieManuelle(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaines = dernieresSemaines(5);

  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id, semaine, specialite_id, specialite:specialites(nom, type_cursus)')
    .in('semaine', semaines)
    .eq('statut', 'valide');
  const emploiIds = (emplois ?? []).map((e) => e.id);
  const infosParEmploi = new Map(
    (emplois ?? []).map((e: any) => [
      e.id,
      {
        semaine: e.semaine as string,
        specialiteId: e.specialite_id as string,
        specialiteNom: (e.specialite?.nom as string) ?? null,
        typeCursus: (e.specialite?.type_cursus as TypeCursus) ?? null,
      },
    ])
  );

  let seancesSpe: any[] = [];
  if (emploiIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        `
        id, jour, creneau, emploi_du_temps_id, heure_ouverture, heure_fermeture,
        tronc_commun_id,
        offre:offres(semestre, ue:ues(id, nom)),
        tronc_commun:troncs_communs(nom),
        enseignant:enseignants(nom, matricule)
      `
      )
      .in('emploi_du_temps_id', emploiIds);
    if (error) throw error;
    seancesSpe = data ?? [];
  }

  // Séances de tronc commun des dernières semaines — plus rattachées à
  // un emploi de spécialité (une seule ligne partagée par tout le
  // groupe).
  const { data: seancesTronc, error: errorTronc } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture, semaine,
      tronc_commun_id,
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom, matricule)
    `
    )
    .in('semaine', semaines)
    .not('tronc_commun_id', 'is', null);
  if (errorTronc) throw errorTronc;

  const q = recherche.trim().toLowerCase();
  return [...seancesSpe, ...(seancesTronc ?? [])]
    .map((s: any) => {
      const infos = infosParEmploi.get(s.emploi_du_temps_id);
      return {
        id: s.id,
        ueId: s.offre?.ue?.id ?? null,
        troncCommunId: s.tronc_commun_id ?? null,
        ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
        enseignantNom: s.enseignant?.nom ?? '',
        enseignantMatricule: s.enseignant?.matricule ?? null,
        specialiteId: infos?.specialiteId ?? null,
        specialiteNom: infos?.specialiteNom ?? null,
        typeCursus: infos?.typeCursus ?? null,
        semestre: s.offre?.semestre ?? null,
        jour: s.jour,
        creneau: s.creneau,
        semaine: infos?.semaine ?? s.semaine ?? '',
        heureOuverture: s.heure_ouverture,
        heureFermeture: s.heure_fermeture,
      };
    })
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

export async function saisirHeureManuelle(
  seanceId: string,
  heures: { heureOuverture?: string | null; heureFermeture?: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('saisir_heure_manuelle', {
    p_seance_id: seanceId,
    p_heure_ouverture: heures.heureOuverture || null,
    p_heure_fermeture: heures.heureFermeture || null,
  });
  if (error) throw new Error(error.message);
}