// src/features/referentiel/creneaux/pages/CreneauxPage.tsx
import { useEffect, useState } from 'react';
import { Trash2, Plus, WifiOff } from 'lucide-react';
import {
  listCreneaux,
  lireCreneauxDepuisCache,
  ajouterCreneau,
  supprimerCreneau,
  type CreneauReferentiel,
} from '../api';

function heureVersMinutes(heureHHMM: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heureHHMM.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesVersHeure(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Écran Référentiel → Créneaux — gère les créneaux horaires utilisés
// dans toute l'app (emploi du temps, disponibilités, ouverture/fermeture
// de séance...). Vraie donnée en base (table "creneaux"), synchronisée
// hors ligne, visible par tous — pas une astuce locale à un navigateur.
export default function CreneauxPage() {
  const [creneaux, setCreneaux] = useState<CreneauReferentiel[]>([]);
  const [chargement, setChargement] = useState(true);
  const [depuisCache, setDepuisCache] = useState(false);
  const [code, setCode] = useState('');
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(
    null
  );
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    let aDesDonneesLocales = false;
    try {
      const local = await lireCreneauxDepuisCache();
      if (local.length > 0) {
        setCreneaux(local);
        setDepuisCache(true);
        aDesDonneesLocales = true;
      }
    } catch {
      // pas grave
    }
    if (!navigator.onLine) {
      setChargement(false);
      return;
    }
    try {
      const frais = await listCreneaux();
      setCreneaux(frais);
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
  }, []);

  async function handleAjouter() {
    setErreur(null);
    const codeNettoye = code.trim();
    if (!codeNettoye) {
      setErreur('Donne un nom au créneau (ex : "15h-16h").');
      return;
    }
    if (creneaux.some((c) => c.code === codeNettoye)) {
      setErreur('Un créneau porte déjà ce nom.');
      return;
    }
    const debut = heureVersMinutes(heureDebut);
    const fin = heureVersMinutes(heureFin);
    if (debut === null || fin === null) {
      setErreur('Heures invalides — utilise le format HH:MM (ex : 15:00).');
      return;
    }
    if (fin <= debut) {
      setErreur("L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (!navigator.onLine) {
      setErreur(
        'Connexion nécessaire pour ajouter un créneau (action partagée avec tous les utilisateurs).'
      );
      return;
    }
    setEnregistrement(true);
    try {
      await ajouterCreneau(codeNettoye, debut, fin);
      setCode('');
      setHeureDebut('');
      setHeureFin('');
      await charger();
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'ajout."
      );
    } finally {
      setEnregistrement(false);
    }
  }

  async function handleSupprimer(codeASupprimer: string) {
    if (
      !window.confirm(
        `Supprimer le créneau "${codeASupprimer}" ? Il disparaîtra des grilles pour tout le monde. Les séances déjà programmées sur ce créneau ne sont pas supprimées, mais ce créneau ne pourra plus être choisi pour en programmer de nouvelles.`
      )
    )
      return;
    if (!navigator.onLine) {
      setErreur('Connexion nécessaire pour supprimer un créneau.');
      return;
    }
    setSuppressionEnCours(codeASupprimer);
    setErreur(null);
    try {
      await supprimerCreneau(codeASupprimer);
      await charger();
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    } finally {
      setSuppressionEnCours(null);
    }
  }

  return (
    <div>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Créneaux</p>
      <p className="text-sm text-gray-400 mb-6">
        Créneaux horaires utilisés dans tout l'établissement — emploi du
        temps, disponibilités, ouverture/fermeture de séance.
      </p>

      <div className="bg-white rounded-[20px] p-5 mb-6">
        <p className="font-extrabold text-gray-900 mb-4">
          Ajouter un créneau
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Nom
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex : 15h-16h"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Heure de début
            </label>
            <input
              type="time"
              value={heureDebut}
              onChange={(e) => setHeureDebut(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Heure de fin
            </label>
            <input
              type="time"
              value={heureFin}
              onChange={(e) => setHeureFin(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>
        </div>
        {erreur && (
          <p className="text-xs font-semibold text-red-600 mb-3">{erreur}</p>
        )}
        <button
          onClick={handleAjouter}
          disabled={enregistrement}
          className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {depuisCache && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-3">
          <WifiOff size={12} /> Données locales — en attente de
          rafraîchissement
        </p>
      )}

      <div className="bg-white rounded-[20px] overflow-hidden">
        {chargement ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-300">
            Chargement...
          </div>
        ) : creneaux.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-300">
            Aucun créneau pour l'instant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Début</th>
                <th className="px-5 py-3">Fin</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {creneaux.map((c) => (
                <tr
                  key={c.code}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="px-5 py-3.5 font-bold text-gray-900">
                    {c.code}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {minutesVersHeure(c.heure_debut)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {minutesVersHeure(c.heure_fin)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleSupprimer(c.code)}
                      disabled={suppressionEnCours === c.code}
                      className="text-gray-300 hover:text-red-600 disabled:opacity-50"
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
    </div>
  );
}