// src/lib/horlogeAppareil.ts
import { supabase } from './supabase';

// Compare l'heure de l'appareil à celle du serveur — ne sert qu'à
// avertir si l'horloge du téléphone semble mal réglée. Purement
// informatif : la logique d'ouverture/fermeture des séances se base
// uniquement sur l'heure du serveur (calculée côté base de données),
// jamais sur celle de l'appareil.
export async function ecartHorlogeMinutes(): Promise<number | null> {
  try {
    const avant = Date.now();
    const { data, error } = await supabase.rpc('heure_serveur');
    if (error) {
      console.error('[horlogeAppareil] Erreur RPC heure_serveur :', error);
      return null;
    }
    if (!data) {
      console.warn('[horlogeAppareil] heure_serveur a renvoyé une valeur vide.');
      return null;
    }
    const heureServeurMs = new Date(data as string).getTime();
    if (Number.isNaN(heureServeurMs)) {
      console.warn('[horlogeAppareil] Date illisible reçue :', data);
      return null;
    }
    // Correction grossière du temps d'aller-retour réseau.
    const rttMs = Date.now() - avant;
    const heureAppareilAjustee = Date.now() - rttMs / 2;
    const ecart = Math.round((heureAppareilAjustee - heureServeurMs) / 60000);
    console.log(
      `[horlogeAppareil] Heure serveur : ${data} — écart calculé : ${ecart} min (RTT ${rttMs}ms)`
    );
    return ecart;
  } catch (err) {
    console.error('[horlogeAppareil] Exception :', err);
    return null;
  }
}

// Même principe que ecartHorlogeMinutes, mais en millisecondes et sans
// arrondi — nécessaire pour le QR d'ouverture/fermeture (lib/totp.ts) :
// un TOTP change toutes les 15s, un arrondi à la minute serait bien trop
// grossier. Utilisé par EcranQrPage pour reconstituer "l'heure serveur
// estimée" (Date.now() + ce décalage) même hors ligne, une fois cette
// fonction appelée au moins une fois pendant que le réseau était là.
export async function ecartHorlogeMs(): Promise<number | null> {
  try {
    const avant = Date.now();
    const { data, error } = await supabase.rpc('heure_serveur');
    if (error || !data) return null;
    const heureServeurMs = new Date(data as string).getTime();
    if (Number.isNaN(heureServeurMs)) return null;
    const rttMs = Date.now() - avant;
    const heureAppareilAjustee = Date.now() - rttMs / 2;
    return Math.round(heureAppareilAjustee - heureServeurMs);
  } catch {
    return null;
  }
}