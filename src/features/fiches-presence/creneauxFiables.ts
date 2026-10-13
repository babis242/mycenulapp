// src/features/fiches-presence/creneauxFiables.ts
//
// Liste des créneaux pour les fiches/présences. Si le cache est vide
// (table « creneaux » vide ou pas encore chargée), on retombe sur les
// créneaux officiels plutôt que de produire un tableau sans colonnes.
import { CRENEAUX, tousLesCreneaux } from '@/constants/enums';

export function creneauxFiables(): string[] {
  const liste = tousLesCreneaux() as string[];
  return liste.length > 0 ? liste : (CRENEAUX as string[]);
}