import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();

  // TODO : quand la session Supabase sera branchée, remplacer ce court-circuit
  // par une vraie vérification (session récupérée / restaurée depuis le cache
  // offline si hors ligne — cf. ecrans_ui.md 0.1).
  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
