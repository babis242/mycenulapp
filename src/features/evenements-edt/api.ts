// src/features/evenements-edt/api.ts
//
// Événements de l'emploi du temps : un jour + un ou deux créneaux bloqués pour
// des classes (spécialité + niveau). À la création, les séances déjà
// programmées sur ces créneaux pour ces classes sont supprimées.
import { supabase } from '@/lib/supabase';
import { niveauDeSemestre } from '@/lib/niveau';

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;

export interface CibleEvenement {
  specialiteId: string;
  niveau: number;
}

export interface EvenementEDT {
  id: string;
  titre: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  semaine: string; // lundi
  jour: string;
  creneaux: string[];
  cibles: CibleEvenement[];
}

// Un créneau bloqué (utilisé par la grille, le générateur et le PDF).
export interface BlocEvenement {
  evenementId: string;
  titre: string;
  jour: string;
  creneau: string;
  cibles: CibleEvenement[];
}

// ── Dates ──────────────────────────────────────────────────────────

function dateUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Lundi de la semaine contenant la date + nom du jour. null pour un dimanche.
export function semaineEtJour(iso: string): { semaine: string; jour: string } | null {
  const d = dateUTC(iso);
  const n = d.getUTCDay(); // 0 = dimanche
  if (n === 0) return null;
  const lundi = new Date(d);
  lundi.setUTCDate(d.getUTCDate() - (n - 1));
  return { semaine: isoDate(lundi), jour: JOURS_SEMAINE[n - 1] };
}

export function concerneClasse(bloc: { cibles: CibleEvenement[] }, specialiteId: string, niveau: number | null): boolean {
  return bloc.cibles.some((c) => c.specialiteId === specialiteId && (niveau == null || c.niveau === niveau));
}

// ── Lecture ────────────────────────────────────────────────────────

function mapEvenement(e: any): EvenementEDT {
  return {
    id: e.id,
    titre: e.titre,
    description: e.description ?? null,
    date: e.date_evenement,
    semaine: e.semaine,
    jour: e.jour,
    creneaux: e.creneaux ?? [],
    cibles: ((e.cibles ?? []) as any[]).map((c) => ({ specialiteId: c.specialite_id, niveau: c.niveau })),
  };
}

export async function listEvenements(depuisDate?: string): Promise<EvenementEDT[]> {
  let q = supabase
    .from('evenements_edt')
    .select('id, titre, description, date_evenement, semaine, jour, creneaux, cibles:evenements_edt_cibles(specialite_id, niveau)')
    .order('date_evenement', { ascending: false });
  if (depuisDate) q = q.gte('date_evenement', depuisDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapEvenement);
}

function versBlocs(evenements: EvenementEDT[]): BlocEvenement[] {
  return evenements.flatMap((e) =>
    e.creneaux.map((creneau) => ({ evenementId: e.id, titre: e.titre, jour: e.jour, creneau, cibles: e.cibles }))
  );
}

const cleCache = (semaine: string) => `evenements-edt:${semaine}`;

// Blocs de la semaine ; en cas d'échec réseau, dernière copie locale.
export async function getBlocsSemaine(semaine: string): Promise<BlocEvenement[]> {
  try {
    const { data, error } = await supabase
      .from('evenements_edt')
      .select('id, titre, description, date_evenement, semaine, jour, creneaux, cibles:evenements_edt_cibles(specialite_id, niveau)')
      .eq('semaine', semaine);
    if (error) throw error;
    const blocs = versBlocs((data ?? []).map(mapEvenement));
    try {
      localStorage.setItem(cleCache(semaine), JSON.stringify(blocs));
    } catch {
      /* cache facultatif */
    }
    return blocs;
  } catch (e) {
    try {
      const brut = localStorage.getItem(cleCache(semaine));
      if (brut) return JSON.parse(brut) as BlocEvenement[];
    } catch {
      /* ignore */
    }
    // Table pas encore créée (SQL non exécuté) : aucun événement.
    return [];
  }
}

// ── Aperçu / création ──────────────────────────────────────────────

export interface SeanceImpactee {
  id: string;
  ueNom: string;
  jour: string;
  creneau: string;
  enseignantId: string | null;
  enseignantNom: string;
  classes: string[]; // "Spécialité N1"
  classesNonCiblees: string[];
  protegee: boolean; // déjà ouverte / rapport : jamais supprimée
  raisonProtection: string | null;
  tronc: boolean;
}

export interface ApercuEvenement {
  aSupprimer: SeanceImpactee[];
  protegees: SeanceImpactee[];
  classesNonCibleesTouchees: string[];
}

export interface SaisieEvenement {
  titre: string;
  description?: string;
  date: string;
  creneaux: string[];
  cibles: CibleEvenement[];
}

async function lire<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? ([] as unknown)) as T;
}

export async function apercuEvenement(saisie: SaisieEvenement): Promise<ApercuEvenement> {
  const sj = semaineEtJour(saisie.date);
  if (!sj) throw new Error('Le dimanche n’est pas un jour de cours.');

  const seances = await lire<any[]>(
    supabase
      .from('seances_edt')
      .select(
        `id, jour, creneau, heure_ouverture, enseignant_id, offre_id, tronc_commun_id,
         offre:offres(semestre, specialite_id, ue:ues(nom), specialite:specialites(nom)),
         tronc_commun:troncs_communs(nom),
         enseignant:enseignants(nom)`
      )
      .eq('semaine', sj.semaine)
      .eq('jour', sj.jour)
      .in('creneau', saisie.creneaux)
  );
  if (seances.length === 0) return { aSupprimer: [], protegees: [], classesNonCibleesTouchees: [] };

  // Classes des troncs communs : (spécialité, semestre) de chaque UE du tronc.
  const troncIds = Array.from(new Set(seances.map((s) => s.tronc_commun_id).filter(Boolean)));
  const classesTronc = new Map<string, { specialiteId: string; nom: string; niveau: number }[]>();
  if (troncIds.length > 0) {
    const liens = await lire<any[]>(
      supabase
        .from('troncs_communs_ues')
        .select('tronc_commun_id, ue_id')
        .in('tronc_commun_id', troncIds)
    );
    const ueIds = Array.from(new Set(liens.map((l) => l.ue_id)));
    const offres = ueIds.length
      ? await lire<any[]>(
          supabase
            .from('offres')
            .select('ue_id, semestre, specialite_id, specialite:specialites(nom)')
            .in('ue_id', ueIds)
        )
      : [];
    const offresParUe = new Map<string, any[]>();
    for (const o of offres) offresParUe.set(o.ue_id, [...(offresParUe.get(o.ue_id) ?? []), o]);
    for (const l of liens) {
      for (const o of offresParUe.get(l.ue_id) ?? []) {
        const niveau = niveauDeSemestre(o.semestre);
        if (niveau == null) continue;
        const liste = classesTronc.get(l.tronc_commun_id) ?? [];
        if (!liste.some((c) => c.specialiteId === o.specialite_id && c.niveau === niveau))
          liste.push({ specialiteId: o.specialite_id, nom: o.specialite?.nom ?? '', niveau });
        classesTronc.set(l.tronc_commun_id, liste);
      }
    }
  }

  // Séances déjà tenues : un rapport existe.
  const rapports = await lire<any[]>(
    supabase.from('rapports_seances').select('seance_edt_id').in('seance_edt_id', seances.map((s) => s.id))
  ).catch(() => [] as any[]);
  const avecRapport = new Set(rapports.map((r) => r.seance_edt_id));

  const cible = (specialiteId: string, niveau: number) =>
    saisie.cibles.some((c) => c.specialiteId === specialiteId && c.niveau === niveau);

  const aSupprimer: SeanceImpactee[] = [];
  const protegees: SeanceImpactee[] = [];
  const nonCiblees = new Set<string>();

  for (const s of seances) {
    let classes: { specialiteId: string; nom: string; niveau: number }[] = [];
    if (s.tronc_commun_id) classes = classesTronc.get(s.tronc_commun_id) ?? [];
    else if (s.offre) {
      const niveau = niveauDeSemestre(s.offre.semestre);
      if (niveau != null) classes = [{ specialiteId: s.offre.specialite_id, nom: s.offre.specialite?.nom ?? '', niveau }];
    }
    if (!classes.some((c) => cible(c.specialiteId, c.niveau))) continue;

    const hors = classes.filter((c) => !cible(c.specialiteId, c.niveau)).map((c) => `${c.nom} N${c.niveau}`);
    const protegee = !!s.heure_ouverture || avecRapport.has(s.id);
    const impact: SeanceImpactee = {
      id: s.id,
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? 'Cours',
      jour: s.jour,
      creneau: s.creneau,
      enseignantId: s.enseignant_id ?? null,
      enseignantNom: s.enseignant?.nom ?? '',
      classes: classes.map((c) => `${c.nom} N${c.niveau}`),
      classesNonCiblees: hors,
      protegee,
      raisonProtection: protegee ? 'séance déjà ouverte ou avec rapport' : null,
      tronc: !!s.tronc_commun_id,
    };
    if (protegee) protegees.push(impact);
    else {
      aSupprimer.push(impact);
      hors.forEach((h) => nonCiblees.add(h));
    }
  }
  return { aSupprimer, protegees, classesNonCibleesTouchees: Array.from(nonCiblees) };
}

export async function creerEvenement(saisie: SaisieEvenement, apercu: ApercuEvenement): Promise<EvenementEDT> {
  const sj = semaineEtJour(saisie.date);
  if (!sj) throw new Error('Le dimanche n’est pas un jour de cours.');
  if (!saisie.titre.trim()) throw new Error('Donne un titre à l’événement.');
  if (saisie.creneaux.length === 0) throw new Error('Choisis au moins un créneau.');
  if (saisie.cibles.length === 0) throw new Error('Choisis au moins une classe concernée.');

  const { data: u } = await supabase.auth.getUser();
  const { data: ev, error } = await supabase
    .from('evenements_edt')
    .insert({
      titre: saisie.titre.trim(),
      description: saisie.description?.trim() || null,
      date_evenement: saisie.date,
      semaine: sj.semaine,
      jour: sj.jour,
      creneaux: saisie.creneaux,
      cree_par: u?.user?.id ?? null,
    })
    .select('id, titre, description, date_evenement, semaine, jour, creneaux')
    .single();
  if (error) throw error;

  const { error: errCibles } = await supabase.from('evenements_edt_cibles').insert(
    saisie.cibles.map((c) => ({ evenement_id: ev.id, specialite_id: c.specialiteId, niveau: c.niveau }))
  );
  if (errCibles) {
    await supabase.from('evenements_edt').delete().eq('id', ev.id);
    throw errCibles;
  }

  // Suppression des séances (hors séances déjà tenues).
  const ids = apercu.aSupprimer.map((s) => s.id);
  if (ids.length > 0) {
    await supabase.from('codes_seances').delete().in('seance_edt_id', ids);
    const { count, error: errSuppr } = await supabase
      .from('seances_edt')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (errSuppr) throw errSuppr;
    if ((count ?? 0) < ids.length) {
      throw new Error('La base a refusé de supprimer certaines séances (droits insuffisants). L’événement est créé ; supprime-les à la main dans la grille.');
    }
    await notifierEnseignants(apercu.aSupprimer, saisie, sj.jour);
  }

  try {
    localStorage.removeItem(cleCache(sj.semaine));
  } catch {
    /* ignore */
  }
  return mapEvenement({ ...ev, cibles: saisie.cibles.map((c) => ({ specialite_id: c.specialiteId, niveau: c.niveau })) });
}

// Modification d'un événement : titre, description, date, créneaux et classes.
// Les séances qui se trouvent désormais sur un créneau/une classe concernés
// sont supprimées (comme à la création) ; retirer une classe ou un créneau
// libère simplement la case — les séances déjà supprimées ne reviennent pas.
export async function modifierEvenement(
  id: string,
  saisie: SaisieEvenement,
  apercu: ApercuEvenement
): Promise<void> {
  const sj = semaineEtJour(saisie.date);
  if (!sj) throw new Error('Le dimanche n’est pas un jour de cours.');
  if (!saisie.titre.trim()) throw new Error('Donne un titre à l’événement.');
  if (saisie.creneaux.length === 0) throw new Error('Choisis au moins un créneau.');
  if (saisie.cibles.length === 0) throw new Error('Choisis au moins une classe concernée.');

  const { error } = await supabase
    .from('evenements_edt')
    .update({
      titre: saisie.titre.trim(),
      description: saisie.description?.trim() || null,
      date_evenement: saisie.date,
      semaine: sj.semaine,
      jour: sj.jour,
      creneaux: saisie.creneaux,
    })
    .eq('id', id);
  if (error) throw error;

  const { error: errDel } = await supabase.from('evenements_edt_cibles').delete().eq('evenement_id', id);
  if (errDel) throw errDel;
  const { error: errIns } = await supabase.from('evenements_edt_cibles').insert(
    saisie.cibles.map((c) => ({ evenement_id: id, specialite_id: c.specialiteId, niveau: c.niveau }))
  );
  if (errIns) throw errIns;

  const ids = apercu.aSupprimer.map((x) => x.id);
  if (ids.length > 0) {
    await supabase.from('codes_seances').delete().in('seance_edt_id', ids);
    const { count, error: errSuppr } = await supabase.from('seances_edt').delete({ count: 'exact' }).in('id', ids);
    if (errSuppr) throw errSuppr;
    if ((count ?? 0) < ids.length) {
      throw new Error('La base a refusé de supprimer certaines séances (droits insuffisants). L’événement est modifié ; supprime-les à la main dans la grille.');
    }
    await notifierEnseignants(apercu.aSupprimer, saisie, sj.jour);
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('evenements-edt:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

async function notifierEnseignants(seances: SeanceImpactee[], saisie: SaisieEvenement, jour: string) {
  try {
    const parEns = new Map<string, SeanceImpactee[]>();
    for (const s of seances) if (s.enseignantId) parEns.set(s.enseignantId, [...(parEns.get(s.enseignantId) ?? []), s]);
    if (parEns.size === 0) return;
    const { data: ens } = await supabase.from('enseignants').select('id, matricule').in('id', Array.from(parEns.keys()));
    const matricules = (ens ?? []).map((e: any) => e.matricule);
    const idParMat = new Map((ens ?? []).map((e: any) => [e.matricule, e.id]));
    const { data: comptes } = await supabase.from('comptes_utilisateurs').select('id, matricule').in('matricule', matricules);
    if (!comptes?.length) return;
    await supabase.from('notifications').insert(
      comptes.map((c: any) => {
        const cours = parEns.get(idParMat.get(c.matricule) ?? '') ?? [];
        return {
          compte_id: c.id,
          titre: 'Séance annulée : événement',
          message: `${saisie.titre} — ${jour} ${new Date(saisie.date + 'T00:00:00Z').toLocaleDateString('fr-FR', { timeZone: 'UTC' })} : ${cours.map((s) => `${s.ueNom} (${s.creneau})`).join(', ')} n’aura pas lieu.`,
          lien: '/mes-cours',
        };
      })
    );
  } catch {
    /* notifications facultatives */
  }
}

export async function supprimerEvenement(id: string): Promise<void> {
  const { error } = await supabase.from('evenements_edt').delete().eq('id', id);
  if (error) throw error;
  // Les copies locales de semaine sont rafraîchies à la prochaine lecture en ligne.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('evenements-edt:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// Créneaux bloqués par un événement pour les classes d'un groupe
// (spécialités + semestre → niveau) : "specialiteId|jour|creneau". Sert au
// générateur automatique et à la reconduction, qui ne doivent jamais placer
// de séance sur un événement.
export async function creneauxBloquesParEvenement(
  semaine: string,
  specialiteIds: string[],
  semestre: string
): Promise<Set<string>> {
  const niveau = niveauDeSemestre(semestre);
  const blocs = await getBlocsSemaine(semaine);
  const res = new Set<string>();
  for (const b of blocs) {
    for (const c of b.cibles) {
      if (specialiteIds.includes(c.specialiteId) && (niveau == null || c.niveau === niveau)) {
        res.add(`${c.specialiteId}|${b.jour}|${b.creneau}`);
      }
    }
  }
  return res;
}