// src/features/emploi-du-temps/pages/ValidationEDTPage.tsx
import { useEffect, useState, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Upload,
  CheckCircle2,
  FileText,
  Printer,
  Pencil,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { filtrerParPerimetre, estDansLePerimetre } from '@/lib/perimetre';
import { JOURS, CRENEAUX } from '@/constants/enums';
import {
  getSeances,
  getHeuresEffectuees,
  uploaderDocumentSigne,
  validerEDT,
  lireEmploiExistantDepuisCache,
  lireSeancesDepuisCache,
  type SeanceDetail,
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

function cycleKeyDe(cycle: string, sousCycle: string | null) {
  return `${cycle}::${sousCycle ?? ''}`;
}

const MOIS_FR = [
  'JANVIER',
  'FÉVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOÛT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DÉCEMBRE',
];

// "SEMAINE DU 16 AU 21 MARS 2026" — le lundi (semaine) + 5 jours = samedi.
function formatSemaineTitre(semaineISO: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const mois = MOIS_FR[samedi.getMonth()];
  return `DU ${lundi.getDate()} AU ${samedi.getDate()} ${mois} ${samedi.getFullYear()}`;
}
function labelCycle(cycle: string, sousCycle: string | null) {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

// Format compact pour le nom de fichier PDF : "07-09-2026_au_12-09-2026"
function formatSemaineFichier(semaineISO: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const fmt = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, '0')}-${String(
      dt.getMonth() + 1
    ).padStart(2, '0')}-${dt.getFullYear()}`;
  return `${fmt(lundi)}_au_${fmt(samedi)}`;
}

// Écran Scénario 6 — Validation et publication (journal.md).
// Sélection de l'emploi du temps généré, aperçu, upload du document signé
// (photo ou fichier), puis validation → verrouillage + notification de
// chaque enseignant avec ses seuls cours.
export default function ValidationEDTPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const enLigne = useOnlineStatus();

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
  const [semaine, setSemaine] = useState(searchParams.get('semaine') || '');

  const [emploi, setEmploi] = useState<{
    id: string;
    statut: string;
    pdfSigneUrl: string | null;
  } | null>(null);
  const [seances, setSeances] = useState<SeanceDetail[]>([]);
  const [chargement, setChargement] = useState(false);

  const [upload, setUpload] = useState(false);
  const [validation, setValidation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

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

  // Pré-remplissage + chargement automatique quand on arrive depuis
  // "Enregistrer l'emploi du temps" (?specialite=...&semaine=...) — plus
  // besoin de recliquer "Charger".
  useEffect(() => {
    const specialiteParam = searchParams.get('specialite');
    if (!specialiteParam) return;

    async function preremplirEtCharger() {
      const { data: specialite } = await supabase
        .from('specialites')
        .select('id, nom, filiere_id, cycle, sous_cycle, type_cursus')
        .eq('id', specialiteParam)
        .maybeSingle();
      if (!specialite) return;
      if (!estDansLePerimetre(specialite.id, user)) return;

      const { data: filiere } = await supabase
        .from('filieres')
        .select('id, nom, ecole_id')
        .eq('id', specialite.filiere_id)
        .maybeSingle();
      if (!filiere) return;

      setEcoleId(filiere.ecole_id);
      const { data: filieresEcole } = await supabase
        .from('filieres')
        .select('id, nom, ecole_id')
        .eq('ecole_id', filiere.ecole_id)
        .order('nom');
      setFilieresByEcole((prev) => ({
        ...prev,
        [filiere.ecole_id]: filieresEcole ?? [],
      }));

      setFiliereId(filiere.id);
      const { data: specialitesFiliere } = await supabase
        .from('specialites')
        .select('id, nom, filiere_id, cycle, sous_cycle, type_cursus')
        .eq('filiere_id', filiere.id)
        .order('nom');
      setSpecialitesByFiliere((prev) => ({
        ...prev,
        [filiere.id]: (specialitesFiliere ?? []) as Specialite[],
      }));

      setCycleKey(cycleKeyDe(specialite.cycle, specialite.sous_cycle));
      setSpecialiteId(specialite.id);

      // Charge directement l'emploi du temps de cette spécialité/semaine.
      chargerEmploiPour(specialite.id, searchParams.get('semaine') || semaine);
    }
    preremplirEtCharger();
  }, [searchParams, user]);

  async function handleEcoleChange(id: string) {
    setEcoleId(id);
    setFiliereId('');
    setCycleKey('');
    setSpecialiteId('');
    setEmploi(null);
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
    setEmploi(null);
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
  const specialiteChoisie = specialitesDuCycle.find(
    (s) => s.id === specialiteId
  );

  const [heuresEffectuees, setHeuresEffectuees] = useState<Map<string, number>>(
    new Map()
  );
  const [heuresIndisponibles, setHeuresIndisponibles] = useState(false);

  async function chargerEmploiPour(specId: string, sem: string) {
    if (!specId || !sem) return;
    setChargement(true);
    setSucces(false);
    setErreur(null);
    setHeuresIndisponibles(false);
    try {
      if (navigator.onLine) {
        const { data } = await supabase
          .from('emplois_du_temps')
          .select('id, statut, pdf_signe_url')
          .eq('specialite_id', specId)
          .eq('semaine', sem)
          .maybeSingle();

        if (!data) {
          setEmploi(null);
          setSeances([]);
          return;
        }
        setEmploi({
          id: data.id,
          statut: data.statut,
          pdfSigneUrl: data.pdf_signe_url,
        });
        const s = await getSeances(data.id);
        setSeances(s);
        const offreIds = Array.from(
          new Set(s.map((x) => x.offreId).filter((x): x is string => !!x))
        );
        const heures = await getHeuresEffectuees(offreIds, sem);
        setHeuresEffectuees(heures);
      } else {
        // Hors ligne : consultation seule. "Heures déjà effectuées" a
        // besoin de parcourir tout l'historique validé (potentiellement
        // pas en cache) — plutôt que d'afficher un chiffre possiblement
        // faux, on l'indique clairement comme indisponible.
        const e = await lireEmploiExistantDepuisCache(specId, sem);
        if (!e) {
          setEmploi(null);
          setSeances([]);
          return;
        }
        const emploiComplet = await db.emploisDuTemps.get(e.id);
        setEmploi({
          id: e.id,
          statut: e.statut,
          pdfSigneUrl: (emploiComplet as any)?.pdf_signe_url ?? null,
        });
        const s = await lireSeancesDepuisCache(e.id);
        setSeances(s);
        setHeuresEffectuees(new Map());
        setHeuresIndisponibles(true);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setChargement(false);
    }
  }

  function chargerEmploi() {
    return chargerEmploiPour(specialiteId, semaine);
  }

  function handleImprimer() {
    const titreOriginal = document.title;
    const cycle = specialiteChoisie
      ? labelCycle(specialiteChoisie.cycle, specialiteChoisie.sous_cycle)
      : '';
    const nomFichier = `EDT ${cycle} ${
      specialiteChoisie?.nom ?? ''
    } ${formatSemaineFichier(semaine)}`
      .replace(/\s+/g, ' ')
      .trim();
    document.title = nomFichier;

    function restaurer() {
      document.title = titreOriginal;
      window.removeEventListener('afterprint', restaurer);
    }
    window.addEventListener('afterprint', restaurer);

    window.print();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier || !emploi) return;
    setUpload(true);
    setErreur(null);
    try {
      const url = await uploaderDocumentSigne(emploi.id, fichier);
      setEmploi((prev) => (prev ? { ...prev, pdfSigneUrl: url } : prev));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
    } finally {
      setUpload(false);
    }
  }

  async function handleValider() {
    if (!emploi) return;
    setValidation(true);
    setErreur(null);
    try {
      await validerEDT(emploi.id);
      setEmploi((prev) => (prev ? { ...prev, statut: 'valide' } : prev));
      setSucces(true);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : 'Erreur lors de la validation.'
      );
    } finally {
      setValidation(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="print:hidden">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Validation de l'emploi du temps
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Télécharge le PDF, fais-le signer par le directeur, puis téléverse le
          document signé.
        </p>
        {!enLigne && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            <WifiOff size={15} className="text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-700">
              Hors ligne — consultation uniquement. La validation, l'envoi du
              document signé et les heures déjà effectuées nécessitent une
              connexion.
            </p>
          </div>
        )}

        <div className="bg-white rounded-[20px] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
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
            onChange={(e) => setSpecialiteId(e.target.value)}
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

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Semaine (lundi)
            </label>
            <input
              type="date"
              value={semaine}
              onChange={(e) => setSemaine(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={chargerEmploi}
              disabled={!specialiteId || !semaine || chargement}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {chargement && <Loader2 size={15} className="animate-spin" />}
              Charger
            </button>
          </div>
        </div>

        {emploi === null && !chargement && specialiteId && semaine && (
          <div className="bg-amber-50 rounded-xl px-4 py-3.5">
            <p className="text-sm font-bold text-amber-700">
              Aucun emploi du temps généré pour cette spécialité/semaine — va
              d'abord le générer.
            </p>
          </div>
        )}

        {emploi && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  emploi.statut === 'valide'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {emploi.statut === 'valide'
                  ? 'Validé'
                  : 'Généré (en attente de validation)'}
              </span>
              {heuresIndisponibles && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1.5">
                  <WifiOff size={12} /> Heures déjà effectuées indisponibles
                  hors ligne
                </span>
              )}
              <div className="flex gap-2">
                {emploi.statut !== 'valide' && (
                  <Link
                    to={`/emploi-du-temps?specialite=${specialiteId}&semaine=${semaine}`}
                    className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={15} /> Modifier
                  </Link>
                )}
                <button
                  onClick={handleImprimer}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  <Printer size={16} /> Télécharger le PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[20px] overflow-x-auto mb-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50 w-24">
                      Jour
                    </th>
                    {CRENEAUX.map((c) => (
                      <th
                        key={c}
                        className="px-3 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {JOURS.map((jour) => (
                    <tr key={jour}>
                      <td className="px-3 py-3 font-bold text-gray-900 border-b border-gray-50 align-top">
                        {jour}
                      </td>
                      {CRENEAUX.map((creneau) => {
                        const cellules = seances.filter(
                          (s) => s.jour === jour && s.creneau === creneau
                        );
                        return (
                          <td
                            key={creneau}
                            className="px-2 py-2 border-b border-gray-50 align-top"
                          >
                            {cellules.length === 0 ? (
                              <span className="text-gray-200 text-xs px-2">
                                —
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {cellules.map((s) => (
                                  <div
                                    key={s.id}
                                    className="bg-gray-50 rounded-xl px-3 py-2"
                                  >
                                    <p className="font-bold text-xs text-gray-900">
                                      {s.ueNom}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                      {s.enseignantNom} ·{' '}
                                      {s.salleCode ?? 'Aucune salle'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {emploi.statut !== 'valide' && (
              <div className="bg-white rounded-[20px] p-5">
                <p className="font-extrabold text-sm text-gray-900 mb-1">
                  Document signé par le directeur
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Obligatoire avant validation — photo ou fichier (PDF/image).
                </p>

                {emploi.pdfSigneUrl ? (
                  <a
                    href={emploi.pdfSigneUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-bold text-green-700 bg-green-50 rounded-xl px-4 py-3 mb-4 w-fit"
                  >
                    <FileText size={16} /> Document téléversé — voir
                  </a>
                ) : (
                  <label className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 mb-4 w-fit cursor-pointer">
                    {upload ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Upload size={16} className="text-gray-500" />
                    )}
                    <span className="text-sm font-bold text-gray-700">
                      {upload
                        ? 'Envoi...'
                        : 'Prendre une photo / choisir un fichier'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={handleUpload}
                      className="hidden"
                      disabled={upload || !enLigne}
                    />
                  </label>
                )}

                {erreur && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                    <p className="text-sm font-bold text-red-600">{erreur}</p>
                  </div>
                )}

                <button
                  onClick={handleValider}
                  disabled={!emploi.pdfSigneUrl || validation || !enLigne}
                  className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {validation && <Loader2 size={15} className="animate-spin" />}
                  Valider
                </button>
              </div>
            )}

            {succes && (
              <div className="flex items-center gap-2 bg-green-50 rounded-xl px-4 py-3 mt-4">
                <CheckCircle2 size={16} className="text-green-600" />
                <p className="text-sm font-bold text-green-700">
                  Emploi du temps validé — enseignants notifiés.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Vue imprimable — visible uniquement à l'impression/export PDF, calquée
          sur le modèle CENULAPE fourni. Format paysage (@page), logo réel en
          en-tête + filigrane en fond. */}
      {emploi && (
        <>
          <style>{'@page { size: landscape; margin: 0; }'}</style>
          <div
            className="hidden print:block text-black relative"
            style={{ padding: '10mm' }}
          >
            <img
              src="/logo-cenulape.png"
              alt=""
              className="absolute top-1/2 left-1/2 w-[420px] opacity-[0.07] pointer-events-none"
              style={{ transform: 'translate(-50%, -50%)' }}
            />
            <div className="relative">
              <div className="flex items-start justify-between mb-2">
                <div className="text-center flex-1">
                  <p className="text-blue-600 font-bold text-sm">
                    CENTRE UNIVERSITAIRE LA PERLE
                  </p>
                  <p className="text-blue-600 font-bold text-sm mb-2">
                    (CENULAPE)
                  </p>
                  <p className="font-bold text-xs">BP : 760 YASSA DOUALA</p>
                  <p className="font-bold text-xs">TEL : 658 09 34 70</p>
                </div>
                <div className="text-center flex-1">
                  <img
                    src="/logo-cenulape.png"
                    alt="Logo CENULAPE"
                    className="mx-auto w-24 h-24 object-contain"
                  />
                </div>
                <div className="text-center flex-1">
                  <p className="text-blue-600 font-bold text-sm">
                    THE PEARL UNIVERSITY CENTER
                  </p>
                  <p className="text-blue-600 font-bold text-sm mb-2">
                    (CENULAPE)
                  </p>
                  <p className="font-bold text-xs">
                    Email :{' '}
                    <span className="text-blue-600 underline">
                      info@laperle-sup.com
                    </span>
                  </p>
                  <p className="font-bold text-xs">
                    Site web :{' '}
                    <span className="text-blue-600 underline">
                      www.laperle-sup.com
                    </span>
                  </p>
                </div>
              </div>

              <p className="text-center italic font-bold text-xs mb-3">
                Autorisation N° : 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS du 20
                Septembre 2017
              </p>

              <p className="text-center text-red-600 font-extrabold text-lg">
                EMPLOI DU TEMPS {specialiteChoisie?.nom.toUpperCase()}
              </p>
              <p className="text-center text-red-600 font-extrabold text-lg mb-3">
                SEMAINE {formatSemaineTitre(semaine)}
              </p>

              <div className="flex items-center justify-between mb-2 text-sm font-bold">
                <span>
                  SEMESTRE{' '}
                  {Array.from(
                    new Set(seances.map((s) => s.semestre).filter(Boolean))
                  ).join(' / ') || '……….'}
                </span>
                <span>ANNEE : 2026/2027</span>
                <span>Salle : ……….</span>
              </div>

              <table className="w-full border-collapse border border-black text-[11px] mb-3">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1.5">Horaire</th>
                    {JOURS.map((j) => (
                      <th key={j} className="border border-black px-2 py-1.5">
                        {j.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRENEAUX.map((creneau, idx) => (
                    <Fragment key={creneau}>
                      <tr>
                        <td className="border border-black px-2 py-2 text-red-600 font-bold text-center align-middle">
                          {creneau.replace('h-', 'h00 - ') + '00'}
                        </td>
                        {JOURS.map((jour) => {
                          const s = seances.find(
                            (x) => x.jour === jour && x.creneau === creneau
                          );
                          if (!s)
                            return (
                              <td
                                key={jour}
                                className="border border-black px-2 py-2"
                              />
                            );
                          const total = s.volumeHoraire ?? 0;
                          const faites = s.offreId
                            ? heuresEffectuees.get(s.offreId) ?? 0
                            : 0;
                          const restant = total - faites;
                          return (
                            <td
                              key={jour}
                              className="border border-black px-2 py-2 text-center align-top"
                            >
                              <p className="font-bold">{s.ueNom}</p>
                              <p className="font-bold">{s.enseignantNom}</p>
                              <p className="font-semibold text-[10px] text-gray-700">
                                {s.salleCode ?? 'Salle à confirmer'}
                              </p>
                              {s.volumeHoraire != null && (
                                <p className="text-red-600 font-bold">
                                  {faites}/{total}h (-{restant}h)
                                </p>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {idx === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="border border-black bg-green-400 text-center font-bold py-1"
                          >
                            GRANDE PAUSE
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>

              <p className="text-[10px] font-bold leading-snug">
                NB : 1- Tous les enseignants affectés aux différentes unités
                d'enseignements sont priés de fournir le support de cours en
                version physique (et éventuellement numérique) à la scolarité et
                aux étudiants une version de leur choix.
                <br />
                2- Les heures inscrites en dessous de chaque unité
                d'enseignement désignent respectivement le cumul d'heures
                effectuées au moment de la programmation sur le volume horaire
                total (exemple : 3/24h) et le nombre d'heures restant pour
                achever de ladite unité (exemple : -21h).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
