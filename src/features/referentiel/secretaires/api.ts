// src/features/referentiel/secretaires/api.ts
import { supabase } from '@/lib/supabase';
import type { Secretaire } from '@/types';

export async function listSecretaires(): Promise<Secretaire[]> {
  const { data, error } = await supabase
    .from('secretaires')
    .select(
      'id, matricule, nom, email, numero_telephone, statut, date_creation:created_at'
    )
    .order('nom', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Secretaire[];
}

export interface NouvelleSecretaire {
  nom: string;
  email: string;
  numero_telephone?: string;
}

// Le matricule est généré côté base (trigger, migration 027). Comme pour
// les enseignants et responsables, la création du compte de connexion est
// déclenchée séparément via une Edge Function.
export async function createSecretaire(
  input: NouvelleSecretaire
): Promise<{ id: string; matricule: string }> {
  const { data, error } = await supabase
    .from('secretaires')
    .insert({
      nom: input.nom,
      email: input.email,
      numero_telephone: input.numero_telephone || null,
    })
    .select('id, matricule')
    .single();
  if (error) throw error;
  return data;
}
