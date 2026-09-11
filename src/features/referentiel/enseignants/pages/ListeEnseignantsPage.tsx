// src/features/referentiel/enseignants/pages/ListeEnseignantsPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UploadCloud, Loader2, Search, WifiOff } from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { db } from '@/lib/db';
import { listEnseignants } from '../api';
import type { Enseignant } from '@/types';

// Écran 1.2 — Liste des enseignants (ecrans_ui.md)
// Écran de référence pour la lecture hors ligne : affiche d'abord le
// cache local (Dexie), se rafraîchit ensuite depuis le réseau. Même
// motif à reprendre sur les autres écrans de liste.
export default function ListeEnseignantsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const {
    data: enseignants,
    loading,
    error,
    depuisCache,
  } = useCacheSupabase<Enseignant>(
    () => db.enseignants.toArray(),
    listEnseignants
  );

  const filtered = enseignants.filter(
    (e) =>
      e.nom.toLowerCase().includes(search.toLowerCase()) ||
      e.matricule.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Enseignants</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Personnel enseignant de l'institut
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
            onClick={() => navigate('/referentiel/enseignants/importer')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <UploadCloud size={16} /> Importer Excel
          </button>
          <button
            onClick={() => navigate('/referentiel/enseignants/nouveau')}
            className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            <Plus size={16} /> Ajouter un enseignant
          </button>
        </div>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un enseignant..."
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
            Impossible de charger les enseignants : {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-gray-900 mb-1">
              Aucun enseignant pour l'instant
            </p>
            <p className="text-sm text-gray-400">
              Ajoutez le premier, manuellement ou par import Excel.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Matricule</th>
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3.5 font-mono text-xs font-bold text-gray-500">
                    {e.matricule}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {e.nom}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{e.email}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        e.statut === 'actif'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {e.statut === 'actif' ? 'Actif' : 'Inactif'}
                    </span>
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
