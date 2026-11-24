// src/features/fiches-presence/rapportGlobalApi.ts
//
// Rapport de présence GLOBAL (toutes filières) : chargement à plat des
// spécialités, étudiants et cumuls d'absences HEBDOMADAIRES (en heures) des semaines demandées,
// puis calculs purs (taux par semaine, par filière, par spécialité et
// classement des absents de la semaine choisie).
import { supabase } from '@/lib/supabase';

// ── Semaines ─────────────────────────────────────────────────────────
export function decalerSemaine(lundiISO: string, n: number): string {
  const d = new Date(`${lundiISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

// Ramène n'importe quelle date au lundi de sa semaine.
export function lundiDe(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const j = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (j === 0 ? -6 : 1 - j));
  return d.toISOString().slice(0, 10);
}

// `nb` semaines consécutives se terminant par `fin` (ordre chronologique).
export function semainesJusqua(fin: string, nb: number): string[] {
  return Array.from({ length: nb }, (_, i) => decalerSemaine(fin, i - (nb - 1)));
}

// Durée en heures d'un créneau « 08h-12h », « 13h30-17h », « 8h à 12h »… (4 h si illisible).
export function dureeCreneau(label: string): number {
  const m = label.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:-|–|à)\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return 4;
  const debut = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  const fin = Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0);
  return fin > debut ? fin - debut : 4;
}

const arrondi = (x: number) => Math.round(x * 100) / 100;

// ── Chargement ───────────────────────────────────────────────────────
export interface SpecialiteBrute {
  id: string;
  nom: string;
  cycle: string | null;
  filiere_id: string | null;
}
export interface EtudiantBrut {
  id: string;
  matricule: string;
  nom_complet: string;
  specialite_id: string;
  semestre: string;
}
export interface PresenceBrute {
  etudiant_id: string;
  specialite_id: string;
  semestre: string;
  semaine: string;
  jour: string;
  creneau: string;
  present: boolean;
}
// Cumul d'une semaine pour un étudiant, EN HEURES : heures d'absence et heures de
// cours programmées. Vient de la saisie hebdomadaire ; pour les semaines saisies
// avant ce système (présences case par case), il est reconstitué depuis les créneaux.
export interface HeuresHebdo {
  etudiant_id: string;
  specialite_id: string;
  semestre: string;
  semaine: string;
  absence: number;
  programmees: number;
}
export interface DonneesBrutes {
  specialites: SpecialiteBrute[];
  etudiants: EtudiantBrut[];
  presences: PresenceBrute[];
  hebdo: HeuresHebdo[];
}

const PAGE = 1000;

async function toutLire<T>(
  construire: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await construire(debut, debut + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

export async function chargerDonnees(semaines: string[]): Promise<DonneesBrutes> {
  const [specialites, etudiants, parSemaine, hebdoBrut] = await Promise.all([
    toutLire<SpecialiteBrute>((a, b) =>
      supabase.from('specialites').select('id, nom, cycle, filiere_id').order('id').range(a, b)
    ),
    toutLire<EtudiantBrut>((a, b) =>
      supabase
        .from('etudiants')
        .select('id, matricule, nom_complet, specialite_id, semestre')
        .order('id')
        .range(a, b)
    ),
    Promise.all(
      semaines.map((semaine) =>
        toutLire<PresenceBrute>((a, b) =>
          supabase
            .from('presences_etudiants')
            .select('etudiant_id, specialite_id, semestre, semaine, jour, creneau, present')
            .eq('semaine', semaine)
            .order('etudiant_id')
            .order('jour')
            .order('creneau')
            .range(a, b)
        )
      )
    ),
    Promise.all(
      semaines.map((semaine) =>
        toutLire<any>((a, b) =>
          supabase
            .from('absences_hebdo_etudiants')
            .select('etudiant_id, specialite_id, semestre, semaine, heures_absence, heures_programmees')
            .eq('semaine', semaine)
            .order('etudiant_id')
            .range(a, b)
        ).catch((e) => {
          // Table pas encore créée (sql/absences_hebdomadaires.sql) : on ne lit que l'ancienne saisie.
          if (/does not exist|schema cache/i.test(String(e?.message))) return [] as any[];
          throw e;
        })
      )
    ),
  ]);
  const presences = parSemaine.flat();

  const hebdo: HeuresHebdo[] = hebdoBrut.flat().map((r: any) => ({
    etudiant_id: r.etudiant_id,
    specialite_id: r.specialite_id,
    semestre: r.semestre,
    semaine: r.semaine,
    absence: Number(r.heures_absence) || 0,
    programmees: Number(r.heures_programmees) || 0,
  }));
  // Anciennes saisies (case par case) : reconstituées en heures pour les étudiants/semaines sans cumul.
  const dejaSaisis = new Set(hebdo.map((h) => `${h.etudiant_id}|${h.semaine}`));
  const anciens = new Map<string, HeuresHebdo>();
  for (const pr of presences) {
    const k = `${pr.etudiant_id}|${pr.semaine}`;
    if (dejaSaisis.has(k)) continue;
    let h = anciens.get(k);
    if (!h) {
      h = { etudiant_id: pr.etudiant_id, specialite_id: pr.specialite_id, semestre: pr.semestre, semaine: pr.semaine, absence: 0, programmees: 0 };
      anciens.set(k, h);
    }
    const d = dureeCreneau(pr.creneau ?? '');
    h.programmees += d;
    if (!pr.present) h.absence += d;
  }
  return { specialites, etudiants, presences, hebdo: [...hebdo, ...anciens.values()] };
}

// ── Calculs ──────────────────────────────────────────────────────────
export interface Stat {
  p: number; // heures de présence
  t: number; // heures de cours renseignées
}
export const absencesDe = (s: Stat) => arrondi(s.t - s.p);
export const tauxDe = (s: Stat): number | null => (s.t ? Math.round((s.p / s.t) * 100) : null);

export interface EtudiantAbsent {
  matricule: string;
  nom: string;
  absences: number;
  total: number; // heures de cours renseignées dans la semaine
}

export interface GroupeRapport {
  cle: string;
  specialite: string;
  cycle: string;
  semestre: string; // '' si la spécialité n'a aucun étudiant
  inscrits: number; // étudiants enregistrés dans la base
  etudiants: number; // étudiants avec au moins une case renseignée cette semaine
  semaine: Stat; // semaine détaillée
  renseigne: boolean; // au moins une case renseignée cette semaine
  absents: EtudiantAbsent[]; // ≥ 1 absence, triés par nombre d'absences décroissant
}

export interface CycleRapport {
  nom: string;
  parSemaine: Stat[]; // aligné sur `semaines`
  groupes: GroupeRapport[];
}

export interface Rapport {
  semaines: string[];
  semaine: string; // dernière semaine = semaine détaillée
  seuil: number;
  parSemaine: Stat[];
  cycles: CycleRapport[];
  semaineEtudiants: number;
}

// Ajoute un cumul (en heures) à une statistique.
const additionner = (s: Stat, absence: number, programmees: number) => {
  s.t = arrondi(s.t + programmees);
  s.p = arrondi(s.p + Math.max(0, programmees - absence));
};

const ORDRE_CYCLES = ['BTS', 'HND', 'Licence', 'Bachelor', 'Master', 'Formation courte'];
const rangCycle = (c: string) => {
  const i = ORDRE_CYCLES.findIndex((x) => x.toLowerCase() === c.toLowerCase());
  return i === -1 ? ORDRE_CYCLES.length : i;
};
const numeroSemestre = (sem: string) => Number(sem.replace(/[^0-9]/g, '')) || 0;

export interface ClasseChoix {
  cle: string; // « specialiteId|semestre »
  specialite: string;
  cycle: string;
  semestre: string;
  inscrits: number;
}

// Classes (spécialité + semestre) qui ont au moins un étudiant, triées par
// cycle (BTS, HND…) puis par nom, puis par semestre.
export function listerClasses(donnees: DonneesBrutes): ClasseChoix[] {
  const specParId = new Map(donnees.specialites.map((s) => [s.id, s]));
  const m = new Map<string, ClasseChoix>();
  for (const e of donnees.etudiants) {
    const spec = specParId.get(e.specialite_id);
    if (!spec || !e.semestre) continue;
    const cle = `${e.specialite_id}|${e.semestre}`;
    const c = m.get(cle) ?? {
      cle,
      specialite: spec.nom,
      cycle: (spec.cycle ?? '').trim() || 'Autre',
      semestre: e.semestre,
      inscrits: 0,
    };
    c.inscrits += 1;
    m.set(cle, c);
  }
  return Array.from(m.values()).sort(
    (a, b) =>
      rangCycle(a.cycle) - rangCycle(b.cycle) ||
      a.cycle.localeCompare(b.cycle, 'fr') ||
      a.specialite.localeCompare(b.specialite, 'fr') ||
      numeroSemestre(a.semestre) - numeroSemestre(b.semestre)
  );
}

// `inclure` : clés « specialiteId|semestre » retenues (toutes si absent).
// Seules les classes qui ont des étudiants sont prises en compte.
export function calculerRapport(
  donnees: DonneesBrutes,
  semaines: string[],
  seuil: number,
  inclure?: Set<string>
): Rapport {
  const semaine = semaines[semaines.length - 1];
  const idxSemaine = new Map(semaines.map((s, i) => [s, i]));
  const specParId = new Map(donnees.specialites.map((s) => [s.id, s]));
  const etuParId = new Map(donnees.etudiants.map((e) => [e.id, e]));

  const cycles = new Map<string, CycleRapport>();
  const cycleDe = (nom: string) => {
    let c = cycles.get(nom);
    if (!c) {
      c = { nom, parSemaine: semaines.map(() => ({ p: 0, t: 0 })), groupes: [] };
      cycles.set(nom, c);
    }
    return c;
  };
  const groupes = new Map<string, GroupeRapport>();
  const groupeDe = (specId: string, semestre: string) => {
    const spec = specParId.get(specId);
    if (!spec || !semestre) return null;
    const cle = `${specId}|${semestre}`;
    if (inclure && !inclure.has(cle)) return null;
    let g = groupes.get(cle);
    if (!g) {
      const cycle = (spec.cycle ?? '').trim() || 'Autre';
      g = {
        cle,
        specialite: spec.nom,
        cycle,
        semestre,
        inscrits: 0,
        etudiants: 0,
        semaine: { p: 0, t: 0 },
        renseigne: false,
        absents: [],
      };
      groupes.set(cle, g);
      cycleDe(cycle).groupes.push(g);
    }
    return g;
  };

  // Toutes les classes qui ont des étudiants (même sans aucune fiche cette semaine).
  for (const e of donnees.etudiants) {
    const g = groupeDe(e.specialite_id, e.semestre);
    if (g) g.inscrits += 1;
  }

  const parSemaine: Stat[] = semaines.map(() => ({ p: 0, t: 0 }));
  const parEtudiant = new Map<string, { groupe: GroupeRapport; stat: Stat }>();

  for (const h of donnees.hebdo) {
    const i = idxSemaine.get(h.semaine);
    const g = groupes.get(`${h.specialite_id}|${h.semestre}`); // uniquement les classes ayant des étudiants
    if (i === undefined || !g) continue;
    additionner(parSemaine[i], h.absence, h.programmees);
    additionner(cycleDe(g.cycle).parSemaine[i], h.absence, h.programmees);
    if (h.semaine !== semaine) continue;
    g.renseigne = true;
    additionner(g.semaine, h.absence, h.programmees);
    let e = parEtudiant.get(h.etudiant_id);
    if (!e) {
      e = { groupe: g, stat: { p: 0, t: 0 } };
      parEtudiant.set(h.etudiant_id, e);
      g.etudiants += 1;
    }
    additionner(e.stat, h.absence, h.programmees);
  }

  for (const [id, { groupe, stat }] of parEtudiant) {
    if (absencesDe(stat) === 0) continue;
    const etu = etuParId.get(id);
    groupe.absents.push({
      matricule: etu?.matricule ?? '—',
      nom: etu?.nom_complet ?? 'Étudiant inconnu',
      absences: absencesDe(stat),
      total: stat.t,
    });
  }

  const liste = Array.from(cycles.values()).sort(
    (a, b) => rangCycle(a.nom) - rangCycle(b.nom) || a.nom.localeCompare(b.nom, 'fr')
  );
  for (const c of liste) {
    c.groupes.sort(
      (a, b) =>
        a.specialite.localeCompare(b.specialite, 'fr') || numeroSemestre(a.semestre) - numeroSemestre(b.semestre)
    );
    for (const g of c.groupes) {
      g.absents.sort((a, b) => b.absences - a.absences || a.nom.localeCompare(b.nom, 'fr'));
    }
  }
  // Seules les classes dont la fiche est lue cette semaine figurent dans le rapport.
  for (const c of liste) c.groupes = c.groupes.filter((g) => g.renseigne);
  const utiles = liste.filter((c) => c.groupes.length > 0 || c.parSemaine.some((x) => x.t > 0));
  return { semaines, semaine, seuil, parSemaine, cycles: utiles, semaineEtudiants: parEtudiant.size };
}

// Classement d'un absent de la semaine :
//  · complet  : absent à toutes les heures de cours renseignées ;
//  · eleve    : au moins `seuil` heures d'absence mais pas complet ;
//  · faible   : moins de `seuil` heures d'absence.
export type CategorieAbsence = 'complet' | 'eleve' | 'faible';
export function categorieAbsence(a: EtudiantAbsent, seuil: number): CategorieAbsence {
  if (a.absences >= a.total) return 'complet';
  return a.absences >= seuil ? 'eleve' : 'faible';
}