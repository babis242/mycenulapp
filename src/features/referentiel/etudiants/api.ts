// src/features/referentiel/etudiants/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { niveauDeSemestre } from '@/constants/enums';

export interface Etudiant {
  id: string;
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
  niveau?: string;
  created_at: string;
}

export async function listEtudiants(
  specialiteId: string,
  semestre: string
): Promise<Etudiant[]> {
  const { data, error } = await supabase
    .from('etudiants')
    .select('id, matricule, nom_complet, specialite_id, semestre, niveau, created_at')
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

  const { data: existants, error: erreurExistants } = await supabase
    .from('etudiants')
    .select('matricule')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre);
  if (erreurExistants) throw erreurExistants;
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
      // La colonne "niveau" est obligatoire en base : déduite du semestre
      // (S1/S2 → Niveau 1, S3/S4 → Niveau 2, …).
      niveau: niveauDeSemestre('standard', semestre) ?? 'Niveau 1',
    }))
  );
  if (error) throw error;

  return { ajoutes: aInserer.length, doublons };
}

export async function supprimerEtudiant(id: string): Promise<void> {
  const { error } = await supabase.from('etudiants').delete().eq('id', id);
  if (error) throw error;
}
export interface ModificationEtudiant {
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
  niveau: string;
}

// Modifie la fiche d'un étudiant (nom, matricule, spécialité, semestre,
// niveau). Les présences déjà saisies restent rattachées à la classe où elles
// ont été faites. En cas de doublon (même matricule, même spécialité et même
// niveau), renvoie un message clair plutôt que l'erreur brute de la base.
export async function modifierEtudiant(
  id: string,
  m: ModificationEtudiant
): Promise<void> {
  const patch = {
    matricule: m.matricule.trim(),
    nom_complet: m.nom_complet.trim(),
    specialite_id: m.specialite_id,
    semestre: m.semestre,
    niveau: m.niveau,
  };
  const { data, error } = await supabase
    .from('etudiants')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(
        'Un étudiant avec ce matricule existe déjà dans cette spécialité et ce niveau.'
      );
    }
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error(
      "La modification n'a pas été enregistrée (droits insuffisants ou étudiant introuvable)."
    );
  }
  // Met aussi à jour la copie locale (hors-ligne), sans bloquer en cas d'échec.
  try {
    await db.etudiants.update(id, patch);
  } catch {
    /* le prochain rafraîchissement corrigera le cache */
  }
}