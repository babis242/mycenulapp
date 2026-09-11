// src/features/referentiel/ues/pages/DetailUEPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Trash2, ArrowLeft } from 'lucide-react';
import {
  getUE,
  updateUE,
  deleteUE,
  ueEstUtilisee,
  type UEAvecOffre,
} from '../api';

// Écran 1.5 — Détail / Modification d'une UE (ecrans_ui.md)
// Une UE = une spécialité. Pour la regrouper avec d'autres UEs (tronc
// commun), voir Référentiel → Jumelages.
export default function DetailUEPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ue, setUe] = useState<UEAvecOffre | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [volumeHoraire, setVolumeHoraire] = useState('');
  const [coefficient, setCoefficient] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getUE(id)
      .then((data) => {
        if (cancelled || !data) return;
        setUe(data);
        setNom(data.nom);
        setCode(data.code ?? '');
        setVolumeHoraire(data.volume_horaire?.toString() ?? '');
        setCoefficient(data.coefficient?.toString() ?? '');
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    if (!id) return;
    if (!nom.trim()) {
      setError("Le nom de l'UE est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUE(id, {
        nom: nom.trim(),
        code: code.trim() || undefined,
        volume_horaire: volumeHoraire ? Number(volumeHoraire) : undefined,
        coefficient: coefficient ? Number(coefficient) : undefined,
      });
      setUe((prev) => (prev ? { ...prev, nom: nom.trim(), code } : prev));
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
    const utilisee = await ueEstUtilisee(id);
    const message = utilisee
      ? "Cette UE fait partie d'un jumelage. La supprimer quand même ?"
      : 'Supprimer définitivement cette UE ?';
    if (!window.confirm(message)) return;

    try {
      await deleteUE(id);
      navigate('/referentiel/ues');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!ue) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="font-bold text-gray-900">UE introuvable.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/ues')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <div className="flex items-center justify-between mb-6">
        <p className="font-extrabold text-2xl text-gray-900">
          {editing ? "Modifier l'UE" : ue.nom}
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
            Nom / Intitulé
          </label>
          {editing ? (
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">{ue.nom}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Code
            </label>
            {editing ? (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.code ?? '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Volume horaire
            </label>
            {editing ? (
              <input
                type="number"
                value={volumeHoraire}
                onChange={(e) => setVolumeHoraire(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.volume_horaire ?? '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Coefficient
            </label>
            {editing ? (
              <input
                type="number"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.coefficient ?? '—'}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}

      {editing ? (
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
      ) : (
        <div className="mb-6">
          <p className="font-extrabold text-sm text-gray-900 mb-2.5">
            Rattachement
          </p>
          <div className="bg-white rounded-[20px] p-5">
            {ue.offre ? (
              <>
                <p className="text-sm font-bold text-gray-900">
                  {ue.offre.specialite.nom} — {ue.offre.semestre}
                </p>
                <p className="text-xs text-gray-400">
                  {ue.offre.specialite.filiere.ecole.nom} ·{' '}
                  {ue.offre.specialite.filiere.nom}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">
                Aucune spécialité rattachée.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
