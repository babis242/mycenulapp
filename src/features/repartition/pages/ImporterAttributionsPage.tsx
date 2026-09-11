// src/features/repartition/pages/ImporterAttributionsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Download,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCoursPourSpecialiteSemestre,
  attribuerCoursEtGroupe,
  type CoursAAttribuer,
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
interface EnseignantRef {
  id: string;
  nom: string;
  matricule: string;
}

interface LigneImport {
  key: string;
  ueTexte: string;
  enseignantTexte: string;
  offreId: string | null;
  ueResolueNom: string | null;
  enseignantId: string | null;
  attributionExistanteId: string | null;
  enseignantActuelNom: string | null;
  troncCommun: CoursAAttribuer['troncCommun'];
  statut?: 'ok' | 'erreur' | 'en_cours';
  erreurMessage?: string;
}

function resoudreLigne(
  ueTexte: string,
  enseignantTexte: string,
  coursDisponibles: CoursAAttribuer[],
  enseignantsRef: EnseignantRef[]
) {
  const coursTrouve = coursDisponibles.find(
    (c) => normaliser(c.ueNom) === normaliser(ueTexte)
  );
  const enseignantTrouve = enseignantsRef.find(
    (e) =>
      normaliser(e.nom) === normaliser(enseignantTexte) ||
      normaliser(e.matricule) === normaliser(enseignantTexte)
  );
  return {
    offreId: coursTrouve?.offreId ?? null,
    ueResolueNom: coursTrouve?.ueNom ?? null,
    enseignantId: enseignantTrouve?.id ?? null,
    attributionExistanteId: coursTrouve?.attributionId ?? null,
    enseignantActuelNom: coursTrouve?.enseignantNom ?? null,
    troncCommun: coursTrouve?.troncCommun ?? null,
  };
}

function normaliser(s: string): string {
  return s.trim().toLowerCase();
}
function cycleKeyDe(cycle: string, sousCycle: string | null): string {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null): string {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

// Écran Scénario 2, Mode B — Import Excel des attributions (journal.md)
// Spécialité + Semestre choisis d'abord (cascade École→Filière→Cycle→
// Spécialité), puis fichier "Intitulé UE | Enseignant". Écrasement
// automatique des attributions existantes à la validation (pas de
// confirmation ligne par ligne, juste un signalement visuel avant).
export default function ImporterAttributionsPage() {
  const navigate = useNavigate();

  // Sélection du contexte (même cascade que RepartitionPage)
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

  const [etape, setEtape] = useState<
    'contexte' | 'depot' | 'preview' | 'resultat'
  >('contexte');
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [coursRef, setCoursRef] = useState<CoursAAttribuer[]>([]);
  const [enseignantsRef, setEnseignantsRef] = useState<EnseignantRef[]>([]);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);

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

  function telechargerModele() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Intitulé UE', 'Enseignant'],
      ['Algorithmique et structures de données', 'Jean Kamdem'],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Attributions');
    XLSX.writeFile(classeur, 'modele_import_attributions.xlsx');
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreurFichier(null);

    const [coursDisponibles, { data: enseignantsData }] = await Promise.all([
      listCoursPourSpecialiteSemestre(specialiteId, semestre),
      supabase.from('enseignants').select('id, nom, matricule'),
    ]);
    const enseignantsList = (enseignantsData ?? []) as EnseignantRef[];
    setCoursRef(coursDisponibles);
    setEnseignantsRef(enseignantsList);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const classeur = XLSX.read(data, { type: 'binary' });
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignesBrutes: Record<string, string>[] = XLSX.utils.sheet_to_json(
          feuille,
          { defval: '' }
        );

        if (lignesBrutes.length === 0) {
          setErreurFichier('Le fichier ne contient aucune ligne de données.');
          return;
        }

        const attendues = ['Intitulé UE', 'Enseignant'];
        const colonnes = Object.keys(lignesBrutes[0]);
        const manquantes = attendues.filter((c) => !colonnes.includes(c));
        if (manquantes.length > 0) {
          setErreurFichier(
            `Colonne(s) manquante(s) : ${manquantes.join(', ')}`
          );
          return;
        }

        const parsed: LigneImport[] = lignesBrutes.map((row, i) => {
          const ueTexte = String(row['Intitulé UE'] ?? '').trim();
          const enseignantTexte = String(row['Enseignant'] ?? '').trim();
          const resolu = resoudreLigne(
            ueTexte,
            enseignantTexte,
            coursDisponibles,
            enseignantsList
          );

          return {
            key: `${i}-${Date.now()}`,
            ueTexte,
            enseignantTexte,
            ...resolu,
          };
        });

        setLignes(parsed);
        setEtape('preview');
      } catch {
        setErreurFichier(
          "Impossible de lire ce fichier. Vérifie qu'il s'agit bien d'un .xlsx valide."
        );
      }
    };
    reader.readAsBinaryString(fichier);
  }

  function updateLigneOffre(key: string, offreId: string) {
    const cours = coursRef.find((c) => c.offreId === offreId);
    setLignes((prev) =>
      prev.map((l) =>
        l.key !== key
          ? l
          : {
              ...l,
              ueTexte: cours?.ueNom ?? l.ueTexte,
              offreId: cours?.offreId ?? null,
              ueResolueNom: cours?.ueNom ?? null,
              attributionExistanteId: cours?.attributionId ?? null,
              enseignantActuelNom: cours?.enseignantNom ?? null,
              troncCommun: cours?.troncCommun ?? null,
            }
      )
    );
  }

  function updateLigneEnseignant(key: string, enseignantId: string) {
    const enseignant = enseignantsRef.find((e) => e.id === enseignantId);
    setLignes((prev) =>
      prev.map((l) =>
        l.key !== key
          ? l
          : {
              ...l,
              enseignantTexte: enseignant?.nom ?? l.enseignantTexte,
              enseignantId: enseignant?.id ?? null,
            }
      )
    );
  }

  function supprimerLigne(key: string) {
    setLignes((prev) => prev.filter((l) => l.key !== key));
  }

  const compteParOffre = new Map<string, number>();
  for (const l of lignes) {
    if (l.offreId)
      compteParOffre.set(l.offreId, (compteParOffre.get(l.offreId) ?? 0) + 1);
  }
  function estEnDoublon(l: LigneImport): boolean {
    return !!l.offreId && (compteParOffre.get(l.offreId) ?? 0) > 1;
  }

  const nbValides = lignes.filter(
    (l) => l.offreId && l.enseignantId && !estEnDoublon(l)
  ).length;

  async function handleValiderImport() {
    setImportEnCours(true);
    setEtape('resultat');

    for (const ligne of lignes) {
      if (!ligne.offreId || !ligne.enseignantId) {
        setLignes((prev) =>
          prev.map((x) =>
            x.key === ligne.key
              ? {
                  ...x,
                  statut: 'erreur',
                  erreurMessage: 'UE ou enseignant non reconnu',
                }
              : x
          )
        );
        continue;
      }
      if (estEnDoublon(ligne)) {
        setLignes((prev) =>
          prev.map((x) =>
            x.key === ligne.key
              ? {
                  ...x,
                  statut: 'erreur',
                  erreurMessage: 'UE en doublon dans le fichier — ignorée',
                }
              : x
          )
        );
        continue;
      }

      setLignes((prev) =>
        prev.map((x) =>
          x.key === ligne.key ? { ...x, statut: 'en_cours' } : x
        )
      );
      try {
        await attribuerCoursEtGroupe(
          {
            offreId: ligne.offreId,
            ueId: '',
            ueNom: ligne.ueResolueNom ?? '',
            attributionId: ligne.attributionExistanteId,
            enseignantId: null,
            enseignantNom: ligne.enseignantActuelNom,
            troncCommun: ligne.troncCommun,
          },
          ligne.enseignantId
        );
        setLignes((prev) =>
          prev.map((x) => (x.key === ligne.key ? { ...x, statut: 'ok' } : x))
        );
      } catch (err) {
        setLignes((prev) =>
          prev.map((x) =>
            x.key === ligne.key
              ? {
                  ...x,
                  statut: 'erreur',
                  erreurMessage:
                    err instanceof Error ? err.message : 'Erreur inconnue',
                }
              : x
          )
        );
      }
    }

    setImportEnCours(false);
  }

  // ── Étape 0 : contexte (Spécialité + Semestre) ───────────────────
  if (etape === 'contexte') {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/repartition')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> Retour à la répartition
        </button>

        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Importer des attributions
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Choisis d'abord la Spécialité et le Semestre concernés.
        </p>

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
              onChange={(e) => {
                setCycleKey(e.target.value);
                setSpecialiteId('');
                setSemestre('');
              }}
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
              onChange={(e) => {
                setSpecialiteId(e.target.value);
                setSemestre('');
              }}
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

        <button
          onClick={() => setEtape('depot')}
          disabled={!specialiteId || !semestre}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Continuer
        </button>
      </div>
    );
  }

  // ── Étape 1 : dépôt du fichier ────────────────────────────────────
  if (etape === 'depot') {
    return (
      <div className="max-w-md mx-auto">
        <button
          onClick={() => setEtape('contexte')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> Retour
        </button>

        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Importer des attributions
        </p>
        <p className="text-sm text-gray-400 mb-6">
          {specialiteChoisie?.nom} — {semestre}. Colonnes attendues : Intitulé
          UE, Enseignant (nom ou matricule).
        </p>

        <button
          onClick={telechargerModele}
          className="flex items-center gap-2 text-sm font-bold text-red-600 mb-5"
        >
          <Download size={15} /> Télécharger le modèle
        </button>

        <label className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-dashed border-gray-200 rounded-[20px] p-10 cursor-pointer hover:border-red-300 transition-colors">
          <UploadCloud size={28} className="text-gray-300" />
          <p className="text-sm font-bold text-gray-700">
            Choisir un fichier .xlsx
          </p>
          <p className="text-xs text-gray-400">ou glisse-dépose ici</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFichier}
            className="hidden"
          />
        </label>

        {erreurFichier && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4">
            <p className="text-sm font-bold text-red-600">{erreurFichier}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Étape 2 : prévisualisation ─────────────────────────────────────
  if (etape === 'preview') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <p className="font-extrabold text-2xl text-gray-900">
              Prévisualisation de l'import
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {lignes.length} ligne(s) détectée(s), {nbValides} prête(s) à
              importer
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEtape('depot')}
              className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleValiderImport}
              disabled={nbValides === 0}
              className="bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Valider l'import
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {lignes.map((l) => {
            const doublon = estEnDoublon(l);
            const nonReconnue = !l.offreId || !l.enseignantId;
            const vaEcraser =
              l.offreId &&
              l.enseignantId &&
              l.attributionExistanteId &&
              !doublon;

            return (
              <div
                key={l.key}
                className={`rounded-2xl p-4 ${
                  doublon
                    ? 'bg-red-50 ring-1 ring-red-200'
                    : nonReconnue
                    ? 'bg-orange-50'
                    : vaEcraser
                    ? 'bg-amber-50'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px] grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 mb-1">
                        UE
                      </p>
                      <select
                        value={l.offreId ?? ''}
                        onChange={(e) =>
                          updateLigneOffre(l.key, e.target.value)
                        }
                        className="w-full text-sm font-bold text-gray-900 outline-none bg-transparent"
                      >
                        <option value="">
                          {l.offreId ? '' : `— non reconnue : "${l.ueTexte}" —`}
                        </option>
                        {coursRef.map((c) => (
                          <option key={c.offreId} value={c.offreId}>
                            {c.ueNom}
                          </option>
                        ))}
                      </select>
                      {!l.offreId && (
                        <p className="text-[10px] text-orange-600 font-bold mt-0.5">
                          UE non reconnue
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 mb-1">
                        Enseignant
                      </p>
                      <select
                        value={l.enseignantId ?? ''}
                        onChange={(e) =>
                          updateLigneEnseignant(l.key, e.target.value)
                        }
                        className="w-full text-sm font-semibold text-gray-700 outline-none bg-transparent"
                      >
                        <option value="">
                          {l.enseignantId
                            ? ''
                            : `— non reconnu : "${l.enseignantTexte}" —`}
                        </option>
                        {enseignantsRef.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nom} ({e.matricule})
                          </option>
                        ))}
                      </select>
                      {!l.enseignantId && (
                        <p className="text-[10px] text-orange-600 font-bold mt-0.5">
                          Enseignant non reconnu
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {doublon && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                        <AlertTriangle size={12} />
                        UE en doublon dans le fichier
                      </span>
                    )}
                    {vaEcraser && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                        <AlertTriangle size={12} />
                        Remplace : {l.enseignantActuelNom}
                      </span>
                    )}
                    <button
                      onClick={() => supprimerLigne(l.key)}
                      className="text-gray-300 hover:text-red-600 p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          En rouge : UE en doublon dans le fichier (ligne ignorée — corrige ou
          supprime). En orange : UE ou enseignant non reconnu (ligne ignorée).
          En jaune : l'attribution existante sera remplacée.
        </p>
      </div>
    );
  }

  // ── Étape 3 : résultat ───────────────────────────────────────────
  const termine = !importEnCours;
  const nbOk = lignes.filter((l) => l.statut === 'ok').length;
  const nbErreur = lignes.filter((l) => l.statut === 'erreur').length;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Import en cours
      </p>
      <p className="text-sm text-gray-400 mb-6">
        {termine
          ? `Terminé : ${nbOk} attribuée(s), ${nbErreur} en erreur.`
          : 'Attribution en cours...'}
      </p>

      <div className="bg-white rounded-[20px] overflow-hidden">
        {lignes.map((l) => (
          <div
            key={l.key}
            className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0"
          >
            {l.statut === 'ok' && (
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
            )}
            {l.statut === 'erreur' && (
              <XCircle size={16} className="text-red-500 shrink-0" />
            )}
            {l.statut === 'en_cours' && (
              <Loader2
                size={16}
                className="animate-spin text-gray-300 shrink-0"
              />
            )}
            {!l.statut && <div className="w-4 h-4 shrink-0" />}
            <p className="text-sm font-semibold text-gray-900 flex-1 truncate">
              {l.ueTexte}
            </p>
            {l.erreurMessage && (
              <p className="text-xs text-gray-400">{l.erreurMessage}</p>
            )}
          </div>
        ))}
      </div>

      {termine && (
        <button
          onClick={() => navigate('/repartition')}
          className="mt-5 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la répartition
        </button>
      )}
    </div>
  );
}
