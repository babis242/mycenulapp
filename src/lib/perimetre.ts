// src/lib/perimetre.ts
import type { AuthUser } from '@/types';

// Règle transversale (journal.md) : un Responsable est limité aux
// spécialités qui lui sont assignées (table responsables_specialites,
// chargée dans user.perimetre_specialite_ids à la connexion). Admin (et
// tout autre rôle) voit tout, sans restriction.
export function filtrerParPerimetre<T extends { id: string }>(
  items: T[],
  user: AuthUser | null
): T[] {
  if (!user || user.role !== 'responsable') return items;
  const perimetre = new Set(user.perimetre_specialite_ids ?? []);
  return items.filter((item) => perimetre.has(item.id));
}

// Même chose, mais pour un tableau d'objets où l'identifiant de spécialité
// n'est pas `id` mais un champ nommé différemment (ex: specialiteId).
export function filtrerParPerimetreParChamp<T>(
  items: T[],
  user: AuthUser | null,
  champSpecialiteId: (item: T) => string | null | undefined
): T[] {
  if (!user || user.role !== 'responsable') return items;
  const perimetre = new Set(user.perimetre_specialite_ids ?? []);
  return items.filter((item) => {
    const id = champSpecialiteId(item);
    return id != null && perimetre.has(id);
  });
}

export function estDansLePerimetre(
  specialiteId: string | null | undefined,
  user: AuthUser | null
): boolean {
  if (!user || user.role !== 'responsable') return true;
  if (!specialiteId) return false;
  return (user.perimetre_specialite_ids ?? []).includes(specialiteId);
}
