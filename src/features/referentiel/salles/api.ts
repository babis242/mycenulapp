// src/features/referentiel/salles/api.ts
import { supabase } from '@/lib/supabase';

export interface SalleAvecSpecialite {
  id: string;
  code_salle: string;
  capacite: number;
  specialite_par_defaut_id: string;
  niveau?: number | null;
  specialite: { id: string; nom: string } | null;
}

export async function listSalles(): Promise<SalleAvecSpecialite[]> {
  const { data, error } = await supabase
    .from('salles')
    .select(
      'id, code_salle, capacite, specialite_par_defaut_id, niveau, specialite:specialites(id, nom)'
    )
    .order('code_salle', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SalleAvecSpecialite[];
}

export interface NouvelleSalle {
  code_salle: string;
  capacite: number;
  specialite_par_defaut_id: string;
  niveau?: number | null;
}

export async function createSalle(input: NouvelleSalle) {
  const { data, error } = await supabase
    .from('salles')
    .insert(input)
    .select('id, code_salle')
    .single();
  if (error) throw error;
  return data;
}

// Modifie le code (et/ou la capacité) d'une salle. L'identifiant ne change
// pas : les séances déjà programmées gardent leur salle, seul le code
// affiché change partout.
export async function updateSalle(
  id: string,
  input: { code_salle: string; capacite: number }
): Promise<void> {
  const { error } = await supabase
    .from('salles')
    .update({ code_salle: input.code_salle, capacite: input.capacite })
    .eq('id', id);
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Une salle avec ce code existe déjà.');
    }
    throw new Error(error.message);
  }
}

export async function deleteSalle(id: string): Promise<void> {
  const { error } = await supabase.from('salles').delete().eq('id', id);
  if (error) throw error;
}