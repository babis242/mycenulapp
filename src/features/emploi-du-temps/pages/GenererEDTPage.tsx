// src/features/emploi-du-temps/pages/GenererEDTPage.tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Sparkles,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { filtrerParPerimetre, estDansLePerimetre } from '@/lib/perimetre';
import { JOURS, CRENEAUX } from '@/constants/enums';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import {
  creerOuChargerEDT,
  getSeances,
  listOffresDeSpecialite,
  getEnseignantsDisponibles,
  getSalleParDefautSpecialite,
  listToutesLesSalles,
  assignerSeance,
  supprimerSeance,
  lireEmploiExistantDepuisCache,
  lireSeancesDepuisCache,
  lireOffresDeSpecialiteDepuisCache,
  lireEnseignantsDisponiblesDepuisCache,
  lireSalleParDefautDepuisCache,
  lireToutesLesSallesDepuisCache,
  type SeanceDetail,
  type OffreDeSpecialite,
  type EnseignantDisponible,
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
interface Salle {
  id: string;
  code_salle: string;
  capacite: number;
}

function cycleKeyDe(cycle: string, sousCycle: string | null) {
  return `${cycle}::${sousCycle ?? ''}`;
}
function labelCycle(cycle: string, sousCycle: string | null) {
  return sousCycle ? `${cycle} (${sousCycle})` : cycle;
}

function lundiDeLaSemaine(): string {
  const d = new Date();
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ModalCellule {
  jour: string;
  creneau: string;
  seanceIdExistante: string | null;
  offreId: string;
  salleId: string;
}

// Écran Scénario 5 — Construction manuelle de l'emploi du temps
// (journal.md). Nouvelle procédure : pas d'algorithme automatique, l'EDT
// démarre vierge. Pour chaque créneau, on affiche les enseignants
// disponibles (facultatif — on peut aussi en choisir un autre, ou une UE
// différente), une salle est suggérée mais modifiable.
export default function GenererEDTPage() {
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
  const [semaine, setSemaine] = useState(
    searchParams.get('semaine') || lundiDeLaSemaine()
  );

  const [chargement, setChargement] = useState(false);
  const [emploi, setEmploi] = useState<{ id: string; statut: string } | null>(
    null
  );
  const [seances, setSeances] = useState<SeanceDetail[]>([]);
  const [offresSpecialite, setOffresSpecialite] = useState<OffreDeSpecialite[]>(
    []
  );
  const [toutesSalles, setToutesSalles] = useState<Salle[]>([]);
  const [salleParDefaut, setSalleParDefaut] = useState<Salle | null>(null);

  const [modal, setModal] = useState<ModalCellule | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [enseignantsDispoModal, setEnseignantsDispoModal] = useState<
    EnseignantDisponible[]
  >([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (navigator.onLine) {
      supabase
        .from('ecoles')
        .select('id, nom')
        .order('nom')
        .then(({ data }) => setEcoles(data ?? []));
      listToutesLesSalles().then(setToutesSalles);
    } else {
      db.ecoles
        .toArray()
        .then((data) =>
          setEcoles(
            [...data].sort((a: any, b: any) => a.nom.localeCompare(b.nom))
          )
        );
      lireToutesLesSallesDepuisCache().then(setToutesSalles);
    }
  }, []);

  useEffect(() => {
    const specialiteParam = searchParams.get('specialite');
    if (!specialiteParam) return;

    async function preremplir() {
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
    }
    preremplir();
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

  async function handleCharger() {
    if (!specialiteId || !semaine) return;
    setChargement(true);
    setErreurChargement(null);
    try {
      if (navigator.onLine) {
        const e = await creerOuChargerEDT(specialiteId, semaine);
        setEmploi(e);
        const [s, offres, defaut] = await Promise.all([
          getSeances(e.id),
          listOffresDeSpecialite(specialiteId),
          getSalleParDefautSpecialite(specialiteId),
        ]);
        setSeances(s);
        setOffresSpecialite(offres);
        setSalleParDefaut(defaut);
      } else {
        // Hors ligne : consultation uniquement. Si cet EDT n'a jamais été
        // synchronisé sur cet appareil, impossible de savoir s'il existe
        // déjà ailleurs — on ne crée jamais rien sans réseau (conflits de
        // salle, propagation aux troncs communs... tout ça a besoin d'une
        // vue à jour de la base).
        const e = await lireEmploiExistantDepuisCache(specialiteId, semaine);
        if (!e) {
          setErreurChargement(
            "Cet emploi du temps n'est pas disponible hors ligne. Connecte-toi pour l'ouvrir ou le créer."
          );
          return;
        }
        setEmploi(e);
        const [s, offres, defaut] = await Promise.all([
          lireSeancesDepuisCache(e.id),
          lireOffresDeSpecialiteDepuisCache(specialiteId),
          lireSalleParDefautDepuisCache(specialiteId),
        ]);
        setSeances(s);
        setOffresSpecialite(offres);
        setSalleParDefaut(defaut);
      }
    } catch (err) {
      setErreurChargement(
        err instanceof Error ? err.message : 'Erreur de chargement.'
      );
    } finally {
      setChargement(false);
    }
  }

  async function ouvrirModal(
    jour: string,
    creneau: string,
    seanceExistante?: SeanceDetail
  ) {
    setModal({
      jour,
      creneau,
      seanceIdExistante: seanceExistante?.id ?? null,
      offreId: seanceExistante?.offreId ?? '',
      salleId: seanceExistante?.salleId ?? salleParDefaut?.id ?? '',
    });
    const dispo = navigator.onLine
      ? await getEnseignantsDisponibles(jour, creneau)
      : await lireEnseignantsDisponiblesDepuisCache(jour, creneau);
    setEnseignantsDispoModal(dispo);
  }

  function offreChoisie() {
    return offresSpecialite.find((o) => o.offreId === modal?.offreId) ?? null;
  }

  async function handleEnregistrerModal() {
    const offre = offreChoisie();
    if (!modal || !emploi || !modal.offreId || !offre?.enseignantAttribueId)
      return;
    setEnregistrement(true);
    try {
      await assignerSeance({
        emploiId: emploi.id,
        specialiteId,
        semaine,
        seanceIdExistante: modal.seanceIdExistante,
        offreId: modal.offreId,
        enseignantId: offre.enseignantAttribueId,
        salleId: modal.salleId || null,
        jour: modal.jour,
        creneau: modal.creneau,
      });
      const s = await getSeances(emploi.id);
      setSeances(s);
      setModal(null);
    } finally {
      setEnregistrement(false);
    }
  }

  async function handleSupprimer() {
    if (!modal?.seanceIdExistante || !emploi) return;
    if (!window.confirm('Retirer cette séance ?')) return;
    await supprimerSeance(modal.seanceIdExistante);
    const s = await getSeances(emploi.id);
    setSeances(s);
    setModal(null);
  }

  const nbConflits = seances.filter((s) => s.statut === 'conflit').length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <p className="font-extrabold text-2xl text-gray-900">Emploi du temps</p>
        <Link
          to={`/emploi-du-temps/validation?specialite=${specialiteId}&semaine=${semaine}`}
          className="text-red-600 font-bold hover:underline text-sm"
        >
          Aller à la validation →
        </Link>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Choisis la spécialité et la semaine, puis remplis chaque créneau à la
        main.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — consultation uniquement. Un emploi du temps déjà
            ouvert sur cet appareil peut être consulté, mais aucune
            création ni modification n'est possible sans réseau (conflits
            de salle vérifiés en direct).
          </p>
        </div>
      )}

      {enLigne && (
        <div className="bg-white rounded-[20px] p-5 mb-4">
          <RechercheSpecialite
            onSelect={handleSelectionRecherche}
            placeholder="Rechercher directement une spécialité..."
          />
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
            setEmploi(null);
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
            setEmploi(null);
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

        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Semaine (lundi)
          </label>
          <input
            type="date"
            value={semaine}
            onChange={(e) => {
              setSemaine(e.target.value);
              setEmploi(null);
            }}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
          />
        </div>
      </div>

      {!emploi && (
        <>
          <button
            onClick={handleCharger}
            disabled={!specialiteId || !semaine || chargement}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {chargement && <Loader2 size={15} className="animate-spin" />}
            Ouvrir l'emploi du temps
          </button>
          {erreurChargement && (
            <p className="text-xs font-semibold text-amber-600 mt-3 flex items-center gap-1.5">
              <WifiOff size={13} /> {erreurChargement}
            </p>
          )}
        </>
      )}

      {emploi && (
        <>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
              {emploi.statut === 'valide'
                ? 'Validé'
                : 'En cours de construction'}
            </span>
            {nbConflits > 0 && (
              <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
                {nbConflits} conflit(s) de salle
              </span>
            )}
          </div>

          <div className="bg-white rounded-[20px] overflow-x-auto">
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
                      const seancesCellule = seances.filter(
                        (s) => s.jour === jour && s.creneau === creneau
                      );
                      return (
                        <td
                          key={creneau}
                          className="px-2 py-2 border-b border-gray-50 align-top"
                        >
                          {seancesCellule.length === 0 ? (
                            <button
                              onClick={() => ouvrirModal(jour, creneau)}
                              title="Programmer ce créneau"
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {seancesCellule.map((s) => (
                                <div
                                  key={s.id}
                                  className={`rounded-xl px-3 py-2 ${
                                    s.statut === 'conflit'
                                      ? 'bg-red-50 border border-red-200'
                                      : 'bg-gray-50'
                                  }`}
                                >
                                  <p className="font-bold text-xs text-gray-900 truncate">
                                    {s.ueNom}
                                  </p>
                                  <p className="text-[11px] text-gray-400 truncate mb-1.5">
                                    {s.enseignantNom} ·{' '}
                                    {s.salleCode ?? 'Aucune salle'}
                                  </p>
                                  {s.statut === 'conflit' && (
                                    <p className="text-[10px] text-red-600 font-bold mb-1.5">
                                      ⚠ Conflit de salle
                                    </p>
                                  )}
                                  <button
                                    onClick={() =>
                                      ouvrirModal(jour, creneau, s)
                                    }
                                    title="Modifier"
                                    className="w-6 h-6 flex items-center justify-center rounded-md bg-white text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Pencil size={11} />
                                  </button>
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

          <div className="flex items-center gap-3 mt-5">
            <Link
              to={`/emploi-du-temps/validation?specialite=${specialiteId}&semaine=${semaine}`}
              onClick={() => setEnregistre(true)}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              <CheckCircle2 size={15} /> Enregistrer l'emploi du temps
            </Link>
            {enregistre && (
              <span className="text-xs font-bold text-green-600">
                Enregistré ✓
              </span>
            )}
          </div>
        </>
      )}

      {modal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-[20px] p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-extrabold text-base text-gray-900">
                {modal.jour} · {modal.creneau}
              </p>
              <button
                onClick={() => setModal(null)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  UE *
                </label>

                {(() => {
                  const idsDisponibles = new Set(
                    enseignantsDispoModal.map((e) => e.id)
                  );
                  const disponibles = offresSpecialite.filter(
                    (o) =>
                      o.enseignantAttribueId &&
                      idsDisponibles.has(o.enseignantAttribueId)
                  );
                  const autres = offresSpecialite.filter(
                    (o) =>
                      !o.enseignantAttribueId ||
                      !idsDisponibles.has(o.enseignantAttribueId)
                  );

                  function ligneUE(o: OffreDeSpecialite, dispo: boolean) {
                    if (!modal) return null;
                    const selectionnee = modal.offreId === o.offreId;
                    return (
                      <button
                        key={o.offreId}
                        type="button"
                        disabled={!o.enseignantAttribueId}
                        onClick={() =>
                          setModal((prev) =>
                            prev ? { ...prev, offreId: o.offreId } : prev
                          )
                        }
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          selectionnee
                            ? 'bg-red-600 border-red-600 text-white'
                            : dispo
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-sm font-bold truncate">
                          {o.ueNom}
                        </span>
                        <span
                          className={`text-xs font-semibold shrink-0 ${
                            selectionnee ? 'text-white/80' : 'text-gray-400'
                          }`}
                        >
                          {o.enseignantAttribueNom ?? 'non attribué'}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-[11px] font-bold text-amber-600 mb-1.5 flex items-center gap-1.5">
                          <Sparkles size={11} /> Enseignant disponible à ce
                          créneau ({disponibles.length})
                        </p>
                        {disponibles.length === 0 ? (
                          <p className="text-xs text-gray-300 italic">Aucune</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {disponibles.map((o) => ligneUE(o, true))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-[11px] font-bold text-gray-400 mb-1.5">
                          Autres UEs du semestre ({autres.length})
                        </p>
                        {autres.length === 0 ? (
                          <p className="text-xs text-gray-300 italic">Aucune</p>
                        ) : (
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                            {autres.map((o) => ligneUE(o, false))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <p className="text-[10px] text-gray-400 mt-2">
                  L'enseignant est celui déjà attribué à cette UE (Répartition).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  Salle
                </label>
                <select
                  value={modal.salleId}
                  onChange={(e) =>
                    setModal((prev) =>
                      prev ? { ...prev, salleId: e.target.value } : prev
                    )
                  }
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
                >
                  <option value="">Aucune</option>
                  {toutesSalles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code_salle}{' '}
                      {s.id === salleParDefaut?.id ? '(par défaut)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleEnregistrerModal}
                disabled={!modal.offreId || enregistrement || !enLigne}
                className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {enregistrement && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Enregistrer
              </button>
              {modal.seanceIdExistante && (
                <button
                  onClick={handleSupprimer}
                  disabled={!enLigne}
                  className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} /> Retirer
                </button>
              )}
            </div>
            {!enLigne && (
              <p className="text-xs font-semibold text-amber-600 mt-3 flex items-center gap-1.5">
                <WifiOff size={13} /> Hors ligne — la sauvegarde nécessite
                une connexion (vérification des conflits de salle en
                direct).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}