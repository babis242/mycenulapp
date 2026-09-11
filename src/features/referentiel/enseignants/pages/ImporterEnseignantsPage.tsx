// src/features/referentiel/enseignants/pages/ImporterEnseignantsPage.tsx
import { useRef, useState } from 'react';
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
import { createEnseignant } from '../api';

interface LigneImport {
  key: string;
  nom: string;
  email: string;
  whatsapp: string;
  cellulaire: string;
  statut?: 'ok' | 'erreur' | 'en_cours';
  erreurMessage?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ligneValide(l: LigneImport): boolean {
  return l.nom.trim().length > 0 && EMAIL_REGEX.test(l.email.trim());
}

// Écran 1.3 / 1.4 (adapté aux enseignants) — Import Excel (ecrans_ui.md)
// Étape 1 : dépôt du fichier. Étape 2 : prévisualisation éditable avant
// import réel. Modèle attendu : colonnes Nom, Email, WhatsApp, Cellulaire.
export default function ImporterEnseignantsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [etape, setEtape] = useState<'depot' | 'preview' | 'resultat'>('depot');
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);

  function telechargerModele() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Nom', 'Email', 'WhatsApp', 'Cellulaire'],
      [
        'Jean Kamdem',
        'jean.kamdem@exemple.com',
        '+237600000000',
        '+237600000001',
      ],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Enseignants');
    XLSX.writeFile(classeur, 'modele_import_enseignants.xlsx');
  }

  function handleFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreurFichier(null);

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

        const attendues = ['Nom', 'Email'];
        const colonnes = Object.keys(lignesBrutes[0]);
        const manquantes = attendues.filter((c) => !colonnes.includes(c));
        if (manquantes.length > 0) {
          setErreurFichier(
            `Colonne(s) manquante(s) : ${manquantes.join(', ')}`
          );
          return;
        }

        const parsed: LigneImport[] = lignesBrutes.map((row, i) => ({
          key: `${i}-${Date.now()}`,
          nom: String(row['Nom'] ?? '').trim(),
          email: String(row['Email'] ?? '').trim(),
          whatsapp: String(row['WhatsApp'] ?? '').trim(),
          cellulaire: String(row['Cellulaire'] ?? '').trim(),
        }));

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

  const nbValides = lignes.filter(ligneValide).length;

  async function handleValiderImport() {
    setImportEnCours(true);
    setEtape('resultat');

    for (const ligne of lignes) {
      if (!ligneValide(ligne)) {
        updateLigne(ligne.key, {
          statut: 'erreur',
          erreurMessage: 'Ligne invalide (nom/email manquant)',
        });
        continue;
      }

      updateLigne(ligne.key, { statut: 'en_cours' });
      try {
        const enseignant = await createEnseignant({
          nom: ligne.nom,
          email: ligne.email,
          numero_whatsapp: ligne.whatsapp || undefined,
          numero_cellulaire: ligne.cellulaire || undefined,
        });

        const { error: fnError } = await supabase.functions.invoke(
          'create-enseignant-account',
          {
            body: { enseignantId: enseignant.id },
          }
        );

        updateLigne(ligne.key, {
          statut: 'ok',
          erreurMessage: fnError ? 'Créé, mais email non envoyé' : undefined,
        });
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
          onClick={() => navigate('/referentiel/enseignants')}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> Retour à la liste
        </button>

        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Importer des enseignants
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Fichier Excel (.xlsx), colonnes : Nom, Email, WhatsApp, Cellulaire.
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
            ref={fileInputRef}
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
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Cellulaire</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const valide = ligneValide(l);
                return (
                  <tr
                    key={l.key}
                    className={`border-b border-gray-50 last:border-0 ${
                      !valide ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        value={l.nom}
                        onChange={(e) =>
                          updateLigne(l.key, { nom: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[140px]"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={l.email}
                        onChange={(e) =>
                          updateLigne(l.key, { email: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[180px]"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={l.whatsapp}
                        onChange={(e) =>
                          updateLigne(l.key, { whatsapp: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[130px]"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={l.cellulaire}
                        onChange={(e) =>
                          updateLigne(l.key, { cellulaire: e.target.value })
                        }
                        className="w-full text-sm font-semibold outline-none bg-transparent min-w-[130px]"
                      />
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
          Les lignes surlignées en orange sont invalides (nom ou email
          manquant/incorrect).
        </p>
      </div>
    );
  }

  // ── Étape 3 : résultat de l'import ──────────────────────────────
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
          ? `Terminé : ${nbOk} créé(s), ${nbErreur} en erreur.`
          : 'Création des comptes et envoi des emails...'}
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
              {l.nom || l.email}
            </p>
            {l.erreurMessage && (
              <p className="text-xs text-gray-400">{l.erreurMessage}</p>
            )}
          </div>
        ))}
      </div>

      {termine && (
        <button
          onClick={() => navigate('/referentiel/enseignants')}
          className="mt-5 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la liste
        </button>
      )}
    </div>
  );
}
