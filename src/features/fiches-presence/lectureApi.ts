// src/features/fiches-presence/lectureApi.ts
//
// Lecture automatique (IA) des fiches de présence photographiées, mise en
// correspondance avec la liste des étudiants, enregistrement et lecture
// des présences.
import { supabase } from '@/lib/supabase';

export interface LigneLue {
  numero: number | null;
  matricule: string;
  nom: string;
  cases: (boolean | null)[]; // jours × créneaux ; true=P, false=A, null=vide
}

// ── Mise en correspondance nom lu ↔ étudiant de la liste ─────────────

function jetons(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prec = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prec[j] + 1,
        cur[j - 1] + 1,
        prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prec = cur;
  }
  return prec[n];
}

const ratio = (a: string, b: string) =>
  a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0;

export function similariteNoms(a: string, b: string): number {
  const ja = jetons(a);
  const jb = jetons(b);
  if (!ja.length || !jb.length) return 0;
  const global = ratio([...ja].sort().join(' '), [...jb].sort().join(' '));
  // Recouvrement par mots (tolère un prénom manquant ou tronqué).
  const [petit, grand] = ja.length <= jb.length ? [ja, jb] : [jb, ja];
  let somme = 0;
  for (const t of petit) somme += Math.max(...grand.map((g) => ratio(t, g)));
  const recouvrement = (somme / petit.length) * 0.92;
  return Math.max(global, recouvrement);
}

export interface Correspondance {
  etudiantId: string | null;
  score: number;
  statut: 'ok' | 'incertain' | 'nouveau';
}

export function rapprocher(
  lignes: { matricule: string; nom: string }[],
  etudiants: { id: string; matricule: string; nom_complet: string }[]
): Correspondance[] {
  const resultat: Correspondance[] = lignes.map(() => ({
    etudiantId: null,
    score: 0,
    statut: 'nouveau',
  }));
  const paires: { i: number; e: number; score: number }[] = [];
  const mat = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  lignes.forEach((l, i) => {
    etudiants.forEach((e, k) => {
      const parMatricule = l.matricule && mat(l.matricule) === mat(e.matricule);
      const score = parMatricule ? 1 : similariteNoms(l.nom, e.nom_complet);
      if (score >= 0.72) paires.push({ i, e: k, score });
    });
  });
  paires.sort((a, b) => b.score - a.score);
  const lignesPrises = new Set<number>();
  const etudiantsPris = new Set<number>();
  for (const p of paires) {
    if (lignesPrises.has(p.i) || etudiantsPris.has(p.e)) continue;
    lignesPrises.add(p.i);
    etudiantsPris.add(p.e);
    resultat[p.i] = {
      etudiantId: etudiants[p.e].id,
      score: p.score,
      statut: p.score >= 0.88 ? 'ok' : 'incertain',
    };
  }
  return resultat;
}

// ── Enregistrement / lecture des présences ───────────────────────────

export interface PresenceEnregistree {
  etudiant_id: string;
  semaine: string;
  jour: string;
  creneau: string;
  present: boolean;
}

export async function enregistrerPresences(params: {
  specialiteId: string;
  semestre: string;
  semaine: string;
  jours: string[];
  creneaux: string[];
  // une entrée par étudiant (cases déjà fusionnées si lu sur plusieurs photos)
  parEtudiant: Map<string, (boolean | null)[]>;
}): Promise<number> {
  const { specialiteId, semestre, semaine, jours, creneaux, parEtudiant } = params;
  const lignes: any[] = [];
  for (const [etudiantId, cases] of parEtudiant) {
    let k = 0;
    for (const jour of jours) {
      for (const creneau of creneaux) {
        const valeur = cases[k++];
        if (valeur === null || valeur === undefined) continue; // case vide : rien à enregistrer
        lignes.push({
          etudiant_id: etudiantId,
          specialite_id: specialiteId,
          semestre,
          semaine,
          jour,
          creneau,
          present: valeur,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await supabase
      .from('presences_etudiants')
      .upsert(lignes.slice(i, i + 500), { onConflict: 'etudiant_id,semaine,jour,creneau' });
    if (error) throw error;
  }
  return parEtudiant.size;
}

// Présences d'un groupe (spécialité + semestre), toutes semaines ou une
// seule — requêtes à plat, paginées.
export async function listPresences(
  specialiteId: string,
  semestre: string,
  semaine?: string
): Promise<PresenceEnregistree[]> {
  const resultat: PresenceEnregistree[] = [];
  const PAGE = 1000;
  for (let debut = 0; ; debut += PAGE) {
    let q = supabase
      .from('presences_etudiants')
      .select('etudiant_id, semaine, jour, creneau, present')
      .eq('specialite_id', specialiteId)
      .eq('semestre', semestre);
    if (semaine) q = q.eq('semaine', semaine);
    const { data, error } = await q
      .order('semaine', { ascending: true })
      .order('etudiant_id', { ascending: true })
      .order('jour', { ascending: true })
      .order('creneau', { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    resultat.push(...((data ?? []) as PresenceEnregistree[]));
    if ((data ?? []).length < PAGE) break;
  }
  return resultat;
}