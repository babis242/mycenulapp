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
//
// Hors ligne (ou requête échouée) : retombe sur le dernier profil chargé
// avec succès pour ce même utilisateur, mis en cache dans localStorage à
// chaque chargement réussi. Sans ça, toute coupure réseau faisait passer
// l'utilisateur pour déconnecté et le renvoyait vers /login, alors que sa
// session reste valide.
const CLE_CACHE_COMPTE = 'gestion-pedagogique:dernier-compte';

function lireCompteEnCache(): AuthUser | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE_COMPTE);
    return brut ? (JSON.parse(brut) as AuthUser) : null;
  } catch {
    return null;
  }
}

function ecrireCompteEnCache(compte: AuthUser) {
  try {
    localStorage.setItem(CLE_CACHE_COMPTE, JSON.stringify(compte));
  } catch {
    // Stockage indisponible (mode privé, quota...) — pas bloquant, le
    // repli offline sera juste indisponible pour ce compte.
  }
}

async function chargerCompte(userId: string): Promise<AuthUser | null> {
  if (!navigator.onLine) {
    const local = lireCompteEnCache();
    return local && local.id === userId ? local : null;
  }

  try {
    const { data, error } = await supabase
      .from('comptes_utilisateurs')
      .select('id, matricule, nom, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) throw error ?? new Error('Compte introuvable.');

    let compte: AuthUser;
    if (data.role === 'responsable') {
      const { data: responsable } = await supabase
        .from('responsables')
        .select('id, responsables_specialites(specialite_id)')
        .eq('matricule', data.matricule)
        .maybeSingle();
      const perimetreSpecialiteIds = (
        (responsable as any)?.responsables_specialites ?? []
      ).map((rs: any) => rs.specialite_id);
      compte = {
        ...data,
        perimetre_specialite_ids: perimetreSpecialiteIds,
      } as AuthUser;
    } else {
      compte = data as AuthUser;
    }

    ecrireCompteEnCache(compte);
    return compte;
  } catch {
    // Réseau instable en cours de session (pas juste au démarrage) : même
    // repli, pour ne pas déconnecter quelqu'un en plein milieu d'un trou
    // de connexion.
    const local = lireCompteEnCache();
    return local && local.id === userId ? local : null;
  }
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