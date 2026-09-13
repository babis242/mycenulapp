// src/features/repartition/pages/RepartitionPage.tsx
import { useEffect, useState } from 'react';
import { Search, Loader2, X, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCoursPourSpecialiteSemestre,
  listEnseignantsOptions,
  attribuerCoursEtGroupe,
  type CoursAAttribuer,
  type EnseignantOption,
} from '../api';
import type { TypeCursus } from '@/types';

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
  type_cursus: TypeCursus;
}

function cycleKeyDe(cycle: string, sousCycle: string | null): string {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null): string {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

type ModalAttribution = CoursAAttribuer;

// Écran Scénario 2 — Répartition du travail, Mode A (manuel) (journal.md)
// Sélection en cascade École → Filière → Cycle → Spécialité → Semestre
// (plutôt qu'une seule liste à plat, ingérable au-delà de quelques dizaines
// de spécialités), puis attribution/réattribution par enseignant.
export default function RepartitionPage() {
  const navigate = useNavigate();
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
  const [semestre, setSemestre] = useState('');

  const [cours, setCours] = useState<CoursAAttribuer[]>([]);
  const [loadingCours, setLoadingCours] = useState(false);

  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [modal, setModal] = useState<ModalAttribution | null>(null);
  const [recherche, setRecherche] = useState('');
  const [attribution, setAttribution] = useState(false);
  const [erreurAttribution, setErreurAttribution] = useState<string | null>(
    null
  );

  useEffect(() => {
    supabase
      .from('ecoles')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setEcoles(data ?? []));
    listEnseignantsOptions().then(setEnseignants);
  }, []);

  async function handleEcoleChange(id: string) {
    setEcoleId(id);
    setFiliereId('');
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    if (id && !filieresByEcole[id]) {
      const { data } = await supabase
        .from('filieres')
        .select('id, nom, ecole_id')
        .eq('ecole_id', id)
        .order('nom');
      setFilieresByEcole((prev) => ({ ...prev, [id]: data ?? [] }));
    }
  }

  async function handleFiliereChange(id: string) {
    setFiliereId(id);
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    if (id && !specialitesByFiliere[id]) {
      const { data } = await supabase
        .from('specialites')
        .select('id, nom, filiere_id, cycle, sous_cycle, type_cursus')
        .eq('filiere_id', id)
        .order('nom');
      setSpecialitesByFiliere((prev) => ({
        ...prev,
        [id]: (data ?? []) as Specialite[],
      }));
    }
  }

  function handleCycleChange(key: string) {
    setCycleKey(key);
    setSpecialiteId('');
    setSemestre('');
  }

  function handleSpecialiteChange(id: string) {
    setSpecialiteId(id);
    setSemestre('');
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
  const specialiteChoisie = specialitesDeFiliere.find(
    (s) => s.id === specialiteId
  );
  const semestresDisponibles = specialiteChoisie
    ? SEMESTRES_PAR_TYPE_CURSUS[specialiteChoisie.type_cursus]
    : [];

  useEffect(() => {
    if (!specialiteId || !semestre) {
      setCours([]);
      return;
    }
    setLoadingCours(true);
    listCoursPourSpecialiteSemestre(specialiteId, semestre)
      .then(setCours)
      .finally(() => setLoadingCours(false));
  }, [specialiteId, semestre]);

  function ouvrirModale(c: CoursAAttribuer) {
    setModal(c);
    setRecherche('');
    setErreurAttribution(null);
  }

  async function handleAttribuer(enseignant: EnseignantOption) {
    if (!modal) return;

    if (modal.troncCommun) {
      const enseignantActuelGroupe =
        modal.troncCommun.enseignant_nom ?? modal.enseignantNom;
      const listeUEs = modal.troncCommun.ues.map((u) => u.nom).join(', ');
      const message = enseignantActuelGroupe
        ? `Cette UE fait partie du tronc commun "${modal.troncCommun.nom}" (${listeUEs}), actuellement enseigné par ${enseignantActuelGroupe}. Attribuer ${enseignant.nom} changera l'enseignant de TOUTES les UEs du groupe. Continuer ?`
        : `Cette UE fait partie du tronc commun "${modal.troncCommun.nom}" (${listeUEs}). ${enseignant.nom} sera attribué à TOUTES les UEs du groupe. Continuer ?`;
      if (!window.confirm(message)) return;
    } else if (modal.attributionId) {
      const confirme = window.confirm(
        `Cette UE est actuellement attribuée à ${modal.enseignantNom}. Voulez-vous vraiment la réattribuer à ${enseignant.nom} ?`
      );
      if (!confirme) return;
    }

    setAttribution(true);
    setErreurAttribution(null);
    try {
      await attribuerCoursEtGroupe(modal, enseignant.id);
      const misAJour = await listCoursPourSpecialiteSemestre(
        specialiteId,
        semestre
      );
      setCours(misAJour);
      setModal(null);
    } catch (err) {
      setErreurAttribution(
        err instanceof Error ? err.message : "Erreur lors de l'attribution."
      );
    } finally {
      setAttribution(false);
    }
  }

  const enseignantsFiltres = enseignants.filter(
    (e) =>
      e.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      e.matricule.toLowerCase().includes(recherche.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <p className="font-extrabold text-2xl text-gray-900 mb-1">
            Répartition du travail
          </p>
          <p className="text-sm text-gray-400">
            Attribue chaque UE offerte à un enseignant.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/repartition/troncs-communs')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Troncs communs
          </button>
          <button
            onClick={() => navigate('/repartition/importer')}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <UploadCloud size={16} /> Importer Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[20px] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            École *
          </label>
          <select
            value={ecoleId}
            onChange={(e) => handleEcoleChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
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
            Filière *
          </label>
          <select
            value={filiereId}
            onChange={(e) => handleFiliereChange(e.target.value)}
            disabled={!ecoleId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
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
            Cycle *
          </label>
          <select
            value={cycleKey}
            onChange={(e) => handleCycleChange(e.target.value)}
            disabled={!filiereId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
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
            Spécialité *
          </label>
          <select
            value={specialiteId}
            onChange={(e) => handleSpecialiteChange(e.target.value)}
            disabled={!cycleKey}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Sélectionner...</option>
            {specialitesDuCycle.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Semestre *
          </label>
          <select
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
            disabled={!specialiteId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Sélectionner...</option>
            {semestresDisponibles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!specialiteId || !semestre ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="text-sm text-gray-400">
            Choisis École → Filière → Cycle → Spécialité → Semestre pour voir
            les UEs à répartir.
          </p>
        </div>
      ) : loadingCours ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : cours.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="text-sm text-gray-400">
            Aucune UE offerte pour cette combinaison spécialité/semestre.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] overflow-hidden">
          {cours.map((c) => (
            <div
              key={c.offreId}
              className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-gray-900 truncate">
                    {c.ueNom}
                  </p>
                  {c.troncCommun && (
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full shrink-0">
                      Tronc commun
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {c.enseignantNom ? c.enseignantNom : 'Non attribué'}
                </p>
              </div>
              <button
                onClick={() => ouvrirModale(c)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                  c.enseignantId
                    ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {c.enseignantId ? 'Réattribuer' : 'Attribuer'}
              </button>
            </div>
          ))}
        </div>
      )}

      {modal &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="font-extrabold text-base text-gray-900 truncate pr-2">
                  {modal.ueNom}
                </p>
                <button
                  onClick={() => setModal(null)}
                  className="text-gray-300 hover:text-gray-600 shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {modal.troncCommun && (
                <div className="bg-purple-50 rounded-xl px-3.5 py-2.5 mb-3 shrink-0">
                  <p className="text-xs font-bold text-purple-700">
                    Tronc commun "{modal.troncCommun.nom}"
                  </p>
                  <p className="text-[11px] text-purple-500 mt-0.5">
                    L'enseignant choisi sera appliqué à toutes les UEs :{' '}
                    {modal.troncCommun.ues.map((u) => u.nom).join(', ')}
                  </p>
                </div>
              )}

              {erreurAttribution && (
                <div className="bg-red-50 rounded-xl px-3.5 py-2.5 mb-3 shrink-0">
                  <p className="text-xs font-bold text-red-600">
                    {erreurAttribution}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3 shrink-0">
                <Search size={15} className="text-gray-300" />
                <input
                  autoFocus
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Nom ou matricule..."
                  className="flex-1 text-sm font-semibold outline-none bg-transparent"
                />
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
                {enseignantsFiltres.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Aucun enseignant trouvé.
                  </p>
                ) : (
                  enseignantsFiltres.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {e.nom}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          {e.matricule}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAttribuer(e)}
                        disabled={attribution}
                        className="shrink-0 flex items-center gap-1.5 bg-red-600 rounded-full px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {attribution && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        Attribuer
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}