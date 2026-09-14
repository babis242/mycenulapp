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