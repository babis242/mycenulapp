// src/features/referentiel/ReferentielLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/referentiel/ues', label: 'UEs' },
  { to: '/referentiel/enseignants', label: 'Enseignants' },
  { to: '/referentiel/etudiants', label: 'Étudiants' },
  { to: '/referentiel/inscriptions', label: 'Inscriptions' },
  { to: '/referentiel/responsables', label: 'Responsables' },
  { to: '/referentiel/secretaires', label: 'Secrétaires' },
  { to: '/referentiel/salles', label: 'Salles' },
  { to: '/referentiel/troncs-communs', label: 'Troncs communs' },
  { to: '/referentiel/creneaux', label: 'Créneaux' },
];

// Onglets du module Référentiel (Scénario 1) — chaque sous-module (UEs,
// Enseignants, Salles) a sa propre liste/ajout/détail sous cette mise en page.
export default function ReferentielLayout() {
  return (
    <div className="max-w-4xl mx-auto">
      <style>{`
        .onglets-referentiel::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="onglets-referentiel flex gap-1.5 mb-6 bg-white rounded-full p-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                isActive
                  ? 'bg-red-600 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}