// src/lib/tempsCameroun.ts
import { toutesLesBornesCreneaux } from './creneaux';

// Le Cameroun est en UTC+1 (WAT) toute l'année — voir aussi
// src/features/seances/api.ts pour le même principe côté planification.
export function maintenantCameroun(): Date {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

// Fin (en minutes depuis minuit) de chaque créneau — lue depuis
// lib/creneaux.ts (table "creneaux" en base).
function finCreneauMinutes(): Record<string, number> {
  const fins: Record<string, number> = {};
  for (const [code, bornes] of Object.entries(toutesLesBornesCreneaux())) {
    fins[code] = bornes.fin;
  }
  return fins;
}

// Vrai si l'heure actuelle (Cameroun) dépasse la fin programmée du
// créneau + la marge donnée — utilisé pour verrouiller le rapport de
// séance après la fin du cours. Suppose que le créneau concerné est
// celui d'AUJOURD'HUI (cas de "Ma séance", qui ne montre jamais un cours
// d'un autre jour) — pas de comparaison de date, juste l'heure du jour.
export function finCreneauAvecMargeDepassee(
  creneau: string,
  margeMinutes: number
): boolean {
  const fin = finCreneauMinutes()[creneau];
  if (fin === undefined) return false;
  const maintenant = maintenantCameroun();
  const minutesActuelles =
    maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  return minutesActuelles > fin + margeMinutes;
}