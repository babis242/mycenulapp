// src/features/referentiel/ues/pages/AjouterUEPage.tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Loader2, X, WifiOff, Sparkles, FileText, Trash2, Plus, Users2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { extraireTextePdf } from '@/lib/pdfExtraction';
import { televerserFichier } from '@/lib/r2';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import {
  createUE,
  createEcole,
  createFiliere,
  createSpecialite,
  extraireSyllabusPdf,
  enregistrerPointsCles,
} from '../api';
import { CYCLES, SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  createTroncCommun,
  enregistrerPointsClesTronc,
} from '@/features/referentiel/troncs-communs/api';
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

type ModalCreation =
  | { type: 'ecole' }
  | { type: 'filiere'; ecoleId: string; ecoleNom: string }
  | { type: 'specialite'; filiereId: string; filiereNom: string }
  | null;

function cycleKeyDe(cycle: string, sousCycle: string | null): string {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null): string {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

// Mini-fenêtre de création rapide (École / Filière / Spécialité), via portail
// pour ne jamais être déformée par un parent positionné.
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
                    placeholder="ex : Ingénieur, Doctorat..."
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
                  placeholder="ex : Professionnelle, Technologique"
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

// Écran 1.2 — Ajouter une UE, mode manuel (ecrans_ui.md)
// Une UE = une spécialité. Le tronc commun n'est plus géré ici : c'est un
// Jumelage créé après coup (Référentiel → Jumelages), qui regroupe
// plusieurs UEs distinctes sans les modifier.
export default function AjouterUEPage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [volumeHoraire, setVolumeHoraire] = useState('');
  const [coefficient, setCoefficient] = useState('');

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

  // Mode tronc commun : au lieu d'une seule spécialité, on en choisit
  // plusieurs (recherche) — une UE est créée pour chacune, regroupées
  // automatiquement dans un nouveau tronc commun.
  const [modeTronc, setModeTronc] = useState(false);
  const [specialitesTronc, setSpecialitesTronc] = useState<
    SpecialiteRecherche[]
  >([]);

  const [modal, setModal] = useState<ModalCreation>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Import PDF + IA ─────────────────────────────────────────────
  const [fichierSyllabus, setFichierSyllabus] = useState<File | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [erreurAnalyse, setErreurAnalyse] = useState<string | null>(null);
  const [pointsCles, setPointsCles] = useState<string[]>([]);

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

  async function loadFilieres(id: string) {
    if (filieresByEcole[id]) return;
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

  async function loadSpecialites(id: string) {
    if (specialitesByFiliere[id]) return;
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
      const data = await db.specialites.where('filiere_id').equals(id).toArray();
      setSpecialitesByFiliere((prev) => ({
        ...prev,
        [id]: (data as Specialite[]).sort((a, b) => a.nom.localeCompare(b.nom)),
      }));
    }
  }

  async function handleEcoleChange(id: string) {
    setEcoleId(id);
    setFiliereId('');
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    if (id) await loadFilieres(id);
  }

  async function handleFiliereChange(id: string) {
    setFiliereId(id);
    setCycleKey('');
    setSpecialiteId('');
    setSemestre('');
    if (id) await loadSpecialites(id);
  }

  function handleCycleChange(key: string) {
    setCycleKey(key);
    setSpecialiteId('');
    setSemestre('');
  }

  // Raccourci : sélectionne directement une spécialité trouvée par
  // recherche, en pré-remplissant la cascade École → Filière → Cycle.
  async function handleSelectionRecherche(s: SpecialiteRecherche) {
    await handleEcoleChange(s.ecoleId);
    await handleFiliereChange(s.filiereId);
    setCycleKey(cycleKeyDe(s.cycle, s.sousCycle));
    setSpecialiteId(s.id);
  }

  function ajouterSpecialiteTronc(s: SpecialiteRecherche) {
    setSpecialitesTronc((prev) =>
      prev.some((p) => p.id === s.id) ? prev : [...prev, s]
    );
    // Le semestre choisi peut ne plus être valable pour la nouvelle
    // combinaison de spécialités — on le remet à zéro pour forcer un
    // nouveau choix cohérent.
    setSemestre('');
  }

  function retirerSpecialiteTronc(id: string) {
    setSpecialitesTronc((prev) => prev.filter((p) => p.id !== id));
    setSemestre('');
  }

  // Semestres valables pour TOUTES les spécialités choisies à la fois
  // (intersection) — un semestre qui n'existe pas pour l'une d'elles ne
  // doit pas être proposé.
  const semestresCommuns =
    specialitesTronc.length === 0
      ? []
      : SEMESTRES_PAR_TYPE_CURSUS[specialitesTronc[0].typeCursus].filter(
          (sem) =>
            specialitesTronc.every((s) =>
              SEMESTRES_PAR_TYPE_CURSUS[s.typeCursus].includes(sem)
            )
        );

  async function handleImporterPdf(fichier: File | undefined) {
    if (!fichier) return;
    setFichierSyllabus(fichier);
    setAnalyseEnCours(true);
    setErreurAnalyse(null);
    try {
      const texte = await extraireTextePdf(fichier);
      const extraction = await extraireSyllabusPdf(texte);
      if (extraction.nom) setNom(extraction.nom);
      if (extraction.code) setCode(extraction.code);
      if (extraction.volume_horaire != null)
        setVolumeHoraire(String(extraction.volume_horaire));
      if (extraction.coefficient != null)
        setCoefficient(String(extraction.coefficient));
      setPointsCles(extraction.points_cles);
      if (extraction.points_cles.length === 0) {
        setErreurAnalyse(
          "L'IA n'a trouvé aucun point clé — ajoute-les manuellement ci-dessous (obligatoire)."
        );
      }
    } catch (err) {
      setErreurAnalyse(
        err instanceof Error ? err.message : "Erreur lors de l'analyse."
      );
    } finally {
      setAnalyseEnCours(false);
    }
  }

  function modifierPointCle(index: number, valeur: string) {
    setPointsCles((prev) => prev.map((p, i) => (i === index ? valeur : p)));
  }
  function retirerPointCle(index: number) {
    setPointsCles((prev) => prev.filter((_, i) => i !== index));
  }
  function ajouterPointCle() {
    setPointsCles((prev) => [...prev, '']);
  }

  async function handleCreerEcole(nomEcole: string) {
    const ecole = await createEcole(nomEcole);
    setEcoles((prev) =>
      [...prev, ecole].sort((a, b) => a.nom.localeCompare(b.nom))
    );
    await handleEcoleChange(ecole.id);
    setModal(null);
  }

  async function handleCreerFiliere(nomFiliere: string) {
    if (modal?.type !== 'filiere') return;
    const filiere = await createFiliere(nomFiliere, modal.ecoleId);
    setFilieresByEcole((prev) => ({
      ...prev,
      [modal.ecoleId]: [...(prev[modal.ecoleId] ?? []), filiere].sort((a, b) =>
        a.nom.localeCompare(b.nom)
      ),
    }));
    await handleFiliereChange(filiere.id);
    setModal(null);
  }

  async function handleCreerSpecialite(
    nomSpecialite: string,
    cycle: string,
    sousCycle: string,
    typeCursus: TypeCursus
  ) {
    if (modal?.type !== 'specialite') return;
    const specialite = await createSpecialite(
      nomSpecialite,
      modal.filiereId,
      cycle,
      typeCursus
    );
    if (sousCycle) {
      await supabase
        .from('specialites')
        .update({ sous_cycle: sousCycle })
        .eq('id', specialite.id);
    }
    const specialiteComplete: Specialite = {
      ...specialite,
      sous_cycle: sousCycle || null,
    };
    setSpecialitesByFiliere((prev) => ({
      ...prev,
      [modal.filiereId]: [
        ...(prev[modal.filiereId] ?? []),
        specialiteComplete,
      ].sort((a, b) => a.nom.localeCompare(b.nom)),
    }));
    setCycleKey(cycleKeyDe(cycle, sousCycle || null));
    setSpecialiteId(specialite.id);
    setSemestre('');
    setModal(null);
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

  function nomEcole(id: string): string {
    return ecoles.find((e) => e.id === id)?.nom ?? '';
  }
  function nomFiliere(id: string): string {
    return filieres.find((f) => f.id === id)?.nom ?? '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim()) {
      setError("Le nom de l'UE est obligatoire.");
      return;
    }

    if (modeTronc) {
      if (specialitesTronc.length < 2) {
        setError('Choisis au moins 2 spécialités pour un tronc commun.');
        return;
      }
      if (!semestre) {
        setError('Choisis un semestre (valable pour toutes les spécialités).');
        return;
      }
      if (
        fichierSyllabus &&
        pointsCles.filter((p) => p.trim()).length === 0
      ) {
        setError(
          'Un syllabus a été importé : au moins un point clé du contenu est obligatoire.'
        );
        return;
      }

      setSaving(true);
      try {
        const uesCreees = [];
        for (const spe of specialitesTronc) {
          const ue = await createUE({
            nom: nom.trim(),
            code: code.trim() || undefined,
            volume_horaire: volumeHoraire ? Number(volumeHoraire) : undefined,
            coefficient: coefficient ? Number(coefficient) : undefined,
            specialite_id: spe.id,
            semestre,
          });
          uesCreees.push(ue.id);
        }

        const tronc = await createTroncCommun({
          nom: nom.trim(),
          ue_ids: uesCreees,
        });

        // Le syllabus + ses points clés (obligatoires dès qu'un syllabus
        // est fourni) sont partagés par tout le groupe — enregistrés au
        // niveau du tronc commun, pas d'une UE en particulier.
        if (fichierSyllabus) {
          await televerserFichier('syllabus-tronc-commun', tronc.id, fichierSyllabus);
          await enregistrerPointsClesTronc(
            tronc.id,
            pointsCles.map((p) => p.trim()).filter(Boolean)
          );
        }

        navigate(`/referentiel/troncs-communs/${tronc.id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erreur lors de la création.'
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!specialiteId || !semestre) {
      setError('Choisis École, Filière, Cycle, Spécialité et Semestre.');
      return;
    }
    if (
      fichierSyllabus &&
      pointsCles.filter((p) => p.trim()).length === 0
    ) {
      setError(
        'Un syllabus a été importé : au moins un point clé du contenu est obligatoire.'
      );
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        const ue = await createUE({
          nom: nom.trim(),
          code: code.trim() || undefined,
          volume_horaire: volumeHoraire ? Number(volumeHoraire) : undefined,
          coefficient: coefficient ? Number(coefficient) : undefined,
          specialite_id: specialiteId,
          semestre,
        });

        // Le syllabus + ses points clés (obligatoires dès qu'un syllabus
        // est fourni) sont enregistrés juste après la création de l'UE.
        if (fichierSyllabus) {
          await televerserFichier('syllabus', ue.id, fichierSyllabus);
          await enregistrerPointsCles(
            ue.id,
            pointsCles.map((p) => p.trim()).filter(Boolean)
          );
        }
      } else {
        // Hors ligne : id généré côté client pour pouvoir l'afficher tout
        // de suite localement, rejoué vers Supabase au retour du réseau
        // (cf. src/lib/sync.ts) avec ce même id.
        const id = crypto.randomUUID();
        await db.ues.put({
          id,
          nom: nom.trim(),
          code: code.trim() || undefined,
          volume_horaire: volumeHoraire ? Number(volumeHoraire) : undefined,
          coefficient: coefficient ? Number(coefficient) : undefined,
          tronc_commun: false,
        } as any);
        await db.offres.put({
          id: crypto.randomUUID(),
          ue_id: id,
          specialite_id: specialiteId,
          semestre,
        } as any);
        await enqueueSyncAction({
          entity: 'ues',
          operation: 'create',
          payload: {
            id,
            nom: nom.trim(),
            code: code.trim() || null,
            volume_horaire: volumeHoraire ? Number(volumeHoraire) : null,
            coefficient: coefficient ? Number(coefficient) : null,
            specialite_id: specialiteId,
            semestre,
          },
        });
      }
      navigate('/referentiel/ues');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Ajouter une UE
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Une UE appartient à une seule spécialité. Pour regrouper plusieurs UEs
        (tronc commun), utilise "Jumelages" après création.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — l'UE sera enregistrée localement et envoyée dès le
            retour du réseau. La création rapide d'école/filière/spécialité
            n'est pas disponible hors ligne.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="bg-white rounded-[20px] p-5">
          <p className="font-extrabold text-sm text-gray-900 mb-1 flex items-center gap-1.5">
            <Sparkles size={15} className="text-red-600" />
            Importer depuis un syllabus (IA)
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Pré-remplit le formulaire et extrait les points clés du
            contenu — à vérifier avant d'enregistrer.
          </p>

          {!enLigne ? (
            <p className="text-xs font-semibold text-amber-600">
              Indisponible hors ligne.
            </p>
          ) : fichierSyllabus ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3.5 py-2.5">
              <FileText size={16} className="text-gray-400 shrink-0" />
              <span className="text-sm font-semibold text-gray-700 truncate flex-1">
                {fichierSyllabus.name}
              </span>
              {analyseEnCours && (
                <Loader2 size={15} className="animate-spin text-red-600 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => {
                  setFichierSyllabus(null);
                  setPointsCles([]);
                  setErreurAnalyse(null);
                }}
                className="text-gray-300 hover:text-red-600 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-red-300">
              <FileText size={18} className="text-gray-400" />
              <span className="text-sm font-bold text-gray-500">
                Choisir un PDF de syllabus
              </span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handleImporterPdf(e.target.files?.[0])}
                className="hidden"
              />
            </label>
          )}

          {erreurAnalyse && (
            <p className="text-xs font-semibold text-red-600 mt-2">
              {erreurAnalyse}
            </p>
          )}

          {fichierSyllabus && !analyseEnCours && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500">
                  Points clés du contenu{' '}
                  <span className="text-red-500">*</span>
                </p>
                <button
                  type="button"
                  onClick={ajouterPointCle}
                  className="flex items-center gap-1 text-[11px] font-bold text-red-600"
                >
                  <Plus size={12} /> Ajouter
                </button>
              </div>
              {pointsCles.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Aucun point pour l'instant — ajoute-en au moins un.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {pointsCles.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={p}
                        onChange={(e) => modifierPointCle(i, e.target.value)}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
                      />
                      <button
                        type="button"
                        onClick={() => retirerPointCle(i)}
                        className="text-gray-300 hover:text-red-600 shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[20px] p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Nom / Intitulé *
            </label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              placeholder="Algorithmique et structures de données"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                placeholder="Auto"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Volume horaire
              </label>
              <input
                type="number"
                value={volumeHoraire}
                onChange={(e) => setVolumeHoraire(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Coefficient
              </label>
              <input
                type="number"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-extrabold text-sm text-gray-900">
              Rattachement
            </p>
            <div className="flex items-center gap-1 bg-gray-50 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setModeTronc(false)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                  !modeTronc ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400'
                }`}
              >
                Une spécialité
              </button>
              <button
                type="button"
                onClick={() => setModeTronc(true)}
                className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                  modeTronc ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400'
                }`}
              >
                <Users2 size={12} /> Tronc commun
              </button>
            </div>
          </div>

          {modeTronc ? (
            <div>
              <p className="text-xs text-gray-400 mb-3">
                Choisis au moins 2 spécialités — une UE sera créée pour
                chacune, automatiquement regroupées dans un nouveau tronc
                commun.
              </p>

              {enLigne ? (
                <RechercheSpecialite onSelect={ajouterSpecialiteTronc} />
              ) : (
                <p className="text-xs font-semibold text-amber-600 mb-2">
                  Indisponible hors ligne.
                </p>
              )}

              {specialitesTronc.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {specialitesTronc.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-full"
                    >
                      {s.nom}
                      <button
                        type="button"
                        onClick={() => retirerSpecialiteTronc(s.id)}
                        className="hover:text-purple-900"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {specialitesTronc.length >= 2 && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    Semestre{' '}
                    <span className="text-gray-300 font-normal">
                      (valable pour toutes les spécialités choisies)
                    </span>
                  </label>
                  <select
                    value={semestre}
                    onChange={(e) => setSemestre(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600"
                  >
                    <option value="">Sélectionner...</option>
                    {semestresCommuns.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {semestresCommuns.length === 0 && (
                    <p className="text-xs font-semibold text-red-600 mt-1.5">
                      Aucun semestre commun à ces spécialités — vérifie ta
                      sélection.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {enLigne && (
                <div className="mb-3">
                  <RechercheSpecialite onSelect={handleSelectionRecherche} />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-500">École</label>
                <button
                  type="button"
                  onClick={() => setModal({ type: 'ecole' })}
                  disabled={!enLigne}
                  title={!enLigne ? 'Indisponible hors ligne' : undefined}
                  className="text-[11px] font-bold text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  + Nouvelle école
                </button>
              </div>
              <select
                value={ecoleId}
                onChange={(e) => handleEcoleChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600"
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-500">
                  Filière
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!ecoleId)
                      return window.alert("Choisissez d'abord une école.");
                    setModal({
                      type: 'filiere',
                      ecoleId,
                      ecoleNom: nomEcole(ecoleId),
                    });
                  }}
                  disabled={!enLigne}
                  title={!enLigne ? 'Indisponible hors ligne' : undefined}
                  className="text-[11px] font-bold text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  + Nouvelle filière
                </button>
              </div>
              <select
                value={filiereId}
                onChange={(e) => handleFiliereChange(e.target.value)}
                disabled={!ecoleId}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-500">Cycle</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!filiereId)
                      return window.alert("Choisissez d'abord une filière.");
                    setModal({
                      type: 'specialite',
                      filiereId,
                      filiereNom: nomFiliere(filiereId),
                    });
                  }}
                  disabled={!enLigne}
                  title={!enLigne ? 'Indisponible hors ligne' : undefined}
                  className="text-[11px] font-bold text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  + Nouveau cycle
                </button>
              </div>
              <select
                value={cycleKey}
                onChange={(e) => handleCycleChange(e.target.value)}
                disabled={!filiereId}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-500">
                  Spécialité
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (!filiereId)
                      return window.alert("Choisissez d'abord une filière.");
                    setModal({
                      type: 'specialite',
                      filiereId,
                      filiereNom: nomFiliere(filiereId),
                    });
                  }}
                  disabled={!enLigne}
                  title={!enLigne ? 'Indisponible hors ligne' : undefined}
                  className="text-[11px] font-bold text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  + Nouvelle spécialité
                </button>
              </div>
              <select
                value={specialiteId}
                onChange={(e) => {
                  setSpecialiteId(e.target.value);
                  setSemestre('');
                }}
                disabled={!cycleKey}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
              >
                <option value="">Sélectionner...</option>
                {specialitesDuCycle.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">
                Semestre
              </label>
              <select
                value={semestre}
                onChange={(e) => setSemestre(e.target.value)}
                disabled={!specialiteId}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
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
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || analyseEnCours || (modeTronc && !enLigne)}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => navigate('/referentiel/ues')}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </form>

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