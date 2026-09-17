// src/features/referentiel/creneaux-test/pages/CreneauxTestPage.tsx
import { useState } from 'react';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';
import {
  listerCreneauxTest,
  ajouterCreneauTest,
  supprimerCreneauTest,
  heureVersMinutes,
  minutesVersHeure,
  type CreneauTest,
} from '@/lib/creneauxTest';
import { CRENEAUX } from '@/constants/enums';

// Écran admin — créneaux de TEST, pour faciliter les tests manuels sans
// attendre d'être réellement dans la fenêtre 08h-12h ou 14h-17h (ex :
// créer un créneau "maintenant" pour tester l'ouverture/fermeture d'une
// séance ou le verrouillage du rapport en conditions réelles).
//
// Purement local à CE navigateur (localStorage) : rien n'est envoyé au
// serveur, rien n'est visible par les autres utilisateurs. Supprimer un
// créneau de test ici ne supprime AUCUNE donnée déjà enregistrée en
// base pour ce créneau (séances, disponibilités...) — juste l'option de
// le recréer/l'afficher dans les grilles de CE navigateur.
export default function CreneauxTestPage() {
  const [creneaux, setCreneaux] = useState<CreneauTest[]>(
    listerCreneauxTest()
  );
  const [code, setCode] = useState('');
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  function rafraichir() {
    setCreneaux(listerCreneauxTest());
  }

  function handleAjouter() {
    setErreur(null);
    const codeNettoye = code.trim();
    if (!codeNettoye) {
      setErreur('Donne un nom au créneau (ex : "15h-16h").');
      return;
    }
    if (CRENEAUX.includes(codeNettoye)) {
      setErreur('Ce nom correspond déjà à un créneau officiel.');
      return;
    }
    if (creneaux.some((c) => c.code === codeNettoye)) {
      setErreur('Un créneau de test porte déjà ce nom — supprime-le avant de le recréer, ou choisis un autre nom.');
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
    ajouterCreneauTest({ code: codeNettoye, debut, fin });
    setCode('');
    setHeureDebut('');
    setHeureFin('');
    rafraichir();
  }

  function handleSupprimer(c: string) {
    supprimerCreneauTest(c);
    rafraichir();
  }

  return (
    <div>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Créneaux (test)
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Ajoute un créneau temporaire pour tester l'app en dehors des
        horaires officiels (08h-12h / 14h-17h) — par exemple un créneau
        qui correspond à maintenant, pour tester l'ouverture/fermeture
        d'une séance tout de suite.
      </p>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold text-amber-700">
          Purement local à cet appareil/navigateur — personne d'autre ne
          verra ce créneau, et rien n'est enregistré côté serveur. Pense à
          le supprimer une fois le test terminé.
        </p>
      </div>

      <div className="bg-white rounded-[20px] p-5 mb-6">
        <p className="font-extrabold text-gray-900 mb-4">
          Ajouter un créneau de test
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
          className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          <Plus size={15} /> Ajouter
        </button>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden">
        {creneaux.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-300">
            Aucun créneau de test pour l'instant.
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
                    {minutesVersHeure(c.debut)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {minutesVersHeure(c.fin)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleSupprimer(c.code)}
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
    </div>
  );
}