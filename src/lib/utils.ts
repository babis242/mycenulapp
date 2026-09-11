import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formate une Date en 'YYYY-MM-DD' à partir de ses composantes LOCALES.
// À utiliser partout où une date est calculée côté client (lundi de la
// semaine, +N jours, "aujourd'hui"...) — ne JAMAIS utiliser
// `date.toISOString().slice(0, 10)` pour ça : toISOString() convertit en
// UTC, donc pour un fuseau horaire en avance sur UTC (ex: Douala, UTC+1),
// minuit local devient 23h la veille en UTC et la date affichée recule
// d'un jour.
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
