import type { Jour, Creneau, Cycle, TypeCursus } from '@/types';
import { tousLesCreneaux as tousLesCreneauxDepuisCache } from '@/lib/creneaux';

export const JOURS: Jour[] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

// Créneaux officiels par défaut — utilisés comme filet de sécurité tant
// que le cache (lib/creneaux.ts, alimenté depuis la table Supabase
// "creneaux") n'a rien chargé.
export const CRENEAUX: Creneau[] = ['08h-12h', '14h-17h'];

// Liste réelle des créneaux — table "creneaux" en base, gérable depuis
// Référentiel → Créneaux, synchronisée hors ligne comme le reste des
// données de référence. Ré-exportée ici pour que les écrans existants
// n'aient qu'un seul endroit à importer (@/constants/enums), comme pour
// CRENEAUX.
export const tousLesCreneaux = tousLesCreneauxDepuisCache;

export const CYCLES: Cycle[] = ['BTS', 'Licence', 'Master', 'HND', 'Bachelor'];

export const TYPES_CURSUS: TypeCursus[] = ['standard', 'sante_culinaire'];

// Le référentiel Semestre dépend du type_cursus (journal.md, Scénario 1.1)
// — 2 niveaux (4 semestres) pour un cursus "standard" (BTS, 2 ans),
// 3 niveaux (6 semestres) pour "sante_culinaire" (licence, 3 ans).
// Plus de semestres combinés (S3&4, S5&6, supprimés) — chaque semestre
// est désormais individuel, S1 à S6 selon le cursus. Les UE/offres qui
// étaient sur un semestre combiné ont été migrées vers le premier
// semestre du groupe (S3&4 → S3, S5&6 → S5) — voir la migration SQL.
export const SEMESTRES_PAR_TYPE_CURSUS: Record<TypeCursus, string[]> = {
  standard: ['S1', 'S2', 'S3', 'S4'],
  sante_culinaire: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
};

// Le niveau (année) d'une UE découle directement de son semestre — jamais
// une donnée indépendante à redemander. Règle UNIVERSELLE, la même pour
// tous les cursus (avant : une table par cursus, avec des semestres
// combinés qui ne correspondaient à rien de plus fin) : S1/S2 → Niveau 1,
// S3/S4 → Niveau 2, S5/S6 → Niveau 3, etc.
export function niveauDeSemestre(
  _typeCursus: TypeCursus,
  semestre: string
): string | null {
  const numero = Number(semestre.replace(/[^0-9]/g, ''));
  if (!numero) return null;
  return `Niveau ${Math.ceil(numero / 2)}`;
}

// Liste ordonnée et dédupliquée des niveaux possibles pour un type de
// cursus donné — encore utile pour un affichage groupé (ex: tronc
// commun), même si les étudiants sont désormais rattachés à un semestre
// précis plutôt qu'à ce niveau dérivé.
export function niveauxPourTypeCursus(typeCursus: TypeCursus): string[] {
  const vus = new Set<string>();
  const ordre: string[] = [];
  for (const semestre of SEMESTRES_PAR_TYPE_CURSUS[typeCursus] ?? []) {
    const niveau = niveauDeSemestre(typeCursus, semestre);
    if (niveau && !vus.has(niveau)) {
      vus.add(niveau);
      ordre.push(niveau);
    }
  }
  return ordre;
}