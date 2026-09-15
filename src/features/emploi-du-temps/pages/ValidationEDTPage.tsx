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
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { JOURS, CRENEAUX } from '@/constants/enums';
import { supabase } from '@/lib/supabase';
import {
  listCyclesDisponibles,
  listSpecialitesDuCycleSemestre,
  listSpecialitesParIds,
  getSeancesGroupees,
  getHeuresEffectuees,
  getHeuresEffectueesTronc,
  uploaderDocumentSigneGroupe,
  validerEDT,
  type CycleOption,
  type SpecialiteGroupe,
  type SeanceGroupee,
} from '../api';

const MOIS_FR = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
];
const MOIS_EN = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const JOURS_EN: Record<string, string> = {
  Lundi: 'Monday', Mardi: 'Tuesday', Mercredi: 'Wednesday',
  Jeudi: 'Thursday', Vendredi: 'Friday', Samedi: 'Saturday', Dimanche: 'Sunday',
};
function traduireJour(jour: string, anglais: boolean): string {
  return anglais ? (JOURS_EN[jour] ?? jour) : jour;
}
function formatSemaineTitre(semaineISO: string, anglais: boolean): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const mois = (anglais ? MOIS_EN : MOIS_FR)[samedi.getMonth()];
  return anglais
    ? `FROM ${lundi.getDate()} TO ${samedi.getDate()} ${mois} ${samedi.getFullYear()}`
    : `DU ${lundi.getDate()} AU ${samedi.getDate()} ${mois} ${samedi.getFullYear()}`;
}
function formatSemaineFichier(semaineISO: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const fmt = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
  return `${fmt(lundi)}_au_${fmt(samedi)}`;
}

const TEXTES = {
  fr: {
    semestre: 'SEMESTRE', annee: 'ANNEE', salle: 'Salle', horaire: 'Horaire',
    pause: 'GRANDE PAUSE', salleAConfirmer: 'Salle à confirmer',
    emploiDuTemps: 'EMPLOI DU TEMPS', semaine: 'SEMAINE', siteWeb: 'Site web',
    autorisation: 'Autorisation N° : 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS du 20 Septembre 2017',
    nb: (
      <>
        NB : 1- Tous les enseignants affectés aux différentes unités
        d'enseignements sont priés de fournir le support de cours en
        version physique (et éventuellement numérique) à la scolarité et
        aux étudiants une version de leur choix.
        <br />
        2- Les heures inscrites en dessous de chaque unité d'enseignement
        désignent respectivement le cumul d'heures effectuées au moment
        de la programmation sur le volume horaire total (exemple :
        3/24h) et le nombre d'heures restant pour achever de ladite
        unité (exemple : -21h).
      </>
    ),
  },
  en: {
    semestre: 'SEMESTER', annee: 'ACADEMIC YEAR', salle: 'Room', horaire: 'Time',
    pause: 'BREAK', salleAConfirmer: 'Room to be confirmed',
    emploiDuTemps: 'TIMETABLE', semaine: 'WEEK', siteWeb: 'Website',
    autorisation: 'Authorization N°: 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS of 20 September 2017',
    nb: (
      <>
        NB: 1- All lecturers assigned to the various course units are
        kindly requested to provide the course material (physical copy,
        and digital copy where possible) to the registry and to
        students, in the format of their choice.
        <br />
        2- The hours shown below each course unit indicate, respectively,
        the cumulative hours completed at the time of scheduling out of
        the total course load (e.g. 3/24h) and the hours remaining to
        complete that unit (e.g. -21h).
      </>
    ),
  },
};

interface EmploiGroupe {
  specialiteId: string;
  emploiId: string | null;
  statut: string | null;
  pdfSigneUrl: string | null;
}

// Écran Scénario 6 (refonte) — Validation groupée par cycle + semestre :
// un seul document signé, une seule validation, pour toutes les
// spécialités concernées à la fois (même dans des écoles/filières
// différentes). Le PDF téléchargé regroupe une page par spécialité.
export default function ValidationEDTPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const enLigne = useOnlineStatus();
  const perimetreIds =
    user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState(searchParams.get('cycle') || '');
  const [semestre, setSemestre] = useState(searchParams.get('semestre') || '');
  const [semaine, setSemaine] = useState(searchParams.get('semaine') || '');

  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const [specialiteAffichee, setSpecialiteAffichee] = useState('');
  const [emplois, setEmplois] = useState<EmploiGroupe[]>([]);
  const [seances, setSeances] = useState<SeanceGroupee[]>([]);
  const [specialitesParTronc, setSpecialitesParTronc] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [heuresEffectueesParSpecialite, setHeuresEffectueesParSpecialite] =
    useState<Map<string, Map<string, number>>>(new Map());

  const [chargement, setChargement] = useState(false);
  const [upload, setUpload] = useState(false);
  const [validation, setValidation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!enLigne) return;
    listCyclesDisponibles(perimetreIds).then(setCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne]);

  // Resynchronise avec l'URL à chaque navigation vers cette page (pas
  // seulement au tout premier montage) — sinon, en arrivant une
  // deuxième fois depuis "Génération EDT" avec une sélection différente
  // mais le même cycle/semestre, la page garde silencieusement l'ancien
  // état.
  useEffect(() => {
    setCycleKey(searchParams.get('cycle') || '');
    setSemestre(searchParams.get('semestre') || '');
    setSemaine(searchParams.get('semaine') || '');
  }, [searchParams]);

  useEffect(() => {
    if (!cycleKey || !semestre || !enLigne) {
      setSpecialites([]);
      return;
    }
    const specialitesParam = searchParams.get('specialites');

    // Sélection explicite déjà faite (depuis "Génération EDT") — on va
    // chercher directement ces spécialités par leur id, sans repasser
    // par le filtre cycle/semestre qui pourrait en perdre certaines
    // (libellés de semestre pas identiques d'une spécialité à l'autre,
    // ex: "S3" vs "S3&4").
    if (specialitesParam) {
      const ids = specialitesParam.split(',').filter(Boolean);
      listSpecialitesParIds(ids).then((liste) => {
        setSpecialites(liste);
        setSpecialiteAffichee((prev) =>
          liste.some((s) => s.id === prev) ? prev : liste[0]?.id ?? ''
        );
      });
      return;
    }

    const [cycle, sousCycle] = cycleKey.split('::');
    listSpecialitesDuCycleSemestre(
      cycle,
      sousCycle || null,
      semestre,
      perimetreIds
    ).then((liste) => {
      setSpecialites(liste);
      setSpecialiteAffichee((prev) =>
        liste.some((s) => s.id === prev) ? prev : liste[0]?.id ?? ''
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre, enLigne, searchParams.get('specialites')]);

  useEffect(() => {
    if (specialites.length === 0 || !semaine || !enLigne) {
      setEmplois([]);
      setSeances([]);
      return;
    }
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialites, semaine, enLigne]);

  async function charger() {
    setChargement(true);
    setErreur(null);
    setSucces(false);
    try {
      const specialiteIds = specialites.map((s) => s.id);
      const { data: emploisData } = await supabase
        .from('emplois_du_temps')
        .select('id, specialite_id, statut, pdf_signe_url')
        .in('specialite_id', specialiteIds)
        .eq('semaine', semaine);

      setEmplois(
        specialiteIds.map((id) => {
          const e = (emploisData ?? []).find((x: any) => x.specialite_id === id);
          return {
            specialiteId: id,
            emploiId: e?.id ?? null,
            statut: e?.statut ?? null,
            pdfSigneUrl: e?.pdf_signe_url ?? null,
          };
        })
      );

      const donnees = await getSeancesGroupees(specialiteIds, semaine);
      setSeances(donnees.seances);
      setSpecialitesParTronc(donnees.specialitesParTronc);

      const troncIdsGlobal = Array.from(
        new Set(
          donnees.seances
            .filter((s) => s.troncCommunId)
            .map((s) => s.troncCommunId as string)
        )
      );
      const heuresTroncsGlobal =
        troncIdsGlobal.length > 0
          ? await getHeuresEffectueesTronc(troncIdsGlobal, semaine)
          : new Map<string, number>();

      const heuresParSpe = new Map<string, Map<string, number>>();
      for (const specId of specialiteIds) {
        const offreIds = Array.from(
          new Set(
            donnees.seances
              .filter((s) => s.specialiteId === specId && s.offreId)
              .map((s) => s.offreId as string)
          )
        );
        const heuresOffres =
          offreIds.length > 0
            ? await getHeuresEffectuees(offreIds, semaine)
            : new Map<string, number>();
        heuresParSpe.set(specId, new Map([...heuresOffres, ...heuresTroncsGlobal]));
      }
      setHeuresEffectueesParSpecialite(heuresParSpe);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setChargement(false);
    }
  }

  const [cycleNom] = cycleKey.split('::');
  const estHND = cycleNom.toUpperCase() === 'HND';
  const texte = estHND ? TEXTES.en : TEXTES.fr;

  const emploisAvecDonnees = emplois.filter((e) => e.emploiId);
  const auMoinsUnSigne = emploisAvecDonnees.some((e) => e.pdfSigneUrl);
  const tousSignes =
    emploisAvecDonnees.length > 0 &&
    emploisAvecDonnees.every((e) => e.pdfSigneUrl);
  const tousValides =
    emploisAvecDonnees.length > 0 &&
    emploisAvecDonnees.every((e) => e.statut === 'valide');

  function handleImprimer() {
    const titreOriginal = document.title;
    document.title = `EDT ${cycleNom} ${semestre} ${formatSemaineFichier(semaine)}`
      .replace(/\s+/g, ' ')
      .trim();
    function restaurer() {
      document.title = titreOriginal;
      window.removeEventListener('afterprint', restaurer);
    }
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const emploiIds = emploisAvecDonnees
      .map((x) => x.emploiId)
      .filter((x): x is string => !!x);
    if (emploiIds.length === 0) return;
    setUpload(true);
    setErreur(null);
    try {
      const url = await uploaderDocumentSigneGroupe(emploiIds, fichier);
      setEmplois((prev) =>
        prev.map((x) => (x.emploiId ? { ...x, pdfSigneUrl: url } : x))
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi.");
    } finally {
      setUpload(false);
    }
  }

  async function handleValider() {
    setValidation(true);
    setErreur(null);
    try {
      for (const e of emploisAvecDonnees) {
        if (e.emploiId && e.statut !== 'valide') {
          await validerEDT(e.emploiId);
        }
      }
      setEmplois((prev) =>
        prev.map((x) => (x.emploiId ? { ...x, statut: 'valide' } : x))
      );
      setSucces(true);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : 'Erreur lors de la validation.'
      );
    } finally {
      setValidation(false);
    }
  }

  if (!enLigne) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="font-extrabold text-2xl text-gray-900 mb-4">
          Validation de l'emploi du temps
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-amber-700">
            Connexion nécessaire pour cet écran.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="print:hidden">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          Validation de l'emploi du temps
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Un seul document signé et une seule validation pour toutes les
          spécialités du cycle et du semestre.
        </p>

        <div className="bg-white rounded-[20px] p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <select
            value={cycleKey}
            onChange={(e) => {
              setCycleKey(e.target.value);
              setSemestre('');
            }}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
          >
            <option value="">Cycle...</option>
            {cycles.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
            disabled={!cycleKey}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <option value="">Semestre...</option>
            {['S1', 'S2', 'S3', 'S4', 'S3&4', 'S5&6'].map((s) => (
              <option key={s} value={s}>
                {s}
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
        </div>

        {chargement ? (
          <div className="flex items-center justify-center py-16 text-gray-300">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : specialites.length === 0 ? (
          cycleKey && semestre && semaine ? (
            <div className="bg-amber-50 rounded-xl px-4 py-3.5">
              <p className="text-sm font-bold text-amber-700">
                Aucune spécialité accessible pour ce cycle et ce semestre.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[20px] p-8 text-center text-sm text-gray-400">
              Choisis un cycle, un semestre et une semaine.
            </div>
          )
        ) : emploisAvecDonnees.length === 0 ? (
          <div className="bg-amber-50 rounded-xl px-4 py-3.5">
            <p className="text-sm font-bold text-amber-700">
              Aucun emploi du temps généré pour ce cycle/semestre/semaine —
              va d'abord le confectionner.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <select
                value={specialiteAffichee}
                onChange={(e) => setSpecialiteAffichee(e.target.value)}
                className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:border-red-600 bg-white"
              >
                {specialites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} — {s.ecoleNom}
                  </option>
                ))}
              </select>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  tousValides
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tousValides
                  ? 'Groupe validé'
                  : `Généré — ${emploisAvecDonnees.length} spécialité${
                      emploisAvecDonnees.length > 1 ? 's' : ''
                    }`}
              </span>
              <div className="flex gap-2">
                {!tousValides && (
                  <Link
                    to={`/emploi-du-temps?cycle=${encodeURIComponent(
                      cycleKey
                    )}&semestre=${semestre}&semaine=${semaine}`}
                    className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={15} /> Modifier
                  </Link>
                )}
                <button
                  onClick={handleImprimer}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  <Printer size={16} /> Télécharger le PDF (
                  {emploisAvecDonnees.length} spécialité
                  {emploisAvecDonnees.length > 1 ? 's' : ''})
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
                          (s) =>
                            s.jour === jour &&
                            s.creneau === creneau &&
                            (s.specialiteId === specialiteAffichee ||
                              (s.troncCommunId &&
                                specialitesParTronc
                                  .get(s.troncCommunId)
                                  ?.has(specialiteAffichee)))
                        );
                        return (
                          <td
                            key={creneau}
                            className="px-2 py-2 border-b border-gray-50 align-top"
                          >
                            {cellules.length === 0 ? (
                              <span className="text-gray-200 text-xs px-2">—</span>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {cellules.map((s) => (
                                  <div key={s.id} className="bg-gray-50 rounded-xl px-3 py-2">
                                    <p className="font-bold text-xs text-gray-900">{s.ueNom}</p>
                                    <p className="text-[11px] text-gray-400">
                                      {s.enseignantNom} · {s.salleCode ?? 'Aucune salle'}
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

            {!tousValides && (
              <div className="bg-white rounded-[20px] p-5">
                <p className="font-extrabold text-sm text-gray-900 mb-1">
                  Document signé par le directeur
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Un seul document pour tout le groupe — obligatoire avant
                  validation.
                </p>

                {auMoinsUnSigne && tousSignes ? (
                  <a
                    href={emploisAvecDonnees[0].pdfSigneUrl ?? undefined}
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
                      {upload ? 'Envoi...' : 'Prendre une photo / choisir un fichier'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={handleUpload}
                      className="hidden"
                      disabled={upload}
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
                  disabled={!tousSignes || validation}
                  className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {validation && <Loader2 size={15} className="animate-spin" />}
                  Valider le groupe
                </button>
              </div>
            )}

            {succes && (
              <div className="flex items-center gap-2 bg-green-50 rounded-xl px-4 py-3 mt-4">
                <CheckCircle2 size={16} className="text-green-600" />
                <p className="text-sm font-bold text-green-700">
                  Emplois du temps validés — enseignants notifiés.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {emploisAvecDonnees.length > 0 && (
        <>
          <style>{'@page { size: landscape; margin: 0; }'}</style>
          {specialites
            .filter((sp) =>
              emploisAvecDonnees.some((e) => e.specialiteId === sp.id)
            )
            .map((sp, idx, tableau) => {
              const seancesSpe = seances.filter(
                (s) =>
                  s.specialiteId === sp.id ||
                  (s.troncCommunId &&
                    specialitesParTronc.get(s.troncCommunId)?.has(sp.id))
              );
              const heuresEffectuees =
                heuresEffectueesParSpecialite.get(sp.id) ?? new Map();
              return (
                <div
                  key={sp.id}
                  className="hidden print:block text-black relative"
                  style={{
                    padding: '10mm',
                    pageBreakAfter:
                      idx < tableau.length - 1 ? 'always' : 'auto',
                  }}
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
                        <p className="text-blue-600 font-bold text-sm mb-2">(CENULAPE)</p>
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
                        <p className="text-blue-600 font-bold text-sm mb-2">(CENULAPE)</p>
                        <p className="font-bold text-xs">
                          Email :{' '}
                          <span className="text-blue-600 underline">info@laperle-sup.com</span>
                        </p>
                        <p className="font-bold text-xs">
                          {texte.siteWeb} :{' '}
                          <span className="text-blue-600 underline">www.laperle-sup.com</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-center italic font-bold text-xs mb-3">
                      {texte.autorisation}
                    </p>

                    <p className="text-center text-red-600 font-extrabold text-lg">
                      {texte.emploiDuTemps} {sp.nom.toUpperCase()}
                    </p>
                    <p className="text-center text-red-600 font-extrabold text-lg mb-3">
                      {texte.semaine} {formatSemaineTitre(semaine, estHND)}
                    </p>

                    <div className="flex items-center justify-between mb-2 text-sm font-bold">
                      <span>{texte.semestre} {semestre}</span>
                      <span>{texte.annee} : 2026/2027</span>
                      <span>{texte.salle} : ……….</span>
                    </div>

                    <table className="w-full border-collapse border border-black text-[11px] mb-3">
                      <thead>
                        <tr>
                          <th className="border border-black px-2 py-1.5">{texte.horaire}</th>
                          {JOURS.map((j) => (
                            <th key={j} className="border border-black px-2 py-1.5">
                              {traduireJour(j, estHND).toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CRENEAUX.map((creneau, cidx) => (
                          <Fragment key={creneau}>
                            <tr>
                              <td className="border border-black px-2 py-2 text-red-600 font-bold text-center align-middle">
                                {creneau.replace('h-', 'h00 - ') + '00'}
                              </td>
                              {JOURS.map((jour) => {
                                const s = seancesSpe.find(
                                  (x) => x.jour === jour && x.creneau === creneau
                                );
                                if (!s)
                                  return <td key={jour} className="border border-black px-2 py-2" />;
                                const total = s.volumeHoraire ?? 0;
                                const faites = heuresEffectuees.get(s.id) ?? 0;
                                const restant = total - faites;
                                return (
                                  <td
                                    key={jour}
                                    className="border border-black px-2 py-2 text-center align-top"
                                  >
                                    <p className="font-bold">{s.ueNom}</p>
                                    <p className="font-bold">{s.enseignantNom}</p>
                                    <p className="font-semibold text-[10px] text-gray-700">
                                      {s.salleCode ?? texte.salleAConfirmer}
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
                            {cidx === 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="border border-black bg-green-400 text-center font-bold py-1"
                                >
                                  {texte.pause}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>

                    <p className="text-[10px] font-bold leading-snug">{texte.nb}</p>
                  </div>
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}