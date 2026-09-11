// src/hooks/useOnlineStatus.ts
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);

  useEffect(() => {
    const surLigne = () => setEnLigne(true);
    const horsLigne = () => setEnLigne(false);
    window.addEventListener('online', surLigne);
    window.addEventListener('offline', horsLigne);
    return () => {
      window.removeEventListener('online', surLigne);
      window.removeEventListener('offline', horsLigne);
    };
  }, []);

  return enLigne;
}
