// src/features/rapports-pdf/api.ts
//
// Données des rapports PDF du Service de la scolarité :
//  - rapport hebdomadaire / mensuel (KPI, courbes, enseignants absents et
//    en retard) ;
//  - fiche de répartition des salles d'une semaine.
//
// Toutes les lectures sont des requêtes À PLAT (jamais de jointure
// imbriquée PostgREST, qui peut renvoyer des embeds vides sans erreur) :
// on lit les colonnes brutes puis on recoupe en mémoire.
//
// Mêmes définitions que "Voir les états" (features/heures/api.ts) :
//  - retard   : ouverture au-delà de la marge de 15 min (estEnRetard) ;
//  - absence  : séance programmée, jamais ouverte, jamais annulée, dont
//               le créneau est déjà terminé ;
//  - heures validées : heures effectuées des séances fermées (règle de
//               la marge de 15 min, heuresEffectueesPourSeance).

import { supabase } from '@/lib/supabase';
import { recupererToutesLesLignes } from '@/features/emploi-du-temps/api';
import {
  heuresEffectueesPourSeance,
  estEnRetard,
  retardMinutes,
  seanceEstTerminee,
} from '@/lib/calculHeures';
import { bornesCreneau, tousLesCreneaux } from '@/lib/creneaux';
import { JOURS } from '@/constants/enums';

// ── Dates (calcul pur sur "YYYY-MM-DD", sans fuseau) ────────────────

const JOUR_DECALAGE: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
};

function versISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

export function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return versISO(new Date(Date.UTC(y, m - 1, d + n)));
}

// Lundi de la semaine contenant la date donnée.
export function lundiDe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return ajouterJours(iso, jour === 0 ? -6 : 1 - jour);
}

export function dateDeSeance(semaine: string, jour: string): string {
  return ajouterJours(semaine, JOUR_DECALAGE[jour] ?? 0);
}

// "YYYY-MM" → [premier jour du mois, premier jour du mois suivant[
export function bornesDuMois(anneeMois: string): { debut: string; finExclu: string } {
  const [y, m] = anneeMois.split('-').map(Number);
  return {
    debut: versISO(new Date(Date.UTC(y, m - 1, 1))),
    finExclu: versISO(new Date(Date.UTC(y, m, 1))),
  };
}

export function formaterDate(
  iso: string,
  options: Intl.DateTimeFormatOptions
): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    ...options,
    timeZone: 'UTC',
  });
}

function dureeNominale(creneau: string): number {
  const bornes = bornesCreneau(creneau);
  if (bornes) return (bornes.fin - bornes.debut) / 60;
  return creneau === '14h-17h' ? 3 : 4;
}

// ── Lecture à plat ──────────────────────────────────────────────────

async function lireParLots<T>(
  ids: string[],
  requete: (lot: string[]) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const lots: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) lots.push(ids.slice(i, i + 100));
  const resultats = await Promise.all(
    lots.map(async (lot) => {
      const { data, error } = await requete(lot);
      if (error) throw error;
      return data ?? [];
    })
  );
  return resultats.flat();
}

interface LigneSeanceBrute {
  id: string;
  semaine: string;
  jour: string;
  creneau: string;
  offre_id: string | null;
  tronc_commun_id: string | null;
  salle_id: string | null;
  enseignant_id: string | null;
  annulee: boolean | null;
  heure_ouverture: string | null;
  heure_fermeture: string | null;
  emploi_du_temps_id?: string | null;
}

// Séances dont la DATE RÉELLE (lundi de la semaine + jour) tombe dans
// [debut, finExclu[ — une semaine à cheval sur deux mois est donc
// correctement coupée entre les deux.
async function lireSeancesPeriode(
  debut: string,
  finExclu: string,
  seulementValides = false
): Promise<LigneSeanceBrute[]> {
  const brutes = await recupererToutesLesLignes<LigneSeanceBrute>((d, f) =>
    supabase
      .from('seances_edt')
      .select(
        'id, semaine, jour, creneau, offre_id, tronc_commun_id, salle_id, enseignant_id, annulee, heure_ouverture, heure_fermeture, emploi_du_temps_id'
      )
      .gte('semaine', ajouterJours(debut, -6))
      .lt('semaine', finExclu)
      .order('id')
      .range(d, f)
  );
  let lignes = brutes.filter((s) => {
    const date = dateDeSeance(s.semaine, s.jour);
    return date >= debut && date < finExclu;
  });
  if (!seulementValides) return lignes;

  // Seuls les emplois du temps VALIDÉS comptent : une séance de spécialité
  // doit appartenir à un emploi validé ; une séance de tronc commun compte
  // si au moins une des spécialités du tronc a validé son emploi cette semaine.
  const semaines = Array.from(new Set(lignes.map((s) => s.semaine)));
  if (semaines.length === 0) return [];
  const emplois = await recupererToutesLesLignes<any>((d, f) =>
    supabase
      .from('emplois_du_temps')
      .select('id, specialite_id, semaine')
      .in('semaine', semaines)
      .eq('statut', 'valide')
      .order('id')
      .range(d, f)
  );
  const emploiIdsValides = new Set(emplois.map((e) => e.id as string));
  const specValidees = new Set(emplois.map((e) => `${e.specialite_id}|${e.semaine}`));

  const troncIds = Array.from(
    new Set(lignes.map((s) => s.tronc_commun_id).filter((v): v is string => !!v))
  );
  const specsParTronc = new Map<string, Set<string>>();
  if (troncIds.length > 0) {
    const liens = await lireParLots<any>(troncIds, (lot) =>
      supabase.from('troncs_communs_ues').select('tronc_commun_id, ue_id').in('tronc_commun_id', lot)
    );
    const ueIds = Array.from(new Set(liens.map((l) => l.ue_id as string)));
    const offres = await lireParLots<any>(ueIds, (lot) =>
      supabase.from('offres').select('ue_id, specialite_id').in('ue_id', lot)
    );
    const specsParUe = new Map<string, Set<string>>();
    for (const o of offres) {
      if (!specsParUe.has(o.ue_id)) specsParUe.set(o.ue_id, new Set());
      specsParUe.get(o.ue_id)!.add(o.specialite_id);
    }
    for (const l of liens) {
      if (!specsParTronc.has(l.tronc_commun_id)) specsParTronc.set(l.tronc_commun_id, new Set());
      for (const sp of specsParUe.get(l.ue_id) ?? []) specsParTronc.get(l.tronc_commun_id)!.add(sp);
    }
  }
  lignes = lignes.filter((s) => {
    if (s.tronc_commun_id) {
      const specs = specsParTronc.get(s.tronc_commun_id);
      return !!specs && Array.from(specs).some((sp) => specValidees.has(`${sp}|${s.semaine}`));
    }
    return !!s.emploi_du_temps_id && emploiIdsValides.has(s.emploi_du_temps_id);
  });
  return lignes;
}

interface Referentiels {
  offreParId: Map<string, { ue_id: string; specialite_id: string }>;
  nomUeParId: Map<string, string>;
  nomTroncParId: Map<string, string>;
  nomEnseignantParId: Map<string, string>;
  // Seulement si demandé (fiche des salles) :
  specialitesParTronc: Map<string, Set<string>>;
  specialiteParId: Map<string, { nom: string; filiereId: string }>;
  nomFiliereParId: Map<string, string>;
  salleParId: Map<string, { code: string; capacite: number | null }>;
}

async function lireReferentiels(
  lignes: LigneSeanceBrute[],
  avecSalles: boolean
): Promise<Referentiels> {
  const offreIds = Array.from(
    new Set(lignes.map((s) => s.offre_id).filter((v): v is string => !!v))
  );
  const troncIds = Array.from(
    new Set(lignes.map((s) => s.tronc_commun_id).filter((v): v is string => !!v))
  );
  const enseignantIds = Array.from(
    new Set(lignes.map((s) => s.enseignant_id).filter((v): v is string => !!v))
  );

  const [offres, troncs, enseignants, liensTronc] = await Promise.all([
    lireParLots<any>(offreIds, (lot) =>
      supabase.from('offres').select('id, ue_id, specialite_id').in('id', lot)
    ),
    lireParLots<any>(troncIds, (lot) =>
      supabase.from('troncs_communs').select('id, nom').in('id', lot)
    ),
    lireParLots<any>(enseignantIds, (lot) =>
      supabase.from('enseignants').select('id, nom').in('id', lot)
    ),
    avecSalles
      ? lireParLots<any>(troncIds, (lot) =>
          supabase
            .from('troncs_communs_ues')
            .select('tronc_commun_id, ue_id')
            .in('tronc_commun_id', lot)
        )
      : Promise.resolve([] as any[]),
  ]);

  const ueIdsOffres = Array.from(new Set(offres.map((o) => o.ue_id as string)));
  const ueIdsTroncs = Array.from(new Set(liensTronc.map((l) => l.ue_id as string)));

  const [ues, offresDesTroncs, salles] = await Promise.all([
    lireParLots<any>(ueIdsOffres, (lot) =>
      supabase.from('ues').select('id, nom').in('id', lot)
    ),
    lireParLots<any>(ueIdsTroncs, (lot) =>
      supabase.from('offres').select('ue_id, specialite_id').in('ue_id', lot)
    ),
    avecSalles
      ? supabase
          .from('salles')
          .select('id, code_salle, capacite')
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as any[];
          })
      : Promise.resolve([] as any[]),
  ]);

  // Spécialités → filières (uniquement pour la fiche des salles).
  const troncParUe = new Map(
    liensTronc.map((l) => [l.ue_id as string, l.tronc_commun_id as string])
  );
  const specialitesParTronc = new Map<string, Set<string>>();
  for (const o of offresDesTroncs) {
    const troncId = troncParUe.get(o.ue_id);
    if (!troncId) continue;
    if (!specialitesParTronc.has(troncId)) specialitesParTronc.set(troncId, new Set());
    specialitesParTronc.get(troncId)!.add(o.specialite_id);
  }

  const specialiteIds = avecSalles
    ? Array.from(
        new Set([
          ...offres.map((o) => o.specialite_id as string),
          ...offresDesTroncs.map((o) => o.specialite_id as string),
        ])
      )
    : [];
  const specialites = await lireParLots<any>(specialiteIds, (lot) =>
    supabase.from('specialites').select('id, nom, filiere_id').in('id', lot)
  );
  const filiereIds = Array.from(
    new Set(specialites.map((s) => s.filiere_id as string).filter(Boolean))
  );
  const filieres = await lireParLots<any>(filiereIds, (lot) =>
    supabase.from('filieres').select('id, nom').in('id', lot)
  );

  return {
    offreParId: new Map(offres.map((o) => [o.id as string, o])),
    nomUeParId: new Map(ues.map((u) => [u.id as string, u.nom as string])),
    nomTroncParId: new Map(troncs.map((t) => [t.id as string, t.nom as string])),
    nomEnseignantParId: new Map(enseignants.map((e) => [e.id as string, e.nom as string])),
    specialitesParTronc,
    specialiteParId: new Map(
      specialites.map((s) => [
        s.id as string,
        { nom: s.nom as string, filiereId: s.filiere_id as string },
      ])
    ),
    nomFiliereParId: new Map(filieres.map((f) => [f.id as string, f.nom as string])),
    salleParId: new Map(
      salles.map((s) => [
        s.id as string,
        { code: s.code_salle as string, capacite: s.capacite ?? null },
      ])
    ),
  };
}

// ── Rapport hebdomadaire / mensuel ──────────────────────────────────

export type TypeRapport = 'semaine' | 'mois';

export interface PointSerie {
  cle: string;
  label: string;
  programmees: number;
  validees: number;
  retards: number;
  absences: number;
}

export interface LigneEnseignant {
  enseignantId: string;
  nom: string;
  nb: number;
  cumulMinutes: number;
  details: string[];
}

export interface RapportPeriode {
  type: TypeRapport;
  titre: string; // "Rapport hebdomadaire"
  libellePeriode: string; // "Semaine du 5 au 10 octobre 2026"
  debut: string;
  finExclu: string;
  nbCours: number;
  nbAnnulees: number;
  heuresProgrammees: number;
  heuresValidees: number;
  heuresPerduesRetard: number;
  heuresAbsence: number;
  heuresAVenir: number;
  nbRetards: number;
  nbAbsences: number;
  // Heures validées / heures des séances déjà échues (null s'il n'y en a pas)
  tauxValidation: number | null;
  serie: PointSerie[];
  absents: LigneEnseignant[];
  retardataires: LigneEnseignant[];
  genereLe: string; // ISO
}

const JOURS_COURTS: Record<string, string> = {
  Lundi: 'Lun',
  Mardi: 'Mar',
  Mercredi: 'Mer',
  Jeudi: 'Jeu',
  Vendredi: 'Ven',
  Samedi: 'Sam',
};

export async function genererRapportPeriode(
  type: TypeRapport,
  reference: string // date (semaine) ou "YYYY-MM" (mois)
): Promise<RapportPeriode> {
  let debut: string;
  let finExclu: string;
  let titre: string;
  let libellePeriode: string;

  if (type === 'semaine') {
    debut = lundiDe(reference);
    finExclu = ajouterJours(debut, 7);
    titre = 'Rapport hebdomadaire';
    const samedi = ajouterJours(debut, 5);
    libellePeriode = `Semaine du ${formaterDate(debut, { day: 'numeric', month: 'long' })} au ${formaterDate(
      samedi,
      { day: 'numeric', month: 'long', year: 'numeric' }
    )}`;
  } else {
    const bornes = bornesDuMois(reference);
    debut = bornes.debut;
    finExclu = bornes.finExclu;
    titre = 'Rapport mensuel';
    const brut = formaterDate(debut, { month: 'long', year: 'numeric' });
    libellePeriode = `Mois de ${brut}`;
  }

  const lignes = await lireSeancesPeriode(debut, finExclu, true);
  const ref = await lireReferentiels(lignes, false);
  const maintenant = new Date();

  // Points de la série : un par jour (semaine) ou par semaine (mois).
  const serie: PointSerie[] = [];
  const indexSerie = new Map<string, PointSerie>();
  if (type === 'semaine') {
    for (const jour of JOURS) {
      const p: PointSerie = {
        cle: jour,
        label: `${JOURS_COURTS[jour] ?? jour} ${formaterDate(dateDeSeance(debut, jour), {
          day: '2-digit',
          month: '2-digit',
        })}`,
        programmees: 0,
        validees: 0,
        retards: 0,
        absences: 0,
      };
      serie.push(p);
      indexSerie.set(jour, p);
    }
  } else {
    // Semaines (lundis) qui touchent le mois.
    for (let lundi = lundiDe(debut); lundi < finExclu; lundi = ajouterJours(lundi, 7)) {
      const p: PointSerie = {
        cle: lundi,
        label: `Sem. ${formaterDate(lundi, { day: '2-digit', month: '2-digit' })}`,
        programmees: 0,
        validees: 0,
        retards: 0,
        absences: 0,
      };
      serie.push(p);
      indexSerie.set(lundi, p);
    }
  }

  let nbCours = 0;
  let nbAnnulees = 0;
  let heuresProgrammees = 0;
  let heuresValidees = 0;
  let heuresPerduesRetard = 0;
  let heuresAbsence = 0;
  let heuresEchues = 0;
  let nbRetards = 0;
  let nbAbsences = 0;

  const absentsParEns = new Map<string, LigneEnseignant>();
  const retardsParEns = new Map<string, LigneEnseignant>();

  for (const s of lignes) {
    if (s.annulee) {
      nbAnnulees++;
      continue;
    }
    const nominal = dureeNominale(s.creneau);
    const date = dateDeSeance(s.semaine, s.jour);
    const point = indexSerie.get(type === 'semaine' ? s.jour : lundiDe(date));

    nbCours++;
    heuresProgrammees += nominal;
    if (point) point.programmees += nominal;

    const nomEnseignant = s.enseignant_id ? ref.nomEnseignantParId.get(s.enseignant_id) : null;
    const nomUe = s.tronc_commun_id
      ? ref.nomTroncParId.get(s.tronc_commun_id) ?? 'Tronc commun'
      : s.offre_id
      ? ref.nomUeParId.get(ref.offreParId.get(s.offre_id)?.ue_id ?? '') ?? 'UE'
      : 'UE';
    const quand = `${JOURS_COURTS[s.jour] ?? s.jour} ${formaterDate(date, {
      day: '2-digit',
      month: '2-digit',
    })} ${s.creneau}`;

    const ouverte = !!s.heure_ouverture;
    const echue = ouverte || seanceEstTerminee(s.semaine, s.jour, s.creneau, maintenant);
    if (echue) heuresEchues += nominal;

    if (ouverte) {
      // Retard : connu dès l'ouverture.
      if (estEnRetard(s.semaine, s.jour, s.creneau, s.heure_ouverture)) {
        nbRetards++;
        if (point) point.retards++;
        if (s.enseignant_id && nomEnseignant) {
          const minutes = retardMinutes(s.semaine, s.jour, s.creneau, s.heure_ouverture);
          const l = retardsParEns.get(s.enseignant_id) ?? {
            enseignantId: s.enseignant_id,
            nom: nomEnseignant,
            nb: 0,
            cumulMinutes: 0,
            details: [],
          };
          l.nb++;
          l.cumulMinutes += minutes;
          l.details.push(`${nomUe} — ${quand} (+${minutes} min)`);
          retardsParEns.set(s.enseignant_id, l);
        }
      }
      // Heures validées : séances fermées uniquement (comme "Voir les états").
      if (s.heure_fermeture) {
        const h = heuresEffectueesPourSeance(
          s.semaine,
          s.jour,
          s.creneau,
          s.heure_ouverture,
          s.heure_fermeture
        );
        heuresValidees += h;
        heuresPerduesRetard += Math.max(0, nominal - h);
        if (point) point.validees += h;
      }
    } else if (echue) {
      // Absence : créneau terminé, jamais ouvert, non annulé.
      nbAbsences++;
      heuresAbsence += nominal;
      if (point) point.absences++;
      if (s.enseignant_id && nomEnseignant) {
        const l = absentsParEns.get(s.enseignant_id) ?? {
          enseignantId: s.enseignant_id,
          nom: nomEnseignant,
          nb: 0,
          cumulMinutes: 0,
          details: [],
        };
        l.nb++;
        l.details.push(`${nomUe} — ${quand}`);
        absentsParEns.set(s.enseignant_id, l);
      }
    }
  }

  const trier = (m: Map<string, LigneEnseignant>) =>
    Array.from(m.values()).sort((a, b) => b.nb - a.nb || a.nom.localeCompare(b.nom));

  const heuresAVenir = Math.max(
    0,
    heuresProgrammees - heuresValidees - heuresPerduesRetard - heuresAbsence
  );

  return {
    type,
    titre,
    libellePeriode,
    debut,
    finExclu,
    nbCours,
    nbAnnulees,
    heuresProgrammees,
    heuresValidees,
    heuresPerduesRetard,
    heuresAbsence,
    heuresAVenir,
    nbRetards,
    nbAbsences,
    tauxValidation: heuresEchues > 0 ? heuresValidees / heuresEchues : null,
    serie,
    absents: trier(absentsParEns),
    retardataires: trier(retardsParEns),
    genereLe: maintenant.toISOString(),
  };
}

// ── Fiche de répartition des salles ─────────────────────────────────

export interface LigneFicheSalle {
  creneau: string;
  salleCode: string; // "Non attribuée" si aucune
  capacite: number | null;
  filieres: string[]; // déjà formatées, prêtes à afficher
  cours: string[];
}

export interface JourFicheSalle {
  jour: string;
  date: string;
  lignes: LigneFicheSalle[];
}

export interface FicheSalles {
  semaine: string;
  libelleSemaine: string;
  jours: JourFicheSalle[];
  nbSeances: number;
  nbSallesUtilisees: number;
  nbSansSalle: number;
  genereLe: string;
}

export async function genererFicheSalles(reference: string): Promise<FicheSalles> {
  const lundi = lundiDe(reference);
  const lignes = (await lireSeancesPeriode(lundi, ajouterJours(lundi, 7))).filter(
    (s) => !s.annulee
  );
  const ref = await lireReferentiels(lignes, true);

  const ordreCreneau = new Map(tousLesCreneaux().map((c, i) => [c, i]));

  // Spécialités concernées par une séance, regroupées par filière.
  function filieresDe(s: LigneSeanceBrute): string[] {
    const specIds = s.tronc_commun_id
      ? Array.from(ref.specialitesParTronc.get(s.tronc_commun_id) ?? [])
      : s.offre_id && ref.offreParId.get(s.offre_id)
      ? [ref.offreParId.get(s.offre_id)!.specialite_id]
      : [];
    const parFiliere = new Map<string, Set<string>>();
    for (const specId of specIds) {
      const spe = ref.specialiteParId.get(specId);
      if (!spe) continue;
      const nomFiliere = ref.nomFiliereParId.get(spe.filiereId) ?? 'Filière';
      if (!parFiliere.has(nomFiliere)) parFiliere.set(nomFiliere, new Set());
      parFiliere.get(nomFiliere)!.add(spe.nom);
    }
    const nbFilieres = parFiliere.size;
    return Array.from(parFiliere.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([filiere, spes]) =>
        nbFilieres <= 3 ? `${filiere} (${Array.from(spes).sort().join(', ')})` : filiere
      );
  }

  function nomCours(s: LigneSeanceBrute): string {
    if (s.tronc_commun_id) return ref.nomTroncParId.get(s.tronc_commun_id) ?? 'Tronc commun';
    if (s.offre_id) {
      return ref.nomUeParId.get(ref.offreParId.get(s.offre_id)?.ue_id ?? '') ?? 'UE';
    }
    return 'UE';
  }

  // (jour, créneau, salle) → une ligne (plusieurs séances sur la même
  // salle au même créneau = un conflit, visible dans la fiche).
  const parCle = new Map<string, LigneFicheSalle & { jour: string }>();
  let nbSansSalle = 0;
  const sallesUtilisees = new Set<string>();

  for (const s of lignes) {
    const salle = s.salle_id ? ref.salleParId.get(s.salle_id) : undefined;
    if (!salle) nbSansSalle++;
    else sallesUtilisees.add(s.salle_id as string);
    const salleCode = salle?.code ?? 'Non attribuée';
    const cle = `${s.jour}|${s.creneau}|${salleCode}`;
    let ligne = parCle.get(cle);
    if (!ligne) {
      ligne = {
        jour: s.jour,
        creneau: s.creneau,
        salleCode,
        capacite: salle?.capacite ?? null,
        filieres: [],
        cours: [],
      };
      parCle.set(cle, ligne);
    }
    for (const f of filieresDe(s)) if (!ligne.filieres.includes(f)) ligne.filieres.push(f);
    const cours = nomCours(s);
    if (!ligne.cours.includes(cours)) ligne.cours.push(cours);
  }

  const jours: JourFicheSalle[] = JOURS.map((jour) => ({
    jour,
    date: dateDeSeance(lundi, jour),
    lignes: Array.from(parCle.values())
      .filter((l) => l.jour === jour)
      .sort(
        (a, b) =>
          (ordreCreneau.get(a.creneau) ?? 99) - (ordreCreneau.get(b.creneau) ?? 99) ||
          a.salleCode.localeCompare(b.salleCode, 'fr', { numeric: true })
      )
      .map(({ jour: _jour, ...reste }) => reste),
  })).filter((j) => j.lignes.length > 0);

  return {
    semaine: lundi,
    libelleSemaine: `Semaine du ${formaterDate(lundi, { day: 'numeric', month: 'long' })} au ${formaterDate(
      ajouterJours(lundi, 5),
      { day: 'numeric', month: 'long', year: 'numeric' }
    )}`,
    jours,
    nbSeances: lignes.length,
    nbSallesUtilisees: sallesUtilisees.size,
    nbSansSalle,
    genereLe: new Date().toISOString(),
  };
}