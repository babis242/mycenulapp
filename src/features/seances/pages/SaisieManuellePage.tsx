// src/features/seances/pages/SaisieManuellePage.tsx
import { useRef, useState } from 'react';
import {
  Loader2,
  Search,
  Save,
  CheckCircle2,
  WifiOff,
  MousePointerClick,
} from 'lucide-react';
import { db, enqueueSyncAction } from '@/lib/db';
import { JOURS, tousLesCreneaux } from '@/constants/enums';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import RapportSeanceForm from '../components/RapportSeanceForm';
import {
  rechercherSeancesPourSaisieManuelle,
  dernieresSemaines,
  lireSeancesPourSaisieManuelleDepuisCache,
  saisirHeureManuelle,
  type SeanceRecherche,
} from '../api';

// Convertit un ISO datetime en valeur pour <input type="datetime-local">
// (heure locale, sans le "Z").
function versDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const JOURS_INDEX: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
  Dimanche: 6,
};

// Date calendaire réelle du jour programmé, à partir du lundi de la
// semaine et du nom du jour ("Mardi" → mardi de cette semaine-là).
function dateAttendue(semaine: string, jour: string): Date {
  const [y, m, d] = semaine.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + (JOURS_INDEX[jour] ?? 0));
  return date;
}

// Format court (ex: "14/09") pour distinguer d'un coup d'œil deux
// séances du même jour/créneau mais de semaines différentes — sans ça,
// deux "Mardi · 08h-12h" de semaines distinctes sont indiscernables.
function formatDateCourte(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`;
}

// Extrait les bornes (en minutes depuis minuit) d'un créneau du type
// "08h-12h" ou "14h30-17h".
function bornesCreneau(creneau: string): { debut: number; fin: number } {
  const match = creneau.match(/(\d{1,2})h(\d{0,2})\s*-\s*(\d{1,2})h(\d{0,2})/);
  if (!match) return { debut: 0, fin: 24 * 60 };
  const [, hd, md, hf, mf] = match;
  return {
    debut: Number(hd) * 60 + (md ? Number(md) : 0),
    fin: Number(hf) * 60 + (mf ? Number(mf) : 0),
  };
}

// Marge de tolérance (minutes) avant/après le créneau — pour ne pas
// bloquer un léger retard ou une arrivée un peu en avance, tout en
// détectant les vraies erreurs (mauvais jour, mauvais créneau horaire).
const MARGE_TOLERANCE_MIN = 60;

// Vérifie qu'une heure saisie correspond bien au jour et au créneau
// programmés de la séance — renvoie un message d'erreur, ou null si ok.
function validerHeureContreCreneau(
  valeurDatetimeLocal: string,
  label: string,
  seance: SeanceRecherche
): string | null {
  if (!valeurDatetimeLocal) return null;
  const saisie = new Date(valeurDatetimeLocal);
  const attendue = dateAttendue(seance.semaine, seance.jour);

  const memeJour =
    saisie.getFullYear() === attendue.getFullYear() &&
    saisie.getMonth() === attendue.getMonth() &&
    saisie.getDate() === attendue.getDate();
  if (!memeJour) {
    return `${label} : la date ne correspond pas au ${
      seance.jour
    } programmé (${attendue.toLocaleDateString('fr-FR')}).`;
  }

  const { debut, fin } = bornesCreneau(seance.creneau);
  const minutesSaisies = saisie.getHours() * 60 + saisie.getMinutes();
  if (
    minutesSaisies < debut - MARGE_TOLERANCE_MIN ||
    minutesSaisies > fin + MARGE_TOLERANCE_MIN
  ) {
    return `${label} : ${saisie.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })} est en dehors du créneau programmé (${seance.creneau}).`;
  }
  return null;
}

// Écran 6.3 (ecrans_ui.md) — Scénario 8, flux de secours : la secrétaire
// (ou Responsable/Admin) enregistre manuellement l'heure notée sur le
// cahier papier lorsque l'app n'était pas disponible.
export default function SaisieManuellePage() {
  const enLigne = useOnlineStatus();
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<SeanceRecherche[]>([]);
  const [chargement, setChargement] = useState(false);
  const [aRecherche, setARecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [filtreSemaine, setFiltreSemaine] = useState('');
  const [filtreJour, setFiltreJour] = useState('');
  const [filtreCreneau, setFiltreCreneau] = useState('');

  const [selection, setSelection] = useState<SeanceRecherche | null>(null);
  const [heureOuverture, setHeureOuverture] = useState('');
  const [heureFermeture, setHeureFermeture] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [succes, setSucces] = useState(false);
  const [enregistreHorsLigne, setEnregistreHorsLigne] = useState(false);

  // ── Saisie en groupe (cases à cocher) ──
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [groupeArrivee, setGroupeArrivee] = useState('');
  const [groupeDepart, setGroupeDepart] = useState('');
  const [groupeCreneau, setGroupeCreneau] = useState(false);
  // null = automatique (jour commun des séances cochées, ou leur propre
  // jour si elles n'en ont pas un seul en commun).
  const [groupeJour, setGroupeJour] = useState<string | null>(null);
  const [groupeEnCours, setGroupeEnCours] = useState(false);
  const [groupeMessage, setGroupeMessage] = useState<{
    ok: boolean;
    texte: string;
  } | null>(null);

  // La recherche respecte toujours la semaine / le jour / le créneau
  // choisis : seuls les résultats de ce filtre sont retournés.
  async function lancerRecherche(
    e?: React.FormEvent,
    filtres: { semaine: string; jour: string; creneau: string } = {
      semaine: filtreSemaine,
      jour: filtreJour,
      creneau: filtreCreneau,
    }
  ) {
    e?.preventDefault();
    setChargement(true);
    setErreur(null);
    setARecherche(true);
    try {
      const f = {
        semaine: filtres.semaine || undefined,
        jour: filtres.jour || undefined,
        creneau: filtres.creneau || undefined,
      };
      const data = navigator.onLine
        ? await rechercherSeancesPourSaisieManuelle(recherche, f)
        : await lireSeancesPourSaisieManuelleDepuisCache(recherche, f);
      setResultats(data);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de recherche.');
    } finally {
      setChargement(false);
    }
  }

  // Options de filtre dérivées des résultats actuels uniquement (pas de
  // valeur qui n'existerait dans aucune séance retournée) — semaines
  // triées de la plus récente à la plus ancienne, jours dans l'ordre du
  // calendrier, créneaux dans l'ordre chronologique de la journée.
  // Options toujours proposées (5 dernières semaines, jours, créneaux
  // configurés) + celles présentes dans les résultats : on peut choisir
  // un filtre AVANT de lancer la recherche.
  const semainesDisponibles = Array.from(
    new Set([...dernieresSemaines(5), ...resultats.map((s) => s.semaine)])
  ).sort((a, b) => b.localeCompare(a));

  const joursDisponibles = Array.from(
    new Set([...JOURS, ...resultats.map((s) => s.jour)])
  ).sort((a, b) => (JOURS_INDEX[a] ?? 0) - (JOURS_INDEX[b] ?? 0));

  const creneauxDisponibles = Array.from(
    new Set([...tousLesCreneaux(), ...resultats.map((s) => s.creneau)])
  ).sort((a, b) => bornesCreneau(a).debut - bornesCreneau(b).debut);

  const resultatsFiltres = resultats.filter(
    (s) =>
      (!filtreSemaine || s.semaine === filtreSemaine) &&
      (!filtreJour || s.jour === filtreJour) &&
      (!filtreCreneau || s.creneau === filtreCreneau)
  );

  const seancesCochees = resultats.filter((s) => cochees.has(s.id));
  const toutesCocheesFiltrees =
    resultatsFiltres.length > 0 &&
    resultatsFiltres.every((s) => cochees.has(s.id));

  function basculerCochee(id: string) {
    setGroupeMessage(null);
    setCochees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function basculerToutesFiltrees() {
    setGroupeMessage(null);
    setCochees((prev) => {
      const next = new Set(prev);
      if (toutesCocheesFiltrees) resultatsFiltres.forEach((s) => next.delete(s.id));
      else resultatsFiltres.forEach((s) => next.add(s.id));
      return next;
    });
  }

  // Combine la date réelle de la séance et une heure "HH:mm" → ISO.
  function isoDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Jour commun à toutes les séances cochées (null s'il y en a plusieurs).
  const joursDesCochees = Array.from(
    new Set(seancesCochees.map((s) => isoDate(dateAttendue(s.semaine, s.jour))))
  );
  const jourCommun = joursDesCochees.length === 1 ? joursDesCochees[0] : null;
  const jourEffectif = groupeJour ?? jourCommun ?? '';

  function isoPourSeance(seance: SeanceRecherche, minutes: number): string {
    const d = jourEffectif
      ? (() => {
          const [y, m, j] = jourEffectif.split('-').map(Number);
          return new Date(y, m - 1, j);
        })()
      : dateAttendue(seance.semaine, seance.jour);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d.toISOString();
  }

  function enMinutes(hhmm: string): number | null {
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  async function handleEnregistrerGroupe() {
    setGroupeMessage(null);
    const arrivee = groupeCreneau ? null : enMinutes(groupeArrivee);
    const depart = groupeCreneau ? null : enMinutes(groupeDepart);
    if (!groupeCreneau && arrivee == null && depart == null) {
      setGroupeMessage({ ok: false, texte: "Renseigne au moins une heure d'arrivée ou de départ." });
      return;
    }

    // Calcule + valide chaque séance avant d'enregistrer quoi que ce soit.
    const aEnregistrer: { s: SeanceRecherche; ouv: string | null; ferm: string | null }[] = [];
    const erreurs: string[] = [];
    for (const s of seancesCochees) {
      const { debut, fin } = bornesCreneau(s.creneau);
      const ouv = groupeCreneau ? isoPourSeance(s, debut) : arrivee != null ? isoPourSeance(s, arrivee) : null;
      const ferm = groupeCreneau ? isoPourSeance(s, fin) : depart != null ? isoPourSeance(s, depart) : null;
      const etiquette = `${s.ueNom} (${s.jour} ${formatDateCourte(dateAttendue(s.semaine, s.jour))} · ${s.creneau})`;
      const e1 = ouv ? validerHeureContreCreneau(versDatetimeLocal(ouv), "Arrivée", s) : null;
      const e2 = ferm ? validerHeureContreCreneau(versDatetimeLocal(ferm), 'Départ', s) : null;
      if (e1 || e2) erreurs.push(`${etiquette} — ${[e1, e2].filter(Boolean).join(' ')}`);
      else aEnregistrer.push({ s, ouv, ferm });
    }
    if (erreurs.length > 0) {
      setGroupeMessage({
        ok: false,
        texte: `Rien n'a été enregistré. ${erreurs.length} séance(s) hors créneau : ${erreurs.join(' | ')}`,
      });
      return;
    }

    setGroupeEnCours(true);
    let nbOk = 0;
    let horsLigne = false;
    const echecs: string[] = [];
    const reussies = new Map<string, { ouv: string | null; ferm: string | null }>();
    for (const { s, ouv, ferm } of aEnregistrer) {
      try {
        if (await appliquerHeures(s.id, ouv, ferm)) horsLigne = true;
        reussies.set(s.id, { ouv, ferm });
        nbOk++;
      } catch (err) {
        echecs.push(`${s.ueNom} : ${err instanceof Error ? err.message : 'échec'}`);
      }
    }
    setResultats((prev) =>
      prev.map((s) => {
        const r = reussies.get(s.id);
        return r
          ? { ...s, heureOuverture: r.ouv ?? s.heureOuverture, heureFermeture: r.ferm ?? s.heureFermeture }
          : s;
      })
    );
    setCochees((prev) => {
      const next = new Set(prev);
      reussies.forEach((_, id) => next.delete(id));
      return next;
    });
    setGroupeEnCours(false);
    setGroupeMessage({
      ok: echecs.length === 0,
      texte:
        `${nbOk} séance(s) enregistrée(s)` +
        (horsLigne ? ' localement — envoi au retour du réseau' : '') +
        (echecs.length ? `. Échecs : ${echecs.join(' | ')}` : '.'),
    });
  }

  // Sur petit écran le panneau est sous la liste : on y amène l'écran.
  // Sur ordinateur il est déjà visible à droite.
  const panneauRef = useRef<HTMLDivElement>(null);

  function selectionner(s: SeanceRecherche) {
    setSelection(s);
    if (!window.matchMedia('(min-width: 640px)').matches) {
      setTimeout(
        () =>
          panneauRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          }),
        50
      );
    }
    setHeureOuverture(versDatetimeLocal(s.heureOuverture));
    setHeureFermeture(versDatetimeLocal(s.heureFermeture));
    setSucces(false);
    setErreur(null);
  }

  // Enregistre les heures d'une séance (en ligne, ou en file d'attente
  // hors ligne). Renvoie true si l'enregistrement est parti en file.
  async function appliquerHeures(
    seanceId: string,
    nouvelleOuverture: string | null,
    nouvelleFermeture: string | null
  ): Promise<boolean> {
    if (navigator.onLine) {
      await saisirHeureManuelle(seanceId, {
        heureOuverture: nouvelleOuverture,
        heureFermeture: nouvelleFermeture,
      });
      return false;
    }
    await enqueueSyncAction({
      entity: 'seancesEDT',
      operation: 'update',
      payload: {
        seanceId,
        heureOuverture: nouvelleOuverture,
        heureFermeture: nouvelleFermeture,
      },
    });
    const seanceLocale = await db.seancesEDT.get(seanceId);
    if (seanceLocale) {
      await db.seancesEDT.put({
        ...seanceLocale,
        heure_ouverture: nouvelleOuverture ?? (seanceLocale as any).heure_ouverture,
        heure_fermeture: nouvelleFermeture ?? (seanceLocale as any).heure_fermeture,
        mode_ouverture: nouvelleOuverture
          ? 'manuel'
          : (seanceLocale as any).mode_ouverture,
        mode_fermeture: nouvelleFermeture
          ? 'manuel'
          : (seanceLocale as any).mode_fermeture,
      } as any);
    }
    return true;
  }

  async function handleEnregistrer() {
    if (!selection) return;
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);
    try {
      const erreurOuverture = validerHeureContreCreneau(
        heureOuverture,
        "Heure d'ouverture",
        selection
      );
      const erreurFermeture = validerHeureContreCreneau(
        heureFermeture,
        'Heure de fermeture',
        selection
      );
      if (erreurOuverture || erreurFermeture) {
        setErreur([erreurOuverture, erreurFermeture].filter(Boolean).join(' '));
        return;
      }

      const nouvelleOuverture = heureOuverture
        ? new Date(heureOuverture).toISOString()
        : null;
      const nouvelleFermeture = heureFermeture
        ? new Date(heureFermeture).toISOString()
        : null;

      const horsLigne = await appliquerHeures(
        selection.id,
        nouvelleOuverture,
        nouvelleFermeture
      );
      setEnregistreHorsLigne(horsLigne);

      setSucces(true);
      setResultats((prev) =>
        prev.map((s) =>
          s.id === selection.id
            ? {
                ...s,
                heureOuverture: nouvelleOuverture ?? s.heureOuverture,
                heureFermeture: nouvelleFermeture ?? s.heureFermeture,
              }
            : s
        )
      );
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      );
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <div className="saisie-page mx-auto">
      <style>{`
        .saisie-page { max-width: 42rem; }
        .saisie-grille { display: block; }
        .saisie-dates { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }
        @media (min-width: 1100px) { .saisie-dates { grid-template-columns: 1fr 1fr; } }
        .saisie-panneau-vide { display: none; }
        @media (min-width: 640px) {
          .saisie-page { max-width: 80rem; }
          .saisie-grille {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
            gap: 1.5rem;
            align-items: start;
          }
          .saisie-liste { max-height: calc(100vh - 17rem); overflow-y: auto; margin-bottom: 0 !important; }
          .saisie-panneau {
            position: sticky; top: 0;
            max-height: calc(100vh - 3rem);
            overflow-y: auto;
          }
          .saisie-panneau-vide {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; text-align: center; min-height: 320px;
          }
          .saisie-panneau-haut { margin-top: 0 !important; }
        }
      `}</style>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Saisie manuelle
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Flux de secours : enregistre l'heure d'ouverture/fermeture et,
        si besoin, le rapport de séance complet (appel, points abordés,
        cahier de texte) à la place d'un enseignant qui n'a pas pu le
        faire lui-même.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — recherche sur les dernières données enregistrées ;
            l'enregistrement partira dès le retour du réseau.
          </p>
        </div>
      )}

      <div className="saisie-grille">
      <div className="min-w-0">
      <form
        onSubmit={lancerRecherche}
        className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full mb-4"
      >
        <Search size={15} className="text-gray-300 shrink-0" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Enseignant, UE ou jour..."
          className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
        />
        <button
          type="submit"
          className="shrink-0 bg-red-600 rounded-full px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
        >
          Rechercher
        </button>
      </form>

      {true && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={filtreSemaine}
            onChange={(e) => {
              setFiltreSemaine(e.target.value);
              lancerRecherche(undefined, { semaine: e.target.value, jour: filtreJour, creneau: filtreCreneau });
            }}
            className="bg-white rounded-full px-3.5 py-2 text-xs font-bold text-gray-600 outline-none"
          >
            <option value="">Toutes les semaines</option>
            {semainesDisponibles.map((sem) => (
              <option key={sem} value={sem}>
                Semaine du {formatDateCourte(dateAttendue(sem, 'Lundi'))}
              </option>
            ))}
          </select>

          <select
            value={filtreJour}
            onChange={(e) => {
              setFiltreJour(e.target.value);
              lancerRecherche(undefined, { semaine: filtreSemaine, jour: e.target.value, creneau: filtreCreneau });
            }}
            className="bg-white rounded-full px-3.5 py-2 text-xs font-bold text-gray-600 outline-none"
          >
            <option value="">Tous les jours</option>
            {joursDisponibles.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>

          <select
            value={filtreCreneau}
            onChange={(e) => {
              setFiltreCreneau(e.target.value);
              lancerRecherche(undefined, { semaine: filtreSemaine, jour: filtreJour, creneau: e.target.value });
            }}
            className="bg-white rounded-full px-3.5 py-2 text-xs font-bold text-gray-600 outline-none"
          >
            <option value="">Tous les créneaux</option>
            {creneauxDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {(filtreSemaine || filtreJour || filtreCreneau) && (
            <button
              onClick={() => {
                setFiltreSemaine('');
                setFiltreJour('');
                setFiltreCreneau('');
                lancerRecherche(undefined, { semaine: '', jour: '', creneau: '' });
              }}
              className="text-xs font-bold text-red-600 hover:text-red-700 px-1"
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {chargement ? (
        <div className="flex items-center justify-center py-10 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : aRecherche && resultats.length === 0 ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
          Aucune séance trouvée sur la semaine en cours ou la précédente.
        </div>
      ) : resultats.length > 0 && resultatsFiltres.length === 0 ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
          Aucune séance ne correspond à ce filtre.
        </div>
      ) : resultatsFiltres.length > 0 ? (
        <div className="bg-white rounded-[20px] overflow-hidden mb-5 saisie-liste">
          <label className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 cursor-pointer text-xs font-bold text-gray-500">
            <input
              type="checkbox"
              checked={toutesCocheesFiltrees}
              onChange={basculerToutesFiltrees}
              className="shrink-0"
            />
            Tout cocher ({resultatsFiltres.length}) — saisie en groupe
          </label>
          {resultatsFiltres.map((s) => (
            <div
              key={s.id}
              className={`flex items-stretch border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                selection?.id === s.id
                  ? 'bg-red-50 border-l-4 border-l-red-600'
                  : ''
              }`}
            >
              <label className="flex items-center pl-5 pr-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cochees.has(s.id)}
                  onChange={() => basculerCochee(s.id)}
                  className="shrink-0"
                />
              </label>
              <button
                onClick={() => selectionner(s)}
                className="flex-1 min-w-0 text-left flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3.5"
              >
                <div className="min-w-[9rem] flex-1">
                  <p className="font-bold text-sm text-gray-900">
                    {s.ueNom}
                  </p>
                  <p className="text-xs text-gray-400">{s.enseignantNom}</p>
                </div>
                <div className="shrink-0">
                  <p className="text-xs font-bold text-gray-500">
                    {s.jour} {formatDateCourte(dateAttendue(s.semaine, s.jour))}{' '}
                    · {s.creneau}
                  </p>
                  {s.heureOuverture && s.heureFermeture && (
                    <p className="text-[11px] font-semibold text-green-600">
                      Déjà renseignée
                    </p>
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      </div>

      <div
        ref={panneauRef}
        className="saisie-panneau min-w-0"
      >
      {(cochees.size > 0 || groupeMessage) && (
        <div className="bg-white rounded-[20px] p-6 mb-5 border-2 border-red-600">
          <p className="font-extrabold text-gray-900 mb-0.5">
            Saisie en groupe — {seancesCochees.length} séance
            {seancesCochees.length > 1 ? 's' : ''} sélectionnée
            {seancesCochees.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Les heures s'appliquent à la date réelle de chaque séance
            (±{MARGE_TOLERANCE_MIN} min tolérés autour de son créneau).
          </p>

          <label className="block mb-3">
            <span className="text-xs font-bold text-gray-500 mb-1 block">
              Jour {jourCommun ? '(commun aux séances cochées)' : ''}
            </span>
            <input
              type="date"
              value={jourEffectif}
              onChange={(e) => setGroupeJour(e.target.value || null)}
              className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
            />
            <span className="text-[11px] text-gray-400 mt-1 block">
              {jourCommun
                ? 'Toutes les séances cochées ont lieu ce jour-là.'
                : 'Les séances cochées sont sur des jours différents : laisse vide pour que chacune garde son propre jour, ou choisis un jour commun.'}
              {groupeJour && (
                <button
                  type="button"
                  onClick={() => setGroupeJour(null)}
                  className="ml-2 font-bold text-red-600 hover:underline"
                >
                  Remettre automatique
                </button>
              )}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={groupeCreneau}
              onChange={(e) => setGroupeCreneau(e.target.checked)}
            />
            Utiliser les heures exactes du créneau de chaque séance
            (ex : 08h → 12h)
          </label>

          {!groupeCreneau && (
            <div className="saisie-dates mb-4">
              <label className="block">
                <span className="text-xs font-bold text-gray-500 mb-1 block">
                  Heure d'arrivée
                </span>
                <input
                  type="time"
                  value={groupeArrivee}
                  onChange={(e) => setGroupeArrivee(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-500 mb-1 block">
                  Heure de départ
                </span>
                <input
                  type="time"
                  value={groupeDepart}
                  onChange={(e) => setGroupeDepart(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleEnregistrerGroupe}
              disabled={groupeEnCours || seancesCochees.length === 0}
              className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {groupeEnCours ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              Enregistrer pour {seancesCochees.length} séance
              {seancesCochees.length > 1 ? 's' : ''}
            </button>
            <button
              onClick={() => {
                setCochees(new Set());
                setGroupeJour(null);
                setGroupeMessage(null);
              }}
              className="text-xs font-bold text-gray-500 hover:text-gray-800"
            >
              Tout décocher
            </button>
          </div>
          {groupeMessage && (
            <p
              className={`text-xs font-semibold mt-3 ${
                groupeMessage.ok ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {groupeMessage.texte}
            </p>
          )}
        </div>
      )}

      {!selection && cochees.size === 0 && !groupeMessage && (
        <div className="saisie-panneau-vide bg-white rounded-[20px] p-12">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3">
            <MousePointerClick size={22} />
          </div>
          <p className="font-extrabold text-gray-900 mb-1">
            Sélectionne une séance
          </p>
          <p className="text-sm text-gray-400 max-w-xs">
            Clique sur un cours ou un enseignant dans la liste : la saisie
            des heures et le rapport de séance s'afficheront ici.
          </p>
        </div>
      )}

      {selection && (
        <div className="bg-white rounded-[20px] p-6 mt-5 saisie-panneau-haut">
          <p className="font-extrabold text-gray-900 mb-0.5">
            {selection.ueNom}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {selection.enseignantNom} · {selection.jour}{' '}
            {formatDateCourte(dateAttendue(selection.semaine, selection.jour))} ·{' '}
            {selection.creneau}
          </p>

          <p className="text-xs text-gray-400 mb-3">
            Créneau programmé :{' '}
            <span className="font-bold text-gray-600">
              {selection.jour}{' '}
              {formatDateCourte(dateAttendue(selection.semaine, selection.jour))}{' '}
              · {selection.creneau}
            </span>{' '}
            (±{MARGE_TOLERANCE_MIN} min tolérés)
          </p>

          <div className="saisie-dates mb-4">
            <label className="block">
              <span className="text-xs font-bold text-gray-500 mb-1 block">
                Heure d'ouverture
              </span>
              <input
                type="datetime-local"
                value={heureOuverture}
                onChange={(e) => setHeureOuverture(e.target.value)}
                className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-500 mb-1 block">
                Heure de fermeture
              </span>
              <input
                type="datetime-local"
                value={heureFermeture}
                onChange={(e) => setHeureFermeture(e.target.value)}
                className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
              />
            </label>
          </div>

          <button
            onClick={handleEnregistrer}
            disabled={
              enregistrement || (!heureOuverture && !heureFermeture)
            }
            className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enregistrement ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Enregistrer
          </button>

          {succes && (
            <p className="text-xs font-semibold text-green-600 mt-3 flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {enregistreHorsLigne
                ? 'Enregistré localement — sera envoyé au retour du réseau.'
                : 'Enregistré.'}
            </p>
          )}
          {erreur && (
            <p className="text-xs font-semibold text-red-600 mt-3">
              {erreur}
            </p>
          )}
        </div>
      )}

      {selection && selection.enseignantMatricule && (
        <div className="mt-5">
          <RapportSeanceForm
            seanceId={selection.id}
            ueId={selection.ueId}
            troncCommunId={selection.troncCommunId}
            specialiteId={selection.specialiteId}
            specialiteNom={selection.specialiteNom}
            typeCursus={selection.typeCursus}
            semestre={selection.semestre}
            enseignantMatricule={selection.enseignantMatricule}
            titre={`Rapport de séance — ${selection.enseignantNom}`}
            sousTitre="À remplir à la place de l'enseignant s'il n'a pas pu ouvrir sa séance."
          />
        </div>
      )}
      </div>
      </div>
    </div>
  );
}