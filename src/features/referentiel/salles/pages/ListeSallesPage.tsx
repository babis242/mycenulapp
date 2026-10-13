// src/features/referentiel/salles/pages/ListeSallesPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UploadCloud, Loader2, Search, WifiOff, Trash2, Pencil, Check, X } from 'lucide-react';
import { useCacheSupabase } from '@/hooks/useCacheSupabase';
import { db } from '@/lib/db';
import { listSalles, deleteSalle, updateSalle, type SalleAvecSpecialite } from '../api';

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

  // Modification du code / de la capacité (en ligne uniquement).
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [codeEdite, setCodeEdite] = useState('');
  const [capaciteEditee, setCapaciteEditee] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [modifications, setModifications] = useState<
    Map<string, { code_salle: string; capacite: number }>
  >(new Map());

  function commencerEdition(s: SalleAvecSpecialite) {
    setEnEdition(s.id);
    setCodeEdite(s.code_salle);
    setCapaciteEditee(String(s.capacite));
    setErreurEdition(null);
  }

  async function enregistrerEdition(s: SalleAvecSpecialite) {
    const code = codeEdite.trim();
    const cap = Number(capaciteEditee);
    if (!code) {
      setErreurEdition('Le code de la salle est obligatoire.');
      return;
    }
    if (!Number.isFinite(cap) || cap <= 0) {
      setErreurEdition('La capacité doit être un nombre positif.');
      return;
    }
    if (!navigator.onLine) {
      setErreurEdition('Modification impossible hors ligne.');
      return;
    }
    setEnregistrement(true);
    setErreurEdition(null);
    try {
      await updateSalle(s.id, { code_salle: code, capacite: cap });
      try {
        const locale = await db.salles.get(s.id);
        if (locale) await db.salles.put({ ...locale, code_salle: code, capacite: cap } as any);
      } catch {
        // cache local : pas bloquant
      }
      setModifications((prev) => new Map(prev).set(s.id, { code_salle: code, capacite: cap }));
      setEnEdition(null);
    } catch (err) {
      setErreurEdition(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setEnregistrement(false);
    }
  }

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
    .map((s) => ({ ...s, ...(modifications.get(s.id) ?? {}) }))
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
                    {enEdition === s.id ? (
                      <div>
                        <input
                          value={codeEdite}
                          onChange={(e) => setCodeEdite(e.target.value)}
                          autoFocus
                          className="w-full min-w-28 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
                        />
                        {erreurEdition && (
                          <p className="text-xs font-semibold text-red-600 mt-1">{erreurEdition}</p>
                        )}
                      </div>
                    ) : (
                      s.code_salle
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {enEdition === s.id ? (
                      <input
                        type="number"
                        min={1}
                        value={capaciteEditee}
                        onChange={(e) => setCapaciteEditee(e.target.value)}
                        className="w-24 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
                      />
                    ) : (
                      s.capacite
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {s.specialite?.nom ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {enEdition === s.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => enregistrerEdition(s)}
                          disabled={enregistrement}
                          className="flex items-center gap-1.5 bg-red-600 rounded-full px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {enregistrement ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEnEdition(null)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-gray-500"
                        >
                          <X size={13} /> Annuler
                        </button>
                      </div>
                    ) : (
                    <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => commencerEdition(s)}
                      className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
                    >
                      <Pencil size={13} /> Modifier
                    </button>
                    <button
                      onClick={() => handleSupprimer(s)}
                      disabled={suppression === s.id}
                      className="flex items-center gap-1.5 bg-red-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 w-fit"
                    >
                      {suppression === s.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Supprimer
                    </button>
                    </div>
                    )}
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