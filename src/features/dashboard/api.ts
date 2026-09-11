// src/features/dashboard/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export interface StatsReferentiel {
  ues: number;
  enseignants: number;
  salles: number;
  specialites: number;
}

export async function getStatsReferentiel(): Promise<StatsReferentiel> {
  const [ues, enseignants, salles, specialites] = await Promise.all([
    supabase.from('ues').select('id', { count: 'exact', head: true }),
    supabase.from('enseignants').select('id', { count: 'exact', head: true }),
    supabase.from('salles').select('id', { count: 'exact', head: true }),
    supabase.from('specialites').select('id', { count: 'exact', head: true }),
  ]);

  return {
    ues: ues.count ?? 0,
    enseignants: enseignants.count ?? 0,
    salles: salles.count ?? 0,
    specialites: specialites.count ?? 0,
  };
}

// Compte directement dans le cache local (Dexie) — utilisé hors ligne, ou
// pour un premier affichage instantané pendant que le réseau répond.
export async function getStatsReferentielDepuisCache(): Promise<StatsReferentiel> {
  const [ues, enseignants, salles, specialites] = await Promise.all([
    db.ues.count(),
    db.enseignants.count(),
    db.salles.count(),
    db.specialites.count(),
  ]);
  return { ues, enseignants, salles, specialites };
}
