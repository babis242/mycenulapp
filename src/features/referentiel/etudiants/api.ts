// src/features/referentiel/etudiants/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { niveauDeSemestre } from '@/constants/enums';

export interface Etudiant {
  id: string;
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
  niveau?: string;
  inscrit?: boolean; // inscrit / pas inscrit (sql/etudiants_inscription.sql) ; absent = inscrit
  created_at: string;
}

export async function listEtudiants(
  specialiteId: string,
  semestre: string
): Promise<Etudiant[]> {
  const lire = (colonnes: string) =>
    supabase
      .from('etudiants')
      .select(colonnes)
      .eq('specialite_id', specialiteId)
      .eq('semestre', semestre)
      .order('nom_complet', { ascending: true });
  const base = 'id, matricule, nom_complet, specialite_id, semestre, niveau, created_at';
  let { data, error } = await lire(`${base}, inscrit`);
  // Colonne « inscrit » pas encore créée (sql/etudiants_inscription.sql) : on lit sans elle.
  if (error && /inscrit/i.test(error.message)) ({ data, error } = await lire(base));
  if (error) throw error;
  return (data ?? []) as unknown as Etudiant[];
}

// Lecture hors-ligne — même filtre, depuis Dexie.
export async function lireEtudiantsDepuisCache(
  specialiteId: string,
  semestre: string
): Promise<Etudiant[]> {
  const data = await db.etudiants
    .where('specialite_id')
    .equals(specialiteId)
    .and((e: any) => e.semestre === semestre)
    .toArray();
  return (data as Etudiant[]).sort((a, b) =>
    a.nom_complet.localeCompare(b.nom_complet)
  );
}

export interface NouvelEtudiant {
  matricule: string;
  nom_complet: string;
}

// Ajout en masse (manuel ou depuis un import Excel — même chemin) : ignore
// silencieusement les doublons (même matricule déjà présent dans ce groupe
// spécialité/semestre) plutôt que de faire échouer tout le lot.
export async function ajouterEtudiants(
  specialiteId: string,
  semestre: string,
  etudiants: NouvelEtudiant[]
): Promise<{ ajoutes: number; doublons: number }> {
  if (etudiants.length === 0) return { ajoutes: 0, doublons: 0 };

  const { data: existants, error: erreurExistants } = await supabase
    .from('etudiants')
    .select('matricule')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre);
  if (erreurExistants) throw erreurExistants;
  const matriculesExistants = new Set(
    (existants ?? []).map((e) => e.matricule.trim().toLowerCase())
  );

  const aInserer = etudiants.filter(
    (e) => !matriculesExistants.has(e.matricule.trim().toLowerCase())
  );
  const doublons = etudiants.length - aInserer.length;
  if (aInserer.length === 0) return { ajoutes: 0, doublons };

  const { error } = await supabase.from('etudiants').insert(
    aInserer.map((e) => ({
      matricule: e.matricule.trim(),
      nom_complet: e.nom_complet.trim(),
      specialite_id: specialiteId,
      semestre,
      // La colonne "niveau" est obligatoire en base : déduite du semestre
      // (S1/S2 → Niveau 1, S3/S4 → Niveau 2, …).
      niveau: niveauDeSemestre('standard', semestre) ?? 'Niveau 1',
    }))
  );
  if (error) throw error;

  return { ajoutes: aInserer.length, doublons };
}

export async function supprimerEtudiant(id: string): Promise<void> {
  const { error } = await supabase.from('etudiants').delete().eq('id', id);
  if (error) throw error;
}
export interface ModificationEtudiant {
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
  niveau: string;
  inscrit?: boolean;
}

// Modifie la fiche d'un étudiant (nom, matricule, spécialité, semestre,
// niveau). Les présences déjà saisies restent rattachées à la classe où elles
// ont été faites. En cas de doublon (même matricule, même spécialité et même
// niveau), renvoie un message clair plutôt que l'erreur brute de la base.
export async function modifierEtudiant(
  id: string,
  m: ModificationEtudiant
): Promise<void> {
  const patch = {
    matricule: m.matricule.trim(),
    nom_complet: m.nom_complet.trim(),
    specialite_id: m.specialite_id,
    semestre: m.semestre,
    niveau: m.niveau,
    ...(m.inscrit === undefined ? {} : { inscrit: m.inscrit }),
  };
  const { data, error } = await supabase
    .from('etudiants')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error(
        'Un étudiant avec ce matricule existe déjà dans cette spécialité et ce niveau.'
      );
    }
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error(
      "La modification n'a pas été enregistrée (droits insuffisants ou étudiant introuvable)."
    );
  }
  // Met aussi à jour la copie locale (hors-ligne), sans bloquer en cas d'échec.
  try {
    await db.etudiants.update(id, patch);
  } catch {
    /* le prochain rafraîchissement corrigera le cache */
  }
}

// ── Matricule provisoire ─────────────────────────────────────────────────────
// Un étudiant sans matricule officiel reçoit « PROV-0001 », « PROV-0002 »… (numéro
// suivant dans la spécialité). Il suffit ensuite de modifier sa fiche pour y mettre le vrai matricule.
export const PREFIXE_PROVISOIRE = 'PROV-';
export const estMatriculeProvisoire = (m: string) => m.trim().toUpperCase().startsWith(PREFIXE_PROVISOIRE);

async function numeroProvisoireSuivant(specialiteId: string): Promise<number> {
  const { data, error } = await supabase
    .from('etudiants')
    .select('matricule')
    .eq('specialite_id', specialiteId)
    .ilike('matricule', `${PREFIXE_PROVISOIRE}%`)
    .limit(5000);
  if (error) throw error;
  let max = 0;
  for (const e of data ?? []) {
    const n = Number(String(e.matricule).slice(PREFIXE_PROVISOIRE.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Crée UN étudiant dans une classe (spécialité + semestre). `matricule` vide ou null =
 * matricule provisoire généré automatiquement. Renvoie l'étudiant créé.
 */
export async function creerEtudiant(
  specialiteId: string,
  semestre: string,
  nomComplet: string,
  matricule: string | null,
  inscrit = true
): Promise<Etudiant> {
  const nom = nomComplet.trim();
  if (!nom) throw new Error('Le nom est obligatoire.');
  const niveau = niveauDeSemestre('standard', semestre) ?? 'Niveau 1';
  const fourni = (matricule ?? '').trim();

  let numero = fourni ? 0 : await numeroProvisoireSuivant(specialiteId);
  for (let essai = 0; essai < 5; essai++) {
    const m = fourni || `${PREFIXE_PROVISOIRE}${String(numero).padStart(4, '0')}`;
    const { data, error } = await supabase
      .from('etudiants')
      .insert({ matricule: m, nom_complet: nom, specialite_id: specialiteId, semestre, niveau, ...(inscrit ? {} : { inscrit: false }) })
      .select('id, matricule, nom_complet, specialite_id, semestre, niveau, created_at')
      .single();
    if (!error) return data as Etudiant;
    if ((error as any).code === '23505') {
      if (fourni) throw new Error('Un étudiant avec ce matricule existe déjà dans cette spécialité et ce niveau.');
      numero += 1; // numéro provisoire déjà pris (autre niveau, saisie simultanée) : on prend le suivant
      continue;
    }
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new Error("Ajout refusé : exécutez sql/gestion_etudiants_saisie.sql dans Supabase pour autoriser ce compte.");
    }
    throw error;
  }
  throw new Error('Impossible de générer un matricule provisoire unique.');
}

/** Change le statut d'inscription d'un étudiant (inscrit / pas inscrit). */
export async function definirInscription(id: string, inscrit: boolean): Promise<void> {
  const { data, error } = await supabase.from('etudiants').update({ inscrit }).eq('id', id).select('id');
  if (error) {
    if (/inscrit/i.test(error.message)) throw new Error('Colonne absente : exécutez sql/etudiants_inscription.sql dans Supabase.');
    throw error;
  }
  if ((data ?? []).length === 0) throw new Error('Modification refusée par la base (droits insuffisants).');
}

// ── Recherche générale (toute l'école) ───────────────────────────────────────
export interface EtudiantTrouve extends Etudiant {
  specialite_nom: string;
  specialite_cycle: string;
}

/**
 * Cherche des étudiants par nom ou matricule dans TOUTES les classes. Chaque mot saisi doit
 * apparaître dans le nom ou le matricule (« kamga paul » trouve « PAUL KAMGA »). 50 résultats au plus.
 */
export async function rechercherEtudiants(terme: string): Promise<{ resultats: EtudiantTrouve[]; tronque: boolean }> {
  const mots = terme
    .trim()
    .split(/\s+/)
    .map((m) => m.replace(/[,()%*\\]/g, ''))
    .filter(Boolean);
  if (mots.length === 0) return { resultats: [], tronque: false };

  const LIMITE = 50;
  const base = 'id, matricule, nom_complet, specialite_id, semestre, niveau, created_at';
  const lancer = (colonnes: string) => {
    let q: any = supabase.from('etudiants').select(colonnes);
    for (const m of mots) q = q.or(`nom_complet.ilike.%${m}%,matricule.ilike.%${m}%`);
    return q.order('nom_complet', { ascending: true }).limit(LIMITE + 1);
  };
  let { data, error } = await lancer(`${base}, inscrit`);
  if (error && /inscrit/i.test(error.message)) ({ data, error } = await lancer(base));
  if (error) throw error;

  const lignes = (data ?? []) as unknown as Etudiant[];
  const tronque = lignes.length > LIMITE;
  const utiles = lignes.slice(0, LIMITE);

  const ids = Array.from(new Set(utiles.map((e) => e.specialite_id)));
  const noms = new Map<string, { nom: string; cycle: string }>();
  if (ids.length > 0) {
    const { data: sp, error: errSp } = await supabase.from('specialites').select('id, nom, cycle').in('id', ids);
    if (errSp) throw errSp;
    for (const x of sp ?? []) noms.set(x.id, { nom: x.nom, cycle: x.cycle });
  }
  return {
    tronque,
    resultats: utiles.map((e) => ({
      ...e,
      specialite_nom: noms.get(e.specialite_id)?.nom ?? '—',
      specialite_cycle: noms.get(e.specialite_id)?.cycle ?? '',
    })),
  };
}