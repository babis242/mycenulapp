// src/features/examens/api.ts — programmes d'examens (nécessite sql/examens.sql).
import { supabase } from '@/lib/supabase';

export interface SpecialiteExamen { id: string; nom: string; cycle?: string }
export interface Examen {
  id: string;
  titre: string;
  anneeAcademique: string;
  semestre: string;
  specialites: SpecialiteExamen[];
  jours: string[]; // AAAA-MM-JJ, triés
  creeLe: string;
}
export type TypeLigne = 'epreuve' | 'pause';
export interface LigneExamen {
  id: string;
  examenId: string;
  specialiteId: string | null; // null = épreuve de tronc commun (propagée)
  troncCommunId: string | null;
  type: TypeLigne;
  offreId: string | null;
  ueNom: string | null;
  date: string; // AAAA-MM-JJ
  debutMin: number;
  dureeMin: number;
  salle: string | null;
  libelle: string | null; // nom affiché dans le programme (remplace le nom de l'UE)
}
/** Nom affiché dans le programme : libellé personnalisé, sinon nom de l'UE. */
export const nomLigne = (l: { libelle: string | null; ueNom: string | null }) => l.libelle?.trim() || l.ueNom || '';
export interface MatiereExamen {
  offreId: string; ueNom: string; specialiteId: string;
  troncId: string | null; troncNom: string | null;
}
/** Identifiant d'une « matière à programmer » : le tronc commun compte pour une seule matière. */
export const cleMatiere = (m: MatiereExamen) => (m.troncId ? `t:${m.troncId}` : `o:${m.offreId}`);


export const DUREE_EPREUVE_DEFAUT = 120;
export const DUREE_PAUSE_DEFAUT = 60;

// ── Utilitaires ──
export function minutesVersHeure(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
}
export function heureVersMinutes(valeur: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valeur);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function minutesVersChamp(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
const JOURS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
export function jourDeDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return JOURS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
export function dateFr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Deux plages [début, fin[ se chevauchent-elles ? */
export function seChevauchent(a: { debutMin: number; dureeMin: number }, b: { debutMin: number; dureeMin: number }): boolean {
  return a.debutMin < b.debutMin + b.dureeMin && b.debutMin < a.debutMin + a.dureeMin;
}

/**
 * Lignes d'une spécialité : ses épreuves, ses pauses, et les épreuves de tronc commun
 * qui la concernent (nom de la matière = celui de SON UE).
 */
export function lignesPourSpecialite(lignes: LigneExamen[], matieres: MatiereExamen[], specialiteId: string): LigneExamen[] {
  const resultat: LigneExamen[] = [];
  for (const l of lignes) {
    if (l.troncCommunId) {
      const m = matieres.find((x) => x.troncId === l.troncCommunId && x.specialiteId === specialiteId);
      if (m) resultat.push({ ...l, specialiteId, offreId: m.offreId, ueNom: m.ueNom });
    } else if (l.specialiteId === specialiteId) {
      resultat.push(l);
    }
  }
  return resultat.sort((a, b) => a.date.localeCompare(b.date) || a.debutMin - b.debutMin);
}

/** Spécialités de l'examen concernées par une ligne (plusieurs si tronc commun). */
export function specialitesDeLigne(l: LigneExamen, matieres: MatiereExamen[]): string[] {
  if (l.troncCommunId) return Array.from(new Set(matieres.filter((m) => m.troncId === l.troncCommunId).map((m) => m.specialiteId)));
  return l.specialiteId ? [l.specialiteId] : [];
}

/** Chevauchement avec une autre ligne du même jour pour l'une des spécialités visées. */
export function conflitHoraire(
  nouvelle: { specialiteIds: string[]; date: string; debutMin: number; dureeMin: number },
  lignes: LigneExamen[],
  matieres: MatiereExamen[],
  ignorerId?: string | string[]
): string | null {
  for (const sp of nouvelle.specialiteIds) {
    for (const l of lignesPourSpecialite(lignes, matieres, sp)) {
      if ((Array.isArray(ignorerId) ? ignorerId.includes(l.id) : l.id === ignorerId) || l.date !== nouvelle.date) continue;
      if (seChevauchent(nouvelle, l)) {
        return `Chevauche ${l.type === 'pause' ? 'une pause' : `« ${nomLigne(l)} »`} (${minutesVersHeure(l.debutMin)} - ${minutesVersHeure(l.debutMin + l.dureeMin)}).`;
      }
    }
  }
  return null;
}

/** Salle déjà utilisée sur une plage qui se chevauche (même examen, toutes spécialités). */
export function conflitsRessources(
  n: { date: string; debutMin: number; dureeMin: number; salle: string | null },
  existantes: LigneExamen[],
  matieres: MatiereExamen[],
  ignorerId?: string
): string[] {
  const messages: string[] = [];
  const salle = n.salle?.trim().toLowerCase();
  if (!salle) return messages;
  for (const l of existantes) {
    if (l.id === ignorerId || l.type !== 'epreuve' || l.date !== n.date || !seChevauchent(n, l)) continue;
    if (l.salle?.trim().toLowerCase() === salle) {
      const nom = nomLigne(l) || (matieres.find((m) => m.troncId === l.troncCommunId)?.troncNom ?? 'épreuve');
      messages.push(`La salle « ${n.salle} » est déjà utilisée à ${minutesVersHeure(l.debutMin)} - ${minutesVersHeure(l.debutMin + l.dureeMin)} (${nom}).`);
    }
  }
  return messages;
}

// ── Examens ──
function versExamen(l: any): Examen {
  return {
    id: l.id,
    titre: l.titre,
    anneeAcademique: l.annee_academique,
    semestre: l.semestre,
    creeLe: l.created_at,
    jours: ((l.examens_jours ?? []) as any[]).map((j) => j.date as string).sort(),
    specialites: ((l.examens_specialites ?? []) as any[])
      .map((s) => ({ id: s.specialite_id, nom: s.specialite?.nom ?? '', cycle: s.specialite?.cycle ?? undefined }))
      .sort((a, b) => a.nom.localeCompare(b.nom)),
  };
}
const SEL_EXAMEN = '*, examens_specialites(specialite_id, specialite:specialites(nom, cycle)), examens_jours(date)';

export async function listExamens(): Promise<Examen[]> {
  const { data, error } = await supabase.from('examens').select(SEL_EXAMEN).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(versExamen);
}

export async function getExamen(id: string): Promise<Examen> {
  const { data, error } = await supabase.from('examens').select(SEL_EXAMEN).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Examen introuvable.');
  const ex = versExamen(data);
  // Cycle des spécialités (requête à plat) : sert à choisir la langue du PDF (HND = anglais).
  if (ex.specialites.length > 0) {
    const { data: sp } = await supabase.from('specialites').select('id, cycle').in('id', ex.specialites.map((x) => x.id));
    const cycles = new Map(((sp ?? []) as any[]).map((x) => [x.id as string, x.cycle as string]));
    ex.specialites = ex.specialites.map((x) => ({ ...x, cycle: cycles.get(x.id) ?? x.cycle }));
  }
  return ex;
}

/** Spécialité anglophone (HND) : programme d'examen en anglais. */
export const estSpecialiteHND = (s: { nom?: string; cycle?: string }) => /HND|higher national/i.test(`${s.cycle ?? ''} ${s.nom ?? ''}`);

export async function creerExamen(p: { titre: string; anneeAcademique: string; semestre: string; specialiteIds: string[]; jours?: string[] }): Promise<string> {
  const { data, error } = await supabase
    .from('examens')
    .insert({ titre: p.titre.trim(), annee_academique: p.anneeAcademique.trim(), semestre: p.semestre })
    .select('id')
    .single();
  if (error) throw error;
  const { error: e2 } = await supabase
    .from('examens_specialites')
    .insert(p.specialiteIds.map((specialite_id) => ({ examen_id: data.id, specialite_id })));
  if (e2) {
    await supabase.from('examens').delete().eq('id', data.id);
    throw e2;
  }
  if (p.jours?.length) await ajouterJours(data.id, p.jours);
  return data.id;
}

export async function ajouterJours(examenId: string, jours: string[]): Promise<void> {
  if (jours.length === 0) return;
  const { error } = await supabase
    .from('examens_jours')
    .upsert(jours.map((date) => ({ examen_id: examenId, date })), { onConflict: 'examen_id,date', ignoreDuplicates: true });
  if (error) throw error;
}

/** Liste de dates (hors dimanche) entre deux dates incluses. */
export function joursEntre(debut: string, fin: string): string[] {
  const res: string[] = [];
  const [y, m, d] = debut.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 120; i++) {
    const iso = t.toISOString().slice(0, 10);
    if (iso > fin) break;
    if (t.getUTCDay() !== 0) res.push(iso);
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return res;
}

/** Retire un jour ainsi que toutes les lignes de ce jour. */
export async function supprimerJour(examenId: string, date: string): Promise<void> {
  const r1 = await supabase.from('examens_lignes').delete().eq('examen_id', examenId).eq('date', date);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from('examens_jours').delete({ count: 'exact' }).eq('examen_id', examenId).eq('date', date);
  if (r2.error) throw r2.error;
  if (!r2.count) throw new Error('Suppression refusée par la base (droits insuffisants).');
}

/** Spécialités proposables pour un examen : celles qui ont une offre dans ce semestre. */
export async function listSpecialitesCandidates(semestre: string, perimetre: string[] | null): Promise<SpecialiteExamen[]> {
  const vues = new Map<string, string>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('offres')
      .select('specialite_id, specialite:specialites(nom)')
      .eq('semestre', semestre)
      .order('id')
      .range(debut, debut + 999);
    if (error) throw error;
    for (const o of (data ?? []) as any[]) if (o.specialite_id && o.specialite?.nom) vues.set(o.specialite_id, o.specialite.nom);
    if ((data ?? []).length < 1000) break;
  }
  return Array.from(vues, ([id, nom]) => ({ id, nom }))
    .filter((x) => !perimetre || perimetre.includes(x.id))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Change les spécialités concernées ; le programme propre aux spécialités retirées est supprimé. */
export async function modifierSpecialitesExamen(examenId: string, actuelles: string[], nouvelles: string[]): Promise<void> {
  const ajoutees = nouvelles.filter((x) => !actuelles.includes(x));
  const retirees = actuelles.filter((x) => !nouvelles.includes(x));
  if (nouvelles.length === 0) throw new Error('Gardez au moins une spécialité.');
  if (ajoutees.length > 0) {
    const { error } = await supabase.from('examens_specialites').insert(ajoutees.map((specialite_id) => ({ examen_id: examenId, specialite_id })));
    if (error) throw error;
  }
  if (retirees.length > 0) {
    const r1 = await supabase.from('examens_lignes').delete().eq('examen_id', examenId).in('specialite_id', retirees);
    if (r1.error) throw r1.error;
    const r2 = await supabase.from('examens_specialites').delete().eq('examen_id', examenId).in('specialite_id', retirees);
    if (r2.error) throw r2.error;
  }
}

export async function supprimerExamen(id: string): Promise<void> {
  const { count, error } = await supabase.from('examens').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('Suppression refusée par la base (droits insuffisants).');
}

// ── Matières à programmer (requêtes à plat) ──
export async function listMatieresExamen(specialiteIds: string[], semestre: string): Promise<MatiereExamen[]> {
  if (specialiteIds.length === 0) return [];
  const { data, error } = await supabase
    .from('offres')
    .select('id, specialite_id, ue_id, ue:ues(nom)')
    .in('specialite_id', specialiteIds)
    .eq('semestre', semestre);
  if (error) throw error;
  const offres = (data ?? []) as any[];
  const ueIds = Array.from(new Set(offres.map((o) => o.ue_id).filter(Boolean)));
  const ueVersTronc = new Map<string, string>();
  const troncNoms = new Map<string, string>();
  if (ueIds.length > 0) {
    const { data: liens, error: e2 } = await supabase.from('troncs_communs_ues').select('ue_id, tronc_commun_id').in('ue_id', ueIds);
    if (e2) throw e2;
    for (const l of (liens ?? []) as any[]) ueVersTronc.set(l.ue_id, l.tronc_commun_id);
    const troncIds = Array.from(new Set(ueVersTronc.values()));
    if (troncIds.length > 0) {
      const { data: tr, error: e3 } = await supabase.from('troncs_communs').select('id, nom').in('id', troncIds);
      if (e3) throw e3;
      for (const t of (tr ?? []) as any[]) troncNoms.set(t.id, t.nom);
    }
  }
  return offres
    .map((o) => {
      const troncId = ueVersTronc.get(o.ue_id) ?? null;
      return {
        offreId: o.id, specialiteId: o.specialite_id, ueNom: o.ue?.nom ?? 'UE',
        troncId, troncNom: troncId ? troncNoms.get(troncId) ?? null : null,
      };
    })
    .sort((a, b) => a.ueNom.localeCompare(b.ueNom));
}

// ── Programme ──
export async function listLignes(examenId: string): Promise<LigneExamen[]> {
  const resultat: LigneExamen[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('examens_lignes')
      .select('*, offre:offres(ue:ues(nom))')
      .eq('examen_id', examenId)
      .order('date').order('debut_min').order('id')
      .range(debut, debut + 999);
    if (error) throw error;
    for (const l of (data ?? []) as any[]) {
      resultat.push({
        id: l.id, examenId: l.examen_id, specialiteId: l.specialite_id, troncCommunId: l.tronc_commun_id, type: l.type, offreId: l.offre_id,
        ueNom: l.offre?.ue?.nom ?? null, date: l.date, debutMin: l.debut_min, dureeMin: l.duree_min, salle: l.salle, libelle: l.libelle ?? null,
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return resultat;
}

export interface SaisieLigne {
  examenId: string; specialiteId: string | null; troncCommunId?: string | null; type: TypeLigne; offreId: string | null;
  date: string; debutMin: number; dureeMin: number; salle: string | null; libelle?: string | null;
}

export async function ajouterLigne(l: SaisieLigne): Promise<void> {
  const { error } = await supabase.from('examens_lignes').insert({
    examen_id: l.examenId, specialite_id: l.troncCommunId ? null : l.specialiteId, tronc_commun_id: l.troncCommunId ?? null,
    type: l.type, offre_id: l.troncCommunId ? null : l.offreId,
    date: l.date, debut_min: l.debutMin, duree_min: l.dureeMin, salle: l.salle?.trim() || null,
    libelle: l.libelle?.trim() || null,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Cette matière est déjà programmée dans cet examen.');
    throw error;
  }
}

export async function modifierLigne(id: string, l: Pick<SaisieLigne, 'date' | 'debutMin' | 'dureeMin' | 'salle'> & { libelle?: string | null }): Promise<void> {
  const { data, error } = await supabase
    .from('examens_lignes')
    .update({ date: l.date, debut_min: l.debutMin, duree_min: l.dureeMin, salle: l.salle?.trim() || null, ...(l.libelle !== undefined ? { libelle: l.libelle?.trim() || null } : {}) })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Modification refusée par la base (droits insuffisants).');
}

export async function supprimerLigne(id: string): Promise<void> {
  const { count, error } = await supabase.from('examens_lignes').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('Suppression refusée par la base (droits insuffisants).');
}

/** Attribue une salle à plusieurs épreuves d'un coup. */
export async function attribuerSalle(ligneIds: string[], salle: string): Promise<void> {
  if (ligneIds.length === 0) return;
  for (let i = 0; i < ligneIds.length; i += 100) {
    const { data, error } = await supabase
      .from('examens_lignes')
      .update({ salle: salle.trim() || null })
      .in('id', ligneIds.slice(i, i + 100))
      .select('id');
    if (error) throw error;
    if ((data ?? []).length === 0) throw new Error('Modification refusée par la base (droits insuffisants).');
  }
}