// src/features/seances/pages/MaSeancePage.tsx
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  getSeanceDuMoment,
  ouvrirSeance,
  fermerSeance,
  type SeanceDuMoment,
} from '../api';

function formatHeure(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Écrans 6.1 et 6.2 (ecrans_ui.md) — Scénario 8, flux normal enseignant :
// saisie du code d'ouverture au début du cours, puis du code de fermeture
// à la fin. Le code n'est jamais transmis ni affiché côté app avant
// saisie : l'enseignant le récupère auprès de la secrétaire.
export default function MaSeancePage() {
  const user = useAuthStore((s) => s.user);
  const [seance, setSeance] = useState<SeanceDuMoment | null>(null);
  const [chargement, setChargement] = useState(true);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);

  function charger() {
    if (!user) return;
    setChargement(true);
    setErreur(null);
    getSeanceDuMoment(user.matricule)
      .then(setSeance)
      .catch((err) =>
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => setChargement(false));
  }

  useEffect(charger, [user?.matricule]);

  async function handleOuvrir() {
    if (!seance || !code.trim()) return;
    setEnvoi(true);
    setErreur(null);
    setMessageSucces(null);
    try {
      const heure = await ouvrirSeance(seance.id, code.trim());
      setSeance((prev) => (prev ? { ...prev, heureOuverture: heure } : prev));
      setMessageSucces(`Séance ouverte à ${formatHeure(heure)}.`);
      setCode('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect.');
    } finally {
      setEnvoi(false);
    }
  }

  async function handleFermer() {
    if (!seance || !code.trim()) return;
    setEnvoi(true);
    setErreur(null);
    setMessageSucces(null);
    try {
      const heure = await fermerSeance(seance.id, code.trim());
      setSeance((prev) => (prev ? { ...prev, heureFermeture: heure } : prev));
      setMessageSucces(`Séance fermée à ${formatHeure(heure)}.`);
      setCode('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">Ma séance</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Le cours du moment, et son code d'ouverture/fermeture.
          </p>
        </div>
        <button
          onClick={charger}
          className="p-2 rounded-full bg-white text-gray-500 hover:bg-gray-50"
          aria-label="Actualiser"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : !seance ? (
        <div className="bg-white rounded-[20px] p-8 text-center">
          <p className="font-bold text-gray-900 mb-1">
            Aucun cours en ce moment
          </p>
          <p className="text-sm text-gray-400">
            Reviens ici au début de ton prochain créneau.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] p-6">
          <p className="font-extrabold text-lg text-gray-900">{seance.ueNom}</p>
          <p className="text-sm text-gray-400 mb-4">
            {seance.jour} · {seance.creneau} ·{' '}
            {seance.salleCode ?? 'Salle à confirmer'}
          </p>

          {seance.heureOuverture && (
            <p className="text-xs font-bold text-green-600 mb-3 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Ouverte à{' '}
              {formatHeure(seance.heureOuverture)}
            </p>
          )}
          {seance.heureFermeture && (
            <p className="text-xs font-bold text-green-600 mb-3 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Fermée à{' '}
              {formatHeure(seance.heureFermeture)}
            </p>
          )}

          {seance.heureOuverture && seance.heureFermeture ? (
            <p className="text-sm font-bold text-gray-500 text-center py-2">
              Séance terminée.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 mb-3">
                <KeyRound size={15} className="text-gray-300 shrink-0" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={
                    seance.heureOuverture
                      ? 'Code de fermeture'
                      : "Code d'ouverture"
                  }
                  className="w-full text-sm font-bold tracking-widest outline-none bg-transparent placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-semibold"
                />
              </div>
              <button
                onClick={seance.heureOuverture ? handleFermer : handleOuvrir}
                disabled={envoi || !code.trim()}
                className="w-full flex items-center justify-center gap-2 bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {envoi && <Loader2 size={15} className="animate-spin" />}
                {seance.heureOuverture
                  ? 'Fermer la séance'
                  : 'Ouvrir la séance'}
              </button>
            </>
          )}

          {erreur && (
            <p className="text-xs font-semibold text-red-600 mt-3 text-center">
              {erreur}
            </p>
          )}
          {messageSucces && !erreur && (
            <p className="text-xs font-semibold text-green-600 mt-3 text-center">
              {messageSucces}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
