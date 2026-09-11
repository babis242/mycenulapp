// src/features/referentiel/jumelages/api.ts
import { supabase } from '@/lib/supabase';

export interface JumelageAvecUEs {
  id: string;
  nom: string;
  enseignant_id: string | null;
  enseignant_nom: string | null;
  ues: { id: string; nom: string; specialite_nom: string | null }[];
}

export async function listJumelages(): Promise<JumelageAvecUEs[]> {
  const { data, error } = await supabase
    .from('jumelages')
    .select(
      `
      id, nom, enseignant_id,
      enseignant:enseignants ( nom ),
      jumelage_ues (
        ue:ues (
          id, nom,
          offres ( specialite:specialites ( nom ) )
        )
      )
    `
    )
    .order('nom');

  if (error) throw error;
  return (data ?? []).map((j: any) => ({
    id: j.id,
    nom: j.nom,
    enseignant_id: j.enseignant_id,
    enseignant_nom: j.enseignant?.nom ?? null,
    ues: (j.jumelage_ues ?? []).map((ju: any) => ({
      id: ju.ue.id,
      nom: ju.ue.nom,
      specialite_nom: ju.ue.offres?.[0]?.specialite?.nom ?? null,
    })),
  }));
}

export interface UEOption {
  id: string;
  nom: string;
  specialite_nom: string | null;
  deja_jumelee: boolean;
}

// UEs disponibles pour un nouveau jumelage — signale celles déjà dans un
// autre jumelage (une UE ne devrait normalement appartenir qu'à un seul
// groupe à la fois, pour éviter les doubles comptages en emploi du temps).
export async function listUEsPourJumelage(): Promise<UEOption[]> {
  const [{ data: uesData }, { data: dejaJumeleesData }] = await Promise.all([
    supabase.from('ues').select('id, nom, offres(specialite:specialites(nom))'),
    supabase.from('jumelage_ues').select('ue_id'),
  ]);
  const dejaJumelees = new Set(
    (dejaJumeleesData ?? []).map((j: any) => j.ue_id)
  );
  return (uesData ?? []).map((u: any) => ({
    id: u.id,
    nom: u.nom,
    specialite_nom: u.offres?.[0]?.specialite?.nom ?? null,
    deja_jumelee: dejaJumelees.has(u.id),
  }));
}

export interface NouveauJumelage {
  nom: string;
  ue_ids: string[];
  enseignant_id?: string;
}

export async function createJumelage(input: NouveauJumelage) {
  const { data: jumelage, error } = await supabase
    .from('jumelages')
    .insert({ nom: input.nom, enseignant_id: input.enseignant_id ?? null })
    .select('id')
    .single();
  if (error) throw error;

  const { error: liaisonError } = await supabase
    .from('jumelage_ues')
    .insert(input.ue_ids.map((ue_id) => ({ jumelage_id: jumelage.id, ue_id })));
  if (liaisonError) throw liaisonError;

  return jumelage;
}

export async function deleteJumelage(id: string) {
  const { error } = await supabase.from('jumelages').delete().eq('id', id);
  if (error) throw error;
}
