// src/features/seances/pages/SaisieManuellePage.tsx
import { useState } from 'react';
import { Loader2, Search, Save, CheckCircle2, WifiOff } from 'lucide-react';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  rechercherSeancesPourSaisieManuelle,
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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

  const [selection, setSelection] = useState<SeanceRecherche | null>(null);
  const [heureOuverture, setHeureOuverture] = useState('');
  const [heureFermeture, setHeureFermeture] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [succes, setSucces] = useState(false);
  const [enregistreHorsLigne, setEnregistreHorsLigne] = useState(false);

  async function lancerRecherche(e?: React.FormEvent) {
    e?.preventDefault();
    setChargement(true);
    setErreur(null);
    setARecherche(true);
    try {
      const data = navigator.onLine
        ? await rechercherSeancesPourSaisieManuelle(recherche)
        : await lireSeancesPourSaisieManuelleDepuisCache(recherche);
      setResultats(data);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de recherche.');
    } finally {
      setChargement(false);
    }
  }

  function selectionner(s: SeanceRecherche) {
    setSelection(s);
    setHeureOuverture(versDatetimeLocal(s.heureOuverture));
    setHeureFermeture(versDatetimeLocal(s.heureFermeture));
    setSucces(false);
    setErreur(null);
  }

  async function handleEnregistrer() {
    if (!selection) return;
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);
    try {
      const nouvelleOuverture = heureOuverture
        ? new Date(heureOuverture).toISOString()
        : null;
      const nouvelleFermeture = heureFermeture
        ? new Date(heureFermeture).toISOString()
        : null;

      if (navigator.onLine) {
        await saisirHeureManuelle(selection.id, {
          heureOuverture: nouvelleOuverture,
          heureFermeture: nouvelleFermeture,
        });
        setEnregistreHorsLigne(false);
      } else {
        // Hors ligne : mise en file (rejouée au retour du réseau, cf.
        // src/lib/sync.ts), + mise à jour optimiste du cache local pour
        // que la recherche reflète la saisie si on y revient avant la
        // synchro.
        await enqueueSyncAction({
          entity: 'seancesEDT',
          operation: 'update',
          payload: {
            seanceId: selection.id,
            heureOuverture: nouvelleOuverture,
            heureFermeture: nouvelleFermeture,
          },
        });
        const seanceLocale = await db.seancesEDT.get(selection.id);
        if (seanceLocale) {
          await db.seancesEDT.put({
            ...seanceLocale,
            heure_ouverture:
              nouvelleOuverture ?? (seanceLocale as any).heure_ouverture,
            heure_fermeture:
              nouvelleFermeture ?? (seanceLocale as any).heure_fermeture,
            mode_ouverture: nouvelleOuverture
              ? 'manuel'
              : (seanceLocale as any).mode_ouverture,
            mode_fermeture: nouvelleFermeture
              ? 'manuel'
              : (seanceLocale as any).mode_fermeture,
          } as any);
        }
        setEnregistreHorsLigne(true);
      }

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
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Saisie manuelle
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Flux de secours : enregistre l'heure notée sur le cahier papier en cas
        de problème technique ou hors ligne.
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

      {chargement ? (
        <div className="flex items-center justify-center py-10 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : aRecherche && resultats.length === 0 ? (
        <div className="bg-white rounded-[20px] p-8 text-center text-sm font-semibold text-gray-300">
          Aucune séance trouvée sur la semaine en cours ou la précédente.
        </div>
      ) : resultats.length > 0 ? (
        <div className="bg-white rounded-[20px] overflow-hidden mb-5">
          {resultats.map((s) => (
            <button
              key={s.id}
              onClick={() => selectionner(s)}
              className={`w-full text-left flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                selection?.id === s.id ? 'bg-red-50' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">
                  {s.ueNom}
                </p>
                <p className="text-xs text-gray-400">{s.enseignantNom}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-gray-500">
                  {s.jour} · {s.creneau}
                </p>
                {s.heureOuverture && s.heureFermeture && (
                  <p className="text-[11px] font-semibold text-green-600">
                    Déjà renseignée
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {selection && (
        <div className="bg-white rounded-[20px] p-6">
          <p className="font-extrabold text-gray-900 mb-0.5">
            {selection.ueNom}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {selection.enseignantNom} · {selection.jour} · {selection.creneau}
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
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
            disabled={enregistrement || (!heureOuverture && !heureFermeture)}
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
            <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>
          )}
        </div>
      )}
    </div>
  );
}
