// src/features/referentiel/salles/pages/AjouterSallePage.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { createSalle } from '../api';

interface Specialite {
  id: string;
  nom: string;
}

// Écran 1.11 — Ajouter une salle (formulaire manuel) (ecrans_ui.md)
export default function AjouterSallePage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [codeSalle, setCodeSalle] = useState('');
  const [capacite, setCapacite] = useState('');
  const [specialiteId, setSpecialiteId] = useState('');
  const [specialites, setSpecialites] = useState<Specialite[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      supabase
        .from('specialites')
        .select('id, nom')
        .order('nom')
        .then(({ data }) => setSpecialites(data ?? []));
    } else {
      db.specialites
        .toArray()
        .then((data) =>
          setSpecialites(
            [...data].sort((a: any, b: any) => a.nom.localeCompare(b.nom))
          )
        );
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!codeSalle.trim() || !capacite || !specialiteId) {
      setError('Tous les champs sont obligatoires.');
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        await createSalle({
          code_salle: codeSalle.trim(),
          capacite: Number(capacite),
          specialite_par_defaut_id: specialiteId,
        });
      } else {
        const id = crypto.randomUUID();
        await db.salles.put({
          id,
          code_salle: codeSalle.trim(),
          capacite: Number(capacite),
          specialite_par_defaut_id: specialiteId,
          date_creation: new Date().toISOString(),
        } as any);
        await enqueueSyncAction({
          entity: 'salles',
          operation: 'create',
          payload: {
            id,
            code_salle: codeSalle.trim(),
            capacite: Number(capacite),
            specialite_par_defaut_id: specialiteId,
          },
        });
      }
      navigate('/referentiel/salles');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => navigate('/referentiel/salles')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Ajouter une salle
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Tous les champs sont obligatoires.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — la salle sera enregistrée localement et envoyée dès le
            retour du réseau.
          </p>
        </div>
      )}

      {specialites.length === 0 ? (
        <div className="bg-white rounded-[20px] p-5">
          <p className="text-sm font-semibold text-gray-500">
            Aucune spécialité n'existe encore. Créez d'abord une spécialité
            (depuis l'ajout d'une UE) avant de pouvoir ajouter une salle.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[20px] p-5 flex flex-col gap-4"
        >
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Code salle *
            </label>
            <input
              value={codeSalle}
              onChange={(e) => setCodeSalle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              placeholder="A101"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Capacité *
            </label>
            <input
              type="number"
              value={capacite}
              onChange={(e) => setCapacite(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              placeholder="40"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Spécialité par défaut *
            </label>
            <select
              value={specialiteId}
              onChange={(e) => setSpecialiteId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Sélectionner...</option>
              {specialites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => navigate('/referentiel/salles')}
              className="px-5 py-2.5 text-sm font-bold text-gray-500"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
