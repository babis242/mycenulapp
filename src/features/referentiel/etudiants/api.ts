// src/features/referentiel/etudiants/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export interface Etudiant {
  id: string;
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
  created_at: string;
}

export async function listEtudiants(
  specialiteId: string,
  semestre: string
): Promise<Etudiant[]> {
  const { data, error } = await supabase
    .from('etudiants')
    .select('id, matricule, nom_complet, specialite_id, semestre, created_at')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre)
    .order('nom_complet', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Lecture hors-ligne — même filtre, depuis Dexie.
export async function lireEtudiantsDepuisCache(
  specialiteId: string,
  semestre: string
): Promise<Etudiant[]> {
  const data = await db.etudiants
    .where('specialite_id')
    .equals(specialiteId)
    .and((e: any) => e.semestre === semestre)
    .toArray();
  return (data as Etudiant[]).sort((a, b) =>
    a.nom_complet.localeCompare(b.nom_complet)
  );
}

export interface NouvelEtudiant {
  matricule: string;
  nom_complet: string;
}

// Ajout en masse (manuel ou depuis un import Excel — même chemin) : ignore
// silencieusement les doublons (même matricule déjà présent dans ce groupe
// spécialité/semestre) plutôt que de faire échouer tout le lot.
export async function ajouterEtudiants(
  specialiteId: string,
  semestre: string,
  etudiants: NouvelEtudiant[]
): Promise<{ ajoutes: number; doublons: number }> {
  if (etudiants.length === 0) return { ajoutes: 0, doublons: 0 };

  const { data: existants } = await supabase
    .from('etudiants')
    .select('matricule')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre);
  const matriculesExistants = new Set(
    (existants ?? []).map((e) => e.matricule.trim().toLowerCase())
  );

  const aInserer = etudiants.filter(
    (e) => !matriculesExistants.has(e.matricule.trim().toLowerCase())
  );
  const doublons = etudiants.length - aInserer.length;
  if (aInserer.length === 0) return { ajoutes: 0, doublons };

  const { error } = await supabase.from('etudiants').insert(
    aInserer.map((e) => ({
      matricule: e.matricule.trim(),
      nom_complet: e.nom_complet.trim(),
      specialite_id: specialiteId,
      semestre,
    }))
  );
  if (error) throw error;

  return { ajoutes: aInserer.length, doublons };
}

export async function supprimerEtudiant(id: string): Promise<void> {
  const { error } = await supabase.from('etudiants').delete().eq('id', id);
  if (error) throw error;
}