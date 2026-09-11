import type { Role } from '@/types';

// Règle transversale (journal.md) :
// - administrateur : accès total
// - responsable : périmètre = ses spécialités assignées
// - secretaire / enseignant : périmètre restreint, précisé par scénario
export const ROLES: Role[] = [
  'administrateur',
  'responsable',
  'secretaire',
  'enseignant',
];

export const ROLE_LABELS: Record<Role, string> = {
  administrateur: 'Administrateur',
  responsable: 'Responsable',
  secretaire: 'Secrétaire',
  enseignant: 'Enseignant',
};
