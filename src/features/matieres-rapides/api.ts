// src/features/matieres-rapides/api.ts
// Création rapide d'une matière (UE + offre + enseignant) depuis l'emploi du temps,
// et gestion des enseignants provisoires (nom seul, remplaçables par le vrai enseignant).
import { supabase } from '@/lib/supabase';
import { createUE } from '@/features/referentiel/ues/api';
import { createEnseignant } from '@/features/referentiel/enseignants/api';

export interface EnseignantChoix { id: string; nom: string; matricule: string | null; provisoire: boolean }

export async function listEnseignantsPourChoix(): Promise<EnseignantChoix[]> {
  const tout: EnseignantChoix[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('enseignants')
      .select('id, nom, matricule, provisoire')
      .order('nom')
      .range(debut, debut + 999);
    if (error) throw error;
    for (const e of (data ?? []) as any[]) tout.push({ id: e.id, nom: e.nom, matricule: e.matricule ?? null, provisoire: !!e.provisoire });
    if ((data ?? []).length < 1000) break;
  }
  return tout;
}

/** Enseignant provisoire : enregistré par son nom uniquement. */
export async function creerEnseignantProvisoire(nom: string): Promise<EnseignantChoix> {
  const n = nom.trim();
  if (!n) throw new Error("Indiquez le nom de l'enseignant.");
  const { data, error } = await supabase
    .from('enseignants')
    .insert({ nom: n, provisoire: true })
    .select('id, nom, matricule, provisoire')
    .single();
  if (error) throw error;
  return { id: data.id, nom: data.nom, matricule: data.matricule ?? null, provisoire: true };
}

/** Une matière du même nom existe-t-elle déjà pour cette spécialité et ce semestre ? */
export async function matiereExiste(specialiteId: string, semestre: string, nom: string): Promise<boolean> {
  const { data: offres, error } = await supabase.from('offres').select('ue_id').eq('specialite_id', specialiteId).eq('semestre', semestre);
  if (error) throw error;
  const ueIds = ((offres ?? []) as any[]).map((o) => o.ue_id).filter(Boolean);
  if (ueIds.length === 0) return false;
  const { data: ues, error: e2 } = await supabase.from('ues').select('nom').in('id', ueIds);
  if (e2) throw e2;
  const cible = nom.trim().toLowerCase();
  return ((ues ?? []) as any[]).some((u) => String(u.nom).trim().toLowerCase() === cible);
}

export async function creerMatiereRapide(p: {
  nom: string; code?: string; volumeHoraire?: number; specialiteId: string; semestre: string; enseignantId: string | null;
}): Promise<{ ueId: string; offreId: string }> {
  const nom = p.nom.trim();
  if (!nom) throw new Error('Indiquez le nom de la matière.');
  const ue = await createUE({ nom, code: p.code?.trim() || undefined, volume_horaire: p.volumeHoraire, specialite_id: p.specialiteId, semestre: p.semestre });
  if (p.enseignantId) {
    const { error } = await supabase.from('attributions').insert({ offre_id: ue.offreId, enseignant_id: p.enseignantId, statut: 'actif' });
    if (error) throw new Error(`Matière créée, mais l'enseignant n'a pas pu être attribué : ${error.message}`);
  }
  return { ueId: ue.id as string, offreId: ue.offreId };
}

/** Remplace un provisoire par un vrai enseignant : tout son historique est transféré. */
export async function remplacerProvisoire(provisoireId: string, reelId: string): Promise<number> {
  const { data, error } = await supabase.rpc('remplacer_enseignant_provisoire', { p_provisoire: provisoireId, p_reel: reelId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Convertit le provisoire en véritable enseignant (même fiche, même historique). */
export async function convertirProvisoire(id: string, p: { email: string; numero_whatsapp?: string; numero_cellulaire?: string }): Promise<void> {
  if (!p.email.trim()) throw new Error("L'email est obligatoire.");
  const { data, error } = await supabase
    .from('enseignants')
    .update({ provisoire: false, email: p.email.trim(), numero_whatsapp: p.numero_whatsapp?.trim() || null, numero_cellulaire: p.numero_cellulaire?.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) throw new Error('Modification refusée par la base (droits insuffisants).');
}


export interface PromotionProvisoire {
  id: string; // id du nouvel enseignant (le provisoire est supprimé)
  matricule: string | null;
  nom: string;
  emailEnvoye: boolean;
  nbTransferes: number;
}

/**
 * Transforme un provisoire en véritable enseignant : crée la fiche (le matricule
 * est généré par la base), transfère tout l'historique du provisoire (attributions,
 * séances, heures…), puis crée le compte de connexion et envoie l'email.
 * L'envoi des identifiants par WhatsApp se fait ensuite depuis le bouton dédié.
 */
export async function promouvoirProvisoire(
  provisoireId: string,
  nom: string,
  p: { email: string; numero_whatsapp?: string; numero_cellulaire?: string }
): Promise<PromotionProvisoire> {
  const email = p.email.trim();
  if (!email) throw new Error("L'email est obligatoire.");
  const cree = await createEnseignant({
    nom,
    email,
    numero_whatsapp: p.numero_whatsapp?.trim() || undefined,
    numero_cellulaire: p.numero_cellulaire?.trim() || undefined,
  });
  let nbTransferes = 0;
  try {
    nbTransferes = await remplacerProvisoire(provisoireId, cree.id);
  } catch (e) {
    // Transfert impossible : on retire la fiche qu'on vient de créer pour ne pas laisser de doublon.
    await supabase.from('enseignants').delete().eq('id', cree.id);
    throw e;
  }
  const { data, error } = await supabase.functions.invoke('create-enseignant-account', {
    body: { enseignantId: cree.id },
  });
  return {
    id: cree.id,
    matricule: cree.matricule ?? null,
    nom: cree.nom,
    emailEnvoye: !(error || data?.error),
    nbTransferes,
  };
}