import type { Jour, Creneau, Cycle, TypeCursus } from '@/types';

export const JOURS: Jour[] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

export const CRENEAUX: Creneau[] = ['08h-12h', '14h-17h'];

export const CYCLES: Cycle[] = ['BTS', 'Licence', 'Master', 'HND', 'Bachelor'];

export const TYPES_CURSUS: TypeCursus[] = ['standard', 'sante_culinaire'];

// Le niveau (année) d'une UE découle directement de son semestre — jamais
// une donnée indépendante à redemander. Une UE en S1 ou S2 est en Niveau
// 1, une UE en S3&4 est en Niveau 2, etc. Corrige un défaut de conception
// où le niveau était traité comme un axe séparé du semestre (Scénario 11
// + rapport de séance).
export const NIVEAU_PAR_SEMESTRE: Record<TypeCursus, Record<string, string>> = {
  standard: {
    S1: 'Niveau 1',
    S2: 'Niveau 1',
    'S3&4': 'Niveau 2',
  },
  sante_culinaire: {
    S1: 'Niveau 1',
    S2: 'Niveau 1',
    S3: 'Niveau 2',
    S4: 'Niveau 2',
    'S5&6': 'Niveau 3',
  },
};

export function niveauDeSemestre(
  typeCursus: TypeCursus,
  semestre: string
): string | null {
  return NIVEAU_PAR_SEMESTRE[typeCursus]?.[semestre] ?? null;
}

// Liste ordonnée et dédupliquée des niveaux possibles pour un type de
// cursus donné — utilisée là où un niveau doit encore être choisi (ex :
// inscrire une liste d'étudiants, indépendante d'une UE précise).
export function niveauxPourTypeCursus(typeCursus: TypeCursus): string[] {
  const vus = new Set<string>();
  const ordre: string[] = [];
  for (const niveau of Object.values(NIVEAU_PAR_SEMESTRE[typeCursus] ?? {})) {
    if (!vus.has(niveau)) {
      vus.add(niveau);
      ordre.push(niveau);
    }
  }
  return ordre;
}

// Le référentiel Semestre dépend du type_cursus (journal.md, Scénario 1.1)
export const SEMESTRES_PAR_TYPE_CURSUS: Record<TypeCursus, string[]> = {
  standard: ['S1', 'S2', 'S3&4'],
  sante_culinaire: ['S1', 'S2', 'S3', 'S4', 'S5&6'],
};