// src/hooks/useCacheSupabase.ts
import { useEffect, useState } from 'react';

// Charge d'abord depuis le cache local (Dexie, via `lecteurCache`) —
// affichage instantané, ça marche même hors ligne — puis rafraîchit en
// arrière-plan depuis le réseau (`fetcherReseau`) dès que possible
// (stale-while-revalidate).
//
// `lecteurCache` reçoit toute liberté pour reconstruire la forme exacte
// attendue par l'écran : pour une table simple, `() => db.enseignants.toArray()`
// suffit. Pour des données jointes (ex: salle + spécialité), `lecteurCache`
// doit lire plusieurs tables Dexie et les assembler lui-même — voir
// ListeSallesPage pour un exemple.
export function useCacheSupabase<T>(
  lecteurCache: () => Promise<T[]>,
  fetcherReseau: () => Promise<T[]>
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depuisCache, setDepuisCache] = useState(false);

  useEffect(() => {
    let annule = false;
    let aDesDonneesLocales = false;

    async function charger() {
      // 1. Cache local d'abord.
      try {
        const local = await lecteurCache();
        if (!annule && local.length > 0) {
          setData(local);
          setDepuisCache(true);
          setLoading(false);
          aDesDonneesLocales = true;
        }
      } catch {
        // Pas grave, on retombe sur le réseau ci-dessous.
      }

      // 2. Réseau ensuite, s'il est disponible.
      if (!navigator.onLine) {
        if (!annule) setLoading(false);
        return;
      }
      try {
        const frais = await fetcherReseau();
        if (!annule) {
          setData(frais);
          setDepuisCache(false);
          setError(null);
        }
      } catch (err) {
        // On ne montre l'erreur que si on n'a rien à afficher du tout —
        // sinon on préfère garder les données locales visibles.
        if (!annule && !aDesDonneesLocales) {
          setError(err instanceof Error ? err.message : 'Erreur de chargement');
        }
      } finally {
        if (!annule) setLoading(false);
      }
    }

    charger();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, depuisCache };
}
