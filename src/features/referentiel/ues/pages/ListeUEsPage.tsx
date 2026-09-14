// src/features/referentiel/ues/pages/ListeUEsPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  UploadCloud,
  Loader2,
  Search,
  WifiOff,
  Trash2,
} from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import {
  listUEsAvecOffre,
  lireUEsDepuisCache,
  deleteUE,
  ueEstUtilisee,
  type UEAvecOffre,
} from '../api';

// Écran 1.1 — Liste des UEs (ecrans_ui.md)
export default function ListeUEsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(
    null
  );
  const [suppressionGroupeEnCours, setSuppressionGroupeEnCours] =
    useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const {
    data: ues,
    loading,
    error,
    depuisCache,
  } = useCacheSupabase<UEAvecOffre>(lireUEsDepuisCache, listUEsAvecOffre);

  // useCacheSupabase n'expose pas de refetch — on masque localement les
  // UEs supprimées plutôt que de forcer un rechargement complet.
  const [idsSupprimes, setIdsSupprimes] = useState<Set<string>>(new Set());

  const filtered = ues
    .filter((ue) => !idsSupprimes.has(ue.id))
    .filter((ue) => ue.nom.toLowerCase().includes(search.toLowerCase()));

  const touSelectionnes =
    filtered.length > 0 && filtered.every((ue) => selection.has(ue.id));

  function toggleUn(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTous() {
    setSelection((prev) => {
      if (touSelectionnes) {
        const next = new Set(prev);
        for (const ue of filtered) next.delete(ue.id);
        return next;
      }
      const next = new Set(prev);
      for (const ue of filtered) next.add(ue.id);
      return next;
    });
  }

  async function handleSupprimerUne(ue: UEAvecOffre) {
    const utilisee = await ueEstUtilisee(ue.id);
    const message = utilisee
      ? `"${ue.nom}" fait partie d'un jumelage. La supprimer quand même ?`
      : `Supprimer définitivement "${ue.nom}" ?`;
    if (!window.confirm(message)) return;

    setErreur(null);
    setSuppressionEnCours(ue.id);
    try {
      await deleteUE(ue.id);
      setSelection((prev) => {
        const next = new Set(prev);
        next.delete(ue.id);
        return next;
      });
      setIdsSupprimes((prev) => new Set(prev).add(ue.id));
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    } finally {
      setSuppressionEnCours(null);
    }
  }

  async function handleSupprimerSelection() {
    if (selection.size === 0) return;
    if (
      !window.confirm(
        `Supprimer définitivement ${selection.size} UE${selection.size > 1 ? 's' : ''} ?`
      )
    )
      return;

    setErreur(null);
    setSuppressionGroupeEnCours(true);
    try {
      for (const id of selection) {
        await deleteUE(id);
      }
      setIdsSupprimes((prev) => {
        const next = new Set(prev);
        for (const id of selection) next.add(id);
        return next;
      });
      setSelection(new Set());
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    } finally {
      setSuppressionGroupeEnCours(false);
    }
  }

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

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une UE..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>

        {selection.size > 0 && (
          <button
            onClick={handleSupprimerSelection}
            disabled={suppressionGroupeEnCours}
            className="flex items-center gap-2 bg-red-50 rounded-full px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {suppressionGroupeEnCours ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            Supprimer la sélection ({selection.size})
          </button>
        )}
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-bold text-red-600">{erreur}</p>
        </div>
      )}

      <div className="bg-white rounded-[20px] overflow-hidden overflow-x-auto">
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
                <th className="px-5 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={touSelectionnes}
                    onChange={toggleTous}
                    className="shrink-0"
                  />
                </th>
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Volume horaire</th>
                <th className="px-5 py-3">Spécialité</th>
                <th className="px-5 py-3">Semestre</th>
                <th className="px-5 py-3">Syllabus</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ue) => (
                <tr
                  key={ue.id}
                  onClick={() => navigate(`/referentiel/ues/${ue.id}`)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                >
                  <td
                    className="px-5 py-3.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selection.has(ue.id)}
                      onChange={() => toggleUn(ue.id)}
                      className="shrink-0"
                    />
                  </td>
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
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        ue.syllabus_key
                          ? 'bg-green-50 text-green-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {ue.syllabus_key ? 'Présent' : 'Manquant'}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleSupprimerUne(ue)}
                      disabled={suppressionEnCours === ue.id}
                      className="flex items-center gap-1.5 bg-red-50 rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 ml-auto w-fit"
                    >
                      {suppressionEnCours === ue.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Supprimer
                    </button>
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