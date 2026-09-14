// src/lib/tempsCameroun.ts

// Le Cameroun est en UTC+1 (WAT) toute l'année — voir aussi
// src/features/seances/api.ts pour le même principe côté planification.
export function maintenantCameroun(): Date {
    return new Date(Date.now() + 60 * 60 * 1000);
  }
  
  const FIN_CRENEAU_MINUTES: Record<string, number> = {
    '08h-12h': 12 * 60,
    '14h-17h': 17 * 60,
  };
  
  // Vrai si l'heure actuelle (Cameroun) dépasse la fin programmée du
  // créneau + la marge donnée — utilisé pour verrouiller le rapport de
  // séance après la fin du cours. Suppose que le créneau concerné est
  // celui d'AUJOURD'HUI (cas de "Ma séance", qui ne montre jamais un cours
  // d'un autre jour) — pas de comparaison de date, juste l'heure du jour.
  export function finCreneauAvecMargeDepassee(
    creneau: string,
    margeMinutes: number
  ): boolean {
    const fin = FIN_CRENEAU_MINUTES[creneau];
    if (fin === undefined) return false;
    const maintenant = maintenantCameroun();
    const minutesActuelles =
      maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
    return minutesActuelles > fin + margeMinutes;
  }