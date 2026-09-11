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

// Le référentiel Semestre dépend du type_cursus (journal.md, Scénario 1.1)
export const SEMESTRES_PAR_TYPE_CURSUS: Record<TypeCursus, string[]> = {
  standard: ['S1', 'S2', 'S3&4'],
  sante_culinaire: ['S1', 'S2', 'S3', 'S4', 'S5&6'],
};
