// src/lib/formatHeureCameroun.ts

// Formate une date/heure ISO en heure du Cameroun (Africa/Douala, UTC+1
// fixe) — jamais celle du fuseau de l'appareil. Sans le paramètre
// timeZone explicite, toLocaleTimeString se cale sur le fuseau configuré
// sur l'appareil, ce qui peut afficher une heure fausse même quand
// l'horloge elle-même (l'instant absolu) est parfaitement correcte.
export function formatHeureCameroun(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  });
}