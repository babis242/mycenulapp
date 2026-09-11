import { Outlet } from 'react-router-dom';

// Les pages d'auth (Login, mot de passe oublié...) gèrent chacune leur
// propre mise en page plein écran — voir LoginPage.tsx.
export default function AuthLayout() {
  return <Outlet />;
}
