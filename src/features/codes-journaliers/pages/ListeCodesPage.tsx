// src/features/codes-journaliers/pages/ListeCodesPage.tsx
import { Fragment, useEffect, useState } from 'react';
import {
  Loader2,
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  WifiOff,
} from 'lucide-react';
import { JOURS, CRENEAUX } from '@/constants/enums';
import { useAuthStore } from '@/stores/authStore';
import { filtrerParPerimetreParChamp } from '@/lib/perimetre';
import {
  listCodesPourSemaine,
  lireCodesDepuisCache,
  jourDAujourdhuiDansSemaine,
  type CodeSeanceDetail,
} from '../api';

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function lundiDeLaSemaine(reference = new Date()): string {
  const d = new Date(reference);
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function decalerSemaine(semaineISO: string, nbSemaines: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + nbSemaines * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatSemaineLabel(semaineISO: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  const moisLundi = MOIS_FR[lundi.getMonth()];
  const moisSamedi = MOIS_FR[samedi.getMonth()];
  if (moisLundi === moisSamedi) {
    return `${lundi.getDate()} au ${samedi.getDate()} ${moisSamedi} ${samedi.getFullYear()}`;
  }
  return `${lundi.getDate()} ${moisLundi} au ${samedi.getDate()} ${moisSamedi} ${samedi.getFullYear()}`;
}

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

const STATUT_LABEL: Record<string, string> = {
  utilise: 'Utilisé',
  non_utilise: 'Non utilisé',
};

// Écran 5.1 (ecrans_ui.md) — Scénario 7 : liste des codes journaliers,
// filtrable par jour/créneau/recherche, avec export PDF structuré
// jour → créneau → page ouverture / page fermeture. La secrétaire arrive
// par défaut sur le jour concerné (journal.md : elle reçoit les codes jour
// par jour), mais peut naviguer librement vers les autres jours.
export default function ListeCodesPage() {
  const user = useAuthStore((s) => s.user);
  const estSecretaire = user?.role === 'secretaire';

  const [semaine, setSemaine] = useState(lundiDeLaSemaine());
  const [codes, setCodes] = useState<CodeSeanceDetail[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depuisCache, setDepuisCache] = useState(false);

  const [filtreJour, setFiltreJour] = useState('Tous');
  const [filtreCreneau, setFiltreCreneau] = useState('Tous');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    let cancelled = false;
    setChargement(true);
    setErreur(null);

    function appliquer(data: CodeSeanceDetail[]) {
      setCodes(data);
      // Pour la secrétaire : pré-sélectionne le jour concerné (aujourd'hui,
      // s'il tombe dans la semaine affichée) ; sinon on laisse "Tous".
      if (estSecretaire) {
        const jourDuJour = jourDAujourdhuiDansSemaine(semaine);
        setFiltreJour(jourDuJour ?? 'Tous');
      }
    }

    async function charger() {
      let aDesDonneesLocales = false;
      // 1. Cache local d'abord — instantané, marche hors ligne.
      try {
        const local = await lireCodesDepuisCache(semaine);
        if (!cancelled && local.length > 0) {
          appliquer(local);
          setDepuisCache(true);
          setChargement(false);
          aDesDonneesLocales = true;
        }
      } catch {
        // pas grave, on retombe sur le réseau
      }

      // 2. Réseau ensuite.
      if (!navigator.onLine) {
        if (!cancelled) setChargement(false);
        return;
      }
      try {
        const frais = await listCodesPourSemaine(semaine);
        if (!cancelled) {
          appliquer(frais);
          setDepuisCache(false);
          setErreur(null);
        }
      } catch (err) {
        if (!cancelled && !aDesDonneesLocales) {
          setErreur(
            err instanceof Error ? err.message : 'Erreur de chargement'
          );
        }
      } finally {
        if (!cancelled) setChargement(false);
      }
    }

    charger();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaine]);

  const codesVisibles = filtrerParPerimetreParChamp(
    codes,
    user,
    (c) => c.specialiteId
  );

  const filtres = codesVisibles.filter((c) => {
    if (filtreJour !== 'Tous' && c.jour !== filtreJour) return false;
    if (filtreCreneau !== 'Tous' && c.creneau !== filtreCreneau) return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      if (
        !c.ueNom.toLowerCase().includes(q) &&
        !c.enseignantNom.toLowerCase().includes(q) &&
        !c.specialiteNom.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Regroupement jour → créneau pour la vue imprimable.
  const groupes = JOURS.map((jour) => ({
    jour,
    creneaux: CRENEAUX.map((creneau) => ({
      creneau,
      lignes: filtres.filter((c) => c.jour === jour && c.creneau === creneau),
    })).filter((c) => c.lignes.length > 0),
  })).filter((g) => g.creneaux.length > 0);

  function handleImprimer() {
    const titreOriginal = document.title;
    document.title = `Codes journaliers ${formatSemaineFichier(semaine)}`;
    function restaurer() {
      document.title = titreOriginal;
      window.removeEventListener('afterprint', restaurer);
    }
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  return (
    <div>
      <div className="print:hidden max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <p className="font-extrabold text-2xl text-gray-900">
              Codes journaliers
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              Codes d'ouverture et de fermeture des séances de la semaine
            </p>
            {depuisCache && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1.5">
                <WifiOff size={12} /> Données locales — en attente de
                rafraîchissement
              </p>
            )}
          </div>
          <button
            onClick={handleImprimer}
            disabled={filtres.length === 0}
            className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer size={16} /> Télécharger le PDF
          </button>
        </div>

        <div className="flex mb-4">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
            <Search size={15} className="text-gray-300 shrink-0" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher..."
              className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-white rounded-full px-2 py-1.5 shrink-0">
            <button
              onClick={() => setSemaine((s) => decalerSemaine(s, -1))}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
              aria-label="Semaine précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-bold text-gray-700 px-1 whitespace-nowrap">
              Semaine du {formatSemaineLabel(semaine)}
            </p>
            <button
              onClick={() => setSemaine((s) => decalerSemaine(s, 1))}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
              aria-label="Semaine suivante"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <select
            value={filtreJour}
            onChange={(e) => setFiltreJour(e.target.value)}
            className="bg-white rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 outline-none shrink-0"
          >
            <option value="Tous">Tous les jours</option>
            {JOURS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          <select
            value={filtreCreneau}
            onChange={(e) => setFiltreCreneau(e.target.value)}
            className="bg-white rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 outline-none shrink-0"
          >
            <option value="Tous">Tous les créneaux</option>
            {CRENEAUX.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-[20px] overflow-hidden overflow-x-auto">
          {chargement ? (
            <div className="flex items-center justify-center py-16 text-gray-300">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : erreur ? (
            <div className="p-6 text-sm font-semibold text-red-600">
              Impossible de charger les codes : {erreur}
            </div>
          ) : filtres.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-gray-300">
              Aucun code pour cette sélection. Les codes n'apparaissent que pour
              les emplois du temps déjà validés (Scénario 6).
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase font-bold">
                  <th className="px-5 py-3">Jour</th>
                  <th className="px-5 py-3">Créneau</th>
                  <th className="px-5 py-3">Spécialité</th>
                  <th className="px-5 py-3">UE</th>
                  <th className="px-5 py-3">Enseignant</th>
                  <th className="px-5 py-3">Salle</th>
                  <th className="px-5 py-3">Code ouverture</th>
                  <th className="px-5 py-3">Code fermeture</th>
                  <th className="px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtres.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-semibold">{c.jour}</td>
                    <td className="px-5 py-3 text-gray-500">{c.creneau}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {c.specialiteNom}
                    </td>
                    <td className="px-5 py-3 font-bold">{c.ueNom}</td>
                    <td className="px-5 py-3">{c.enseignantNom}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {c.salleCode ?? 'Salle à confirmer'}
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-red-600">
                      {c.codeOuverture}
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-red-600">
                      {c.codeFermeture}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          c.statut === 'utilise'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {STATUT_LABEL[c.statut] ?? c.statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Vue imprimable — un créneau = 2 pages (ouverture, puis fermeture),
          groupées par jour, comme demandé dans journal.md Scénario 7. */}
      {groupes.length > 0 && (
        <>
          <style>{'@page { size: portrait; margin: 12mm; }'}</style>
          <div className="hidden print:block text-black">
            {groupes.map((g) => (
              <Fragment key={g.jour}>
                {g.creneaux.map((c) => (
                  <Fragment key={`${g.jour}-${c.creneau}`}>
                    <PageCodes
                      jour={g.jour}
                      creneau={c.creneau}
                      lignes={c.lignes}
                      type="ouverture"
                    />
                    <PageCodes
                      jour={g.jour}
                      creneau={c.creneau}
                      lignes={c.lignes}
                      type="fermeture"
                    />
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PageCodes({
  jour,
  creneau,
  lignes,
  type,
}: {
  jour: string;
  creneau: string;
  lignes: CodeSeanceDetail[];
  type: 'ouverture' | 'fermeture';
}) {
  return (
    <div style={{ breakAfter: 'page', pageBreakAfter: 'always' }}>
      <p className="text-center text-red-600 font-extrabold text-lg">
        CODES DE {type === 'ouverture' ? 'OUVERTURE' : 'FERMETURE'}
      </p>
      <p className="text-center font-bold text-sm mb-4">
        {jour.toUpperCase()} — {creneau}
      </p>
      <table className="w-full border-collapse border border-black text-sm">
        <thead>
          <tr>
            <th className="border border-black px-2 py-1.5">Spécialité</th>
            <th className="border border-black px-2 py-1.5">UE</th>
            <th className="border border-black px-2 py-1.5">Enseignant</th>
            <th className="border border-black px-2 py-1.5">Salle</th>
            <th className="border border-black px-2 py-1.5">
              Code {type === 'ouverture' ? "d'ouverture" : 'de fermeture'}
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td className="border border-black px-2 py-2">
                {l.specialiteNom}
              </td>
              <td className="border border-black px-2 py-2 font-bold">
                {l.ueNom}
              </td>
              <td className="border border-black px-2 py-2">
                {l.enseignantNom}
              </td>
              <td className="border border-black px-2 py-2">
                {l.salleCode ?? '—'}
              </td>
              <td className="border border-black px-2 py-2 text-center font-mono font-extrabold text-lg">
                {type === 'ouverture' ? l.codeOuverture : l.codeFermeture}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
