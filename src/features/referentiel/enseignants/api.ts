// src/features/referentiel/enseignants/api.ts
import { supabase } from '@/lib/supabase';
import type { Enseignant } from '@/types';

export async function listEnseignants(): Promise<Enseignant[]> {
  const { data, error } = await supabase
    .from('enseignants')
    .select(
      'id, matricule, nom, email, numero_whatsapp, numero_cellulaire, statut, date_creation:created_at'
    )
    .order('nom', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Enseignant[];
}

export interface NouvelEnseignant {
  nom: string;
  email: string;
  numero_whatsapp?: string;
  numero_cellulaire?: string;
}

// Le matricule est généré côté base (trigger, cf. migration 002). L'envoi
// d'email avec les identifiants et le mot de passe sont différés au moment
// où Supabase Auth + Edge Functions seront branchés.
export async function createEnseignant(input: NouvelEnseignant) {
  const { data, error } = await supabase
    .from('enseignants')
    .insert({
      nom: input.nom,
      email: input.email,
      numero_whatsapp: input.numero_whatsapp || null,
      numero_cellulaire: input.numero_cellulaire || null,
    })
    .select('id, matricule, nom, email')
    .single();

  if (error) throw error;
  return data;
}
