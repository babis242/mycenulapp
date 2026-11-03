// src/features/signalements/api.ts
//
// Signalement d'absence / de retard par l'enseignant, traité par l'administration.
// Nécessite sql/signalements_enseignants.sql. Fonctionnalité en ligne uniquement.
import { supabase } from '@/lib/supabase';

export type TypeSignalement = 'absence' | 'retard';
export type StatutSignalement = 'en_attente' | 'accepte' | 'refuse';

export interface SeanceSignalable {
  id: string;
  ueNom: string;
  specialiteNom: string;
  jour: string;
  creneau: string;
  date: string; // AAAA-MM-JJ
}

export interface Signalement {
  id: string;
  enseignantId: string;
  enseignantNom: string;
  enseignantWhatsapp: string | null;
  ueNom: string | null;
  specialiteNom: string | null;
  dateCours: string | null;
  jour: string | null;
  creneau: string | null;
  type: TypeSignalement;
  minutesRetard: number | null;
  raison: string;
  justificatifPath: string | null;
  justificatifNom: string | null;
  statut: StatutSignalement;
  commentaireAdmin: string | null;
  traiteLe: string | null;
  creeLe: string;
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function dateDeSeance(semaine: string, jour: string): string {
  const [y, m, d] = semaine.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.max(0, JOURS.indexOf(jour))));
  return dt.toISOString().slice(0, 10);
}

async function enseignantCourant(matricule: string): Promise<string> {
  const { data, error } = await supabase.from('enseignants').select('id').eq('matricule', matricule).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Aucun profil enseignant lié à ce compte.');
  return data.id;
}

// Cours de l'enseignant sur une fenêtre autour d'aujourd'hui : 3 semaines passées
// (retard/absence constatés après coup) et 5 semaines à venir (absence prévue).
export async function listSeancesSignalables(matricule: string): Promise<SeanceSignalable[]> {
  const enseignantId = await enseignantCourant(matricule);
  const maintenant = new Date(Date.now() + 60 * 60 * 1000);
  const jour = maintenant.getUTCDay();
  const lundi = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + (jour === 0 ? -6 : 1 - jour)));
  const debut = new Date(lundi); debut.setUTCDate(debut.getUTCDate() - 21);
  const fin = new Date(lundi); fin.setUTCDate(fin.getUTCDate() + 35);

  const { data, error } = await supabase
    .from('seances_edt')
    .select(`id, jour, creneau, semaine, tronc_commun_id, offre:offres(ue:ues(nom)), tronc_commun:troncs_communs(nom),
             emploi_du_temps:emplois_du_temps(statut, specialite:specialites(nom))`)
    .eq('enseignant_id', enseignantId)
    .eq('annulee', false)
    .gte('semaine', debut.toISOString().slice(0, 10))
    .lte('semaine', fin.toISOString().slice(0, 10))
    .limit(500);
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((s) => s.tronc_commun_id || s.emploi_du_temps?.statut === 'valide')
    .map((s) => ({
      id: s.id,
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? 'Cours',
      specialiteNom: s.tronc_commun_id ? 'Tronc commun' : s.emploi_du_temps?.specialite?.nom ?? '',
      jour: s.jour,
      creneau: s.creneau,
      date: dateDeSeance(s.semaine, s.jour),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.creneau.localeCompare(b.creneau));
}

export const TAILLE_MAX_JUSTIFICATIF = 5 * 1024 * 1024;
const TYPES_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export async function creerSignalement(params: {
  matricule: string;
  seanceId: string;
  type: TypeSignalement;
  minutesRetard: number | null;
  raison: string;
  fichier: File | null;
}): Promise<void> {
  let path: string | null = null;
  let nomFichier: string | null = null;
  if (params.fichier) {
    if (params.fichier.size > TAILLE_MAX_JUSTIFICATIF) throw new Error('La pièce justificative dépasse 5 Mo.');
    if (!TYPES_ACCEPTES.includes(params.fichier.type)) throw new Error('Format accepté : PDF, JPG, PNG ou WebP.');
    const enseignantId = await enseignantCourant(params.matricule);
    const propre = params.fichier.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    path = `${enseignantId}/${Date.now()}-${propre}`;
    const { error: up } = await supabase.storage.from('justificatifs').upload(path, params.fichier, { contentType: params.fichier.type });
    if (up) throw new Error(`Envoi de la pièce justificative impossible : ${up.message}`);
    nomFichier = params.fichier.name;
  }
  const { error } = await supabase.rpc('signaler_absence_retard', {
    p_seance_id: params.seanceId,
    p_type: params.type,
    p_minutes: params.type === 'retard' ? params.minutesRetard : null,
    p_raison: params.raison,
    p_justificatif_path: path,
    p_justificatif_nom: nomFichier,
  });
  if (error) throw new Error(error.message);
}

function versSignalement(l: any): Signalement {
  return {
    id: l.id,
    enseignantId: l.enseignant_id,
    enseignantNom: l.enseignant?.nom ?? '',
    enseignantWhatsapp: l.enseignant?.numero_whatsapp ?? null,
    ueNom: l.ue_nom,
    specialiteNom: l.specialite_nom,
    dateCours: l.date_cours,
    jour: l.jour,
    creneau: l.creneau,
    type: l.type,
    minutesRetard: l.minutes_retard,
    raison: l.raison,
    justificatifPath: l.justificatif_path,
    justificatifNom: l.justificatif_nom,
    statut: l.statut,
    commentaireAdmin: l.commentaire_admin,
    traiteLe: l.traite_le,
    creeLe: l.created_at,
  };
}

const COLONNES = '*, enseignant:enseignants(nom, numero_whatsapp)';

export async function listMesSignalements(): Promise<Signalement[]> {
  const { data, error } = await supabase.from('signalements_enseignants').select(COLONNES).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(versSignalement);
}

export async function listSignalements(statut: StatutSignalement | 'tous'): Promise<Signalement[]> {
  let q = supabase.from('signalements_enseignants').select(COLONNES).order('created_at', { ascending: false }).limit(500);
  if (statut !== 'tous') q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(versSignalement);
}

export async function traiterSignalement(id: string, decision: 'accepte' | 'refuse', commentaire: string): Promise<void> {
  const { error } = await supabase.rpc('traiter_signalement', { p_id: id, p_decision: decision, p_commentaire: commentaire || null });
  if (error) throw new Error(error.message);
}

/** Lien temporaire (10 min) vers la pièce justificative (bucket privé). */
export async function urlJustificatif(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('justificatifs').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Pièce introuvable.');
  return data.signedUrl;
}

export function formaterDateFr(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}