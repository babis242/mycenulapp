// src/features/qr-ouverture/api.ts
//
// QR d'ouverture/fermeture (TOTP, pas 15s) — un chemin EN PLUS du code
// tapé à la main, jamais à la place (voir lib/totp.ts pour le pourquoi).
// Le secret est lu une seule fois pendant que le réseau est là, puis mis
// en cache localement (localStorage) : l'écran QR continue à générer un
// nouveau code toutes les 15s pendant des heures sans connexion, seul
// l'écart d'horloge (voir lib/horlogeAppareil.ts) doit avoir été
// synchronisé au moins une fois.
import { supabase } from '@/lib/supabase';
import { ecartHorlogeMs } from '@/lib/horlogeAppareil';
import { genererCodeTotp, PAS_TOTP_SECONDES } from '@/lib/totp';

const CLE_CACHE_SECRET = 'qr-ouverture:secret-hex';
const CLE_CACHE_ECART = 'qr-ouverture:ecart-horloge-ms';

// Préfixe fixe pour que le scan côté enseignant (ScannerQrModal) puisse
// distinguer d'un coup d'œil "ceci est un QR d'ouverture/fermeture" de
// n'importe quel autre QR qu'on pointerait dessus par erreur, avant même
// de tenter la validation côté serveur.
const PREFIXE_PAYLOAD = 'CENULA-QR1';

// Lit le secret de la base (table ecoles_totp_secrets — voir le SQL
// fourni à part) et le met en cache local. Un administrateur/responsable/
// secrétaire seulement (RLS côté base) peut lire cette valeur — jamais un
// enseignant, jamais exposée ailleurs que sur EcranQrPage.
export async function obtenirSecretQr(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('parametres_qr_ouverture')
      .select('secret_hex')
      .single();
    if (!error && data?.secret_hex) {
      localStorage.setItem(CLE_CACHE_SECRET, data.secret_hex);
      return data.secret_hex;
    }
  } catch {
    // Pas grave — on retombe sur le cache local ci-dessous.
  }
  const enCache = localStorage.getItem(CLE_CACHE_SECRET);
  if (enCache) return enCache;
  throw new Error(
    "Impossible de récupérer le secret du QR — connexion nécessaire au moins une fois."
  );
}

// Rafraîchit et met en cache l'écart d'horloge — à rappeler
// périodiquement (ex: toutes les quelques minutes) pendant qu'EcranQrPage
// reste ouvert et en ligne, pour ne jamais accumuler une dérive gênante
// pendant une éventuelle coupure réseau ensuite.
export async function rafraichirEcartHorlogeQr(): Promise<number> {
  const ecart = await ecartHorlogeMs();
  if (ecart !== null) {
    localStorage.setItem(CLE_CACHE_ECART, String(ecart));
    return ecart;
  }
  const enCache = localStorage.getItem(CLE_CACHE_ECART);
  return enCache ? Number(enCache) : 0;
}

function heureServeurEstimeeSync(): number {
  const enCache = localStorage.getItem(CLE_CACHE_ECART);
  const ecart = enCache ? Number(enCache) : 0;
  return Date.now() - ecart;
}

// Le texte exact encodé dans le QR affiché à l'écran — change toutes les
// 15s (PAS_TOTP_SECONDES). Ne nécessite AUCUN réseau à cet instant : tout
// vient du secret et de l'écart déjà en cache.
export async function genererPayloadQrActuel(secretHex: string): Promise<{
  payload: string;
  expireDansMs: number;
}> {
  const epochMs = heureServeurEstimeeSync();
  const code = await genererCodeTotp(secretHex, epochMs);
  const pasMs = PAS_TOTP_SECONDES * 1000;
  const expireDansMs = pasMs - (Math.floor(epochMs / 1000) % PAS_TOTP_SECONDES) * 1000;
  return { payload: `${PREFIXE_PAYLOAD}:${code}`, expireDansMs };
}

// Extrait le code d'un texte scanné — renvoie null si ce n'est
// manifestement pas un QR d'ouverture/fermeture (évite d'envoyer au
// serveur n'importe quel QR pointé par erreur, comme si c'était un code).
export function extraireCodeDuPayload(texteScanne: string): string | null {
  const prefixe = `${PREFIXE_PAYLOAD}:`;
  if (!texteScanne.startsWith(prefixe)) return null;
  return texteScanne.slice(prefixe.length).trim();
}