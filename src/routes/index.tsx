// src/routes/index.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

import LoginPage from '@/features/auth/pages/LoginPage';
import MotDePasseOubliePage from '@/features/auth/pages/MotDePasseOubliePage';
import InscriptionEnseignantPage from '@/features/inscriptions/pages/InscriptionEnseignantPage';
import ListeInscriptionsPage from '@/features/inscriptions/pages/ListeInscriptionsPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';

import ReferentielLayout from '@/features/referentiel/ReferentielLayout';
import ListeUEsPage from '@/features/referentiel/ues/pages/ListeUEsPage';
import AjouterUEPage from '@/features/referentiel/ues/pages/AjouterUEPage';
import DetailUEPage from '@/features/referentiel/ues/pages/DetailUEPage';
import ImporterUEsPage from '@/features/referentiel/ues/pages/ImporterUEsPage';
import RepartitionPage from '@/features/repartition/pages/RepartitionPage';
import ImporterAttributionsPage from '@/features/repartition/pages/ImporterAttributionsPage';
import AttributionTroncsCommunsPage from '@/features/repartition/pages/AttributionTroncsCommunsPage';
import LancerDemandePage from '@/features/disponibilites/pages/LancerDemandePage';
import SaisieDisponibilitesPage from '@/features/disponibilites/pages/SaisieDisponibilitesPage';
import EtatDisponibilitesPage from '@/features/disponibilites/pages/EtatDisponibilitesPage';
import GenererEDTPage from '@/features/emploi-du-temps/pages/GenererEDTPage';
import ValidationEDTPage from '@/features/emploi-du-temps/pages/ValidationEDTPage';
import MesCoursPage from '@/features/emploi-du-temps/pages/MesCoursPage';
import ListeEnseignantsPage from '@/features/referentiel/enseignants/pages/ListeEnseignantsPage';
import AjouterEnseignantPage from '@/features/referentiel/enseignants/pages/AjouterEnseignantPage';
import ImporterEnseignantsPage from '@/features/referentiel/enseignants/pages/ImporterEnseignantsPage';
import ListeResponsablesPage from '@/features/referentiel/responsables/pages/ListeResponsablesPage';
import AjouterResponsablePage from '@/features/referentiel/responsables/pages/AjouterResponsablePage';
import ListeSecretairesPage from '@/features/referentiel/secretaires/pages/ListeSecretairesPage';
import AjouterSecretairePage from '@/features/referentiel/secretaires/pages/AjouterSecretairePage';
import ListeSallesPage from '@/features/referentiel/salles/pages/ListeSallesPage';
import ListeTroncsCommunsPage from '@/features/referentiel/troncs-communs/pages/ListeTroncsCommunsPage';
import CreerTroncCommunPage from '@/features/referentiel/troncs-communs/pages/CreerTroncCommunPage';
import DetailTroncCommunPage from '@/features/referentiel/troncs-communs/pages/DetailTroncCommunPage';
import AjouterSallePage from '@/features/referentiel/salles/pages/AjouterSallePage';
import ImporterSallesPage from '@/features/referentiel/salles/pages/ImporterSallesPage';
import ListeCodesPage from '@/features/codes-journaliers/pages/ListeCodesPage';
import MaSeancePage from '@/features/seances/pages/MaSeancePage';
import SaisieManuellePage from '@/features/seances/pages/SaisieManuellePage';
import EtatHeuresPage from '@/features/heures/pages/EtatHeuresPage';
import MesHeuresPage from '@/features/heures/pages/MesHeuresPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/mot-de-passe-oublie"
          element={<MotDePasseOubliePage />}
        />
        <Route
          path="/inscription-enseignant"
          element={<InscriptionEnseignantPage />}
        />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />

          {/* Modules réservés à l'administrateur pour l'instant */}
          <Route element={<RoleRoute allowedRoles={['administrateur']} />}>
            <Route path="/referentiel" element={<ReferentielLayout />}>
              <Route index element={<Navigate to="ues" replace />} />

              <Route path="ues" element={<ListeUEsPage />} />
              <Route path="ues/nouvelle" element={<AjouterUEPage />} />
              <Route path="ues/importer" element={<ImporterUEsPage />} />
              <Route path="ues/:id" element={<DetailUEPage />} />

              <Route path="enseignants" element={<ListeEnseignantsPage />} />
              <Route
                path="enseignants/nouveau"
                element={<AjouterEnseignantPage />}
              />
              <Route
                path="enseignants/importer"
                element={<ImporterEnseignantsPage />}
              />
              <Route
                path="inscriptions"
                element={<ListeInscriptionsPage />}
              />

              <Route path="responsables" element={<ListeResponsablesPage />} />
              <Route
                path="responsables/nouveau"
                element={<AjouterResponsablePage />}
              />

              <Route path="secretaires" element={<ListeSecretairesPage />} />
              <Route
                path="secretaires/nouveau"
                element={<AjouterSecretairePage />}
              />

              <Route path="salles" element={<ListeSallesPage />} />
              <Route path="salles/nouvelle" element={<AjouterSallePage />} />
              <Route
                path="troncs-communs"
                element={<ListeTroncsCommunsPage />}
              />
              <Route
                path="troncs-communs/nouveau"
                element={<CreerTroncCommunPage />}
              />
              <Route
                path="troncs-communs/:id"
                element={<DetailTroncCommunPage />}
              />
              <Route path="salles/importer" element={<ImporterSallesPage />} />
            </Route>
          </Route>

          <Route
            element={
              <RoleRoute allowedRoles={['administrateur', 'responsable']} />
            }
          >
            <Route path="/repartition" element={<RepartitionPage />} />
            <Route
              path="/repartition/importer"
              element={<ImporterAttributionsPage />}
            />
            <Route
              path="/repartition/troncs-communs"
              element={<AttributionTroncsCommunsPage />}
            />
          </Route>

          <Route
            element={
              <RoleRoute allowedRoles={['administrateur', 'responsable']} />
            }
          >
            <Route path="/disponibilites" element={<LancerDemandePage />} />
            <Route
              path="/disponibilites/etat"
              element={<EtatDisponibilitesPage />}
            />
          </Route>

          <Route element={<RoleRoute allowedRoles={['enseignant']} />}>
            <Route
              path="/disponibilites/saisie"
              element={<SaisieDisponibilitesPage />}
            />
          </Route>
          <Route
            element={
              <RoleRoute allowedRoles={['administrateur', 'responsable']} />
            }
          >
            <Route path="/emploi-du-temps" element={<GenererEDTPage />} />
            <Route
              path="/emploi-du-temps/validation"
              element={<ValidationEDTPage />}
            />
          </Route>

          <Route element={<RoleRoute allowedRoles={['enseignant']} />}>
            <Route path="/mes-cours" element={<MesCoursPage />} />
            <Route path="/ma-seance" element={<MaSeancePage />} />
          </Route>

          <Route
            element={
              <RoleRoute
                allowedRoles={['administrateur', 'responsable', 'secretaire']}
              />
            }
          >
            <Route path="/codes-journaliers" element={<ListeCodesPage />} />
            <Route
              path="/seances/saisie-manuelle"
              element={<SaisieManuellePage />}
            />
            <Route path="/heures" element={<EtatHeuresPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={['enseignant']} />}>
            <Route path="/mes-heures" element={<MesHeuresPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}