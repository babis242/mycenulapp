// src/routes/RoleRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types';

// Bloque l'accès à une branche de routes aux rôles non autorisés.
// Utilisé pour les modules encore réservés à l'administrateur (Référentiel,
// Disponibilités, Emploi du temps côté gestion) tant que les écrans des
// autres rôles ne sont pas construits.
export default function RoleRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
