// src/features/referentiel/salles/pages/AjouterSallePage.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { createSalle } from '../api';

interface Ecole {
  id: string;
  nom: string;
}
interface Filiere {
  id: string;
  nom: string;
  ecole_id: string;
}
interface Specialite {
  id: string;
  nom: string;
  filiere_id: string;
  cycle: string;
  sous_cycle: string | null;
}

function cycleKeyDe(cycle: string, sousCycle: string | null): string {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null): string {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

// Écran 1.11 — Ajouter une salle (formulaire manuel) (ecrans_ui.md)
// La spécialité par défaut se choisit comme dans l'ajout d'une UE : par
// recherche directe, ou en descendant École → Filière → Cycle →
// Spécialité, pour toujours voir de quelle école/cycle on parle (deux
// spécialités peuvent porter le même nom dans des écoles différentes).
export default function AjouterSallePage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [codeSalle, setCodeSalle] = useState('');
  const [capacite, setCapacite] = useState('');

  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [ecoleId, setEcoleId] = useState('');
  const [filieresByEcole, setFilieresByEcole] = useState<
    Record<string, Filiere[]>
  >({});
  const [filiereId, setFiliereId] = useState('');
  const [specialitesByFiliere, setSpecialitesByFiliere] = useState<
    Record<string, Specialite[]>
  >({});
  const [cycleKey, setCycleKey] = useState('');
  const [specialiteId, setSpecialiteId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      supabase
        .from('ecoles')
        .select('id, nom')
        .order('nom')
        .then(({ data }) => setEcoles(data ?? []));
    } else {
      db.ecoles
        .toArray()
        .then((data) =>
          setEcoles(
            [...data].sort((a: any, b: any) => a.nom.localeCompare(b.nom))
          )
        );
    }
  }, []);

  async function loadFilieres(id: string) {
    if (filieresByEcole[id]) return;
    if (navigator.onLine) {
      const { data } = await supabase
        .from('filieres')
        .select('id, nom, ecole_id')
        .eq('ecole_id', id)
        .order('nom');
      setFilieresByEcole((prev) => ({ ...prev, [id]: data ?? [] }));
    } else {
      const data = await db.filieres.where('ecole_id').equals(id).toArray();
      setFilieresByEcole((prev) => ({
        ...prev,
        [id]: (data as any[]).sort((a, b) => a.nom.localeCompare(b.nom)),
      }));
    }
  }

  async function loadSpecialites(id: string) {
    if (specialitesByFiliere[id]) return;
    if (navigator.onLine) {
      const { data } = await supabase
        .from('specialites')
        .select('id, nom, filiere_id, cycle, sous_cycle')
        .eq('filiere_id', id)
        .order('nom');
      setSpecialitesByFiliere((prev) => ({
        ...prev,
        [id]: (data ?? []) as Specialite[],
      }));
    } else {
      const data = await db.specialites.where('filiere_id').equals(id).toArray();
      setSpecialitesByFiliere((prev) => ({
        ...prev,
        [id]: (data as any[])
          .map((s) => ({ ...s, sous_cycle: s.sous_cycle ?? null }) as Specialite)
          .sort((a, b) => a.nom.localeCompare(b.nom)),
      }));
    }
  }

  async function handleEcoleChange(id: string) {
    setEcoleId(id);
    setFiliereId('');
    setCycleKey('');
    setSpecialiteId('');
    if (id) await loadFilieres(id);
  }

  async function handleFiliereChange(id: string) {
    setFiliereId(id);
    setCycleKey('');
    setSpecialiteId('');
    if (id) await loadSpecialites(id);
  }

  function handleCycleChange(key: string) {
    setCycleKey(key);
    setSpecialiteId('');
  }

  // Raccourci : sélectionne directement une spécialité trouvée par
  // recherche, en pré-remplissant la cascade École → Filière → Cycle.
  async function handleSelectionRecherche(s: SpecialiteRecherche) {
    await handleEcoleChange(s.ecoleId);
    await handleFiliereChange(s.filiereId);
    setCycleKey(cycleKeyDe(s.cycle, s.sousCycle));
    setSpecialiteId(s.id);
  }

  const filieres = filieresByEcole[ecoleId] ?? [];
  const specialitesDeFiliere = specialitesByFiliere[filiereId] ?? [];
  const cycles = (() => {
    const vues = new Map<string, string>();
    for (const s of specialitesDeFiliere) {
      const k = cycleKeyDe(s.cycle, s.sous_cycle);
      if (!vues.has(k)) vues.set(k, labelCycle(s.cycle, s.sous_cycle));
    }
    return Array.from(vues.entries()).map(([key, label]) => ({ key, label }));
  })();
  const specialitesDuCycle = specialitesDeFiliere.filter(
    (s) => cycleKeyDe(s.cycle, s.sous_cycle) === cycleKey
  );

  // Rappel du chemin complet de la spécialité retenue.
  const specialiteChoisie = specialitesDeFiliere.find(
    (s) => s.id === specialiteId
  );
  const resume = specialiteChoisie
    ? [
        ecoles.find((e) => e.id === ecoleId)?.nom,
        filieres.find((f) => f.id === filiereId)?.nom,
        labelCycle(specialiteChoisie.cycle, specialiteChoisie.sous_cycle),
        specialiteChoisie.nom,
      ]
        .filter(Boolean)
        .join(' › ')
    : null;

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

  const selectClasses =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300';

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

      {ecoles.length === 0 ? (
        <div className="bg-white rounded-[20px] p-5">
          <p className="text-sm font-semibold text-gray-500">
            Aucune école ni spécialité n'existe encore. Créez d'abord une
            spécialité (depuis l'ajout d'une UE) avant de pouvoir ajouter une
            salle.
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

          <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500">
              Spécialité par défaut *
            </p>

            {enLigne && <RechercheSpecialite onSelect={handleSelectionRecherche} />}

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                École
              </label>
              <select
                value={ecoleId}
                onChange={(e) => handleEcoleChange(e.target.value)}
                className={selectClasses}
              >
                <option value="">Sélectionner...</option>
                {ecoles.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Filière
              </label>
              <select
                value={filiereId}
                onChange={(e) => handleFiliereChange(e.target.value)}
                disabled={!ecoleId}
                className={selectClasses}
              >
                <option value="">Sélectionner...</option>
                {filieres.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Cycle
              </label>
              <select
                value={cycleKey}
                onChange={(e) => handleCycleChange(e.target.value)}
                disabled={!filiereId}
                className={selectClasses}
              >
                <option value="">Sélectionner...</option>
                {cycles.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Spécialité
              </label>
              <select
                value={specialiteId}
                onChange={(e) => setSpecialiteId(e.target.value)}
                disabled={!cycleKey}
                className={selectClasses}
              >
                <option value="">Sélectionner...</option>
                {specialitesDuCycle.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </div>

            {resume && (
              <p className="text-xs font-semibold text-gray-500 bg-gray-50 rounded-xl px-3.5 py-2.5">
                {resume}
              </p>
            )}
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