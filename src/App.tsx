// src/App.tsx
import { useEffect } from 'react';
import AppRoutes from '@/routes';
import { useAuthStore } from '@/stores/authStore';
import { rafraichirCacheCreneaux } from '@/lib/creneaux';

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
    // Charge les créneaux depuis Dexie (déjà synchronisés lors d'une
    // session précédente) dès le démarrage — avant même qu'une
    // synchronisation réseau ait eu lieu, pour que les grilles affichent
    // tout de suite les bons créneaux, y compris hors ligne.
    rafraichirCacheCreneaux();
  }, [init]);

  return <AppRoutes />;
}

export default App;