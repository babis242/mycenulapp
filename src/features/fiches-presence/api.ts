// src/features/fiches-presence/api.ts
import { supabase } from '@/lib/supabase';
import type { SpecialiteGroupe } from '@/features/emploi-du-temps/api';

export interface EtudiantFiche {
  matricule: string;
  nom_complet: string;
}

// Étudiants de plusieurs spécialités pour UN semestre — requêtes à plat,
// par lots de spécialités, paginées (> 1000 lignes possibles).
export async function getEtudiantsParSpecialites(
  specialiteIds: string[],
  semestre: string
): Promise<Map<string, EtudiantFiche[]>> {
  const resultat = new Map<string, EtudiantFiche[]>();
  for (const id of specialiteIds) resultat.set(id, []);
  if (specialiteIds.length === 0) return resultat;

  const TAILLE_LOT = 20;
  const PAGE = 1000;
  for (let i = 0; i < specialiteIds.length; i += TAILLE_LOT) {
    const lot = specialiteIds.slice(i, i + TAILLE_LOT);
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await supabase
        .from('etudiants')
        .select('specialite_id, matricule, nom_complet')
        .in('specialite_id', lot)
        .eq('semestre', semestre)
        .order('nom_complet', { ascending: true })
        .range(debut, debut + PAGE - 1);
      if (error) throw error;
      for (const e of (data ?? []) as any[]) {
        resultat.get(e.specialite_id)?.push({
          matricule: e.matricule,
          nom_complet: e.nom_complet,
        });
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  for (const liste of resultat.values()) {
    liste.sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'));
  }
  return resultat;
}

// Spécialités d'un cycle ayant des étudiants OU une UE au semestre choisi.
// (Contrairement à l'emploi du temps, une fiche de présence n'a pas besoin
// d'UE programmées : la liste des étudiants suffit.)
export async function listSpecialitesPourFiches(
  cycle: string,
  sousCycle: string | null,
  semestre: string,
  perimetreSpecialiteIds: string[] | null
): Promise<SpecialiteGroupe[]> {
  let query = supabase
    .from('specialites')
    .select('id, nom, type_cursus, filiere:filieres(nom, ecole:ecoles(nom)), offres(semestre)')
    .eq('cycle', cycle);
  query = sousCycle ? query.eq('sous_cycle', sousCycle) : query.is('sous_cycle', null);
  const { data, error } = await query;
  if (error) throw error;

  const specs = ((data ?? []) as any[]).filter(
    (s) => !perimetreSpecialiteIds || perimetreSpecialiteIds.includes(s.id)
  );
  const avecEtudiants = new Set<string>();
  const ids = specs.map((s) => s.id as string);
  const TAILLE_LOT = 20;
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += TAILLE_LOT) {
    const lot = ids.slice(i, i + TAILLE_LOT);
    for (let debut = 0; ; debut += PAGE) {
      const { data: etu, error: e2 } = await supabase
        .from('etudiants')
        .select('specialite_id')
        .in('specialite_id', lot)
        .eq('semestre', semestre)
        .range(debut, debut + PAGE - 1);
      if (e2) throw e2;
      for (const e of (etu ?? []) as any[]) avecEtudiants.add(e.specialite_id);
      if ((etu ?? []).length < PAGE) break;
    }
  }

  return specs
    .filter(
      (s) =>
        avecEtudiants.has(s.id) ||
        (s.offres ?? []).some((o: any) => o.semestre === semestre)
    )
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      ecoleNom: s.filiere?.ecole?.nom ?? '',
      filiereNom: s.filiere?.nom ?? '',
      typeCursus: s.type_cursus,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}