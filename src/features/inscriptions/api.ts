// src/features/inscriptions/api.ts
import { supabase } from '@/lib/supabase';

export interface Inscription {
  id: string;
  nom: string;
  email: string;
  whatsapp: string | null;
  cellulaire: string | null;
  statut: 'en_attente' | 'traite';
  created_at: string;
}

export interface NouvelleInscription {
  nom: string;
  email: string;
  whatsapp?: string;
  cellulaire?: string;
}

// Appelée depuis le formulaire public (lien externe, aucune connexion
// requise) — RLS autorise l'insertion publique sur cette seule table.
export async function creerInscription(
  input: NouvelleInscription
): Promise<void> {
  const { error } = await supabase.from('inscriptions_enseignants').insert({
    nom: input.nom,
    email: input.email,
    whatsapp: input.whatsapp || null,
    cellulaire: input.cellulaire || null,
  });
  if (error) throw error;
}

// Le reste : réservé à l'admin (RLS).
export async function listInscriptions(): Promise<Inscription[]> {
  const { data, error } = await supabase
    .from('inscriptions_enseignants')
    .select('id, nom, email, whatsapp, cellulaire, statut, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function marquerCommeTraitees(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('inscriptions_enseignants')
    .update({ statut: 'traite' })
    .in('id', ids);
  if (error) throw error;
}

export async function supprimerInscription(id: string): Promise<void> {
  const { error } = await supabase
    .from('inscriptions_enseignants')
    .delete()
    .eq('id', id);
  if (error) throw error;
}