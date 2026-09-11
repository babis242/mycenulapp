// src/features/referentiel/salles/pages/ImporterSallesPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Download,
  ArrowLeft,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createSalle } from '../api';

interface Specialite {
  id: string;
  nom: string;
}

interface LigneImport {
  key: string;
  codeSalle: string;
  capacite: string;
  specialiteNom: string;
  specialiteId: string | null; // résolu automatiquement si un nom correspond exactement
  statut?: 'ok' | 'erreur' | 'en_cours';
  erreurMessage?: string;
}

function capaciteValide(l: LigneImport): boolean {
  const n = Number(l.capacite);
  return Number.isInteger(n) && n > 0;
}

function ligneValide(
  l: LigneImport,
  codesExistants: Set<string>,
  codesVus: Map<string, number>
): boolean {
  if (!l.codeSalle.trim() || !capaciteValide(l) || !l.specialiteId)
    return false;
  const code = l.codeSalle.trim().toLowerCase();
  if (codesExistants.has(code)) return false; // doublon avec un code déjà en base
  if ((codesVus.get(code) ?? 0) > 1) return false; // doublon dans le fichier lui-même
  return true;
}

// Écran 1.12 / 1.13 (Salles) — Import Excel (ecrans_ui.md)
// Modèle attendu : colonnes "Code salle", "Capacité", "Spécialité par défaut"
// (le nom doit correspondre exactement à une spécialité existante — sinon
// signalé en orange avec une liste déroulante pour l'associer manuellement).
export default function ImporterSallesPage() {
  const navigate = useNavigate();

  const [etape, setEtape] = useState<'depot' | 'preview' | 'resultat'>('depot');
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [specialites, setSpecialites] = useState<Specialite[]>([]);
  const [codesExistants, setCodesExistants] = useState<Set<string>>(new Set());
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);

  function telechargerModele() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Code salle', 'Capacité', 'Spécialité par défaut'],
      ['A101', '40', 'Génie logiciel'],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Salles');
    XLSX.writeFile(classeur, 'modele_import_salles.xlsx');
  }

  async function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreurFichier(null);

    // Charge le référentiel nécessaire à la résolution des spécialités et
    // des doublons AVANT de parser le fichier.
    const [{ data: specialitesData }, { data: sallesData }] = await Promise.all(
      [
        supabase.from('specialites').select('id, nom'),
        supabase.from('salles').select('code_salle'),
      ]
    );
    const specs = specialitesData ?? [];
    setSpecialites(specs);
    setCodesExistants(
      new Set((sallesData ?? []).map((s) => s.code_salle.toLowerCase()))
    );

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

        const attendues = ['Code salle', 'Capacité', 'Spécialité par défaut'];
        const colonnes = Object.keys(lignesBrutes[0]);
        const manquantes = attendues.filter((c) => !colonnes.includes(c));
        if (manquantes.length > 0) {
          setErreurFichier(
            `Colonne(s) manquante(s) : ${manquantes.join(', ')}`
          );
          return;
        }

        const parsed: LigneImport[] = lignesBrutes.map((row, i) => {
          const nomSpecialite = String(
            row['Spécialité par défaut'] ?? ''
          ).trim();
          const trouvee = specs.find(
            (s) => s.nom.toLowerCase() === nomSpecialite.toLowerCase()
          );
          return {
            key: `${i}-${Date.now()}`,
            codeSalle: String(row['Code salle'] ?? '').trim(),
            capacite: String(row['Capacité'] ?? '').trim(),
            specialiteNom: nomSpecialite,
            specialiteId: trouvee?.id ?? null,
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

  function updateLigne(key: string, patch: Partial<LigneImport>) {
    setLignes((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function supprimerLigne(key: string) {
    setLignes((prev) => prev.filter((l) => l.key !== key));
  }

  const codesVus = new Map<string, number>();
  for (const l of lignes) {
    const c = l.codeSalle.trim().toLowerCase();
    if (c) codesVus.set(c, (codesVus.get(c) ?? 0) + 1);
  }
  const nbValides = lignes.filter((l) =>
    ligneValide(l, codesExistants, codesVus)
  ).length;

  async function handleValiderImport() {
    setImportEnCours(true);
    setEtape('resultat');

    for (const ligne of lignes) {
      if (!ligneValide(ligne, codesExistants, codesVus)) {
        updateLigne(ligne.key, {
          statut: 'erreur',
          erreurMessage: 'Ligne invalide ou doublon',
        });
        continue;
      }

      updateLigne(ligne.key, { statut: 'en_cours' });
      try {
        await createSalle({
          code_salle: ligne.codeSalle.trim(),
          capacite: Number(ligne.capacite),
          specialite_par_defaut_id: ligne.specialiteId!,
        });
        updateLigne(ligne.key, { statut: 'ok' });
      } catch (err) {
        updateLigne(ligne.key, {
          statut: 'erreur',
          erreurMessage: err instanceof Error ? err.message : 'Erreur inconnue',
        });
      }
    }

    setImportEnCours(false);
  }

  // ── Étape 1 : dépôt du fichier ──────────────────────────────────
  if (etape === 'depot') {
    return (
      <div className="max-w-md mx-auto">
        <button
          onClick={() => navigate('/referentiel/salles')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </button>

        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Importer des salles
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Fichier Excel (.xlsx), colonnes : Code salle, Capacité, Spécialité par
          défaut.
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

  // ── Étape 2 : prévisualisation éditable ─────────────────────────
  if (etape === 'preview') {
    return (
      <div>
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <p className="font-extrabold text-2xl text-gray-900">
              Prévisualisation de l'import
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {lignes.length} ligne(s) détectée(s), {nbValides} valide(s)
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

        <div className="bg-white rounded-[20px] overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Code salle</th>
                <th className="px-4 py-3">Capacité</th>
                <th className="px-4 py-3">Spécialité par défaut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const code = l.codeSalle.trim().toLowerCase();
                const doublon =
                  codesExistants.has(code) || (codesVus.get(code) ?? 0) > 1;
                const problematique =
                  !l.codeSalle.trim() ||
                  !capaciteValide(l) ||
                  !l.specialiteId ||
                  doublon;

                return (
                  <tr
                    key={l.key}
                    className={`border-b border-gray-50 last:border-0 ${
                      problematique ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        value={l.codeSalle}
                        onChange={(e) =>
                          updateLigne(l.key, { codeSalle: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[100px]"
                      />
                      {doublon && (
                        <p className="text-[10px] text-orange-600 font-bold mt-0.5">
                          Code déjà utilisé
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={l.capacite}
                        onChange={(e) =>
                          updateLigne(l.key, { capacite: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[80px]"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={l.specialiteId ?? ''}
                        onChange={(e) =>
                          updateLigne(l.key, {
                            specialiteId: e.target.value || null,
                          })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[220px]"
                      >
                        <option value="">
                          {l.specialiteNom
                            ? `— non reconnue : "${l.specialiteNom}" —`
                            : 'Sélectionner...'}
                        </option>
                        {specialites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => supprimerLigne(l.key)}
                        className="text-gray-300 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Les lignes surlignées en orange nécessitent une correction (code
          dupliqué, capacité invalide, ou spécialité non reconnue à associer
          manuellement).
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
          ? `Terminé : ${nbOk} créée(s), ${nbErreur} en erreur.`
          : 'Création des salles...'}
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
              {l.codeSalle}
            </p>
            {l.erreurMessage && (
              <p className="text-xs text-gray-400">{l.erreurMessage}</p>
            )}
          </div>
        ))}
      </div>

      {termine && (
        <button
          onClick={() => navigate('/referentiel/salles')}
          className="mt-5 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la liste
        </button>
      )}
    </div>
  );
}
