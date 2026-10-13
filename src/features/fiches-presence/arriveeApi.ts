// src/features/fiches-presence/arriveeApi.ts
//
// Fiche d'arrivée et de retard : TOUS les étudiants de l'école, regroupés par
// niveau (« BTS 1 », « HND 2 »…). Requêtes à plat, paginées (> 1000 lignes).
import { supabase } from '@/lib/supabase';
import type { FicheArrivee } from './components/FichesArriveePdf';

export async function getFichesArrivee(perimetreSpecialiteIds: string[] | null): Promise<FicheArrivee[]> {
  const { data: specs, error: e1 } = await supabase.from('specialites').select('id, nom, cycle');
  if (e1) throw e1;
  const infoSpe = new Map<string, { nom: string; cycle: string }>(
    ((specs ?? []) as any[]).map((s) => [s.id, { nom: s.nom, cycle: s.cycle }])
  );

  const PAGE = 1000;
  const lignes: any[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('etudiants')
      .select('specialite_id, matricule, nom_complet, semestre')
      .order('id', { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }

  const SANS_NIVEAU = 'Sans niveau';
  const groupes = new Map<string, { cycle: string; numero: number; etudiants: FicheArrivee['etudiants'] }>();
  for (const l of lignes) {
    if (perimetreSpecialiteIds && !perimetreSpecialiteIds.includes(l.specialite_id)) continue;
    const spe = infoSpe.get(l.specialite_id);
    const n = Number(String(l.semestre ?? '').replace(/[^0-9]/g, ''));
    const cycle = (spe?.cycle ?? '').toUpperCase();
    const niveau = spe && n ? `${cycle} ${Math.ceil(n / 2)}` : SANS_NIVEAU;
    if (!groupes.has(niveau)) {
      groupes.set(niveau, { cycle: niveau === SANS_NIVEAU ? '~' : cycle, numero: n ? Math.ceil(n / 2) : 99, etudiants: [] });
    }
    groupes.get(niveau)!.etudiants.push({
      matricule: l.matricule ?? '',
      nom: l.nom_complet ?? '',
      specialite: spe?.nom ?? '',
    });
  }

  return [...groupes.entries()]
    .sort(([, a], [, b]) => a.cycle.localeCompare(b.cycle, 'fr') || a.numero - b.numero)
    .map(([niveau, g]) => ({
      niveau,
      // Ordre alphabétique des noms, toutes spécialités confondues.
      etudiants: g.etudiants.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })),
    }));
}