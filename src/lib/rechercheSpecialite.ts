// src/lib/rechercheSpecialite.ts
import { supabase } from './supabase';

export interface SpecialiteRecherche {
  id: string;
  nom: string;
  cycle: string;
  sousCycle: string | null;
  filiereId: string;
  filiereNom: string;
  ecoleId: string;
  ecoleNom: string;
}

// Liste plate de toutes les spécialités avec leur contexte (filière,
// école) — pour une recherche directe, sans passer par la cascade
// École → Filière → Cycle. Utilisée dans Disponibilités et Emploi du
// temps (admin).
export async function listSpecialitesRecherche(): Promise<
  SpecialiteRecherche[]
> {
  const { data, error } = await supabase
    .from('specialites')
    .select(
      `
      id, nom, cycle, sous_cycle,
      filiere:filieres (
        id, nom,
        ecole:ecoles ( id, nom )
      )
    `
    )
    .order('nom');
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((s) => s.filiere?.ecole)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      cycle: s.cycle,
      sousCycle: s.sous_cycle ?? null,
      filiereId: s.filiere.id,
      filiereNom: s.filiere.nom,
      ecoleId: s.filiere.ecole.id,
      ecoleNom: s.filiere.ecole.nom,
    }));
}