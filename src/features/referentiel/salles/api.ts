// src/features/referentiel/salles/api.ts
import { supabase } from '@/lib/supabase';

export interface SalleAvecSpecialite {
  id: string;
  code_salle: string;
  capacite: number;
  specialite_par_defaut_id: string;
  specialite: { id: string; nom: string } | null;
}

export async function listSalles(): Promise<SalleAvecSpecialite[]> {
  const { data, error } = await supabase
    .from('salles')
    .select(
      'id, code_salle, capacite, specialite_par_defaut_id, specialite:specialites(id, nom)'
    )
    .order('code_salle', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SalleAvecSpecialite[];
}

export interface NouvelleSalle {
  code_salle: string;
  capacite: number;
  specialite_par_defaut_id: string;
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
