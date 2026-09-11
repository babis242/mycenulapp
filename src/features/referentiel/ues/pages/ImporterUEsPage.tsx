// src/features/referentiel/ues/pages/ImporterUEsPage.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Download,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createUE, createEcole, createFiliere, createSpecialite } from '../api';
import { CYCLES, SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import type { TypeCursus } from '@/types';

interface EcoleRef {
  id: string;
  nom: string;
}
interface FiliereRef {
  id: string;
  nom: string;
  ecole_id: string;
}
interface SpecialiteRef {
  id: string;
  nom: string;
  filiere_id: string;
  cycle: string;
  sous_cycle: string | null;
  type_cursus: TypeCursus;
}

interface LigneUE {
  key: string;
  nom: string;
  code: string;
  volumeHoraire: string;
  coefficient: string;
  ecoleTexte: string;
  filiereTexte: string;
  cycleTexte: string;
  specialiteTexte: string;
  semestre: string;
  ecoleId: string | null;
  filiereId: string | null;
  specialiteId: string | null;
  statut?: 'ok' | 'erreur' | 'en_cours';
  erreurMessage?: string;
}

type ModalCreation =
  | { type: 'ecole'; ligneKey: string }
  | { type: 'filiere'; ligneKey: string; ecoleId: string; ecoleNom: string }
  | {
      type: 'specialite';
      ligneKey: string;
      filiereId: string;
      filiereNom: string;
    }
  | null;

function normaliser(s: string): string {
  return s.trim().toLowerCase();
}
function labelCycle(cycle: string, sousCycle: string | null): string {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

function ModaleCreation({
  modal,
  onClose,
  onCreerEcole,
  onCreerFiliere,
  onCreerSpecialite,
}: {
  modal: ModalCreation;
  onClose: () => void;
  onCreerEcole: (nom: string) => Promise<void>;
  onCreerFiliere: (nom: string) => Promise<void>;
  onCreerSpecialite: (
    nom: string,
    cycle: string,
    sousCycle: string,
    typeCursus: TypeCursus
  ) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [cycle, setCycle] = useState<string>('BTS');
  const [cyclePersonnalise, setCyclePersonnalise] = useState('');
  const [sousCycle, setSousCycle] = useState('');
  const [typeCursus, setTypeCursus] = useState<TypeCursus>('standard');
  const [saving, setSaving] = useState(false);

  if (!modal) return null;
  const titre =
    modal.type === 'ecole'
      ? 'Nouvelle école'
      : modal.type === 'filiere'
      ? 'Nouvelle filière'
      : 'Nouvelle spécialité';

  async function handleValider() {
    if (!nom.trim() || !modal) return;
    setSaving(true);
    try {
      if (modal.type === 'ecole') await onCreerEcole(nom.trim());
      else if (modal.type === 'filiere') await onCreerFiliere(nom.trim());
      else
        await onCreerSpecialite(
          nom.trim(),
          cycle === '__autre__' ? cyclePersonnalise.trim() : cycle,
          sousCycle.trim(),
          typeCursus
        );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="font-extrabold text-base text-gray-900">{titre}</p>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        {modal.type === 'filiere' && (
          <p className="text-xs text-gray-400 mb-3">
            École :{' '}
            <span className="font-semibold text-gray-600">
              {modal.ecoleNom}
            </span>
          </p>
        )}
        {modal.type === 'specialite' && (
          <p className="text-xs text-gray-400 mb-3">
            Filière :{' '}
            <span className="font-semibold text-gray-600">
              {modal.filiereNom}
            </span>
          </p>
        )}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Nom *
            </label>
            <input
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>
          {modal.type === 'specialite' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  Cycle *
                </label>
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__autre__">Autre (préciser)...</option>
                </select>
              </div>
              {cycle === '__autre__' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    Nom du nouveau cycle *
                  </label>
                  <input
                    value={cyclePersonnalise}
                    onChange={(e) => setCyclePersonnalise(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  Sous-cycle{' '}
                  <span className="text-gray-300 font-normal">(optionnel)</span>
                </label>
                <input
                  value={sousCycle}
                  onChange={(e) => setSousCycle(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  Type de cursus *
                </label>
                <select
                  value={typeCursus}
                  onChange={(e) => setTypeCursus(e.target.value as TypeCursus)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                >
                  <option value="standard">Standard</option>
                  <option value="sante_culinaire">Santé / Culinaire</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={handleValider}
            disabled={
              !nom.trim() ||
              saving ||
              (modal.type === 'specialite' &&
                cycle === '__autre__' &&
                !cyclePersonnalise.trim())
            }
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Créer
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Écran 1.3 / 1.4 — Import Excel des UEs (ecrans_ui.md)
// Une ligne = une UE = une spécialité (plus de regroupement multi-offres —
// le tronc commun se fait a posteriori via Référentiel → Jumelages).
export default function ImporterUEsPage() {
  const navigate = useNavigate();

  const [etape, setEtape] = useState<'depot' | 'preview' | 'resultat'>('depot');
  const [lignes, setLignes] = useState<LigneUE[]>([]);
  const [ecoles, setEcoles] = useState<EcoleRef[]>([]);
  const [filieres, setFilieres] = useState<FiliereRef[]>([]);
  const [specialites, setSpecialites] = useState<SpecialiteRef[]>([]);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [modal, setModal] = useState<ModalCreation>(null);

  function telechargerModele() {
    const feuille = XLSX.utils.aoa_to_sheet([
      [
        'Nom UE',
        'Code UE',
        'Volume horaire',
        'Coefficient',
        'École',
        'Filière',
        'Cycle',
        'Spécialité',
        'Semestre',
      ],
      [
        'Algorithmique',
        'ALG101',
        '60',
        '3',
        "Institut Supérieur de l'Industrie...",
        'Génie Informatique, Réseaux et Télécommunications',
        'BTS',
        'Génie logiciel',
        'S1',
      ],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'UEs');
    XLSX.writeFile(classeur, 'modele_import_ues.xlsx');
  }

  function resoudre(
    ecoleTexte: string,
    filiereTexte: string,
    cycleTexte: string,
    specialiteTexte: string,
    ecolesRef: EcoleRef[],
    filieresRef: FiliereRef[],
    specialitesRef: SpecialiteRef[]
  ) {
    const ecole = ecolesRef.find(
      (e) => normaliser(e.nom) === normaliser(ecoleTexte)
    );
    const filiere = ecole
      ? filieresRef.find(
          (f) =>
            f.ecole_id === ecole.id &&
            normaliser(f.nom) === normaliser(filiereTexte)
        )
      : undefined;
    let specialite: SpecialiteRef | undefined;
    if (filiere) {
      const candidats = specialitesRef.filter(
        (s) =>
          s.filiere_id === filiere.id &&
          normaliser(s.nom) === normaliser(specialiteTexte)
      );
      if (candidats.length === 1) specialite = candidats[0];
      else if (candidats.length > 1)
        specialite = candidats.find((s) =>
          normaliser(labelCycle(s.cycle, s.sous_cycle)).includes(
            normaliser(cycleTexte)
          )
        );
    }
    return {
      ecoleId: ecole?.id ?? null,
      filiereId: filiere?.id ?? null,
      specialiteId: specialite?.id ?? null,
    };
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreurFichier(null);

    const [
      { data: ecolesData },
      { data: filieresData },
      { data: specialitesData },
    ] = await Promise.all([
      supabase.from('ecoles').select('id, nom'),
      supabase.from('filieres').select('id, nom, ecole_id'),
      supabase
        .from('specialites')
        .select('id, nom, filiere_id, cycle, sous_cycle, type_cursus'),
    ]);
    const ecolesRef = ecolesData ?? [];
    const filieresRef = filieresData ?? [];
    const specialitesRef = (specialitesData ?? []) as SpecialiteRef[];
    setEcoles(ecolesRef);
    setFilieres(filieresRef);
    setSpecialites(specialitesRef);

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

        const attendues = [
          'Nom UE',
          'École',
          'Filière',
          'Spécialité',
          'Semestre',
        ];
        const colonnes = Object.keys(lignesBrutes[0]);
        const manquantes = attendues.filter((c) => !colonnes.includes(c));
        if (manquantes.length > 0) {
          setErreurFichier(
            `Colonne(s) manquante(s) : ${manquantes.join(', ')}`
          );
          return;
        }

        const parsed: LigneUE[] = lignesBrutes.map((row, i) => {
          const ecoleTexte = String(row['École'] ?? '').trim();
          const filiereTexte = String(row['Filière'] ?? '').trim();
          const cycleTexte = String(row['Cycle'] ?? '').trim();
          const specialiteTexte = String(row['Spécialité'] ?? '').trim();
          const resolu = resoudre(
            ecoleTexte,
            filiereTexte,
            cycleTexte,
            specialiteTexte,
            ecolesRef,
            filieresRef,
            specialitesRef
          );

          return {
            key: `${i}-${Date.now()}`,
            nom: String(row['Nom UE'] ?? '').trim(),
            code: String(row['Code UE'] ?? '').trim(),
            volumeHoraire: String(row['Volume horaire'] ?? '').trim(),
            coefficient: String(row['Coefficient'] ?? '').trim(),
            ecoleTexte,
            filiereTexte,
            cycleTexte,
            specialiteTexte,
            semestre: String(row['Semestre'] ?? '').trim(),
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

  function updateLigne(key: string, patch: Partial<LigneUE>) {
    setLignes((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  async function handleCreerEcole(nom: string) {
    if (modal?.type !== 'ecole') return;
    const ecole = await createEcole(nom);
    setEcoles((prev) => [...prev, ecole]);
    updateLigne(modal.ligneKey, {
      ecoleId: ecole.id,
      filiereId: null,
      specialiteId: null,
    });
    setModal(null);
  }

  async function handleCreerFiliere(nom: string) {
    if (modal?.type !== 'filiere') return;
    const filiere = await createFiliere(nom, modal.ecoleId);
    setFilieres((prev) => [...prev, filiere]);
    updateLigne(modal.ligneKey, { filiereId: filiere.id, specialiteId: null });
    setModal(null);
  }

  async function handleCreerSpecialite(
    nom: string,
    cycle: string,
    sousCycle: string,
    typeCursus: TypeCursus
  ) {
    if (modal?.type !== 'specialite') return;
    const specialite = await createSpecialite(
      nom,
      modal.filiereId,
      cycle,
      typeCursus
    );
    if (sousCycle)
      await supabase
        .from('specialites')
        .update({ sous_cycle: sousCycle })
        .eq('id', specialite.id);
    setSpecialites((prev) => [
      ...prev,
      { ...specialite, sous_cycle: sousCycle || null },
    ]);
    updateLigne(modal.ligneKey, { specialiteId: specialite.id });
    setModal(null);
  }

  function supprimerLigne(key: string) {
    setLignes((prev) => prev.filter((l) => l.key !== key));
  }

  const nbValides = lignes.filter(
    (l) => l.nom.trim() && l.specialiteId && l.semestre
  ).length;

  async function handleValiderImport() {
    setImportEnCours(true);
    setEtape('resultat');

    for (const l of lignes) {
      if (!l.nom.trim() || !l.specialiteId || !l.semestre) {
        setLignes((prev) =>
          prev.map((x) =>
            x.key === l.key
              ? {
                  ...x,
                  statut: 'erreur',
                  erreurMessage: 'UE invalide ou spécialité non résolue',
                }
              : x
          )
        );
        continue;
      }
      setLignes((prev) =>
        prev.map((x) => (x.key === l.key ? { ...x, statut: 'en_cours' } : x))
      );
      try {
        await createUE({
          nom: l.nom.trim(),
          code: l.code.trim() || undefined,
          volume_horaire: l.volumeHoraire ? Number(l.volumeHoraire) : undefined,
          coefficient: l.coefficient ? Number(l.coefficient) : undefined,
          specialite_id: l.specialiteId,
          semestre: l.semestre,
        });
        setLignes((prev) =>
          prev.map((x) => (x.key === l.key ? { ...x, statut: 'ok' } : x))
        );
      } catch (err) {
        setLignes((prev) =>
          prev.map((x) =>
            x.key === l.key
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

  // ── Étape 1 : dépôt ──────────────────────────────────────────────
  if (etape === 'depot') {
    return (
      <div className="max-w-md mx-auto">
        <button
          onClick={() => navigate('/referentiel/ues')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </button>
        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Importer des UEs
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Une ligne = une UE = une spécialité.
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

        <div className="flex flex-col gap-3">
          {lignes.map((l) => {
            const filieresDeEcole = filieres.filter(
              (f) => f.ecole_id === l.ecoleId
            );
            const specialitesDeFiliere = specialites.filter(
              (s) => s.filiere_id === l.filiereId
            );
            const problematique =
              !l.nom.trim() ||
              !l.ecoleId ||
              !l.filiereId ||
              !l.specialiteId ||
              !l.semestre;

            return (
              <div
                key={l.key}
                className={`rounded-[20px] p-4 ${
                  problematique ? 'bg-orange-50' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <input
                    value={l.nom}
                    onChange={(e) =>
                      updateLigne(l.key, { nom: e.target.value })
                    }
                    placeholder="Nom de l'UE"
                    className="font-extrabold text-base text-gray-900 outline-none bg-transparent flex-1 min-w-0"
                  />
                  <button
                    onClick={() => supprimerLigne(l.key)}
                    className="text-gray-300 hover:text-red-600 shrink-0 ml-2"
                  >
                    <XCircle size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">
                      École
                    </p>
                    {l.ecoleId ? (
                      <select
                        value={l.ecoleId}
                        onChange={(e) =>
                          updateLigne(l.key, {
                            ecoleId: e.target.value,
                            filiereId: null,
                            specialiteId: null,
                          })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent"
                      >
                        {ecoles.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nom}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-orange-600 font-semibold">
                          "{l.ecoleTexte}" non trouvée
                        </span>
                        <select
                          value=""
                          onChange={(e) =>
                            updateLigne(l.key, {
                              ecoleId: e.target.value,
                              filiereId: null,
                              specialiteId: null,
                            })
                          }
                          className="w-full text-xs font-semibold outline-none bg-transparent border border-orange-200 rounded-lg px-2 py-1.5"
                        >
                          <option value="">Associer...</option>
                          {ecoles.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.nom}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({ type: 'ecole', ligneKey: l.key })
                          }
                          className="flex items-center gap-1 text-[11px] font-bold text-red-600 w-fit"
                        >
                          <Plus size={11} /> Créer
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">
                      Filière
                    </p>
                    {l.filiereId ? (
                      <select
                        value={l.filiereId}
                        onChange={(e) =>
                          updateLigne(l.key, {
                            filiereId: e.target.value,
                            specialiteId: null,
                          })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent"
                      >
                        {filieresDeEcole.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nom}
                          </option>
                        ))}
                      </select>
                    ) : l.ecoleId ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-orange-600 font-semibold">
                          "{l.filiereTexte}" non trouvée
                        </span>
                        <select
                          value=""
                          onChange={(e) =>
                            updateLigne(l.key, {
                              filiereId: e.target.value,
                              specialiteId: null,
                            })
                          }
                          className="w-full text-xs font-semibold outline-none bg-transparent border border-orange-200 rounded-lg px-2 py-1.5"
                        >
                          <option value="">Associer...</option>
                          {filieresDeEcole.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.nom}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              type: 'filiere',
                              ligneKey: l.key,
                              ecoleId: l.ecoleId!,
                              ecoleNom:
                                ecoles.find((e) => e.id === l.ecoleId)?.nom ??
                                '',
                            })
                          }
                          className="flex items-center gap-1 text-[11px] font-bold text-red-600 w-fit"
                        >
                          <Plus size={11} /> Créer
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">
                      Spécialité
                    </p>
                    {l.specialiteId ? (
                      <select
                        value={l.specialiteId}
                        onChange={(e) =>
                          updateLigne(l.key, { specialiteId: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent"
                      >
                        {specialitesDeFiliere.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nom} — {labelCycle(s.cycle, s.sous_cycle)}
                          </option>
                        ))}
                      </select>
                    ) : l.filiereId ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-orange-600 font-semibold">
                          "{l.specialiteTexte}" non trouvée
                        </span>
                        <select
                          value=""
                          onChange={(e) =>
                            updateLigne(l.key, { specialiteId: e.target.value })
                          }
                          className="w-full text-xs font-semibold outline-none bg-transparent border border-orange-200 rounded-lg px-2 py-1.5"
                        >
                          <option value="">Associer...</option>
                          {specialitesDeFiliere.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom} — {labelCycle(s.cycle, s.sous_cycle)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              type: 'specialite',
                              ligneKey: l.key,
                              filiereId: l.filiereId!,
                              filiereNom:
                                filieres.find((f) => f.id === l.filiereId)
                                  ?.nom ?? '',
                            })
                          }
                          className="flex items-center gap-1 text-[11px] font-bold text-red-600 w-fit"
                        >
                          <Plus size={11} /> Créer
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">
                      Semestre
                    </p>
                    {l.specialiteId ? (
                      <select
                        value={l.semestre}
                        onChange={(e) =>
                          updateLigne(l.key, { semestre: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent"
                      >
                        <option value="">Choisir...</option>
                        {SEMESTRES_PAR_TYPE_CURSUS[
                          specialites.find((s) => s.id === l.specialiteId)
                            ?.type_cursus ?? 'standard'
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Les lignes orange n'ont pas été reconnues automatiquement — associe
          une valeur existante ou clique "Créer".
        </p>

        <ModaleCreation
          modal={modal}
          onClose={() => setModal(null)}
          onCreerEcole={handleCreerEcole}
          onCreerFiliere={handleCreerFiliere}
          onCreerSpecialite={handleCreerSpecialite}
        />
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
          ? `Terminé : ${nbOk} créée(s), ${nbErreur} en erreur.`
          : 'Création des UEs...'}
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
              {l.nom}
            </p>
            {l.erreurMessage && (
              <p className="text-xs text-gray-400">{l.erreurMessage}</p>
            )}
          </div>
        ))}
      </div>
      {termine && (
        <button
          onClick={() => navigate('/referentiel/ues')}
          className="mt-5 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la liste
        </button>
      )}
    </div>
  );
}
