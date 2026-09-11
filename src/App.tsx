// src/App.tsx
import { useEffect } from 'react';
import AppRoutes from '@/routes';
import { useAuthStore } from '@/stores/authStore';

function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return <AppRoutes />;
}

export default App;
