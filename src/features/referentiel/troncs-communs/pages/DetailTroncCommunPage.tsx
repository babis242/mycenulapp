// src/features/referentiel/troncs-communs/pages/DetailTroncCommunPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Plus,
  Search,
  AlertTriangle,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getTroncCommun,
  updateTroncCommun,
  deleteTroncCommun,
  retirerUEDuTroncCommun,
  ajouterUEsAuTroncCommun,
  listUEsPourTroncCommun,
  type TroncCommunDetail,
  type UEOption,
} from '../api';

interface EnseignantOption {
  id: string;
  nom: string;
  matricule: string;
}

// Écran de détail d'un Tronc commun : nom + enseignant modifiables, UEs du
// groupe consultables/retirables, ajout d'UEs supplémentaires.
export default function DetailTroncCommunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [troncCommun, setTroncCommun] = useState<TroncCommunDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [enseignantId, setEnseignantId] = useState('');
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);

  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [uesDisponibles, setUesDisponibles] = useState<UEOption[]>([]);
  const [rechercheAjout, setRechercheAjout] = useState('');
  const [ueIdsAAjouter, setUeIdsAAjouter] = useState<Set<string>>(new Set());

  function recharger() {
    if (!id) return;
    setLoading(true);
    getTroncCommun(id)
      .then((data) => {
        setTroncCommun(data);
        if (data) {
          setNom(data.nom);
          setEnseignantId(data.enseignant_id ?? '');
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    recharger();
    supabase
      .from('enseignants')
      .select('id, nom, matricule')
      .order('nom')
      .then(({ data }) => setEnseignants(data ?? []));
  }, [id]);

  async function handleSave() {
    if (!id) return;
    if (!nom.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTroncCommun(id, {
        nom: nom.trim(),
        enseignant_id: enseignantId || null,
      });
      recharger();
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (
      !window.confirm(
        'Supprimer ce tronc commun ? Les UEs elles-mêmes ne seront pas supprimées.'
      )
    )
      return;
    await deleteTroncCommun(id);
    navigate('/referentiel/troncs-communs');
  }

  async function handleRetirerUE(ueId: string) {
    if (!id || !troncCommun) return;
    if (troncCommun.ues.length <= 2) {
      window.alert(
        'Un tronc commun doit contenir au moins 2 UEs. Supprime le groupe entier si besoin.'
      );
      return;
    }
    if (!window.confirm('Retirer cette UE du groupe ?')) return;
    await retirerUEDuTroncCommun(id, ueId);
    recharger();
  }

  async function ouvrirAjout() {
    setAjoutOuvert(true);
    setUeIdsAAjouter(new Set());
    setRechercheAjout('');
    const toutes = await listUEsPourTroncCommun();
    const idsDejaDansCeGroupe = new Set(
      troncCommun?.ues.map((u) => u.id) ?? []
    );
    setUesDisponibles(toutes.filter((u) => !idsDejaDansCeGroupe.has(u.id)));
  }

  async function handleAjouter() {
    if (!id || ueIdsAAjouter.size === 0) return;
    setSaving(true);
    try {
      await ajouterUEsAuTroncCommun(id, Array.from(ueIdsAAjouter));
      setAjoutOuvert(false);
      recharger();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!troncCommun) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="font-bold text-gray-900">Tronc commun introuvable.</p>
      </div>
    );
  }

  const uesFiltrees = uesDisponibles.filter((u) =>
    u.nom.toLowerCase().includes(rechercheAjout.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/troncs-communs')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour aux troncs communs
      </button>

      <div className="flex items-center justify-between mb-6">
        <p className="font-extrabold text-2xl text-gray-900">
          {editing ? 'Modifier le tronc commun' : troncCommun.nom}
        </p>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Modifier
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 bg-red-50 rounded-full px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
            >
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[20px] p-5 flex flex-col gap-4 mb-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Nom
          </label>
          {editing ? (
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">
              {troncCommun.nom}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Enseignant
          </label>
          {editing ? (
            <select
              value={enseignantId}
              onChange={(e) => setEnseignantId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Aucun</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.matricule})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-semibold text-gray-900">
              {troncCommun.enseignant_nom ?? 'Aucun enseignant assigné'}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}

      {editing && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-2.5">
        <p className="font-extrabold text-sm text-gray-900">
          UEs du groupe ({troncCommun.ues.length})
        </p>
        <button
          onClick={ouvrirAjout}
          className="flex items-center gap-1.5 text-xs font-bold text-red-600"
        >
          <Plus size={14} /> Ajouter des UEs
        </button>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden mb-6">
        {troncCommun.ues.map((ue) => (
          <div
            key={ue.id}
            className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
          >
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 truncate">
                {ue.nom}
              </p>
              <p className="text-xs text-gray-400">
                {ue.specialite_nom ?? 'Sans spécialité'}
                {ue.semestre && ` · ${ue.semestre}`}
                {ue.ecole_nom && ` · ${ue.ecole_nom}`}
              </p>
            </div>
            <button
              onClick={() => handleRetirerUE(ue.id)}
              className="shrink-0 text-gray-300 hover:text-red-600 p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {ajoutOuvert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="font-extrabold text-base text-gray-900">
                Ajouter des UEs
              </p>
              <button
                onClick={() => setAjoutOuvert(false)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3 shrink-0">
              <Search size={15} className="text-gray-300" />
              <input
                autoFocus
                value={rechercheAjout}
                onChange={(e) => setRechercheAjout(e.target.value)}
                placeholder="Rechercher une UE..."
                className="flex-1 text-sm font-semibold outline-none bg-transparent"
              />
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 mb-3">
              {uesFiltrees.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Aucune UE disponible.
                </p>
              ) : (
                uesFiltrees.map((u) => (
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
                      checked={ueIdsAAjouter.has(u.id)}
                      disabled={u.deja_dans_un_groupe}
                      onChange={() =>
                        setUeIdsAAjouter((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
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
                ))
              )}
            </div>

            <button
              onClick={handleAjouter}
              disabled={ueIdsAAjouter.size === 0 || saving}
              className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Ajouter ({ueIdsAAjouter.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
