// src/features/qr-enseignants/api.ts
//
// QR personnel et permanent de chaque enseignant. L'enseignant le présente le
// matin ; l'administration le scanne et la séance du moment s'ouvre.
// Les jetons ne sont lisibles que par les fonctions SQL (sql/qr_enseignants.sql).
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import {
  getSeanceDuMomentPourEnseignantId,
  saisirHeureManuelle,
  type SeanceDuMoment,
} from '@/features/seances/api';

const PREFIXE = 'CENULA-ENS1:';

export interface QrEnseignant {
  enseignantId: string;
  matricule: string;
  nom: string;
  numeroWhatsapp: string | null;
  token: string;
}

export function payloadQr(token: string): string {
  return PREFIXE + token;
}

/** Jeton contenu dans un QR scanné, ou null si ce n'est pas un QR enseignant. */
export function extraireJeton(texte: string): string | null {
  const t = texte.trim();
  return t.startsWith(PREFIXE) ? t.slice(PREFIXE.length) || null : null;
}

export async function monQr(): Promise<QrEnseignant> {
  const { data, error } = await supabase.rpc('obtenir_qr_enseignant');
  if (error) throw new Error(error.message);
  const l: any = Array.isArray(data) ? data[0] : data;
  if (!l) throw new Error('QR introuvable.');
  return { enseignantId: l.enseignant_id, matricule: l.matricule, nom: l.nom, numeroWhatsapp: null, token: l.token };
}

export async function listerQrEnseignants(): Promise<QrEnseignant[]> {
  const { data, error } = await supabase.rpc('lister_qr_enseignants');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((l) => ({
    enseignantId: l.enseignant_id,
    matricule: l.matricule,
    nom: l.nom,
    numeroWhatsapp: l.numero_whatsapp ?? null,
    token: l.token,
  }));
}

export async function regenererQr(enseignantId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerer_qr_enseignant', { p_enseignant_id: enseignantId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Image PNG (carte) : QR + nom de l'enseignant, prête à partager. */
export async function genererImageQr(q: { nom: string; matricule: string; token: string }): Promise<Blob> {
  const taille = 640;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, payloadQr(q.token), { width: taille, margin: 2, errorCorrectionLevel: 'M' });
  const hauteurTexte = 150;
  const canvas = document.createElement('canvas');
  canvas.width = taille;
  canvas.height = taille + hauteurTexte;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrCanvas, 0, 0);
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(q.nom, taille / 2, taille + 52, taille - 40);
  ctx.fillStyle = '#6b7280';
  ctx.font = '24px sans-serif';
  ctx.fillText(`${q.matricule} — QR personnel, ne pas partager`, taille / 2, taille + 92, taille - 40);
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('CENULAPP · Ouverture des cours', taille / 2, taille + 128);
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image impossible à générer.'))), 'image/png')
  );
}

export function nomFichierQr(nom: string): string {
  return `QR-${nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')}.png`;
}

export function numeroWhatsappFormate(numero: string): string {
  const c = numero.replace(/\D/g, '');
  if (c.startsWith('237')) return c;
  if (c.length === 9) return `237${c}`;
  return c;
}

// ── Scan ─────────────────────────────────────────────────────────────

export type ResultatScan =
  | { type: 'ouvert'; enseignantNom: string; seance: SeanceDuMoment; heure: string }
  | { type: 'ferme'; enseignantNom: string; seance: SeanceDuMoment; heure: string }
  | { type: 'deja_ouvert'; enseignantNom: string; seance: SeanceDuMoment }
  | { type: 'deja_ferme'; enseignantNom: string; seance: SeanceDuMoment }
  | { type: 'pas_ouverte'; enseignantNom: string; seance: SeanceDuMoment }
  | { type: 'aucun_cours'; enseignantNom: string }
  | { type: 'qr_invalide' }
  | { type: 'pas_un_qr_enseignant' }
  | { type: 'erreur'; message: string };

async function heureServeurIso(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('heure_serveur');
    if (!error && data) {
      const d = new Date(data as string);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch {
    /* repli ci-dessous */
  }
  return new Date().toISOString();
}

export async function traiterScan(texte: string, mode: 'ouvrir' | 'fermer'): Promise<ResultatScan> {
  const token = extraireJeton(texte);
  if (!token) return { type: 'pas_un_qr_enseignant' };
  try {
    const { data, error } = await supabase.rpc('identifier_enseignant_par_qr', { p_token: token });
    if (error) return { type: 'erreur', message: error.message };
    const l: any = Array.isArray(data) ? data[0] : data;
    if (!l?.ok) return { type: 'qr_invalide' };

    const seance = await getSeanceDuMomentPourEnseignantId(l.enseignant_id);
    if (!seance) return { type: 'aucun_cours', enseignantNom: l.nom };

    if (mode === 'ouvrir') {
      if (seance.heureOuverture) return { type: 'deja_ouvert', enseignantNom: l.nom, seance };
      const heure = await heureServeurIso();
      await saisirHeureManuelle(seance.id, { heureOuverture: heure });
      return { type: 'ouvert', enseignantNom: l.nom, seance, heure };
    }

    if (!seance.heureOuverture) return { type: 'pas_ouverte', enseignantNom: l.nom, seance };
    if (seance.heureFermeture) return { type: 'deja_ferme', enseignantNom: l.nom, seance };
    const heure = await heureServeurIso();
    await saisirHeureManuelle(seance.id, { heureOuverture: seance.heureOuverture, heureFermeture: heure });
    return { type: 'ferme', enseignantNom: l.nom, seance, heure };
  } catch (err) {
    return { type: 'erreur', message: err instanceof Error ? err.message : 'Erreur inattendue.' };
  }
}