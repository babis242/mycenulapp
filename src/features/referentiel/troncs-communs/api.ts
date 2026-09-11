// src/features/referentiel/troncs-communs/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

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
          ? enseignantParId.get(t.enseignant_id)?.nom ?? null
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
export async function lireUEsPourTroncCommunDepuisCache(): Promise<UEOption[]> {
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
  const dejaGroupees = new Set((liaisons as any[]).map((l) => l.ue_id));

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

  return troncCommun;
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

export interface UEDuTroncCommun {
  id: string;
  nom: string;
  semestre: string | null;
  specialite_nom: string | null;
  filiere_nom: string | null;
  ecole_nom: string | null;
}

export interface TroncCommunDetail {
  id: string;
  nom: string;
  enseignant_id: string | null;
  enseignant_nom: string | null;
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
      enseignant:enseignants ( nom ),
      troncs_communs_ues (
        ue:ues (
          id, nom,
          offres ( semestre, specialite:specialites ( nom, filiere:filieres ( nom, ecole:ecoles ( nom ) ) ) )
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
