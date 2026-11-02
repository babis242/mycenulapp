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

const TEXTE_CARTE: { titre?: string; texte: string; fort?: boolean }[] = [
  { texte: "À utiliser UNIQUEMENT EN CAS D'INDISPONIBILITÉ des codes d'ouverture/fermeture et du scan du QR de l'école (réseau, application ou téléphone en panne). Sinon, ouvrez votre cours normalement depuis « Ma séance ».", fort: true },
  { titre: 'Procédure', texte: "1. Avant votre cours, présentez-vous à l'administration ou au secrétariat." },
  { texte: '2. Montrez ce QR (sur votre téléphone ou imprimé).' },
  { texte: "3. L'administration le scanne : si le QR est valide, votre cours s'ouvre à l'heure du scan. À la fin du cours, même chose pour la fermeture." },
  { texte: "4. Si le QR n'est pas reconnu, l'administration est alertée." },
  { texte: 'QR strictement personnel : ne le partagez avec personne. En cas de perte, prévenez-nous pour le remplacer.' },
];

function decouper(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const mots = texte.split(' ');
  const lignes: string[] = [];
  let courante = '';
  for (const m of mots) {
    const essai = courante ? `${courante} ${m}` : m;
    if (ctx.measureText(essai).width > largeur && courante) {
      lignes.push(courante);
      courante = m;
    } else courante = essai;
  }
  if (courante) lignes.push(courante);
  return lignes;
}

/** Image PNG (carte) : QR + nom + procédure d'utilisation, prête à partager. */
export async function genererImageQr(q: { nom: string; matricule: string; token: string }): Promise<Blob> {
  const taille = 640;
  const marge = 28;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, payloadQr(q.token), { width: taille, margin: 2, errorCorrectionLevel: 'M' });

  // Mesure du texte pour calculer la hauteur nécessaire.
  const mesure = document.createElement('canvas').getContext('2d')!;
  const interligne = 29;
  mesure.font = '21px sans-serif';
  let hauteurTexte = 0;
  for (const bloc of TEXTE_CARTE) {
    if (bloc.titre) hauteurTexte += 36;
    mesure.font = bloc.fort ? 'bold 21px sans-serif' : '21px sans-serif';
    hauteurTexte += decouper(mesure, bloc.texte, taille - 2 * marge).length * interligne + 10;
  }
  const hauteurEntete = 130;

  const canvas = document.createElement('canvas');
  canvas.width = taille;
  canvas.height = taille + hauteurEntete + hauteurTexte + 30;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrCanvas, 0, 0);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(q.nom, taille / 2, taille + 46, taille - 40);
  ctx.fillStyle = '#6b7280';
  ctx.font = '22px sans-serif';
  ctx.fillText(`${q.matricule} — QR personnel`, taille / 2, taille + 80, taille - 40);
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('CENULAPP · Ouverture des cours', taille / 2, taille + 112);

  ctx.textAlign = 'left';
  let y = taille + hauteurEntete + 14;
  for (const bloc of TEXTE_CARTE) {
    if (bloc.titre) {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(bloc.titre, marge, y);
      y += 36;
    }
    ctx.fillStyle = bloc.fort ? '#b91c1c' : '#374151';
    ctx.font = bloc.fort ? 'bold 21px sans-serif' : '21px sans-serif';
    for (const l of decouper(ctx, bloc.texte, taille - 2 * marge)) {
      ctx.fillText(l, marge, y);
      y += interligne;
    }
    y += 10;
  }
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