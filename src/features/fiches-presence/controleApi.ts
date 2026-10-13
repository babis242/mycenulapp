// src/features/fiches-presence/controleApi.ts
//
// Données des fiches de contrôle des enseignants : pour une semaine, la
// liste des enseignants programmés dans chaque créneau (jour + créneau),
// tirée des emplois du temps (séances de spécialité ET de tronc commun).
import { supabase } from '@/lib/supabase';
import { getSeancesGroupees } from '@/features/emploi-du-temps/api';

// Identifiants des spécialités d'un cycle (ou de tous les cycles si
// cycleKey est vide), restreints au périmètre éventuel d'un responsable.
export async function listIdsSpecialitesPourControle(
  cycleKey: string,
  perimetreSpecialiteIds: string[] | null
): Promise<string[]> {
  let query = supabase.from('specialites').select('id');
  if (cycleKey) {
    const [cycle, sousCycle] = cycleKey.split('::');
    query = query.eq('cycle', cycle);
    query = sousCycle ? query.eq('sous_cycle', sousCycle) : query.is('sous_cycle', null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as { id: string }[])
    .map((s) => s.id)
    .filter((id) => !perimetreSpecialiteIds || perimetreSpecialiteIds.includes(id));
}

export interface CoursControle {
  ue: string;
  salle: string | null;
  specialites: string[]; // ex. "Banque et finance (BTS 2)"
}

export interface EnseignantControle {
  nom: string;
  cours: CoursControle[];
}

// "Jour|Créneau" → enseignants programmés (uniques, triés), avec pour
// chacun le(s) cours, la salle et les spécialités concernées.
export async function getEnseignantsParCreneau(
  specialiteIds: string[],
  semaine: string
): Promise<Map<string, EnseignantControle[]>> {
  // Nom + cycle de toutes les spécialités (les troncs communs peuvent
  // concerner des spécialités hors du cycle filtré).
  const { data: specs, error } = await supabase.from('specialites').select('id, nom, cycle');
  if (error) throw error;
  const infoSpe = new Map<string, { nom: string; cycle: string }>(
    ((specs ?? []) as any[]).map((x) => [x.id, { nom: x.nom, cycle: x.cycle }])
  );
  const etiquette = (specId: string, semestres: Iterable<string | null | undefined>): string => {
    const info = infoSpe.get(specId);
    if (!info) return '';
    const niveaux = Array.from(
      new Set(
        Array.from(semestres)
          .map((sem) => Number(String(sem ?? '').replace(/[^0-9]/g, '')))
          .filter((n) => n > 0)
          .map((n) => Math.ceil(n / 2))
      )
    ).sort();
    return niveaux.length
      ? `${info.nom} (${niveaux.map((n) => `${info.cycle} ${n}`).join(' / ')})`
      : info.nom;
  };

  // clé créneau → clé enseignant → { nom, cours par (ue|salle) }
  const parCreneau = new Map<string, Map<string, { nom: string; cours: Map<string, { ue: string; salle: string | null; spes: Set<string> }> }>>();
  const TAILLE_LOT = 40;
  const vues = new Set<string>();
  for (let i = 0; i < specialiteIds.length; i += TAILLE_LOT) {
    const lot = specialiteIds.slice(i, i + TAILLE_LOT);
    const donnees = await getSeancesGroupees(lot, semaine, { forcerRafraichissement: true });
    for (const s of donnees.seances) {
      if (vues.has(s.id)) continue; // un tronc commun peut ressortir dans plusieurs lots
      vues.add(s.id);
      const nom = (s.enseignantNom ?? '').trim();
      if (!nom) continue;

      const specialites: string[] = [];
      if (s.troncCommunId) {
        for (const specId of donnees.specialitesParTronc.get(s.troncCommunId) ?? []) {
          const sems = donnees.troncSpecialiteSemestres.get(`${s.troncCommunId}|${specId}`) ?? [];
          const e = etiquette(specId, sems);
          if (e) specialites.push(e);
        }
      } else if (s.specialiteId) {
        const e = etiquette(s.specialiteId, [s.semestre]);
        if (e) specialites.push(e);
      }

      const cle = `${s.jour}|${s.creneau}`;
      if (!parCreneau.has(cle)) parCreneau.set(cle, new Map());
      const ens = parCreneau.get(cle)!;
      const cleEns = s.enseignantId ?? nom;
      if (!ens.has(cleEns)) ens.set(cleEns, { nom, cours: new Map() });
      const cours = ens.get(cleEns)!.cours;
      const cleCours = `${s.ueNom}|${s.salleCode ?? ''}`;
      if (!cours.has(cleCours)) cours.set(cleCours, { ue: s.ueNom, salle: s.salleCode, spes: new Set() });
      specialites.forEach((x) => cours.get(cleCours)!.spes.add(x));
    }
  }

  const resultat = new Map<string, EnseignantControle[]>();
  for (const [cle, ens] of parCreneau) {
    resultat.set(
      cle,
      Array.from(ens.values())
        .map((e) => ({
          nom: e.nom,
          cours: Array.from(e.cours.values()).map((c) => ({
            ue: c.ue,
            salle: c.salle,
            specialites: Array.from(c.spes).sort((a, b) => a.localeCompare(b, 'fr')),
          })),
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    );
  }
  return resultat;
}