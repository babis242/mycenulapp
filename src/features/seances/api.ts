// src/features/seances/api.ts
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { processSyncQueue } from '@/lib/sync';
import { toutesLesBornesCreneaux, synchroniserCreneaux } from '@/lib/creneaux';
import type { TypeCursus, Creneau } from '@/types';

// Le Cameroun est en UTC+1 (WAT) toute l'année, pas de changement
// d'heure — donc un simple décalage fixe suffit, pas besoin d'une
// bibliothèque de fuseaux horaires. TOUJOURS utiliser cette heure pour
// "maintenant", jamais l'heure/date de l'appareil (souvent mal réglée,
// ou dans un autre fuseau si l'enseignant est en déplacement).
function maintenantCameroun(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

// Version fiable : demande l'heure au SERVEUR (RPC "heure_serveur",
// déjà utilisée par lib/horlogeAppareil.ts pour l'avertissement de
// dérive) plutôt que de faire confiance à l'horloge de l'appareil.
//
// AVANT : malgré le commentaire ci-dessus ("jamais l'heure de
// l'appareil"), creneauActuel() et jourDAujourdhui() utilisaient bel et
// bien maintenantCameroun() = Date.now() de l'appareil — sur un
// environnement dont l'horloge système est fausse (sandbox de test,
// téléphone mal réglé...), "Ma séance" pouvait afficher "Aucun cours en
// ce moment" alors qu'une séance était bien programmée sur le créneau en
// cours, réellement.
// MAINTENANT : "Ma séance" (getSeanceDuMoment) utilise l'heure RÉELLE du
// serveur pour décider quel créneau est en cours — fiable même si
// l'horloge de l'appareil dérive. Repli sur l'heure de l'appareil
// uniquement si le serveur ne répond pas (hors ligne).
async function maintenantCamerounServeur(): Promise<Date> {
  try {
    const { data, error } = await supabase.rpc('heure_serveur');
    if (error || !data) return maintenantCameroun();
    const heureServeur = new Date(data as string);
    if (Number.isNaN(heureServeur.getTime())) return maintenantCameroun();
    // heure_serveur renvoie l'heure UTC réelle — même décalage +1h que
    // maintenantCameroun() pour obtenir l'heure Cameroun.
    return new Date(heureServeur.getTime() + 60 * 60 * 1000);
  } catch {
    return maintenantCameroun();
  }
}

// À utiliser avec les méthodes getUTCxxx() du Date renvoyé ci-dessus
// (jamais getHours()/getDay() "locaux", qui réinterprètent selon le
// fuseau de l'appareil et annuleraient le décalage qu'on vient d'ajouter).

function lundiDeLaSemaine(reference = maintenantCameroun()): string {
  const jour = reference.getUTCDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate() + decalage;
  const date = new Date(Date.UTC(y, m, d));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function decalerSemaine(semaineISO: string, nbSemaines: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + nbSemaines * 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Les N dernières semaines (lundis), semaine actuelle incluse — utilisé
// pour la Saisie manuelle, dont la fenêtre de recherche doit couvrir
// large (jusqu'à 1 mois en arrière).
function dernieresSemaines(nb: number): string[] {
  const actuelle = lundiDeLaSemaine();
  return Array.from({ length: nb }, (_, i) => decalerSemaine(actuelle, -i));
}

const NOMS_JOURS = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
];

function jourDAujourdhui(reference = maintenantCameroun()): string | null {
  const nom = NOMS_JOURS[reference.getUTCDay()];
  return nom === 'Dimanche' ? null : nom;
}

// Bornes (en minutes depuis minuit, heure du Cameroun) de chaque
// créneau — lues depuis lib/creneaux.ts (table "creneaux" en base,
// synchronisée hors ligne, gérable depuis Référentiel → Créneaux).
function bornesCreneaux(): Record<string, { debut: number; fin: number }> {
  return toutesLesBornesCreneaux();
}

// Fenêtre élargie : ouvrable dès 3h avant le début programmé, encore
// fermable jusqu'à 1h après la fin programmée — sinon un enseignant en
// avance ou un peu en retard ne retrouverait jamais son cours dans "Ma
// séance". Renvoie null si l'heure actuelle ne tombe dans la fenêtre
// élargie d'aucun créneau.
const MARGE_AVANT_MIN = 3 * 60;
const MARGE_APRES_MIN = 1 * 60;

// AVANT : renvoyait le PREMIER créneau trouvé dont la fenêtre élargie
// contient "maintenant" — avec des créneaux rapprochés (ex: "08h-12h" et
// un créneau de 07h30 à 08h30), leurs fenêtres élargies se chevauchent
// largement (marge de 3h avant chacun), et le mauvais créneau pouvait
// être choisi selon l'ordre de la liste, même quand l'heure actuelle
// tombait PILE dans un autre créneau.
// MAINTENANT : on calcule la distance de "maintenant" à chaque créneau
// (0 si on est littéralement dedans, sinon le nombre de minutes avant le
// début ou après la fin) et on choisit celui dont la distance est la
// plus PETITE — un créneau où l'on est vraiment "dedans" gagne toujours
// face à un autre où l'on n'est que dans la marge élargie.
function creneauActuel(reference = maintenantCameroun()): Creneau | null {
  const minutes = reference.getUTCHours() * 60 + reference.getUTCMinutes();
  let meilleur: { creneau: string; distance: number } | null = null;

  for (const [creneau, bornes] of Object.entries(bornesCreneaux())) {
    let distance: number;
    if (minutes < bornes.debut) {
      distance = bornes.debut - minutes;
      if (distance > MARGE_AVANT_MIN) continue;
    } else if (minutes > bornes.fin) {
      distance = minutes - bornes.fin;
      if (distance > MARGE_APRES_MIN) continue;
    } else {
      distance = 0; // littéralement dans le créneau
    }
    if (!meilleur || distance < meilleur.distance) {
      meilleur = { creneau, distance };
    }
  }

  return meilleur?.creneau ?? null;
}

// ── Flux normal enseignant (écrans 6.1 / 6.2) ──────────────────────

export interface SeanceDuMoment {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  salleCode: string | null;
  jour: string;
  creneau: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
  specialiteId: string | null;
  specialiteNom: string | null;
  typeCursus: TypeCursus | null;
  semestre: string | null;
}

// Le cours du moment pour l'enseignant connecté : celui prévu aujourd'hui,
// sur le créneau en cours, dans une semaine déjà validée. Ne renvoie rien
// en dehors des heures de cours ou un dimanche.
//
// AVANT : récupérait TOUS les emplois du temps validés de TOUTE l'école
// pour la semaine (aucun filtre par enseignant), avant de chercher dedans
// la séance de CET enseignant — une requête qui grossit avec le nombre de
// spécialités de l'établissement, pour un résultat qui ne concerne qu'une
// seule personne.
// MAINTENANT : une seule requête, directement filtrée par enseignant_id +
// jour + créneau (déjà indexé), qui ramène à la fois les séances de
// spécialité ET de tronc commun ainsi que le statut de l'emploi du temps
// associé — le filtre "semaine validée" se fait ensuite en mémoire sur ce
// petit résultat (au plus quelques lignes, jamais toute l'école).
// ── Diagnostic (TEMPORAIRE) ─────────────────────────────────────────
// À retirer une fois le bug confirmé résolu. Expose ce que le code
// calcule réellement comme "maintenant", "aujourd'hui" et "créneau
// actuel", pour distinguer en un coup d'œil : (a) un vrai bug dans le
// calcul de l'heure, de (b) des bornes de créneau de test qui ne
// couvrent tout simplement pas l'heure réelle actuelle.
export interface DiagnosticCreneau {
  maintenantISO: string; // heure Cameroun calculée, affichable
  jour: string | null;
  creneauDetecte: string | null;
  bornes: { code: string; debut: string; fin: string }[];
}

function minutesVersHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export async function diagnostiquerCreneauActuel(): Promise<DiagnosticCreneau> {
  await synchroniserCreneaux();
  const maintenant = await maintenantCamerounServeur();
  const jour = jourDAujourdhui(maintenant);
  const creneauDetecte = creneauActuel(maintenant);
  const bornes = Object.entries(bornesCreneaux()).map(([code, b]) => ({
    code,
    debut: minutesVersHHMM(b.debut),
    fin: minutesVersHHMM(b.fin),
  }));
  return {
    maintenantISO: `${String(maintenant.getUTCHours()).padStart(2, '0')}:${String(
      maintenant.getUTCMinutes()
    ).padStart(2, '0')}:${String(maintenant.getUTCSeconds()).padStart(2, '0')}`,
    jour,
    creneauDetecte,
    bornes,
  };
}

export async function getSeanceDuMoment(
  matricule: string
): Promise<SeanceDuMoment | null> {
  // Garantit des bornes de créneaux à jour AVANT de déterminer "quel
  // créneau est-ce maintenant" — sans ça, un créneau ajouté par un admin
  // pendant que cette app était déjà ouverte ne serait jamais reconnu,
  // même en rafraîchissant la page en boucle (voir lib/creneaux.ts).
  await synchroniserCreneaux();

  // Heure RÉELLE du serveur, pas celle de l'appareil (qui peut dériver,
  // surtout dans un environnement de test/sandbox) — voir
  // maintenantCamerounServeur() ci-dessus.
  const maintenant = await maintenantCamerounServeur();

  const jour = jourDAujourdhui(maintenant);
  if (!jour) return null;

  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return null;

  const semaine = lundiDeLaSemaine(maintenant);
  const creneau = creneauActuel(maintenant);
  if (!creneau) return null;

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture, emploi_du_temps_id,
      tronc_commun_id,
      offre:offres(semestre, ue:ues(id, nom)),
      tronc_commun:troncs_communs(nom),
      salle:salles(code_salle),
      emploi_du_temps:emplois_du_temps(
        statut, specialite_id,
        specialite:specialites(nom, type_cursus)
      )
    `
    )
    .eq('enseignant_id', enseignant.id)
    .eq('jour', jour)
    .eq('creneau', creneau)
    .eq('semaine', semaine)
    .eq('annulee', false)
    .order('id')
    .limit(10);
  if (error) throw error;

  // Filtre en mémoire (sur un résultat déjà réduit à un seul enseignant ET
  // une seule semaine) : une séance de tronc commun est toujours valable
  // (pas d'emploi du temps de spécialité rattaché) ; une séance de
  // spécialité doit appartenir à un emploi du temps VALIDÉ.
  const s = ((data ?? []) as any[]).find((ligne) =>
    ligne.tronc_commun_id
      ? true
      : ligne.emploi_du_temps?.statut === 'valide'
  );
  if (!s) return null;

  return {
    id: s.id,
    ueId: s.offre?.ue?.id ?? null,
    troncCommunId: s.tronc_commun_id ?? null,
    ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
    specialiteId: s.emploi_du_temps?.specialite_id ?? null,
    specialiteNom: s.emploi_du_temps?.specialite?.nom ?? null,
    typeCursus: s.emploi_du_temps?.specialite?.type_cursus ?? null,
    semestre: s.offre?.semestre ?? null,
    salleCode: s.salle?.code_salle ?? null,
    jour: s.jour,
    creneau: s.creneau,
    heureOuverture: s.heure_ouverture,
    heureFermeture: s.heure_fermeture,
  };
}

// Même recherche que getSeanceDuMoment, mais depuis Dexie — jusqu'ici,
// "Ma séance" n'avait AUCUN filet de secours hors ligne : sans réseau,
// l'appel Supabase échouait platement et l'enseignant ne voyait même
// plus son cours en cours, ouvert ou pas. seances_edt, emplois_du_temps,
// offres, ues, troncs_communs, salles, specialites et enseignants sont
// déjà synchronisés localement (voir TABLES_A_SYNCHRONISER dans
// lib/sync.ts) — il ne manquait que cette reconstruction.
export async function lireSeanceDuMomentDepuisCache(
  matricule: string
): Promise<SeanceDuMoment | null> {
  const jour = jourDAujourdhui();
  if (!jour) return null;
  const creneau = creneauActuel();
  if (!creneau) return null;
  const semaine = lundiDeLaSemaine();

  const enseignant = await db.enseignants
    .where('matricule')
    .equals(matricule)
    .first();
  if (!enseignant) return null;

  const [seances, emplois, offres, ues, troncsCommuns, salles, specialites] =
    await Promise.all([
      db.seancesEDT
        .where('enseignant_id')
        .equals((enseignant as any).id)
        .toArray(),
      db.emploisDuTemps.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.troncsCommuns.toArray(),
      db.salles.toArray(),
      db.specialites.toArray(),
    ]);

  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const troncParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));

  const s = (seances as any[]).find(
    (ligne) =>
      ligne.jour === jour &&
      ligne.creneau === creneau &&
      ligne.semaine === semaine &&
      !ligne.annulee &&
      (ligne.tronc_commun_id
        ? true
        : emploiParId.get(ligne.emploi_du_temps_id)?.statut === 'valide')
  );
  if (!s) return null;

  const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
  const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
  const tronc = s.tronc_commun_id ? troncParId.get(s.tronc_commun_id) : null;
  const emploi = s.emploi_du_temps_id
    ? emploiParId.get(s.emploi_du_temps_id)
    : null;
  const specialite = emploi?.specialite_id
    ? specialiteParId.get(emploi.specialite_id)
    : null;
  const salle = s.salle_id ? salleParId.get(s.salle_id) : null;

  return {
    id: s.id,
    ueId: ue?.id ?? null,
    troncCommunId: s.tronc_commun_id ?? null,
    ueNom: tronc?.nom ?? ue?.nom ?? '',
    specialiteId: specialite?.id ?? null,
    specialiteNom: specialite?.nom ?? null,
    typeCursus: specialite?.type_cursus ?? null,
    semestre: offre?.semestre ?? null,
    salleCode: salle?.code_salle ?? null,
    jour: s.jour,
    creneau: s.creneau,
    heureOuverture: s.heure_ouverture,
    heureFermeture: s.heure_fermeture,
  };
}

export interface ResultatOuvertureFermeture {
  heure: string;
  // true si l'action a été mise en file d'attente locale faute de réseau
  // — l'heure renvoyée est alors une ESTIMATION locale, pas l'heure
  // définitive du serveur (qui la remplacera une fois synchronisée).
  horsLigne: boolean;
}

// Appelle le RPC en direct si le réseau répond ; ne tombe en file
// d'attente locale QUE si l'appel réseau lui-même échoue (pas de
// connexion, requête qui ne part pas) — jamais si le serveur a bien
// répondu mais rejeté le code (ça, c'est une vraie erreur à montrer tout
// de suite, pas à mettre en attente pour échouer pareil plus tard).
async function appellerRpcOuFileAttente(
  rpc: 'ouvrir_seance' | 'fermer_seance',
  seanceId: string,
  code: string
): Promise<{ data: any; error: any } | null> {
  if (!navigator.onLine) return null;
  try {
    return await supabase.rpc(rpc, { p_seance_id: seanceId, p_code: code });
  } catch {
    // Échec au niveau réseau (fetch n'a pas abouti) — pas une réponse du
    // serveur, donc pas un rejet de code. On tombe en file d'attente.
    return null;
  }
}

// Vérification LOCALE du code, hors ligne — codes_seances est déjà
// synchronisé sur l'appareil (voir TABLES_A_SYNCHRONISER dans
// lib/sync.ts), donc le vrai code (celui généré à la validation de
// l'emploi du temps) est déjà présent localement. On compare directement
// contre lui avant d'accepter quoi que ce soit : jamais d'ouverture ou de
// fermeture mise en file sans que le code tapé corresponde VRAIMENT au
// code de cette séance — la vérification en ligne (RPC serveur) reste la
// référence quand le réseau est là, mais hors ligne, ce n'est plus "faire
// confiance et vérifier plus tard", c'est "vérifier tout de suite, avec
// les vraies données déjà en local".
async function codeValideLocalement(
  seanceId: string,
  code: string,
  type: 'ouvrir' | 'fermer'
): Promise<boolean> {
  const ligne = await db.codesSeance
    .where('seance_edt_id')
    .equals(seanceId)
    .first();
  if (!ligne) return false;
  const attendu =
    type === 'ouvrir'
      ? (ligne as any).code_ouverture
      : (ligne as any).code_fermeture;
  if (!attendu) return false;
  return attendu.trim().toUpperCase() === code.trim().toUpperCase();
}

// Le code n'est jamais lu côté client PENDANT une vérification en ligne :
// la fonction RPC "security definer" le vérifie elle-même côté base et
// renvoie une erreur explicite sinon. Hors ligne, la vérification se fait
// contre le code déjà synchronisé localement (voir codeValideLocalement)
// — un code qui ne correspond pas est refusé IMMÉDIATEMENT, rien n'est
// mis en file d'attente. Seul un code qui correspond VRAIMENT passe en
// file, avec une heure locale provisoire affichée immédiatement ;
// l'ouverture/fermeture définitive (avec l'heure serveur exacte) se fait
// au rejeu, dès le retour du réseau.
export async function ouvrirSeance(
  seanceId: string,
  code: string
): Promise<ResultatOuvertureFermeture> {
  const resultat = await appellerRpcOuFileAttente(
    'ouvrir_seance',
    seanceId,
    code
  );
  if (resultat) {
    if (resultat.error) throw new Error(resultat.error.message);
    const ligne = Array.isArray(resultat.data) ? resultat.data[0] : resultat.data;
    return { heure: ligne?.heure_ouverture, horsLigne: false };
  }

  const valide = await codeValideLocalement(seanceId, code, 'ouvrir');
  if (!valide) {
    throw new Error(
      'Code incorrect (vérifié localement — hors ligne).'
    );
  }

  await enqueueSyncAction({
    entity: 'ouvertureFermetureSeance',
    operation: 'update',
    payload: { seanceId, code, type: 'ouvrir' },
  });
  // Tentative immédiate si jamais le réseau revient entre-temps — sans
  // bloquer le retour de la fonction (l'enseignant a déjà sa confirmation
  // locale, la vraie sync se fait en tâche de fond).
  processSyncQueue().catch(() => {});
  return { heure: new Date().toISOString(), horsLigne: true };
}

export async function fermerSeance(
  seanceId: string,
  code: string
): Promise<ResultatOuvertureFermeture> {
  const resultat = await appellerRpcOuFileAttente(
    'fermer_seance',
    seanceId,
    code
  );
  if (resultat) {
    if (resultat.error) throw new Error(resultat.error.message);
    const ligne = Array.isArray(resultat.data) ? resultat.data[0] : resultat.data;
    return { heure: ligne?.heure_fermeture, horsLigne: false };
  }

  const valide = await codeValideLocalement(seanceId, code, 'fermer');
  if (!valide) {
    throw new Error(
      'Code incorrect (vérifié localement — hors ligne).'
    );
  }

  await enqueueSyncAction({
    entity: 'ouvertureFermetureSeance',
    operation: 'update',
    payload: { seanceId, code, type: 'fermer' },
  });
  processSyncQueue().catch(() => {});
  return { heure: new Date().toISOString(), horsLigne: true };
}

// ── Flux de secours — saisie manuelle (écran 6.3) ──────────────────

export interface SeanceRecherche {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  enseignantNom: string;
  enseignantMatricule: string | null;
  specialiteId: string | null;
  specialiteNom: string | null;
  typeCursus: TypeCursus | null;
  semestre: string | null;
  jour: string;
  creneau: string;
  semaine: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
}

// Recherche parmi les EDT validés de la semaine en cours et de la
// précédente (pour rattraper un oubli de la veille) — Admin, Responsable,
// Secrétaire.
// Reconstruit la même recherche depuis le cache Dexie — utilisée hors
// ligne (le cas d'usage même de cet écran : l'app était injoignable, la
// secrétaire a noté les heures sur papier, et rattrape ça maintenant,
// éventuellement encore hors ligne).
export async function lireSeancesPourSaisieManuelleDepuisCache(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaines = dernieresSemaines(5);

  const [emplois, seancesToutes, offres, ues, enseignants, troncsCommuns, specialites] =
    await Promise.all([
      db.emploisDuTemps
        .where('semaine')
        .anyOf(semaines)
        .and((e: any) => e.statut === 'valide')
        .toArray(),
      db.seancesEDT.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.enseignants.toArray(),
      db.troncsCommuns.toArray(),
      db.specialites.toArray(),
    ]);
  if (emplois.length === 0 && !troncsCommuns.length) return [];

  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));

  const q = recherche.trim().toLowerCase();
  return (seancesToutes as any[])
    .filter(
      (s) =>
        emploiParId.has(s.emploi_du_temps_id) ||
        (s.tronc_commun_id && semaines.includes(s.semaine))
    )
    .map((s) => {
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = s.enseignant_id
        ? enseignantParId.get(s.enseignant_id)
        : null;
      const specialite = emploi?.specialite_id
        ? specialiteParId.get(emploi.specialite_id)
        : null;
      return {
        id: s.id,
        ueId: ue?.id ?? null,
        troncCommunId: s.tronc_commun_id ?? null,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '',
        enseignantNom: enseignant?.nom ?? '',
        enseignantMatricule: enseignant?.matricule ?? null,
        specialiteId: emploi?.specialite_id ?? null,
        specialiteNom: specialite?.nom ?? null,
        typeCursus: specialite?.type_cursus ?? null,
        semestre: offre?.semestre ?? null,
        jour: s.jour,
        creneau: s.creneau,
        semaine: emploi?.semaine ?? s.semaine ?? '',
        heureOuverture: s.heure_ouverture ?? null,
        heureFermeture: s.heure_fermeture ?? null,
      } as SeanceRecherche;
    })
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

// ── Rapport de séance (Scénario 13) ────────────────────────────

export interface RapportSeance {
  id: string;
  seanceId: string;
  niveau: string;
  contenu: string | null;
  cahierTexteKeys: string[];
  cahierTexteNoms: string[];
}

export async function getRapportPourSeance(
  seanceId: string
): Promise<RapportSeance | null> {
  const { data, error } = await supabase
    .from('rapports_seances')
    .select(
      'id, seance_edt_id, niveau, contenu, cahier_texte_keys, cahier_texte_noms'
    )
    .eq('seance_edt_id', seanceId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const r = data[0];
  return {
    id: r.id,
    seanceId: r.seance_edt_id,
    niveau: r.niveau,
    contenu: r.contenu,
    cahierTexteKeys: r.cahier_texte_keys ?? [],
    cahierTexteNoms: r.cahier_texte_noms ?? [],
  };
}

// Retire une photo du cahier de texte (index 1-based, dans l'ordre
// d'envoi) — le fichier reste sur R2 (pas critique de le supprimer), la
// photo disparaît juste de la liste du rapport.
export async function retirerImageCahierTexte(
  rapportId: string,
  index1Based: number
): Promise<void> {
  const { error } = await supabase.rpc('retirer_image_cahier_texte', {
    p_rapport_id: rapportId,
    p_index: index1Based,
  });
  if (error) throw new Error(error.message);
}

// Crée le rapport s'il n'existe pas encore pour cette séance, ou renvoie
// celui déjà en place (en mettant à jour le niveau si l'enseignant l'a
// changé entre-temps).
export async function creerOuRecupererRapport(
  seanceId: string,
  matricule: string,
  niveau: string
): Promise<string> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) throw new Error('Enseignant introuvable.');

  const existant = await getRapportPourSeance(seanceId);
  if (existant) {
    if (existant.niveau !== niveau) {
      await supabase
        .from('rapports_seances')
        .update({ niveau })
        .eq('id', existant.id);
    }
    return existant.id;
  }

  const { data, error } = await supabase
    .from('rapports_seances')
    .insert({ seance_edt_id: seanceId, enseignant_id: enseignant.id, niveau })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getAppelExistant(
  rapportId: string
): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('appels_etudiants')
    .select('etudiant_id, present')
    .eq('rapport_id', rapportId);
  const map: Record<string, boolean> = {};
  for (const ligne of data ?? []) map[ligne.etudiant_id] = ligne.present;
  return map;
}

// Remplace l'appel existant par le nouveau — simple et robuste vu le
// faible volume (une classe par séance).
export async function enregistrerAppel(
  rapportId: string,
  presences: { etudiantId: string; present: boolean }[]
): Promise<void> {
  await supabase.from('appels_etudiants').delete().eq('rapport_id', rapportId);
  if (presences.length === 0) return;
  const { error } = await supabase.from('appels_etudiants').insert(
    presences.map((p) => ({
      rapport_id: rapportId,
      etudiant_id: p.etudiantId,
      present: p.present,
    }))
  );
  if (error) throw error;
}

export async function getPointsAbordesExistants(
  rapportId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('rapports_points_abordes')
    .select('point_cle_id')
    .eq('rapport_id', rapportId);
  return new Set((data ?? []).map((l) => l.point_cle_id));
}

// Remplace intégralement les points abordés — même principe que l'appel :
// chaque enregistrement fournit la liste complète, jamais un ajout partiel.
export async function enregistrerPointsAbordes(
  rapportId: string,
  pointIds: string[]
): Promise<void> {
  await supabase
    .from('rapports_points_abordes')
    .delete()
    .eq('rapport_id', rapportId);
  if (pointIds.length === 0) return;
  const { error } = await supabase.from('rapports_points_abordes').insert(
    pointIds.map((point_cle_id) => ({ rapport_id: rapportId, point_cle_id }))
  );
  if (error) throw error;
}

export async function enregistrerContenuRapport(
  rapportId: string,
  contenu: string
): Promise<void> {
  const { error } = await supabase
    .from('rapports_seances')
    .update({ contenu })
    .eq('id', rapportId);
  if (error) throw error;
}

// ── Enregistrement du rapport — TOUJOURS via la file d'attente ─────
// Jusqu'ici, "Enregistrer" sur le rapport de séance appelait Supabase en
// direct, sans AUCUN filet de secours : une connexion qui coupait en
// cours d'écriture (fréquent, vu le contexte réseau) donnait un échec
// sec, rien de sauvegardé, à refaire entièrement depuis le début.
//
// Ici, on ne tente même plus l'appel réseau en direct : l'écriture part
// TOUJOURS dans db.syncQueue (même mécanisme déjà utilisé pour les
// disponibilités et l'emploi du temps), avec une tentative de
// synchronisation immédiate en tâche de fond si le réseau est là. Ça
// rend l'enregistrement instantané dans TOUS les cas — en ligne comme
// hors ligne — puisque l'enseignant n'attend jamais la confirmation
// réseau pour voir "Enregistré".
//
// Pas de problème de réconciliation d'id : rapportId est généré côté
// client (crypto.randomUUID(), voir RapportSeanceForm) et sert tel quel
// à l'insertion Supabase — inutile d'attendre un id renvoyé par le
// serveur avant de pouvoir mettre l'appel/les points abordés en file.
export async function enregistrerRapportEnFile(params: {
  rapportId: string;
  seanceId: string;
  enseignantMatricule: string;
  niveau: string;
  presences: { etudiantId: string; present: boolean }[];
  pointIds: string[];
}): Promise<void> {
  // Résolution matricule -> id enseignant depuis Dexie (déjà synchronisé
  // localement) — pas d'appel réseau, fonctionne hors ligne.
  const enseignant = await db.enseignants
    .where('matricule')
    .equals(params.enseignantMatricule)
    .first();
  const enseignantId = (enseignant as any)?.id ?? null;

  await enqueueSyncAction({
    entity: 'rapportsSeances',
    operation: 'update',
    payload: {
      kind: 'rapport',
      rapportId: params.rapportId,
      seanceId: params.seanceId,
      enseignantId,
      niveau: params.niveau,
    },
  });
  await enqueueSyncAction({
    entity: 'rapportsSeances',
    operation: 'update',
    payload: {
      kind: 'appel',
      rapportId: params.rapportId,
      presences: params.presences,
    },
  });
  await enqueueSyncAction({
    entity: 'rapportsSeances',
    operation: 'update',
    payload: {
      kind: 'points',
      rapportId: params.rapportId,
      pointIds: params.pointIds,
    },
  });
  // Tentative immédiate si le réseau est là — sans bloquer le retour de
  // la fonction, l'enseignant a déjà sa confirmation locale.
  processSyncQueue().catch(() => {});
}

export async function rechercherSeancesPourSaisieManuelle(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaines = dernieresSemaines(5);

  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id, semaine, specialite_id, specialite:specialites(nom, type_cursus)')
    .in('semaine', semaines)
    .eq('statut', 'valide');
  const emploiIds = (emplois ?? []).map((e) => e.id);
  const infosParEmploi = new Map(
    (emplois ?? []).map((e: any) => [
      e.id,
      {
        semaine: e.semaine as string,
        specialiteId: e.specialite_id as string,
        specialiteNom: (e.specialite?.nom as string) ?? null,
        typeCursus: (e.specialite?.type_cursus as TypeCursus) ?? null,
      },
    ])
  );

  let seancesSpe: any[] = [];
  if (emploiIds.length > 0) {
    const { data, error } = await supabase
      .from('seances_edt')
      .select(
        `
        id, jour, creneau, emploi_du_temps_id, heure_ouverture, heure_fermeture,
        tronc_commun_id,
        offre:offres(semestre, ue:ues(id, nom)),
        tronc_commun:troncs_communs(nom),
        enseignant:enseignants(nom, matricule)
      `
      )
      .in('emploi_du_temps_id', emploiIds);
    if (error) throw error;
    seancesSpe = data ?? [];
  }

  // Séances de tronc commun des dernières semaines — plus rattachées à
  // un emploi de spécialité (une seule ligne partagée par tout le
  // groupe).
  const { data: seancesTronc, error: errorTronc } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture, semaine,
      tronc_commun_id,
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom, matricule)
    `
    )
    .in('semaine', semaines)
    .not('tronc_commun_id', 'is', null);
  if (errorTronc) throw errorTronc;

  const q = recherche.trim().toLowerCase();
  return [...seancesSpe, ...(seancesTronc ?? [])]
    .map((s: any) => {
      const infos = infosParEmploi.get(s.emploi_du_temps_id);
      return {
        id: s.id,
        ueId: s.offre?.ue?.id ?? null,
        troncCommunId: s.tronc_commun_id ?? null,
        ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
        enseignantNom: s.enseignant?.nom ?? '',
        enseignantMatricule: s.enseignant?.matricule ?? null,
        specialiteId: infos?.specialiteId ?? null,
        specialiteNom: infos?.specialiteNom ?? null,
        typeCursus: infos?.typeCursus ?? null,
        semestre: s.offre?.semestre ?? null,
        jour: s.jour,
        creneau: s.creneau,
        semaine: infos?.semaine ?? s.semaine ?? '',
        heureOuverture: s.heure_ouverture,
        heureFermeture: s.heure_fermeture,
      };
    })
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

export async function saisirHeureManuelle(
  seanceId: string,
  heures: { heureOuverture?: string | null; heureFermeture?: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('saisir_heure_manuelle', {
    p_seance_id: seanceId,
    p_heure_ouverture: heures.heureOuverture || null,
    p_heure_fermeture: heures.heureFermeture || null,
  });
  if (error) throw new Error(error.message);
}