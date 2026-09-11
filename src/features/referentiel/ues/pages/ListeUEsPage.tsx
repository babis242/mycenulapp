// src/features/referentiel/ues/pages/ListeUEsPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UploadCloud, Loader2, Search, WifiOff } from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { listUEsAvecOffre, lireUEsDepuisCache, type UEAvecOffre } from '../api';

// Écran 1.1 — Liste des UEs (ecrans_ui.md)
export default function ListeUEsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const {
    data: ues,
    loading,
    error,
    depuisCache,
  } = useCacheSupabase<UEAvecOffre>(lireUEsDepuisCache, listUEsAvecOffre);

  const filtered = ues.filter((ue) =>
    ue.nom.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">UEs</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Unités d'enseignement du référentiel
          </p>
          {depuisCache && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1.5">
              <WifiOff size={12} /> Données locales — en attente de
              rafraîchissement
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/referentiel/ues/importer')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <UploadCloud size={16} /> Importer Excel
          </button>
          <button
            onClick={() => navigate('/referentiel/ues/nouvelle')}
            className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            <Plus size={16} /> Ajouter une UE
          </button>
        </div>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une UE..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-300">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm font-semibold text-red-600">
            Impossible de charger les UEs : {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-gray-900 mb-1">
              Aucune UE pour l'instant
            </p>
            <p className="text-sm text-gray-400">
              Ajoutez votre première UE, manuellement ou par import Excel.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Volume horaire</th>
                <th className="px-5 py-3">Spécialité</th>
                <th className="px-5 py-3">Semestre</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ue) => (
                <tr
                  key={ue.id}
                  onClick={() => navigate(`/referentiel/ues/${ue.id}`)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                >
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {ue.nom}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {ue.code ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {ue.volume_horaire ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {ue.offre?.specialite.nom ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {ue.offre?.semestre ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
