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

export async function getEnseignant(id: string): Promise<Enseignant | null> {
  const { data, error } = await supabase
    .from('enseignants')
    .select(
      'id, matricule, nom, email, numero_whatsapp, numero_cellulaire, statut, date_creation:created_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Enseignant | null;
}

export async function getEnseignantParMatricule(
  matricule: string
): Promise<Enseignant | null> {
  const { data, error } = await supabase
    .from('enseignants')
    .select(
      'id, matricule, nom, email, numero_whatsapp, numero_cellulaire, statut, date_creation:created_at'
    )
    .eq('matricule', matricule)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Enseignant | null;
}

// Un enseignant est considéré "utilisé" s'il a au moins une attribution
// de cours active — même principe que ueEstUtilisee (referentiel/ues) :
// avertit sans bloquer, la vraie protection contre la perte de données
// venant de la contrainte de clé étrangère en base (voir catch dans
// deleteEnseignant).
export async function enseignantEstUtilise(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('attributions')
    .select('id')
    .eq('enseignant_id', id)
    .eq('statut', 'actif')
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function deleteEnseignant(id: string): Promise<void> {
  const { error } = await supabase.from('enseignants').delete().eq('id', id);
  if (error) throw error;
}

export interface ModificationEnseignant {
  nom?: string;
  email?: string;
  numero_whatsapp?: string | null;
  numero_cellulaire?: string | null;
  statut?: 'actif' | 'inactif';
}

export async function updateEnseignant(
  id: string,
  patch: ModificationEnseignant
): Promise<void> {
  const { error } = await supabase.from('enseignants').update(patch).eq('id', id);
  if (error) throw error;
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