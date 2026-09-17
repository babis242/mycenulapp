// src/features/referentiel/etudiants/pages/EtudiantsPage.tsx
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  Search,
  X,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import type { Specialite } from '@/types';
import {
  listEtudiants,
  lireEtudiantsDepuisCache,
  ajouterEtudiants,
  supprimerEtudiant,
  type Etudiant,
  type NouvelEtudiant,
} from '../api';

interface Ecole {
  id: string;
  nom: string;
}
interface Filiere {
  id: string;
  nom: string;
  ecole_id: string;
}

// Écran Scénario 11 — Liste des étudiants, rattachée à une spécialité +
// un semestre précis (plus fin qu'un niveau — un niveau regroupe 2
// semestres). Même cascade École → Filière → Cycle → Spécialité que les
// autres écrans du référentiel, + le semestre en plus.
export default function EtudiantsPage() {
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

  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [chargement, setChargement] = useState(false);
  const [depuisCache, setDepuisCache] = useState(false);
  const [recherche, setRecherche] = useState('');

  const [modeAjout, setModeAjout] = useState<'manuel' | 'excel' | null>(null);
  const [lignesManuelles, setLignesManuelles] = useState<NouvelEtudiant[]>([
    { matricule: '', nom_complet: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [messageAjout, setMessageAjout] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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

  async function handleEcoleChange(id: string) {
    setEcoleId(id);
    setFiliereId('');
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    setEtudiants([]);
    if (id && !filieresByEcole[id]) {
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
  }

  async function handleFiliereChange(id: string) {
    setFiliereId(id);
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    setEtudiants([]);
    if (id && !specialitesByFiliere[id]) {
      if (navigator.onLine) {
        const { data } = await supabase
          .from('specialites')
          .select('id, nom, filiere_id, cycle, sous_cycle, type_cursus')
          .eq('filiere_id', id)
          .order('nom');
        setSpecialitesByFiliere((prev) => ({
          ...prev,
          [id]: (data ?? []) as Specialite[],
        }));
      } else {
        const data = await db.specialites
          .where('filiere_id')
          .equals(id)
          .toArray();
        setSpecialitesByFiliere((prev) => ({
          ...prev,
          [id]: (data as Specialite[]).sort((a, b) =>
            a.nom.localeCompare(b.nom)
          ),
        }));
      }
    }
  }

  const filieres = filieresByEcole[ecoleId] ?? [];
  const specialitesDeFiliere = specialitesByFiliere[filiereId] ?? [];
  const cycles = Array.from(
    new Set(specialitesDeFiliere.map((s) => s.cycle))
  ).map((cycle) => ({
    key: cycle,
    label: cycle,
  }));
  const specialitesDuCycle = specialitesDeFiliere.filter(
    (s) => s.cycle === cycleKey
  );
  const specialiteChoisie = specialitesDuCycle.find(
    (s) => s.id === specialiteId
  );
  const semestresDisponibles = specialiteChoisie
    ? SEMESTRES_PAR_TYPE_CURSUS[specialiteChoisie.type_cursus]
    : [];

  async function charger() {
    if (!specialiteId || !semestre) return;
    setChargement(true);
    setErreur(null);
    let aDesDonneesLocales = false;
    try {
      const local = await lireEtudiantsDepuisCache(specialiteId, semestre);
      if (local.length > 0) {
        setEtudiants(local);
        setDepuisCache(true);
        aDesDonneesLocales = true;
      }
    } catch {
      /* pas grave */
    }
    if (!navigator.onLine) {
      setChargement(false);
      return;
    }
    try {
      const frais = await listEtudiants(specialiteId, semestre);
      setEtudiants(frais);
      setDepuisCache(false);
    } catch (err) {
      if (!aDesDonneesLocales) {
        setErreur(
          err instanceof Error ? err.message : 'Erreur de chargement.'
        );
      }
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialiteId, semestre]);

  const filtres = etudiants.filter((e) =>
    recherche.trim()
      ? e.nom_complet.toLowerCase().includes(recherche.toLowerCase()) ||
        e.matricule.toLowerCase().includes(recherche.toLowerCase())
      : true
  );

  function ajouterLigne() {
    setLignesManuelles((prev) => [...prev, { matricule: '', nom_complet: '' }]);
  }

  function modifierLigne(
    index: number,
    champ: keyof NouvelEtudiant,
    valeur: string
  ) {
    setLignesManuelles((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l))
    );
  }

  function retirerLigne(index: number) {
    setLignesManuelles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleEnregistrerManuel() {
    const valides = lignesManuelles.filter(
      (l) => l.matricule.trim() && l.nom_complet.trim()
    );
    if (valides.length === 0) return;
    setSaving(true);
    setMessageAjout(null);
    setErreur(null);
    try {
      const { ajoutes, doublons } = await ajouterEtudiants(
        specialiteId,
        semestre,
        valides
      );
      setMessageAjout(
        `${ajoutes} étudiant(s) ajouté(s)` +
          (doublons > 0 ? `, ${doublons} déjà présent(s) ignoré(s)` : '')
      );
      setLignesManuelles([{ matricule: '', nom_complet: '' }]);
      setModeAjout(null);
      charger();
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'ajout."
      );
    } finally {
      setSaving(false);
    }
  }

  function telechargerModele() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Matricule', 'Nom complet'],
      ['ETU-2026-001', 'Jean Kamdem'],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Étudiants');
    XLSX.writeFile(classeur, 'modele_import_etudiants.xlsx');
  }

  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    setMessageAjout(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const classeur = XLSX.read(data, { type: 'binary' });
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignes: Record<string, string>[] =
          XLSX.utils.sheet_to_json(feuille);

        const aAjouter: NouvelEtudiant[] = lignes
          .map((l) => ({
            matricule: String(l['Matricule'] ?? '').trim(),
            nom_complet: String(l['Nom complet'] ?? '').trim(),
          }))
          .filter((l) => l.matricule && l.nom_complet);

        if (aAjouter.length === 0) {
          setErreur(
            "Aucune ligne valide trouvée (colonnes attendues : Matricule, Nom complet)."
          );
          return;
        }

        setSaving(true);
        const { ajoutes, doublons } = await ajouterEtudiants(
          specialiteId,
          semestre,
          aAjouter
        );
        setMessageAjout(
          `${ajoutes} étudiant(s) importé(s)` +
            (doublons > 0 ? `, ${doublons} déjà présent(s) ignoré(s)` : '')
        );
        setModeAjout(null);
        charger();
      } catch {
        setErreur('Fichier illisible — vérifie le format Excel.');
      } finally {
        setSaving(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(fichier);
  }

  async function handleSupprimer(id: string) {
    if (!window.confirm('Retirer cet étudiant de la liste ?')) return;
    await supprimerEtudiant(id);
    charger();
  }

  return (
    <div>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Étudiants</p>
      <p className="text-sm text-gray-400 mb-6">
        Liste des étudiants par spécialité et semestre — utilisée pour
        l'appel (Scénario 13).
      </p>

      <div className="bg-white rounded-[20px] p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            École
          </label>
          <select
            value={ecoleId}
            onChange={(e) => handleEcoleChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
          >
            <option value="">École...</option>
            {ecoles.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Filière
          </label>
          <select
            value={filiereId}
            onChange={(e) => handleFiliereChange(e.target.value)}
            disabled={!ecoleId}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-50"
          >
            <option value="">Filière...</option>
            {filieres.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Cycle
          </label>
          <select
            value={cycleKey}
            onChange={(e) => {
              setCycleKey(e.target.value);
              setSpecialiteId('');
              setSemestre('');
              setEtudiants([]);
            }}
            disabled={!filiereId}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-50"
          >
            <option value="">Cycle...</option>
            {cycles.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Spécialité
          </label>
          <select
            value={specialiteId}
            onChange={(e) => {
              setSpecialiteId(e.target.value);
              setSemestre('');
              setEtudiants([]);
            }}
            disabled={!cycleKey}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-50"
          >
            <option value="">Spécialité...</option>
            {specialitesDuCycle.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Semestre
          </label>
          <select
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
            disabled={!specialiteId}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-50"
          >
            <option value="">Semestre...</option>
            {semestresDisponibles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!specialiteId || !semestre ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Choisis une spécialité et un semestre pour voir/ajouter des
          étudiants.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <p className="font-extrabold text-gray-900">
                {specialiteChoisie?.nom} — {semestre}
              </p>
              {depuisCache && (
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1">
                  <WifiOff size={12} /> Données locales
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModeAjout('manuel')}
                className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                <Plus size={15} /> Ajouter
              </button>
              <button
                onClick={() => setModeAjout('excel')}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                <UploadCloud size={15} /> Importer Excel
              </button>
            </div>
          </div>

          {messageAjout && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-bold text-green-700">
                {messageAjout}
              </p>
            </div>
          )}
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-bold text-red-600">{erreur}</p>
            </div>
          )}

          {modeAjout === 'manuel' && (
            <div className="bg-white rounded-[20px] p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-extrabold text-gray-900">Ajout manuel</p>
                <button
                  onClick={() => setModeAjout(null)}
                  className="text-gray-300 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {lignesManuelles.map((ligne, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={ligne.matricule}
                      onChange={(e) =>
                        modifierLigne(i, 'matricule', e.target.value)
                      }
                      placeholder="Matricule"
                      className="w-36 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                    />
                    <input
                      value={ligne.nom_complet}
                      onChange={(e) =>
                        modifierLigne(i, 'nom_complet', e.target.value)
                      }
                      placeholder="Nom complet"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                    />
                    {lignesManuelles.length > 1 && (
                      <button
                        onClick={() => retirerLigne(i)}
                        className="text-gray-300 hover:text-red-600 shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={ajouterLigne}
                  className="text-xs font-bold text-red-600"
                >
                  + Ajouter une ligne
                </button>
                <button
                  onClick={handleEnregistrerManuel}
                  disabled={saving}
                  className="ml-auto flex items-center gap-2 bg-red-600 rounded-full px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          {modeAjout === 'excel' && (
            <div className="bg-white rounded-[20px] p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-extrabold text-gray-900">Import Excel</p>
                <button
                  onClick={() => setModeAjout(null)}
                  className="text-gray-300 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Colonnes attendues : <strong>Matricule</strong>,{' '}
                <strong>Nom complet</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={telechargerModele}
                  className="text-xs font-bold text-red-600"
                >
                  Télécharger le modèle
                </button>
              </div>
              <label className="mt-4 flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-red-300">
                <UploadCloud size={18} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-500">
                  {saving ? 'Import en cours...' : 'Choisir un fichier Excel'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  disabled={saving}
                  className="hidden"
                />
              </label>
            </div>
          )}

          <div className="flex mb-4">
            <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
              <Search size={15} className="text-gray-300 shrink-0" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un étudiant..."
                className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-[20px] overflow-hidden">
            {chargement ? (
              <div className="flex items-center justify-center py-16 text-gray-300">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : filtres.length === 0 ? (
              <div className="p-10 text-center text-sm font-semibold text-gray-300">
                Aucun étudiant pour l'instant.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-3">Matricule</th>
                    <th className="px-5 py-3">Nom complet</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-gray-500">
                        {e.matricule}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-gray-900">
                        {e.nom_complet}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleSupprimer(e.id)}
                          className="text-gray-300 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}