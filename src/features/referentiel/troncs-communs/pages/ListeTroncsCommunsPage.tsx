// src/features/referentiel/troncs-communs/pages/ListeTroncsCommunsPage.tsx
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2, WifiOff } from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import {
  listTroncsCommuns,
  lireTroncsCommunsDepuisCache,
  deleteTroncCommun,
  type TroncCommunAvecUEs,
} from '../api';

// Un Tronc commun regroupe plusieurs UEs distinctes (chacune restant
// rattachée à sa propre spécialité) — utile quand un même cours est
// enseigné ensemble à plusieurs spécialités par le même enseignant.
export default function ListeTroncsCommunsPage() {
  const navigate = useNavigate();
  const {
    data: troncsCommuns,
    loading,
    depuisCache,
  } = useCacheSupabase<TroncCommunAvecUEs>(
    lireTroncsCommunsDepuisCache,
    listTroncsCommuns
  );

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        'Supprimer ce tronc commun ? Les UEs elles-mêmes ne seront pas supprimées.'
      )
    )
      return;
    await deleteTroncCommun(id);
    window.location.reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            Troncs communs
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Regroupe plusieurs UEs distinctes enseignées ensemble par le même
            enseignant.
          </p>
          {depuisCache && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1.5">
              <WifiOff size={12} /> Données locales — en attente de
              rafraîchissement
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/referentiel/troncs-communs/nouveau')}
          className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
        >
          <Plus size={16} /> Créer un tronc commun
        </button>
      </div>

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
            Regroupe des UEs existantes qui doivent être enseignées ensemble.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {troncsCommuns.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/referentiel/troncs-communs/${t.id}`)}
              className="bg-white rounded-[20px] p-5 cursor-pointer hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-base text-gray-900">{t.nom}</p>
                  <p className="text-xs text-gray-400">
                    {t.enseignant_nom
                      ? `Enseignant : ${t.enseignant_nom}`
                      : 'Aucun enseignant assigné'}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.id);
                  }}
                  className="text-gray-300 hover:text-red-600 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {t.ues.map((ue) => (
                  <div
                    key={ue.id}
                    className="bg-gray-50 rounded-xl px-3.5 py-2.5"
                  >
                    <p className="text-sm font-bold text-gray-900">{ue.nom}</p>
                    <p className="text-xs text-gray-400">
                      {[
                        ue.specialite_nom,
                        ue.semestre,
                        ue.filiere_nom,
                        ue.ecole_nom,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
