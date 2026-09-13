// src/layouts/AppLayout.tsx
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Users2,
  CalendarClock,
  Table2,
  KeyRound,
  PlayCircle,
  ClipboardEdit,
  BarChart3,
  Clock,
  FileCheck,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import NotificationBell from '@/components/shared/NotificationBell';
import OfflineBanner from '@/components/shared/OfflineBanner';
import UpdateBanner from '@/components/shared/UpdateBanner';
import PushNotificationPrompt from '@/components/shared/PushNotificationPrompt';
import type { Role } from '@/types';

// Navigation par rôle — chaque module ajoutera son rôle autorisé au fur et
// à mesure qu'il sera construit pour ce rôle (cf. RoleRoute côté routing).
const NAV_ITEMS: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}[] = [
  {
    to: '/',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    roles: ['administrateur', 'responsable', 'secretaire', 'enseignant'],
  },
  {
    to: '/referentiel',
    label: 'Référentiel',
    icon: BookOpen,
    roles: ['administrateur'],
  },
  {
    to: '/repartition',
    label: 'Répartition',
    icon: Users2,
    roles: ['administrateur', 'responsable'],
  },
  {
    to: '/repartition/supports-cours',
    label: 'Supports de cours',
    icon: FileCheck,
    roles: ['administrateur', 'responsable'],
  },
  {
    to: '/rapports',
    label: 'Rapports de séance',
    icon: ClipboardEdit,
    roles: ['administrateur', 'responsable'],
  },
  {
    to: '/disponibilites',
    label: 'Disponibilités',
    icon: CalendarClock,
    roles: ['administrateur'],
  },
  {
    to: '/emploi-du-temps',
    label: 'Emploi du temps',
    icon: Table2,
    roles: ['administrateur', 'responsable'],
  },
  {
    to: '/codes-journaliers',
    label: 'Codes journaliers',
    icon: KeyRound,
    roles: ['administrateur', 'responsable', 'secretaire'],
  },
  {
    to: '/disponibilites/saisie',
    label: 'Mes disponibilités',
    icon: CalendarClock,
    roles: ['enseignant'],
  },
  { to: '/mes-cours', label: 'Mes cours', icon: Table2, roles: ['enseignant'] },
  { to: '/mes-ues', label: 'Mes UEs', icon: FileCheck, roles: ['enseignant'] },
  {
    to: '/ma-seance',
    label: 'Ma séance',
    icon: PlayCircle,
    roles: ['enseignant'],
  },
  {
    to: '/seances/saisie-manuelle',
    label: 'Saisie manuelle',
    icon: ClipboardEdit,
    roles: ['administrateur', 'responsable', 'secretaire'],
  },
  {
    to: '/heures',
    label: 'Voir les états',
    icon: BarChart3,
    roles: ['administrateur', 'responsable'],
  },
  {
    to: '/mes-heures',
    label: 'Mes heures',
    icon: Clock,
    roles: ['enseignant'],
  },
];

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) return null;
  const initials = user.matricule.substring(0, 2).toUpperCase();
  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="h-screen w-full flex flex-col bg-[#f7f7f7] print:h-auto print:block">
      <OfflineBanner />
      <UpdateBanner />
      <div className="flex-1 w-full flex md:p-4 md:gap-4 overflow-hidden print:h-auto print:block print:overflow-visible print:bg-white print:p-0 print:m-0">
      <button
        onClick={() => setMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 w-11 h-11 rounded-2xl bg-white shadow-md flex items-center justify-center print:hidden"
      >
        <Menu size={20} className="text-red-600" />
      </button>

      <NotificationBell className="fixed top-4 right-4 z-30 w-11 h-11 rounded-2xl bg-white shadow-md flex items-center justify-center print:hidden" />

      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-[248px] flex-shrink-0 h-full
          bg-red-600 md:rounded-3xl p-5 flex flex-col
          transform transition-transform duration-200
          md:translate-x-0
          print:hidden
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between pb-8">
          <div className="flex items-center gap-2.5 px-1 text-white font-extrabold text-base">
            <div className="w-8 h-8 rounded-[10px] bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">C</span>
            </div>
            Cenulap
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="md:hidden text-white/70"
          >
            <X size={20} />
          </button>
        </div>

        <style>{`
          .menu-lateral::-webkit-scrollbar { display: none; }
        `}</style>
        <div
          className="menu-lateral flex flex-col gap-1.5 flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {(() => {
            // Parmi tous les éléments dont le chemin correspond à la page
            // actuelle, seul le plus précis (le préfixe le plus long) doit
            // être surligné — sinon "/repartition/supports-cours" allume
            // à la fois "Répartition" ET "Supports de cours".
            const correspondances = navItems.filter((item) =>
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname === item.to ||
                  location.pathname.startsWith(item.to + '/')
            );
            const meilleureCorrespondance = correspondances.sort(
              (a, b) => b.to.length - a.to.length
            )[0];

            return navItems.map((item) => {
              const active = item.to === meilleureCorrespondance?.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-bold text-left transition-colors whitespace-nowrap
                    ${
                      active
                        ? 'bg-white text-red-600'
                        : 'text-white/75 hover:bg-white/10'
                    }
                  `}
                >
                  <item.icon size={17} className="shrink-0" />
                  {item.label}
                </NavLink>
              );
            });
          })()}
        </div>

        <div className="border-t border-white/10 pt-4 mt-2">
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-xs">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-xs truncate">
                {user.matricule}
              </p>
              <p className="text-white/50 text-[10px] truncate">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-bold text-white/75 hover:bg-white/10 transition-colors w-full text-left"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </div>

      <div className="flex-1 h-full overflow-y-auto p-4 pt-20 md:p-6 md:pt-6 min-w-0 print:p-0 print:h-auto print:overflow-visible print:w-full">
        <Outlet />
      </div>
      </div>
      <PushNotificationPrompt />
    </div>
  );
}