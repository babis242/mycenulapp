// src/features/referentiel/troncs-communs/pages/CreerTroncCommunPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Search,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  listUEsPourTroncCommun,
  lireUEsPourTroncCommunDepuisCache,
  createTroncCommun,
  type UEOption,
} from '../api';

interface EnseignantOption {
  id: string;
  nom: string;
  matricule: string;
}

// Créer un tronc commun : choisir un nom, sélectionner au moins 2 UEs
// existantes (chacune reste rattachée à sa propre spécialité, elle n'est ni
// supprimée ni modifiée), et optionnellement un enseignant unique.
export default function CreerTroncCommunPage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [nom, setNom] = useState('');
  const [ues, setUes] = useState<UEOption[]>([]);
  const [ueIdsSelectionnes, setUeIdsSelectionnes] = useState<Set<string>>(
    new Set()
  );
  const [recherche, setRecherche] = useState('');

  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [enseignantId, setEnseignantId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        listUEsPourTroncCommun(),
        supabase.from('enseignants').select('id, nom, matricule').order('nom'),
      ])
        .then(([ueOptions, { data: enseignantsData }]) => {
          setUes(ueOptions);
          setEnseignants(enseignantsData ?? []);
        })
        .finally(() => setLoading(false));
    } else {
      Promise.all([
        lireUEsPourTroncCommunDepuisCache(),
        db.enseignants.toArray(),
      ])
        .then(([ueOptions, enseignantsData]) => {
          setUes(ueOptions);
          setEnseignants(
            (enseignantsData as any[]).sort((a, b) =>
              a.nom.localeCompare(b.nom)
            )
          );
        })
        .finally(() => setLoading(false));
    }
  }, []);

  function toggleUE(id: string) {
    setUeIdsSelectionnes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const uesFiltrees = ues.filter((u) =>
    u.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim()) {
      setError('Le nom du tronc commun est obligatoire.');
      return;
    }
    if (ueIdsSelectionnes.size < 2) {
      setError('Sélectionne au moins 2 UEs à regrouper.');
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        await createTroncCommun({
          nom: nom.trim(),
          ue_ids: Array.from(ueIdsSelectionnes),
          enseignant_id: enseignantId || undefined,
        });
      } else {
        const id = crypto.randomUUID();
        const ueIds = Array.from(ueIdsSelectionnes);
        await db.troncsCommuns.put({
          id,
          nom: nom.trim(),
          enseignant_id: enseignantId || null,
        } as any);
        await db.troncsCommunsUes.bulkPut(
          ueIds.map((ue_id) => ({
            tronc_commun_id: id,
            ue_id,
          })) as any
        );
        await enqueueSyncAction({
          entity: 'troncsCommuns',
          operation: 'create',
          payload: {
            id,
            nom: nom.trim(),
            enseignant_id: enseignantId || null,
            ue_ids: ueIds,
          },
        });
      }
      navigate('/referentiel/troncs-communs');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/troncs-communs')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour aux troncs communs
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Créer un tronc commun
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Regroupe plusieurs UEs distinctes, chacune restant rattachée à sa
        spécialité.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — le tronc commun sera enregistré localement et envoyé
            dès le retour du réseau.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="bg-white rounded-[20px] p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Nom du tronc commun *
            </label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : Algorithmique (tronc commun GI)"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Enseignant{' '}
              <span className="text-gray-300 font-normal">
                (optionnel, un seul pour tout le groupe)
              </span>
            </label>
            <select
              value={enseignantId}
              onChange={(e) => setEnseignantId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Aucun pour l'instant</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.matricule})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="font-extrabold text-sm text-gray-900 mb-2.5">
            UEs à regrouper *{' '}
            <span className="text-gray-400 font-semibold">
              ({ueIdsSelectionnes.size} sélectionnée(s))
            </span>
          </p>

          <div className="bg-white rounded-[20px] p-4">
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3">
              <Search size={15} className="text-gray-300" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une UE..."
                className="flex-1 text-sm font-semibold outline-none bg-transparent"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : uesFiltrees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Aucune UE trouvée.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
                {uesFiltrees.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 ${
                      u.deja_dans_un_groupe
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ueIdsSelectionnes.has(u.id)}
                      onChange={() => toggleUE(u.id)}
                      disabled={u.deja_dans_un_groupe}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {u.nom}
                      </p>
                      <p className="text-xs text-gray-400">
                        {u.specialite_nom ?? 'Sans spécialité'}
                      </p>
                    </div>
                    {u.deja_dans_un_groupe && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full shrink-0">
                        <AlertTriangle size={10} /> déjà dans un groupe
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Créer le tronc commun
          </button>
          <button
            type="button"
            onClick={() => navigate('/referentiel/troncs-communs')}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
