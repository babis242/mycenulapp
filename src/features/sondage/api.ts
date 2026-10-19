// src/features/sondage/api.ts
//
// Sondage hebdomadaire des étudiants. L'administration PUBLIE le sondage
// d'une semaine (photo des cours/enseignants de l'emploi du temps) ; la page
// publique lit cette photo et envoie des réponses anonymes.
import { supabase } from '@/lib/supabase';
import { getSeancesGroupees } from '@/features/emploi-du-temps/api';
import type { Langue } from './codes';

export interface CoursSondage {
  ue: string;
  enseignant: string;
  horaires: string[]; // ex. "Lundi 08h-12h"
}

export interface SondageSemaine {
  id: string;
  semaine: string;
  specialite_id: string;
  specialite_nom: string;
  niveau: string; // "BTS 2", "HND 1"…
  langue: Langue;
  cours: CoursSondage[];
}

// Réponse d'un étudiant (stockée en JSON, avec des codes stables).
export interface ReponseCours {
  ue: string;
  enseignant: string;
  tenu: 'oui' | 'partiel' | 'non';
  compris?: 'non' | 'moyen' | 'oui';
  ponctualite?: 'ok' | 'retard' | 'gros';
  support?: 'oui' | 'partiel' | 'non';
  qualite?: 'bien' | 'mal';
  positifs: string[];
  negatifs: string[];
  commentaire?: string;
}

export interface ContenuReponse {
  cours: ReponseCours[];
  meilleur?: { enseignant: string; raisons: string[] };
  ameliorer?: { enseignant: string; raisons: string[]; commentaire?: string };
  revoir?: { cours: string[]; precision?: string };
  ecole: { conditions: string[]; infos?: 'non' | 'parfois' | 'oui'; suggestion?: string };
}

export interface LigneReponse {
  id: string;
  semaine: string;
  specialite_id: string;
  niveau: string;
  langue: string;
  note: number | null;
  reponses: ContenuReponse;
  cree_le: string;
}

const PAGE = 1000;

// ───────── Public (sans connexion) ─────────

export async function getSondagesOuverts(): Promise<{ semaine: string; sondages: SondageSemaine[] } | null> {
  const { data: derniere, error } = await supabase
    .from('sondages_semaine')
    .select('semaine')
    .order('semaine', { ascending: false })
    .limit(1);
  if (error) throw error;
  const semaine = (derniere ?? [])[0]?.semaine as string | undefined;
  if (!semaine) return null;

  const lignes: SondageSemaine[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error: e2 } = await supabase
      .from('sondages_semaine')
      .select('id, semaine, specialite_id, specialite_nom, niveau, langue, cours')
      .eq('semaine', semaine)
      .range(debut, debut + PAGE - 1);
    if (e2) throw e2;
    lignes.push(...((data ?? []) as SondageSemaine[]));
    if ((data ?? []).length < PAGE) break;
  }
  lignes.sort(
    (a, b) => a.niveau.localeCompare(b.niveau, 'fr') || a.specialite_nom.localeCompare(b.specialite_nom, 'fr')
  );
  return { semaine, sondages: lignes };
}

export async function envoyerReponse(s: SondageSemaine, langue: Langue, note: number | null, contenu: ContenuReponse) {
  // Pas de .select() : l'anonyme peut écrire mais jamais relire.
  const { error } = await supabase.from('sondages_reponses').insert({
    semaine: s.semaine,
    specialite_id: s.specialite_id,
    niveau: s.niveau,
    langue,
    note,
    reponses: contenu,
  });
  if (error) throw error;
}

// ───────── Administration ─────────

export async function publierSondage(
  semaine: string,
  perimetreSpecialiteIds: string[] | null
): Promise<{ nbSondages: number; nbCours: number }> {
  const { data: specs, error } = await supabase.from('specialites').select('id, nom, cycle');
  if (error) throw error;
  const info = new Map<string, { nom: string; cycle: string }>(
    ((specs ?? []) as any[]).map((s) => [s.id, { nom: s.nom, cycle: s.cycle }])
  );
  const dansPerimetre = (id: string) => !perimetreSpecialiteIds || perimetreSpecialiteIds.includes(id);
  const idsPortee = Array.from(info.keys()).filter(dansPerimetre);

  const niveauxDe = (cycle: string, semestres: Iterable<string | null | undefined>): string[] => {
    const ns = Array.from(
      new Set(
        Array.from(semestres)
          .map((x) => Number(String(x ?? '').replace(/[^0-9]/g, '')))
          .filter((n) => n > 0)
          .map((n) => Math.ceil(n / 2))
      )
    ).sort();
    return ns.length ? ns.map((n) => `${cycle.toUpperCase()} ${n}`) : [cycle.toUpperCase()];
  };

  type Cible = { specId: string; niveau: string; cours: Map<string, { ue: string; enseignant: string; horaires: Set<string> }> };
  const cibles = new Map<string, Cible>();
  const ajouter = (specId: string, niveau: string, ue: string, enseignant: string, horaire: string) => {
    const k = `${specId}|${niveau}`;
    if (!cibles.has(k)) cibles.set(k, { specId, niveau, cours: new Map() });
    const c = cibles.get(k)!.cours;
    const kc = `${ue}|${enseignant}`;
    if (!c.has(kc)) c.set(kc, { ue, enseignant, horaires: new Set() });
    c.get(kc)!.horaires.add(horaire);
  };

  const TAILLE_LOT = 40;
  const vues = new Set<string>();
  for (let i = 0; i < idsPortee.length; i += TAILLE_LOT) {
    const lot = idsPortee.slice(i, i + TAILLE_LOT);
    const donnees = await getSeancesGroupees(lot, semaine, { forcerRafraichissement: true });
    for (const s of donnees.seances) {
      if (vues.has(s.id)) continue;
      vues.add(s.id);
      const enseignant = (s.enseignantNom ?? '').trim();
      if (!enseignant || !s.ueNom) continue;
      const horaire = `${s.jour} ${s.creneau}`;
      if (s.troncCommunId) {
        for (const specId of donnees.specialitesParTronc.get(s.troncCommunId) ?? []) {
          if (!dansPerimetre(specId) || !info.has(specId)) continue;
          const sems = donnees.troncSpecialiteSemestres.get(`${s.troncCommunId}|${specId}`) ?? [];
          for (const n of niveauxDe(info.get(specId)!.cycle, sems)) ajouter(specId, n, s.ueNom, enseignant, horaire);
        }
      } else if (s.specialiteId && info.has(s.specialiteId)) {
        for (const n of niveauxDe(info.get(s.specialiteId)!.cycle, [s.semestre])) {
          ajouter(s.specialiteId, n, s.ueNom, enseignant, horaire);
        }
      }
    }
  }

  const lignes = Array.from(cibles.values()).map((c) => {
    const spe = info.get(c.specId)!;
    return {
      semaine,
      specialite_id: c.specId,
      specialite_nom: spe.nom,
      niveau: c.niveau,
      langue: /^HND/i.test(spe.cycle) ? 'en' : 'fr',
      cours: Array.from(c.cours.values())
        .map((x) => ({ ue: x.ue, enseignant: x.enseignant, horaires: Array.from(x.horaires) }))
        .sort((a, b) => a.ue.localeCompare(b.ue, 'fr')),
      publie_le: new Date().toISOString(),
    };
  });

  // Anciennes lignes de la semaine dans le périmètre (à retirer si obsolètes).
  const existants: { id: string; specialite_id: string; niveau: string }[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error: e1 } = await supabase
      .from('sondages_semaine')
      .select('id, specialite_id, niveau')
      .eq('semaine', semaine)
      .range(debut, debut + PAGE - 1);
    if (e1) throw e1;
    existants.push(...((data ?? []) as any[]));
    if ((data ?? []).length < PAGE) break;
  }

  for (let i = 0; i < lignes.length; i += 200) {
    const { error: e2 } = await supabase
      .from('sondages_semaine')
      .upsert(lignes.slice(i, i + 200), { onConflict: 'semaine,specialite_id,niveau' });
    if (e2) throw e2;
  }

  const gardes = new Set(lignes.map((l) => `${l.specialite_id}|${l.niveau}`));
  const obsoletes = existants
    .filter((e) => dansPerimetre(e.specialite_id) && !gardes.has(`${e.specialite_id}|${e.niveau}`))
    .map((e) => e.id);
  for (let i = 0; i < obsoletes.length; i += 100) {
    const { error: e3 } = await supabase.from('sondages_semaine').delete().in('id', obsoletes.slice(i, i + 100));
    if (e3) throw e3;
  }

  return { nbSondages: lignes.length, nbCours: lignes.reduce((n, l) => n + l.cours.length, 0) };
}

export async function fermerSondage(semaine: string, perimetreSpecialiteIds: string[] | null) {
  let q = supabase.from('sondages_semaine').delete().eq('semaine', semaine);
  if (perimetreSpecialiteIds) q = q.in('specialite_id', perimetreSpecialiteIds);
  const { error } = await q;
  if (error) throw error;
}

export async function listSemainesPubliees(): Promise<string[]> {
  const vues = new Set<string>();
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('sondages_semaine')
      .select('semaine')
      .order('semaine', { ascending: false })
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    (data ?? []).forEach((d: any) => vues.add(d.semaine));
    if ((data ?? []).length < PAGE) break;
  }
  return Array.from(vues).sort().reverse();
}

export async function getSondagesDeLaSemaine(semaine: string): Promise<SondageSemaine[]> {
  const out: SondageSemaine[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('sondages_semaine')
      .select('id, semaine, specialite_id, specialite_nom, niveau, langue, cours')
      .eq('semaine', semaine)
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as SondageSemaine[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

export async function listReponses(semaine: string): Promise<LigneReponse[]> {
  const out: LigneReponse[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await supabase
      .from('sondages_reponses')
      .select('id, semaine, specialite_id, niveau, langue, note, reponses, cree_le')
      .eq('semaine', semaine)
      .order('cree_le', { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as LigneReponse[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

// ───────── Retours aux enseignants (WhatsApp) ─────────

export const cleNom = (nom: string): string => nom.trim().replace(/\s+/g, ' ').toLowerCase();

/** Numéro WhatsApp (à défaut, cellulaire) de chaque enseignant, par nom normalisé. */
export async function getContactsEnseignants(noms: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniques = Array.from(new Set(noms.map((n) => n.trim()).filter(Boolean)));
  for (let i = 0; i < uniques.length; i += 80) {
    const { data, error } = await supabase
      .from('enseignants')
      .select('nom, numero_whatsapp, numero_cellulaire')
      .in('nom', uniques.slice(i, i + 80));
    if (error) throw error;
    for (const e of (data ?? []) as any[]) {
      out.set(cleNom(e.nom), e.numero_whatsapp || e.numero_cellulaire || null);
    }
  }
  return out;
}

/** Enseignants dont le retour a déjà été envoyé pour cette semaine. `suivi` = false si la table n'existe pas encore. */
export async function listRetoursEnvoyes(semaine: string): Promise<{ suivi: boolean; envoyes: Set<string> }> {
  const { data, error } = await supabase
    .from('sondages_retours')
    .select('enseignant_nom')
    .eq('semaine', semaine)
    .range(0, PAGE - 1);
  if (error) return { suivi: false, envoyes: new Set() };
  return { suivi: true, envoyes: new Set(((data ?? []) as any[]).map((d) => cleNom(d.enseignant_nom))) };
}

export async function marquerRetour(semaine: string, enseignantNom: string, envoye: boolean): Promise<boolean> {
  if (envoye) {
    const { error } = await supabase
      .from('sondages_retours')
      .upsert({ semaine, enseignant_nom: cleNom(enseignantNom), envoye_le: new Date().toISOString() }, { onConflict: 'semaine,enseignant_nom' });
    return !error;
  }
  const { error } = await supabase
    .from('sondages_retours')
    .delete()
    .eq('semaine', semaine)
    .eq('enseignant_nom', cleNom(enseignantNom));
  return !error;
}