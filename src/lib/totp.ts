// src/lib/totp.ts
//
// TOTP (RFC 6238) minimal, calculé entièrement en local (Web Crypto,
// HMAC-SHA1) — AUCUN appel réseau nécessaire pour générer ou vérifier un
// code une fois le secret connu. C'est ce qui permet à l'écran QR
// (EcranQrPage) de continuer à afficher un nouveau code toutes les 15s
// même hors ligne pendant des heures : seul l'écart d'horloge avec le
// serveur doit avoir été synchronisé au moins une fois (voir
// lib/horlogeAppareil.ts, ecartHorlogeMs).
//
// Le secret est manipulé en hexadécimal (pas en base32 comme les
// authenticator apps classiques) — on n'a pas besoin de compatibilité
// avec Google Authenticator ici, juste que le client et le serveur
// s'accordent sur les mêmes octets, donc l'hexadécimal simplifie tout
// (Postgres le génère nativement avec encode(gen_random_bytes(n), 'hex')).

function hexVersOctets(hex: string): Uint8Array {
    const propre = hex.trim().toLowerCase();
    const octets = new Uint8Array(propre.length / 2);
    for (let i = 0; i < octets.length; i++) {
      octets[i] = parseInt(propre.substring(i * 2, i * 2 + 2), 16);
    }
    return octets;
  }
  
  // Compteur (nombre de "pas" de 15s écoulés) encodé en 8 octets big-endian
  // — format imposé par RFC 4226 (HOTP), dont TOTP n'est qu'une variante où
  // le compteur vient du temps plutôt que d'être incrémenté manuellement.
  function compteurVersOctets(compteur: number): Uint8Array {
    const tampon = new ArrayBuffer(8);
    const vue = new DataView(tampon);
    // Les valeurs manipulées ici (secondes / 15) restent très en-dessous de
    // Number.MAX_SAFE_INTEGER pendant des siècles — pas besoin de BigInt.
    vue.setUint32(0, Math.floor(compteur / 0x100000000), false);
    vue.setUint32(4, compteur % 0x100000000, false);
    return new Uint8Array(tampon);
  }
  
  async function hmacSha1(cle: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    // Cast vers BufferSource : selon la version de TypeScript/lib.dom, les
    // typages de Uint8Array/ArrayBufferLike des signatures Web Crypto sont
    // trop stricts pour un Uint8Array "générique" construit localement —
    // c'est un désaccord de typage, pas un vrai problème à l'exécution.
    const cleImportee = await crypto.subtle.importKey(
      'raw',
      cle as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      cleImportee,
      message as unknown as BufferSource
    );
    return new Uint8Array(signature);
  }
  
  // Troncature dynamique standard (RFC 4226 §5.3) — extrait 4 octets de la
  // signature à une position elle-même dérivée de la signature, pour éviter
  // tout biais statistique.
  function tronquer(hmac: Uint8Array): number {
    const decalage = hmac[hmac.length - 1] & 0x0f;
    return (
      ((hmac[decalage] & 0x7f) << 24) |
      ((hmac[decalage + 1] & 0xff) << 16) |
      ((hmac[decalage + 2] & 0xff) << 8) |
      (hmac[decalage + 3] & 0xff)
    );
  }
  
  export const PAS_TOTP_SECONDES = 15;
  const NB_CHIFFRES = 8;
  
  // Code TOTP pour l'instant "epochMs" donné (millisecondes depuis epoch,
  // PAS forcément Date.now() — voir ecartHorlogeMs pour reconstituer
  // l'heure serveur estimée même hors ligne).
  export async function genererCodeTotp(
    secretHex: string,
    epochMs: number,
    pasSecondes: number = PAS_TOTP_SECONDES
  ): Promise<string> {
    const compteur = Math.floor(epochMs / 1000 / pasSecondes);
    const hmac = await hmacSha1(hexVersOctets(secretHex), compteurVersOctets(compteur));
    const code = tronquer(hmac) % 10 ** NB_CHIFFRES;
    return code.toString().padStart(NB_CHIFFRES, '0');
  }
  
  // Vérifie avec une tolérance de ±1 pas (absorbe le petit délai entre
  // l'affichage du QR et la validation côté serveur) — utilisé par le
  // futur code serveur (SQL) comme référence de l'algorithme à reproduire
  // en PL/pgSQL ; conservé ici aussi pour des tests côté client.
  export async function totpValide(
    secretHex: string,
    code: string,
    epochMs: number,
    pasSecondes: number = PAS_TOTP_SECONDES
  ): Promise<boolean> {
    for (const delta of [0, -1, 1]) {
      const candidat = await genererCodeTotp(
        secretHex,
        epochMs + delta * pasSecondes * 1000,
        pasSecondes
      );
      if (candidat === code) return true;
    }
    return false;
  }