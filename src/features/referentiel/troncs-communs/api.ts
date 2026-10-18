// src/features/referentiel/troncs-communs/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { TypeCursus } from '@/types';
import { createUE } from '@/features/referentiel/ues/api';
import { getHeuresTotalesValideesParOffre } from '@/features/emploi-du-temps/api';

export interface UEDeTroncCommunResume {
  id: string;
  nom: string;
  semestre: string | null;
  specialite_nom: string | null;
  filiere_nom: string | null;
  ecole_nom: string | null;
}

export interface TroncCommunAvecUEs {
  id: string;
  nom: string;
  enseignant_id: string | null;
  enseignant_nom: string | null;
  ues: UEDeTroncCommunResume[];
}

// Reconstruit tronc commun → UEs groupées → offre → spécialité → filière →
// école, depuis Dexie — la jointure la plus profonde de tout le référentiel
// (5 tables à assembler à la main).
export async function lireTroncsCommunsDepuisCache(): Promise<
  TroncCommunAvecUEs[]
> {
  const [
    troncsCommuns,
    liaisons,
    ues,
    offres,
    specialites,
    filieres,
    ecoles,
    enseignants,
  ] = await Promise.all([
    db.troncsCommuns.toArray(),
    db.troncsCommunsUes.toArray(),
    db.ues.toArray(),
    db.offres.toArray(),
    db.specialites.toArray(),
    db.filieres.toArray(),
    db.ecoles.toArray(),
    db.enseignants.toArray(),
  ]);

  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const offreParUeId = new Map<string, any>();
  for (const o of offres as any[]) {
    if (!offreParUeId.has(o.ue_id)) offreParUeId.set(o.ue_id, o);
  }
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));
  const filiereParId = new Map(filieres.map((f: any) => [f.id, f]));
  const ecoleParId = new Map(ecoles.map((e: any) => [e.id, e]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));

  return (troncsCommuns as any[])
    .map((t) => {
      const uesDuTronc = (liaisons as any[])
        .filter((l) => l.tronc_commun_id === t.id)
        .map((l) => {
          const ue = ueParId.get(l.ue_id);
          if (!ue) return null;
          const offre = offreParUeId.get(ue.id);
          const specialite = offre
            ? specialiteParId.get(offre.specialite_id)
            : null;
          const filiere = specialite
            ? filiereParId.get(specialite.filiere_id)
            : null;
          const ecole = filiere ? ecoleParId.get(filiere.ecole_id) : null;
          return {
            id: ue.id,
            nom: ue.nom,
            semestre: offre?.semestre ?? null,
            specialite_nom: specialite?.nom ?? null,
            filiere_nom: filiere?.nom ?? null,
            ecole_nom: ecole?.nom ?? null,
          } as UEDeTroncCommunResume;
        })
        .filter((u): u is UEDeTroncCommunResume => u !== null);

      return {
        id: t.id,
        nom: t.nom,
        enseignant_id: t.enseignant_id,
        enseignant_nom: t.enseignant_id
          ? (enseignantParId.get(t.enseignant_id)?.nom ?? null)
          : null,
        ues: uesDuTronc,
      } as TroncCommunAvecUEs;
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

export async function listTroncsCommuns(): Promise<TroncCommunAvecUEs[]> {
  const { data, error } = await supabase
    .from('troncs_communs')
    .select(
      `
      id, nom, enseignant_id,
      enseignant:enseignants ( nom ),
      troncs_communs_ues (
        ue:ues (
          id, nom,
          offres ( semestre, specialite:specialites ( nom, filiere:filieres ( nom, ecole:ecoles ( nom ) ) ) )
        )
      )
    `
    )
    .order('nom');

  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    id: t.id,
    nom: t.nom,
    enseignant_id: t.enseignant_id,
    enseignant_nom: t.enseignant?.nom ?? null,
    ues: (t.troncs_communs_ues ?? []).map((tu: any) => {
      const offre = tu.ue.offres?.[0];
      return {
        id: tu.ue.id,
        nom: tu.ue.nom,
        semestre: offre?.semestre ?? null,
        specialite_nom: offre?.specialite?.nom ?? null,
        filiere_nom: offre?.specialite?.filiere?.nom ?? null,
        ecole_nom: offre?.specialite?.filiere?.ecole?.nom ?? null,
      };
    }),
  }));
}

export interface UEOption {
  id: string;
  nom: string;
  specialite_nom: string | null;
  deja_dans_un_groupe: boolean;
}

// UEs disponibles pour un nouveau tronc commun — signale celles déjà dans
// un autre groupe (une UE ne devrait appartenir qu'à un seul groupe à la
// fois, pour éviter les doubles comptages en emploi du temps).
// Reconstruit la même liste depuis Dexie — utilisée hors ligne.
export async function lireUEsPourTroncCommunDepuisCache(): Promise<
  UEOption[]
> {
  const [ues, offres, specialites, liaisons] = await Promise.all([
    db.ues.toArray(),
    db.offres.toArray(),
    db.specialites.toArray(),
    db.troncsCommunsUes.toArray(),
  ]);
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));
  const offreParUeId = new Map<string, any>();
  for (const o of offres as any[]) {
    if (!offreParUeId.has(o.ue_id)) offreParUeId.set(o.ue_id, o);
  }
  const dejaGroupees = new Set(
    (liaisons as any[]).map((l) => l.ue_id)
  );

  return (ues as any[]).map((u) => {
    const offre = offreParUeId.get(u.id);
    const specialite = offre ? specialiteParId.get(offre.specialite_id) : null;
    return {
      id: u.id,
      nom: u.nom,
      specialite_nom: specialite?.nom ?? null,
      deja_dans_un_groupe: dejaGroupees.has(u.id),
    };
  });
}

export async function listUEsPourTroncCommun(): Promise<UEOption[]> {
  const [{ data: uesData }, { data: dejaGroupeesData }] = await Promise.all([
    supabase.from('ues').select('id, nom, offres(specialite:specialites(nom))'),
    supabase.from('troncs_communs_ues').select('ue_id'),
  ]);
  const dejaGroupees = new Set(
    (dejaGroupeesData ?? []).map((t: any) => t.ue_id)
  );
  return (uesData ?? []).map((u: any) => ({
    id: u.id,
    nom: u.nom,
    specialite_nom: u.offres?.[0]?.specialite?.nom ?? null,
    deja_dans_un_groupe: dejaGroupees.has(u.id),
  }));
}

export interface NouveauTroncCommun {
  nom: string;
  ue_ids: string[];
  enseignant_id?: string;
}

export interface ResultatMigrationHeures {
  seancesMigrees: number;
  heuresConservees: number;
  doublonsSupprimes: number;
  ueReference: string | null;
}

// Quand des UEs déjà en cours deviennent un tronc commun, leurs séances
// passées (rattachées à l'offre) doivent suivre : sinon le tronc repart
// à 0 heure. On prend l'UE qui a le plus d'heures effectuées comme
// référence : ses séances (avec rapports, présences, ouvertures…)
// passent EN PLACE au tronc — mêmes identifiants, donc rien n'est perdu
// et le total d'heures effectuées reste identique. Les séances encore
// non ouvertes des autres UEs, tombant exactement au même créneau,
// n'étaient que des doublons de ce même cours : elles sont retirées.
// Toutes les autres séances restent intactes.
export async function migrerHeuresVersTronc(
  troncCommunId: string,
  ueIds: string[]
): Promise<ResultatMigrationHeures> {
  const vide: ResultatMigrationHeures = {
    seancesMigrees: 0,
    heuresConservees: 0,
    doublonsSupprimes: 0,
    ueReference: null,
  };
  if (ueIds.length === 0) return vide;

  const { data: offres, error: offresError } = await supabase
    .from('offres')
    .select('id, ue_id')
    .in('ue_id', ueIds);
  if (offresError) throw offresError;
  const offreIds = (offres ?? []).map((o: any) => o.id as string);
  if (offreIds.length === 0) return vide;

  const heuresParOffre = await getHeuresTotalesValideesParOffre(offreIds);
  const { data: seances, error: seancesError } = await supabase
    .from('seances_edt')
    .select('id, offre_id, semaine, jour, creneau, heure_ouverture')
    .in('offre_id', offreIds);
  if (seancesError) throw seancesError;
  const liste = (seances ?? []) as any[];
  if (liste.length === 0) return vide;

  let offreRef = '';
  let heuresRef = -1;
  for (const id of offreIds) {
    const h = heuresParOffre.get(id) ?? 0;
    const nb = liste.filter((x) => x.offre_id === id).length;
    if (nb > 0 && h > heuresRef) {
      heuresRef = h;
      offreRef = id;
    }
  }
  if (!offreRef) return vide;

  const aMigrer = liste.filter((x) => x.offre_id === offreRef);
  const creneauxMigres = new Set(aMigrer.map((x) => `${x.semaine}|${x.jour}|${x.creneau}`));
  const doublons = liste.filter(
    (x) =>
      x.offre_id !== offreRef &&
      !x.heure_ouverture &&
      creneauxMigres.has(`${x.semaine}|${x.jour}|${x.creneau}`)
  );

  if (doublons.length > 0) {
    const { error } = await supabase
      .from('seances_edt')
      .delete()
      .in('id', doublons.map((d) => d.id));
    if (error) throw error;
  }
  const { error: majError } = await supabase
    .from('seances_edt')
    .update({ tronc_commun_id: troncCommunId, offre_id: null, emploi_du_temps_id: null })
    .eq('offre_id', offreRef);
  if (majError) throw majError;

  // Enseignant du tronc : à défaut, celui qui assurait l'UE de référence.
  const { data: tronc } = await supabase
    .from('troncs_communs')
    .select('enseignant_id')
    .eq('id', troncCommunId)
    .maybeSingle();
  if (tronc && !(tronc as any).enseignant_id) {
    const { data: att } = await supabase
      .from('attributions')
      .select('enseignant_id')
      .eq('offre_id', offreRef)
      .eq('statut', 'actif')
      .maybeSingle();
    if (att?.enseignant_id) {
      await supabase
        .from('troncs_communs')
        .update({ enseignant_id: att.enseignant_id })
        .eq('id', troncCommunId);
    }
  }

  const ueRef = (offres ?? []).find((o: any) => o.id === offreRef)?.ue_id ?? null;
  return {
    seancesMigrees: aMigrer.length,
    heuresConservees: Math.max(heuresRef, 0),
    doublonsSupprimes: doublons.length,
    ueReference: ueRef,
  };
}

export async function createTroncCommun(input: NouveauTroncCommun) {
  const { data: troncCommun, error } = await supabase
    .from('troncs_communs')
    .insert({ nom: input.nom, enseignant_id: input.enseignant_id ?? null })
    .select('id')
    .single();
  if (error) throw error;

  const { error: liaisonError } = await supabase
    .from('troncs_communs_ues')
    .insert(
      input.ue_ids.map((ue_id) => ({ tronc_commun_id: troncCommun.id, ue_id }))
    );
  if (liaisonError) throw liaisonError;

  // Les heures déjà effectuées suivent les UEs devenues tronc commun.
  const migration = await migrerHeuresVersTronc(troncCommun.id, input.ue_ids);

  return { ...troncCommun, migration };
}

export async function deleteTroncCommun(id: string) {
  const { error } = await supabase.from('troncs_communs').delete().eq('id', id);
  if (error) throw error;
}

// Retrouve le tronc commun (s'il existe) auquel appartient une UE donnée,
// avec la liste complète des autres UEs du groupe — utilisé par la
// Répartition pour propager l'attribution à tout le groupe.
export async function getTroncCommunDeUE(
  ueId: string
): Promise<TroncCommunAvecUEs | null> {
  const { data: lien } = await supabase
    .from('troncs_communs_ues')
    .select('tronc_commun_id')
    .eq('ue_id', ueId)
    .maybeSingle();

  if (!lien) return null;

  const { data, error } = await supabase
    .from('troncs_communs')
    .select(
      `
      id, nom, enseignant_id,
      enseignant:enseignants ( nom ),
      troncs_communs_ues (
        ue:ues (
          id, nom,
          offres ( id, semestre, specialite:specialites ( nom, filiere:filieres ( nom, ecole:ecoles ( nom ) ) ) )
        )
      )
    `
    )
    .eq('id', lien.tronc_commun_id)
    .single();

  if (error) throw error;
  const t = data as any;
  return {
    id: t.id,
    nom: t.nom,
    enseignant_id: t.enseignant_id,
    enseignant_nom: t.enseignant?.nom ?? null,
    ues: (t.troncs_communs_ues ?? []).map((tu: any) => {
      const offre = tu.ue.offres?.[0];
      return {
        id: tu.ue.id,
        nom: tu.ue.nom,
        semestre: offre?.semestre ?? null,
        specialite_nom: offre?.specialite?.nom ?? null,
        filiere_nom: offre?.specialite?.filiere?.nom ?? null,
        ecole_nom: offre?.specialite?.filiere?.ecole?.nom ?? null,
      };
    }),
  };
}

export async function setEnseignantTroncCommun(
  troncCommunId: string,
  enseignantId: string
) {
  const { error } = await supabase
    .from('troncs_communs')
    .update({ enseignant_id: enseignantId })
    .eq('id', troncCommunId);
  if (error) throw error;
}

// ── Détail / Modification (écran détail tronc commun) ────────────

export interface GroupeSpecialiteTronc {
  specialiteId: string;
  specialiteNom: string;
  typeCursus: TypeCursus;
  semestre: string | null;
}

// Une spécialité par UE membre (dédupliquées) — nécessaire pour le
// rapport de séance : chaque UE du tronc commun garde sa propre offre
// (spécialité + semestre), donc un cours en tronc commun concerne
// potentiellement plusieurs spécialités à la fois.
export async function getGroupesSpecialitesTronc(
  troncCommunId: string
): Promise<GroupeSpecialiteTronc[]> {
  const { data, error } = await supabase
    .from('troncs_communs_ues')
    .select(
      `
      ue:ues(
        offres(semestre, specialite:specialites(id, nom, type_cursus))
      )
    `
    )
    .eq('tronc_commun_id', troncCommunId);
  if (error) throw error;

  const vus = new Map<string, GroupeSpecialiteTronc>();
  for (const ligne of (data ?? []) as any[]) {
    const offre = ligne.ue?.offres?.[0];
    const specialite = offre?.specialite;
    if (!specialite) continue;
    vus.set(specialite.id, {
      specialiteId: specialite.id,
      specialiteNom: specialite.nom,
      typeCursus: specialite.type_cursus,
      semestre: offre.semestre ?? null,
    });
  }
  return Array.from(vus.values());
}

export interface UEDuTroncCommun {
  id: string;
  nom: string;
  code: string | null;
  volume_horaire: number | null;
  coefficient: number | null;
  semestre: string | null;
  specialite_id: string | null;
  specialite_nom: string | null;
  filiere_nom: string | null;
  ecole_nom: string | null;
}

export interface TroncCommunDetail {
  id: string;
  nom: string;
  enseignant_id: string | null;
  enseignant_nom: string | null;
  syllabus_key: string | null;
  syllabus_nom: string | null;
  syllabus_uploaded_at: string | null;
  ues: UEDuTroncCommun[];
}

export async function getTroncCommun(
  id: string
): Promise<TroncCommunDetail | null> {
  const { data, error } = await supabase
    .from('troncs_communs')
    .select(
      `
      id, nom, enseignant_id,
      syllabus_key, syllabus_nom, syllabus_uploaded_at,
      enseignant:enseignants ( nom ),
      troncs_communs_ues (
        ue:ues (
          id, nom, code, volume_horaire, coefficient,
          offres ( semestre, specialite_id, specialite:specialites ( nom, filiere:filieres ( nom, ecole:ecoles ( nom ) ) ) )
        )
      )
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const t = data as any;
  return {
    id: t.id,
    nom: t.nom,
    enseignant_id: t.enseignant_id,
    enseignant_nom: t.enseignant?.nom ?? null,
    syllabus_key: t.syllabus_key,
    syllabus_nom: t.syllabus_nom,
    syllabus_uploaded_at: t.syllabus_uploaded_at,
    ues: (t.troncs_communs_ues ?? []).map((tu: any) => {
      const offre = tu.ue.offres?.[0];
      return {
        id: tu.ue.id,
        nom: tu.ue.nom,
        code: tu.ue.code ?? null,
        volume_horaire: tu.ue.volume_horaire ?? null,
        coefficient: tu.ue.coefficient ?? null,
        semestre: offre?.semestre ?? null,
        specialite_id: offre?.specialite_id ?? null,
        specialite_nom: offre?.specialite?.nom ?? null,
        filiere_nom: offre?.specialite?.filiere?.nom ?? null,
        ecole_nom: offre?.specialite?.filiere?.ecole?.nom ?? null,
      };
    }),
  };
}

export interface PointCleTronc {
  id: string;
  ordre: number;
  libelle: string;
}

export async function listPointsClesTronc(
  troncCommunId: string
): Promise<PointCleTronc[]> {
  const { data, error } = await supabase
    .from('troncs_communs_points_cles')
    .select('id, ordre, libelle')
    .eq('tronc_commun_id', troncCommunId)
    .order('ordre');
  if (error) throw error;
  return data ?? [];
}

// Remplace intégralement les points clés — même principe que pour une UE
// simple (ue_points_cles) : un envoi de syllabus fournit toujours la
// liste complète.
export async function enregistrerPointsClesTronc(
  troncCommunId: string,
  points: string[]
): Promise<void> {
  await supabase
    .from('troncs_communs_points_cles')
    .delete()
    .eq('tronc_commun_id', troncCommunId);
  if (points.length === 0) return;
  const { error } = await supabase.from('troncs_communs_points_cles').insert(
    points.map((libelle, i) => ({ tronc_commun_id: troncCommunId, ordre: i, libelle }))
  );
  if (error) throw error;
}

export async function updateTroncCommun(
  id: string,
  input: { nom: string; enseignant_id: string | null }
) {
  const { error } = await supabase
    .from('troncs_communs')
    .update(input)
    .eq('id', id);
  if (error) throw error;
}

// Applique le même volume horaire à TOUTES les UEs du tronc commun (elles
// partagent une seule séance, donc un seul quota d'heures).
export async function updateVolumeHoraireTroncCommun(
  troncCommunId: string,
  volumeHoraire: number | null
) {
  const { data: liens, error: liensError } = await supabase
    .from('troncs_communs_ues')
    .select('ue_id')
    .eq('tronc_commun_id', troncCommunId);
  if (liensError) throw liensError;
  const ueIds = (liens ?? []).map((l: any) => l.ue_id as string);
  if (ueIds.length === 0) return;
  const { error } = await supabase
    .from('ues')
    .update({ volume_horaire: volumeHoraire })
    .in('id', ueIds);
  if (error) throw error;
}

export async function retirerUEDuTroncCommun(
  troncCommunId: string,
  ueId: string
) {
  const { error } = await supabase
    .from('troncs_communs_ues')
    .delete()
    .eq('tronc_commun_id', troncCommunId)
    .eq('ue_id', ueId);
  if (error) throw error;
}

export async function ajouterUEsAuTroncCommun(
  troncCommunId: string,
  ueIds: string[]
) {
  const { error } = await supabase
    .from('troncs_communs_ues')
    .insert(ueIds.map((ue_id) => ({ tronc_commun_id: troncCommunId, ue_id })));
  if (error) throw error;
}

// Étend un tronc commun à de nouvelles spécialités — plutôt que
// d'ajouter une UE déjà existante, ceci CRÉE une UE (mêmes
// caractéristiques que les UEs déjà membres du groupe : nom, code,
// volume horaire, coefficient, semestre) pour chaque spécialité cochée,
// puis les relie toutes au tronc commun d'un coup.
export async function ajouterSpecialitesAuTroncCommun(
  troncCommunId: string,
  specialiteIds: string[],
  caracteristiques: {
    nom: string;
    code: string | null;
    volumeHoraire: number | null;
    coefficient: number | null;
    semestre: string;
  }
): Promise<void> {
  const ueIds: string[] = [];
  for (const specialiteId of specialiteIds) {
    const ue = await createUE({
      nom: caracteristiques.nom,
      code: caracteristiques.code || undefined,
      volume_horaire: caracteristiques.volumeHoraire ?? undefined,
      coefficient: caracteristiques.coefficient ?? undefined,
      specialite_id: specialiteId,
      semestre: caracteristiques.semestre,
    });
    ueIds.push(ue.id);
  }
  await ajouterUEsAuTroncCommun(troncCommunId, ueIds);
}

export interface InfosUeTronc {
  ueId: string;
  nom: string;
  specialiteNom: string | null;
  semestre: string | null;
  volumeHoraire: number | null;
  heuresEffectuees: number;
  enseignantId: string | null;
  enseignantNom: string | null;
}

// Informations d'une UE à transformer en tronc commun (nom, semestre, volume
// horaire, heures déjà effectuées, enseignant actuel) — affichées et reprises
// automatiquement dans le formulaire.
export async function infosUePourTronc(ueId: string): Promise<InfosUeTronc> {
  const { data: ue, error } = await supabase
    .from('ues')
    .select('id, nom, volume_horaire, offres(id, semestre, specialite:specialites(nom))')
    .eq('id', ueId)
    .single();
  if (error) throw error;
  const u = ue as any;
  const offre = u.offres?.[0];
  let heures = 0;
  let enseignantId: string | null = null;
  let enseignantNom: string | null = null;
  if (offre) {
    const h = await getHeuresTotalesValideesParOffre((u.offres as any[]).map((o) => o.id));
    for (const v of h.values()) heures = Math.max(heures, v);
    const { data: att } = await supabase
      .from('attributions')
      .select('enseignant:enseignants(id, nom)')
      .eq('offre_id', offre.id)
      .eq('statut', 'actif')
      .maybeSingle();
    const ens = (att as any)?.enseignant;
    enseignantId = ens?.id ?? null;
    enseignantNom = ens?.nom ?? null;
  }
  return {
    ueId,
    nom: u.nom,
    specialiteNom: offre?.specialite?.nom ?? null,
    semestre: offre?.semestre ?? null,
    volumeHoraire: u.volume_horaire ?? null,
    heuresEffectuees: Math.round(heures * 100) / 100,
    enseignantId,
    enseignantNom,
  };
}