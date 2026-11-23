// src/features/referentiel/etudiants/components/ModifierEtudiantModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  SEMESTRES_PAR_TYPE_CURSUS,
  niveauDeSemestre,
  niveauxPourTypeCursus,
} from '@/constants/enums';
import { modifierEtudiant, type Etudiant } from '../api';

interface SpecialiteChoix {
  id: string;
  nom: string;
  cycle: string;
  type_cursus: 'standard' | 'sante_culinaire';
}

interface Props {
  etudiant: Etudiant;
  onFermer: () => void;
  onEnregistre: () => void;
}

const champ =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-300';

// Fenêtre de modification d'un étudiant : nom, matricule, spécialité,
// semestre et niveau (le niveau suit le semestre, mais reste modifiable).
export default function ModifierEtudiantModal({
  etudiant,
  onFermer,
  onEnregistre,
}: Props) {
  const [specialites, setSpecialites] = useState<SpecialiteChoix[]>([]);
  const [matricule, setMatricule] = useState(etudiant.matricule);
  const [nom, setNom] = useState(etudiant.nom_complet);
  const [specialiteId, setSpecialiteId] = useState(etudiant.specialite_id);
  const [semestre, setSemestre] = useState(etudiant.semestre);
  const [niveau, setNiveau] = useState(
    etudiant.niveau || niveauDeSemestre('standard', etudiant.semestre) || ''
  );
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const out: SpecialiteChoix[] = [];
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await supabase
          .from('specialites')
          .select('id, nom, cycle, type_cursus')
          .order('nom')
          .range(debut, debut + 999);
        if (error) {
          if (!annule) setErreur(error.message);
          return;
        }
        out.push(...((data ?? []) as SpecialiteChoix[]));
        if ((data ?? []).length < 1000) break;
      }
      if (!annule) setSpecialites(out);
    })();
    return () => {
      annule = true;
    };
  }, []);

  const choisie = specialites.find((s) => s.id === specialiteId);
  const semestres = useMemo(
    () => (choisie ? SEMESTRES_PAR_TYPE_CURSUS[choisie.type_cursus] : [etudiant.semestre]),
    [choisie, etudiant.semestre]
  );
  const niveaux = useMemo(() => {
    const base = choisie ? niveauxPourTypeCursus(choisie.type_cursus) : [];
    return niveau && !base.includes(niveau) ? [...base, niveau] : base;
  }, [choisie, niveau]);

  function changerSpecialite(id: string) {
    setSpecialiteId(id);
    const s = specialites.find((x) => x.id === id);
    if (s) {
      const liste = SEMESTRES_PAR_TYPE_CURSUS[s.type_cursus];
      if (!liste.includes(semestre)) {
        setSemestre(liste[0]);
        setNiveau(niveauDeSemestre(s.type_cursus, liste[0]) ?? '');
      }
    }
  }
  function changerSemestre(sem: string) {
    setSemestre(sem);
    setNiveau(niveauDeSemestre(choisie?.type_cursus ?? 'standard', sem) ?? niveau);
  }

  async function enregistrer() {
    setErreur(null);
    if (!matricule.trim() || !nom.trim()) {
      setErreur('Le matricule et le nom sont obligatoires.');
      return;
    }
    if (!navigator.onLine) {
      setErreur("Pas de connexion internet — la modification nécessite d'être en ligne.");
      return;
    }
    setSaving(true);
    try {
      await modifierEtudiant(etudiant.id, {
        matricule,
        nom_complet: nom,
        specialite_id: specialiteId,
        semestre,
        niveau,
      });
      onEnregistre();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  }

  const change =
    specialiteId !== etudiant.specialite_id || semestre !== etudiant.semestre;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onFermer}>
      <div
        className="bg-white rounded-[20px] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-extrabold text-lg text-gray-900">Modifier l’étudiant</p>
          <button onClick={onFermer} className="text-gray-300 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-gray-500">
            Nom complet
            <input value={nom} onChange={(e) => setNom(e.target.value)} className={`${champ} mt-1.5`} />
          </label>
          <label className="text-xs font-bold text-gray-500">
            Matricule
            <input value={matricule} onChange={(e) => setMatricule(e.target.value)} className={`${champ} mt-1.5`} />
          </label>
          <label className="text-xs font-bold text-gray-500">
            Spécialité
            <select value={specialiteId} onChange={(e) => changerSpecialite(e.target.value)} className={`${champ} mt-1.5`}>
              {specialites.length === 0 && <option value={specialiteId}>Chargement…</option>}
              {specialites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} ({s.cycle})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-500">
              Semestre
              <select value={semestre} onChange={(e) => changerSemestre(e.target.value)} className={`${champ} mt-1.5`}>
                {semestres.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-gray-500">
              Niveau
              <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className={`${champ} mt-1.5`}>
                {niveaux.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {change && (
          <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            L’étudiant quittera cette liste pour la nouvelle spécialité / le nouveau semestre. Ses présences déjà saisies restent
            rattachées à l’ancienne classe.
          </p>
        )}
        {erreur && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{erreur}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onFermer} disabled={saving} className="px-4 py-2 text-sm font-bold text-gray-500">
            Annuler
          </button>
          <button
            onClick={enregistrer}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}