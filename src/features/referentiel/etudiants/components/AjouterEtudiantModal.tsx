// src/features/referentiel/etudiants/components/AjouterEtudiantModal.tsx
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { creerEtudiant, type Etudiant } from '../api';

interface Props {
  specialiteId: string;
  semestre: string;
  onFermer: () => void;
  onCree: (e: Etudiant) => void;
}

const champ =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-300 disabled:bg-gray-50 disabled:text-gray-400';

// Création d'un étudiant dans la classe choisie. La case « Matricule provisoire » est
// cochée par défaut : le matricule (PROV-0001…) est alors généré automatiquement.
export default function AjouterEtudiantModal({ specialiteId, semestre, onFermer, onCree }: Props) {
  const [nom, setNom] = useState('');
  const [provisoire, setProvisoire] = useState(true);
  const [matricule, setMatricule] = useState('');
  const [inscrit, setInscrit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    setErreur(null);
    if (!nom.trim()) return setErreur('Le nom complet est obligatoire.');
    if (!provisoire && !matricule.trim()) return setErreur('Saisissez le matricule, ou cochez « Matricule provisoire ».');
    if (!navigator.onLine) return setErreur("Pas de connexion internet — l'ajout nécessite d'être en ligne.");
    setSaving(true);
    try {
      onCree(await creerEtudiant(specialiteId, semestre, nom, provisoire ? null : matricule, inscrit));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onFermer}>
      <div className="bg-white rounded-[20px] p-6 w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-extrabold text-lg text-gray-900">Ajouter un étudiant</p>
          <button onClick={onFermer} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-gray-500">
            Nom complet
            <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} className={`${champ} mt-1.5`} />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={provisoire} onChange={(e) => setProvisoire(e.target.checked)} className="w-4 h-4 accent-red-600" />
            Matricule provisoire
          </label>
          {provisoire ? (
            <p className="text-xs font-semibold text-gray-400 -mt-1">
              Un matricule du type « PROV-0001 » sera créé automatiquement. Vous pourrez le remplacer plus tard en modifiant l’étudiant.
            </p>
          ) : (
            <label className="text-xs font-bold text-gray-500">
              Matricule
              <input value={matricule} onChange={(e) => setMatricule(e.target.value)} className={`${champ} mt-1.5`} />
            </label>
          )}
        </div>
        <label className="text-xs font-bold text-gray-500 block mt-3">
          Inscription
          <select value={inscrit ? 'oui' : 'non'} onChange={(e) => setInscrit(e.target.value === 'oui')} className={`${champ} mt-1.5`}>
            <option value="oui">Inscrit</option>
            <option value="non">Pas inscrit</option>
          </select>
        </label>
        {erreur && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{erreur}</p>}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onFermer} disabled={saving} className="px-4 py-2 text-sm font-bold text-gray-500">Annuler</button>
          <button onClick={enregistrer} disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}