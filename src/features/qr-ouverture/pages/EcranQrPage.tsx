// src/features/qr-ouverture/pages/EcranQrPage.tsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import {
  obtenirSecretQr,
  rafraichirEcartHorlogeQr,
  genererPayloadQrActuel,
} from '../api';
import { PAS_TOTP_SECONDES } from '@/lib/totp';

// Écran à afficher en continu sur un ordinateur/une tablette du
// secrétariat (pas un par salle — un seul suffit pour toute l'école,
// voir la discussion produit) — Admin/Responsable/Secrétaire seulement.
//
// Le QR affiché change toutes les 15s. Chaque enseignant peut le scanner
// depuis "Ma séance" pour ouvrir/fermer sa séance — EN PLUS du code tapé
// à la main, qui reste disponible en toutes circonstances (voir
// features/qr-ouverture/api.ts pour le détail de la génération).
//
// Fonctionne hors ligne pendant des heures une fois le secret et l'écart
// d'horloge synchronisés une première fois : générer un TOTP ne demande
// aucun réseau (lib/totp.ts).
export default function EcranQrPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dataUrlQr, setDataUrlQr] = useState<string | null>(null);
  const [secondesRestantes, setSecondesRestantes] = useState(PAS_TOTP_SECONDES);
  const [derniereSyncOk, setDerniereSyncOk] = useState<boolean>(true);

  // Chargement initial : secret + premier écart d'horloge — nécessite le
  // réseau UNE fois, ensuite tout tourne en local.
  useEffect(() => {
    let annule = false;
    async function initialiser() {
      try {
        const s = await obtenirSecretQr();
        if (annule) return;
        setSecret(s);
      } catch (err) {
        setErreur(
          err instanceof Error ? err.message : 'Impossible de charger le QR.'
        );
      }
      await rafraichirEcartHorlogeQr();
    }
    initialiser();
    return () => {
      annule = true;
    };
  }, []);

  // Resynchronise l'écart d'horloge toutes les 5 minutes tant que le
  // réseau répond — pour ne jamais accumuler de dérive pendant une
  // éventuelle coupure ensuite. Un échec ici est silencieux : le dernier
  // écart connu (en cache) continue de servir.
  useEffect(() => {
    const intervalle = setInterval(async () => {
      const avant = localStorage.getItem('qr-ouverture:ecart-horloge-ms');
      await rafraichirEcartHorlogeQr();
      const apres = localStorage.getItem('qr-ouverture:ecart-horloge-ms');
      setDerniereSyncOk(avant !== apres || navigator.onLine);
    }, 5 * 60 * 1000);
    return () => clearInterval(intervalle);
  }, []);

  // Régénère le QR à chaque tick de 15s (et un décompte visuel à la
  // seconde, pour que l'enseignant voie qu'il a le temps de scanner).
  useEffect(() => {
    if (!secret) return;
    let annule = false;

    async function regenerer() {
      const { payload, expireDansMs } = await genererPayloadQrActuel(secret!);
      if (annule) return;
      const url = await QRCode.toDataURL(payload, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      if (!annule) {
        setDataUrlQr(url);
        setSecondesRestantes(Math.ceil(expireDansMs / 1000));
      }
    }

    regenerer();
    const intervalleRegen = setInterval(regenerer, PAS_TOTP_SECONDES * 1000);
    const intervalleDecompte = setInterval(() => {
      setSecondesRestantes((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      annule = true;
      clearInterval(intervalleRegen);
      clearInterval(intervalleDecompte);
    };
  }, [secret]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <p className="font-extrabold text-2xl text-gray-900">
          QR d'ouverture / fermeture de séance
        </p>
        <p className="text-sm text-gray-400 mt-1">
          À laisser affiché en continu — les enseignants le scannent
          depuis "Ma séance" pour ouvrir ou fermer leur cours.
        </p>
      </div>

      {!derniereSyncOk && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">
            Pas de réseau depuis un moment — le QR continue de fonctionner,
            mais pense à reconnecter cet écran de temps en temps pour
            garder l'horloge synchronisée.
          </p>
        </div>
      )}

      {erreur && !secret ? (
        <p className="text-sm font-bold text-red-600 text-center max-w-sm">
          {erreur}
        </p>
      ) : !dataUrlQr ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-[24px] p-8 shadow-sm">
            <img
              src={dataUrlQr}
              alt="QR d'ouverture/fermeture"
              width={480}
              height={480}
            />
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <RefreshCw size={13} />
            <p className="text-xs font-bold">
              Change dans {secondesRestantes}s
            </p>
          </div>
        </>
      )}
    </div>
  );
}