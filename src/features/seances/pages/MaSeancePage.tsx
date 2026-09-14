// src/features/seances/pages/MaSeancePage.tsx
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, KeyRound, Ban, X, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import RapportSeanceForm from '../components/RapportSeanceForm';
import {
  getSeanceDuMoment,
  ouvrirSeance,
  fermerSeance,
  type SeanceDuMoment,
} from '../api';
import { annulerMaSeance } from '@/features/seances-ponctuelles/api';
import { ecartHorlogeMinutes } from '@/lib/horlogeAppareil';
import { formatHeureCameroun as formatHeure } from '@/lib/formatHeureCameroun';

// Écrans 6.1 et 6.2 (ecrans_ui.md) — Scénario 8, flux normal enseignant :
// saisie du code d'ouverture au début du cours, puis du code de fermeture
// à la fin. Un cours programmé à la volée par l'admin (remplacement d'un
// cours annulé, etc.) est une vraie séance de la grille — même flux,
// rien de spécial à gérer ici.
export default function MaSeancePage() {
  const user = useAuthStore((s) => s.user);
  const [seance, setSeance] = useState<SeanceDuMoment | null>(null);
  const [chargement, setChargement] = useState(true);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);

  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [ecartHorloge, setEcartHorloge] = useState<number | null>(null);

  useEffect(() => {
    ecartHorlogeMinutes().then(setEcartHorloge);
  }, []);

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

  async function handleAnnuler() {
    if (!seance) return;
    setAnnulationEnCours(true);
    try {
      await annulerMaSeance(seance.id, motifAnnulation.trim());
      setAnnulationOuverte(false);
      setMotifAnnulation('');
      setSeance(null);
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'annulation."
      );
    } finally {
      setAnnulationEnCours(false);
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

      {ecartHorloge !== null && Math.abs(ecartHorloge) > 3 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700">
            L'horloge de cet appareil semble décalée d'environ{' '}
            {Math.abs(ecartHorloge)} min par rapport à l'heure réelle —
            vérifie les réglages date/heure de ton téléphone. Ça n'empêche
            rien : les heures d'ouverture/fermeture enregistrées restent
            toujours celles du serveur, pas celles de l'appareil.
          </p>
        </div>
      )}

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
        <>
          <div className="bg-white rounded-[20px] p-6 mb-4">
            <p className="font-extrabold text-lg text-gray-900">
              {seance.ueNom}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              {seance.jour} · {seance.creneau} ·{' '}
              {seance.salleCode ?? 'Salle à confirmer'}
            </p>

            {seance.heureOuverture && (
              <p className="text-xs font-bold text-green-600 mb-1 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Ouverte à{' '}
                {formatHeure(seance.heureOuverture)}
              </p>
            )}
            {seance.heureOuverture && (
              <p className="text-[11px] text-gray-400 mb-3">
                Le décompte des heures démarre à l'heure programmée du
                cours ({seance.creneau.split('-')[0]}), pas avant — même si
                tu as ouvert en avance.
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
                Séance terminée — le rapport n'est plus modifiable.
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

                {!seance.heureOuverture && (
                  <button
                    onClick={() => setAnnulationOuverte(true)}
                    className="w-full flex items-center justify-center gap-2 mt-2 text-xs font-bold text-gray-400 hover:text-red-600 py-1.5"
                  >
                    <Ban size={13} /> Je ne peux pas assurer ce cours
                  </button>
                )}
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

          {seance.heureOuverture && !seance.heureFermeture && user && (
            <RapportSeanceForm
              seanceId={seance.id}
              ueId={seance.ueId}
              troncCommunId={seance.troncCommunId}
              specialiteId={seance.specialiteId}
              specialiteNom={seance.specialiteNom}
              typeCursus={seance.typeCursus}
              semestre={seance.semestre}
              enseignantMatricule={user.matricule}
            />
          )}
        </>
      )}

      {annulationOuverte && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[20px] p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="font-extrabold text-gray-900">
                Annuler ce cours ?
              </p>
              <button
                onClick={() => setAnnulationOuverte(false)}
                className="text-gray-300 hover:text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              L'admin et le/la responsable seront prévenus immédiatement et
              pourront organiser un remplacement.
            </p>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Motif (optionnel)
            </label>
            <textarea
              value={motifAnnulation}
              onChange={(e) => setMotifAnnulation(e.target.value)}
              rows={3}
              placeholder="Ex : empêchement de dernière minute..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600 mb-4 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAnnuler}
                disabled={annulationEnCours}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {annulationEnCours && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Confirmer l'annulation
              </button>
              <button
                onClick={() => setAnnulationOuverte(false)}
                className="px-4 py-2.5 text-sm font-bold text-gray-500"
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}