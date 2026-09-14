// src/features/referentiel/salles/pages/ListeSallesPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UploadCloud, Loader2, Search, WifiOff, Trash2 } from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { db } from '@/lib/db';
import { listSalles, deleteSalle, type SalleAvecSpecialite } from '../api';

// Reconstruit la forme "salle + spécialité jointe" depuis deux tables
// Dexie séparées — le cache local ne stocke que les tables brutes, pas
// les jointures que fait Supabase à la volée.
async function lireSallesDepuisCache(): Promise<SalleAvecSpecialite[]> {
  const [salles, specialites] = await Promise.all([
    db.salles.toArray(),
    db.specialites.toArray(),
  ]);
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));
  return salles.map((s: any) => ({
    id: s.id,
    code_salle: s.code_salle,
    capacite: s.capacite,
    specialite_par_defaut_id: s.specialite_par_defaut_id,
    specialite: s.specialite_par_defaut_id
      ? (() => {
          const sp = specialiteParId.get(s.specialite_par_defaut_id);
          return sp ? { id: sp.id, nom: sp.nom } : null;
        })()
      : null,
  }));
}

// Écran 1.10 — Liste des salles (ecrans_ui.md)
export default function ListeSallesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [suppression, setSuppression] = useState<string | null>(null);
  const [supprimees, setSupprimees] = useState<Set<string>>(new Set());

  const {
    data: salles,
    loading,
    error,
    depuisCache,
  } = useCacheSupabase<SalleAvecSpecialite>(lireSallesDepuisCache, listSalles);

  async function handleSupprimer(s: SalleAvecSpecialite) {
    if (!window.confirm(`Supprimer la salle "${s.code_salle}" ?`)) return;
    setSuppression(s.id);
    try {
      await deleteSalle(s.id);
      setSupprimees((prev) => new Set(prev).add(s.id));
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la suppression — cette salle est peut-être encore utilisée.'
      );
    } finally {
      setSuppression(null);
    }
  }

  const filtered = salles
    .filter((s) => !supprimees.has(s.id))
    .filter((s) => s.code_salle.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Salles</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Salles de cours de l'institut
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
            onClick={() => navigate('/referentiel/salles/importer')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <UploadCloud size={16} /> Importer Excel
          </button>
          <button
            onClick={() => navigate('/referentiel/salles/nouvelle')}
            className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            <Plus size={16} /> Ajouter une salle
          </button>
        </div>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une salle..."
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
            Impossible de charger les salles : {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-gray-900 mb-1">
              Aucune salle pour l'instant
            </p>
            <p className="text-sm text-gray-400">
              Ajoutez la première, manuellement ou par import Excel.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Code salle</th>
                <th className="px-5 py-3">Capacité</th>
                <th className="px-5 py-3">Spécialité par défaut</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {s.code_salle}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{s.capacite}</td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {s.specialite?.nom ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleSupprimer(s)}
                      disabled={suppression === s.id}
                      className="flex items-center gap-1.5 bg-red-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 ml-auto w-fit"
                    >
                      {suppression === s.id ? (
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