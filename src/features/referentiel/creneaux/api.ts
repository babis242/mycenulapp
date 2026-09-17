// src/features/referentiel/creneaux/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { rafraichirCacheCreneaux } from '@/lib/creneaux';

export interface CreneauReferentiel {
  code: string;
  heure_debut: number; // minutes depuis minuit
  heure_fin: number; // minutes depuis minuit
  ordre: number;
}

export async function listCreneaux(): Promise<CreneauReferentiel[]> {
  const { data, error } = await supabase
    .from('creneaux')
    .select('code, heure_debut, heure_fin, ordre')
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Lecture hors-ligne — depuis Dexie.
export async function lireCreneauxDepuisCache(): Promise<
  CreneauReferentiel[]
> {
  const data = await db.creneaux.toArray();
  return (data as CreneauReferentiel[]).sort((a, b) => a.ordre - b.ordre);
}

export async function ajouterCreneau(
  code: string,
  heureDebut: number,
  heureFin: number
): Promise<void> {
  const existants = await listCreneaux();
  const ordreSuivant =
    existants.length > 0
      ? Math.max(...existants.map((c) => c.ordre)) + 1
      : 0;

  const { error } = await supabase.from('creneaux').insert({
    code,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    ordre: ordreSuivant,
  });
  if (error) throw error;

  // Reflet immédiat en local (Dexie + cache mémoire) — sans attendre la
  // prochaine synchronisation périodique, pour que l'admin qui vient
  // d'ajouter le créneau le voie tout de suite dans les grilles.
  await db.creneaux.put({
    code,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    ordre: ordreSuivant,
  });
  await rafraichirCacheCreneaux();
}

export async function supprimerCreneau(code: string): Promise<void> {
  const { error } = await supabase.from('creneaux').delete().eq('code', code);
  if (error) throw error;

  await db.creneaux.delete(code);
  await rafraichirCacheCreneaux();
}