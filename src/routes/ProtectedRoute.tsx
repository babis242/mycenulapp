import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

// La session Supabase est lue depuis le stockage local par getSession()
// (pas besoin de réseau), et le profil (chargerCompte) retombe sur le
// dernier compte mis en cache si hors ligne — voir src/stores/authStore.ts.
// Une coupure réseau ne déconnecte donc plus l'utilisateur.
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}