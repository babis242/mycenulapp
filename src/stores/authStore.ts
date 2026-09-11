// src/stores/authStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { synchroniserTout, demarrerEcouteReseau } from '@/lib/sync';
import type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  init: () => Promise<void>;
  logout: () => Promise<void>;
}

// Va chercher la fiche (nom, matricule, rôle) correspondant à l'utilisateur
// Supabase Auth actuellement connecté. Pour un Responsable, va aussi
// chercher son périmètre de spécialités assignées (règle transversale,
// journal.md) — utilisé pour restreindre les écrans à ce périmètre.
async function chargerCompte(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('comptes_utilisateurs')
    .select('id, matricule, nom, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  if (data.role === 'responsable') {
    const { data: responsable } = await supabase
      .from('responsables')
      .select('id, responsables_specialites(specialite_id)')
      .eq('matricule', data.matricule)
      .maybeSingle();
    const perimetreSpecialiteIds = (
      (responsable as any)?.responsables_specialites ?? []
    ).map((rs: any) => rs.specialite_id);
    return {
      ...data,
      perimetre_specialite_ids: perimetreSpecialiteIds,
    } as AuthUser;
  }

  return data as AuthUser;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  // Appelé une fois au démarrage de l'app (voir App.tsx) : restaure la
  // session si l'utilisateur était déjà connecté, et écoute les changements
  // (connexion/déconnexion) pour garder le store synchronisé.
  init: async () => {
    set({ isLoading: true });
    demarrerEcouteReseau();

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;

    if (authUserId) {
      const compte = await chargerCompte(authUserId);
      set({ user: compte, isAuthenticated: !!compte, isLoading: false });
      if (compte) synchroniserTout();
    } else {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const compte = await chargerCompte(session.user.id);
        set({ user: compte, isAuthenticated: !!compte, isLoading: false });
        if (compte) synchroniserTout();
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },
}));
