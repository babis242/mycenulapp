// src/features/repartition/pages/AttributionTroncsCommunsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  listTroncsCommuns,
  type TroncCommunAvecUEs,
} from '@/features/referentiel/troncs-communs/api';
import {
  attribuerCoursEtGroupe,
  listEnseignantsOptions,
  type EnseignantOption,
} from '../api';

// Page dédiée à l'attribution des Troncs communs — évite d'avoir à passer
// par la cascade École/Filière/Cycle/Spécialité/Semestre pour chaque UE du
// groupe : on attribue directement le groupe entier depuis sa liste.
export default function AttributionTroncsCommunsPage() {
  const navigate = useNavigate();

  const [troncsCommuns, setTroncsCommuns] = useState<TroncCommunAvecUEs[]>([]);
  const [loading, setLoading] = useState(true);
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);

  const [modal, setModal] = useState<TroncCommunAvecUEs | null>(null);
  const [recherche, setRecherche] = useState('');
  const [attribution, setAttribution] = useState(false);

  function reload() {
    setLoading(true);
    listTroncsCommuns()
      .then(setTroncsCommuns)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    listEnseignantsOptions().then(setEnseignants);
  }, []);

  function ouvrirModale(t: TroncCommunAvecUEs) {
    setModal(t);
    setRecherche('');
  }

  async function handleAttribuer(enseignant: EnseignantOption) {
    if (!modal) return;

    if (modal.enseignant_nom) {
      const confirme = window.confirm(
        `Ce tronc commun ("${modal.nom}") est actuellement enseigné par ${modal.enseignant_nom}. Voulez-vous vraiment le réattribuer à ${enseignant.nom} pour toutes ses UEs ?`
      );
      if (!confirme) return;
    }

    setAttribution(true);
    try {
      await attribuerCoursEtGroupe(
        {
          offreId: '',
          ueId: '',
          ueNom: modal.nom,
          attributionId: null,
          enseignantId: modal.enseignant_id,
          enseignantNom: modal.enseignant_nom,
          troncCommun: modal,
        },
        enseignant.id
      );
      reload();
      setModal(null);
    } finally {
      setAttribution(false);
    }
  }

  const enseignantsFiltres = enseignants.filter(
    (e) =>
      e.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      e.matricule.toLowerCase().includes(recherche.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/repartition')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la répartition
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Attribution des troncs communs
      </p>
      <p className="text-sm text-gray-400 mb-6">
        L'enseignant choisi est attribué à toutes les UEs du groupe en une seule
        fois.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : troncsCommuns.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="font-bold text-gray-900 mb-1">
            Aucun tronc commun pour l'instant
          </p>
          <p className="text-sm text-gray-400">
            Crée-en un depuis Référentiel → Troncs communs.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {troncsCommuns.map((t) => (
            <div key={t.id} className="bg-white rounded-[20px] p-5">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-bold text-base text-gray-900 truncate">
                    {t.nom}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.enseignant_nom ? t.enseignant_nom : 'Non attribué'}
                  </p>
                </div>
                <button
                  onClick={() => ouvrirModale(t)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                    t.enseignant_id
                      ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {t.enseignant_id ? 'Réattribuer' : 'Attribuer'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {t.ues.map((ue) => (
                  <span
                    key={ue.id}
                    className="text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full"
                  >
                    {ue.nom}{' '}
                    {ue.specialite_nom && (
                      <span className="text-gray-400 font-semibold">
                        · {ue.specialite_nom}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="font-extrabold text-base text-gray-900 truncate pr-2">
                  {modal.nom}
                </p>
                <button
                  onClick={() => setModal(null)}
                  className="text-gray-300 hover:text-gray-600 shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3 shrink-0">
                UEs concernées : {modal.ues.map((u) => u.nom).join(', ')}
              </p>

              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3 shrink-0">
                <Search size={15} className="text-gray-300" />
                <input
                  autoFocus
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Nom ou matricule..."
                  className="flex-1 text-sm font-semibold outline-none bg-transparent"
                />
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
                {enseignantsFiltres.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Aucun enseignant trouvé.
                  </p>
                ) : (
                  enseignantsFiltres.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {e.nom}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          {e.matricule}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAttribuer(e)}
                        disabled={attribution}
                        className="shrink-0 flex items-center gap-1.5 bg-red-600 rounded-full px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {attribution && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        Attribuer
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
