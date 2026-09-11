// src/features/referentiel/responsables/pages/ListeResponsablesPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Search } from 'lucide-react';
import { listResponsables, type ResponsableAvecPerimetre } from '../api';

// Écran "Personnel — Responsables" : liste des responsables avec leur
// périmètre de spécialités assigné (règle transversale, journal.md).
export default function ListeResponsablesPage() {
  const navigate = useNavigate();
  const [responsables, setResponsables] = useState<ResponsableAvecPerimetre[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    listResponsables()
      .then((data) => !cancelled && setResponsables(data))
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = responsables.filter(
    (r) =>
      r.nom.toLowerCase().includes(search.toLowerCase()) ||
      r.matricule.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Responsables</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Un responsable, une fois créé, est limité aux spécialités de son
            périmètre.
          </p>
        </div>
        <button
          onClick={() => navigate('/referentiel/responsables/nouveau')}
          className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
        >
          <Plus size={16} /> Ajouter un responsable
        </button>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un responsable..."
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
            Impossible de charger les responsables : {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-gray-900 mb-1">
              Aucun responsable pour l'instant
            </p>
            <p className="text-sm text-gray-400">
              Ajoutez-en un et assignez-lui des spécialités.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Matricule</th>
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Périmètre</th>
                <th className="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3.5 font-mono text-xs font-bold text-gray-500">
                    {r.matricule}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {r.nom}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{r.email}</td>
                  <td className="px-5 py-3.5">
                    {r.specialites.length === 0 ? (
                      <span className="text-xs font-semibold text-amber-600">
                        Aucune spécialité assignée
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.specialites.map((s) => (
                          <span
                            key={s.id}
                            className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                          >
                            {s.nom}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        r.statut === 'actif'
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {r.statut === 'actif' ? 'Actif' : 'Inactif'}
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
