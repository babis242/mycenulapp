// src/features/disponibilites/pages/LancerDemandePage.tsx
import { useEffect, useState } from 'react';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, X, CheckCircle2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { filtrerParPerimetre } from '@/lib/perimetre';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listUEsPourCampagne,
  lancerCampagne,
  type UEPourCampagne,
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

interface PaireSpecialiteSemestre {
  key: string;
  specialiteId: string;
  specialiteNom: string;
  semestre: string;
}

function cycleKeyDe(cycle: string, sousCycle: string | null) {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null) {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

// Écran Étape 1 — Lancement de la demande de disponibilités (journal.md
// Scénario 3). Sélection multi-spécialités/niveaux (une paire à la fois,
// ajoutée à une liste de travail), puis coche des UEs à programmer.
export default function LancerDemandePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Cascade pour ajouter une paire spécialité/semestre
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

  const [paires, setPaires] = useState<PaireSpecialiteSemestre[]>([]);

  const [ues, setUes] = useState<UEPourCampagne[]>([]);
  const [loadingUEs, setLoadingUEs] = useState(false);
  const [ueIdsCochees, setUeIdsCochees] = useState<Set<string>>(new Set());
  const [rechercheUE, setRechercheUE] = useState('');

  const [lancement, setLancement] = useState(false);
  const [succes, setSucces] = useState<{ nbEnseignants: number } | null>(null);

  useEffect(() => {
    supabase
      .from('ecoles')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setEcoles(data ?? []));
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

  // Raccourci : sélectionne directement une spécialité trouvée par
  // recherche, en pré-remplissant la cascade École → Filière → Cycle.
  async function handleSelectionRecherche(s: SpecialiteRecherche) {
    await handleEcoleChange(s.ecoleId);
    await handleFiliereChange(s.filiereId);
    setCycleKey(cycleKeyDe(s.cycle, s.sousCycle));
    setSpecialiteId(s.id);
  }

  const filieres = filieresByEcole[ecoleId] ?? [];
  const specialitesDeFiliere = filtrerParPerimetre(
    specialitesByFiliere[filiereId] ?? [],
    user
  );
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

  async function ajouterPaire() {
    if (!specialiteId || !semestre || !specialiteChoisie) return;
    const key = `${specialiteId}-${semestre}`;
    if (paires.some((p) => p.key === key)) return;

    const nouvellesPaires = [
      ...paires,
      { key, specialiteId, specialiteNom: specialiteChoisie.nom, semestre },
    ];
    setPaires(nouvellesPaires);

    setSpecialiteId('');
    setSemestre('');

    await rechargerUEs(nouvellesPaires);
  }

  function retirerPaire(key: string) {
    const nouvellesPaires = paires.filter((p) => p.key !== key);
    setPaires(nouvellesPaires);
    rechargerUEs(nouvellesPaires);
  }

  async function rechargerUEs(paires: PaireSpecialiteSemestre[]) {
    setLoadingUEs(true);
    try {
      const data = await listUEsPourCampagne(
        paires.map((p) => ({
          specialiteId: p.specialiteId,
          semestre: p.semestre,
        }))
      );
      setUes(data);
      // Pré-coche toutes les UEs récupérées par défaut (la pré-sélection
      // ciblée sur les UEs non achevées de la semaine, Scénario 4, sera
      // ajoutée une fois les séances disponibles).
      setUeIdsCochees(new Set(data.map((u) => u.ueId)));
    } finally {
      setLoadingUEs(false);
    }
  }

  function toggleUE(id: string) {
    setUeIdsCochees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLancer() {
    if (ueIdsCochees.size === 0) return;
    setLancement(true);
    try {
      const resultat = await lancerCampagne(Array.from(ueIdsCochees));
      setSucces({ nbEnseignants: resultat.nbEnseignants });
    } finally {
      setLancement(false);
    }
  }

  if (succes) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
        <p className="font-extrabold text-lg text-gray-900 mb-1">
          Demande envoyée
        </p>
        <p className="text-sm text-gray-400 mb-6">
          {succes.nbEnseignants} enseignant(s) concerné(s). Les
          notifications/rappels automatiques seront branchés prochainement —
          pour l'instant, la campagne est active et visible dans "État des
          disponibilités".
        </p>
        <button
          onClick={() => navigate('/disponibilites/etat')}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Voir l'état des disponibilités
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <p className="font-extrabold text-2xl text-gray-900">
          Demander les disponibilités
        </p>
        <button
          onClick={() => navigate('/disponibilites/etat')}
          className="text-sm font-bold text-red-600 hover:underline"
        >
          Voir l'état des disponibilités →
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Choisis les spécialités/niveaux concernés, puis les UEs à programmer.
      </p>

      <div className="bg-white rounded-[20px] p-5 mb-4">
        <p className="font-extrabold text-sm text-gray-900 mb-3">
          Ajouter une spécialité + niveau
        </p>

        <div className="mb-3">
          <RechercheSpecialite
            onSelect={handleSelectionRecherche}
            placeholder="Rechercher directement une spécialité..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <select
            value={ecoleId}
            onChange={(e) => handleEcoleChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
          >
            <option value="">École...</option>
            {ecoles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>

          <select
            value={filiereId}
            onChange={(e) => handleFiliereChange(e.target.value)}
            disabled={!ecoleId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Filière...</option>
            {filieres.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>

          <select
            value={cycleKey}
            onChange={(e) => {
              setCycleKey(e.target.value);
              setSpecialiteId('');
              setSemestre('');
            }}
            disabled={!filiereId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Cycle...</option>
            {cycles.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={specialiteId}
            onChange={(e) => {
              setSpecialiteId(e.target.value);
              setSemestre('');
            }}
            disabled={!cycleKey}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Spécialité...</option>
            {specialitesDuCycle.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>

          <select
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
            disabled={!specialiteId}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Semestre...</option>
            {semestresDisponibles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={ajouterPaire}
            disabled={!specialiteId || !semestre}
            className="flex items-center justify-center gap-1.5 bg-red-600 rounded-xl px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Plus size={15} /> Ajouter
          </button>
        </div>

        {paires.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {paires.map((p) => (
              <span
                key={p.key}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full"
              >
                {p.specialiteNom} · {p.semestre}
                <button
                  onClick={() => retirerPaire(p.key)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {paires.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="text-sm text-gray-400">
            Ajoute au moins une spécialité + niveau pour voir les UEs
            disponibles.
          </p>
        </div>
      ) : loadingUEs ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : ues.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="text-sm text-gray-400">
            Aucune UE offerte pour cette sélection.
          </p>
        </div>
      ) : (
        <>
          <p className="font-extrabold text-sm text-gray-900 mb-2.5">
            UEs à programmer{' '}
            <span className="text-gray-400 font-semibold">
              ({ueIdsCochees.size}/{ues.length} coché(e)s)
            </span>
          </p>

          <div className="mb-3">
            <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
              <Search size={15} className="text-gray-300 shrink-0" />
              <input
                value={rechercheUE}
                onChange={(e) => setRechercheUE(e.target.value)}
                placeholder="Rechercher une UE..."
                className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-[20px] overflow-hidden mb-5">
            {ues
              .filter((u) => {
                const q = rechercheUE.trim().toLowerCase();
                if (!q) return true;
                return (
                  u.ueNom.toLowerCase().includes(q) ||
                  u.specialiteNom.toLowerCase().includes(q) ||
                  (u.enseignantNom?.toLowerCase().includes(q) ?? false)
                );
              })
              .map((u) => (
              <label
                key={u.offreId}
                className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={ueIdsCochees.has(u.ueId)}
                  onChange={() => toggleUE(u.ueId)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-gray-900 truncate">
                      {u.ueNom}
                    </p>
                    {u.troncCommunNom && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full shrink-0">
                        Tronc commun
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {u.specialiteNom} · {u.semestre} ·{' '}
                    {u.enseignantNom ?? 'Non attribué'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleLancer}
            disabled={ueIdsCochees.size === 0 || lancement}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {lancement && <Loader2 size={15} className="animate-spin" />}
            Demander les disponibilités
          </button>
        </>
      )}
    </div>
  );
}