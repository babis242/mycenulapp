// src/lib/calculHeures.ts
//
// Règle de l'école (heures effectuées d'une séance) :
//   - jusqu'à 15 min de retard sur l'heure de début programmée : aucun
//     impact sur l'ARRIVÉE, l'heure concernée n'est pas perdue pour ce
//     motif ;
//   - au-delà de 15 min de retard : l'heure concernée est perdue, et la
//     règle se répète pour CHAQUE heure du créneau (pas seulement la
//     première) ;
//   - SYMÉTRIQUEMENT, jusqu'à 15 min de fermeture AVANT la fin d'une
//     heure : aucun impact non plus. Au-delà, cette heure est perdue.
//
// Exemples pour un créneau 08h-12h (4h nominal) :
//   - arrivée 08h14 → 4h (retard de 14 min, dans la marge)
//   - arrivée 08h16 → 3h (1h perdue pour retard)
//   - arrivée 08h07, fermeture 11h48 → 4h (12 min avant la fin, dans la marge)
//   - arrivée 08h07, fermeture 11h40 → 3h (20 min avant la fin, hors marge)

import { bornesCreneau } from './creneaux';

const MARGE_MIN = 15;

const JOUR_DECALAGE: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
};

// Bornes du créneau (minutes depuis minuit, heure Cameroun) — cherche
// d'abord dans la table "creneaux" (Référentiel → Créneaux, couvre aussi
// les créneaux personnalisés), sinon reprend le forfait historique.
function bornesEffectives(creneau: string): { debut: number; fin: number } {
  const bornes = bornesCreneau(creneau);
  if (bornes) return bornes;
  return creneau === '14h-17h'
    ? { debut: 14 * 60, fin: 17 * 60 }
    : { debut: 8 * 60, fin: 12 * 60 };
}

// Construit l'instant UTC exact correspondant à "minutesLocales" (heure
// Cameroun, UTC+1) du jour "jour" de la semaine dont le lundi est
// "semaineISO" — même principe que maintenantCameroun() ailleurs dans
// l'app, mais pour une date/heure programmée plutôt que "maintenant".
function instantUTC(semaineISO: string, jour: string, minutesLocales: number): Date {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const decalageJour = JOUR_DECALAGE[jour] ?? 0;
  const minuitUTCDuJour = Date.UTC(y, m - 1, d + decalageJour);
  // Cameroun = UTC+1 : l'instant UTC réel est 1h avant la lecture locale.
  return new Date(minuitUTCDuJour + (minutesLocales - 60) * 60000);
}

export function debutProgramme(
  semaineISO: string,
  jour: string,
  creneau: string
): Date {
  const { debut } = bornesEffectives(creneau);
  return instantUTC(semaineISO, jour, debut);
}

export function finProgrammee(
  semaineISO: string,
  jour: string,
  creneau: string
): Date {
  const { fin } = bornesEffectives(creneau);
  return instantUTC(semaineISO, jour, fin);
}

// Heures réellement effectuées : marge de 15 min à l'ouverture (voir
// règle ci-dessus), ET une heure ne compte que si la séance était
// encore ouverte à sa fin (heureFermetureISO). Sans heure d'ouverture
// connue, renvoie la durée nominale complète (séance pas encore
// programmée à comparer — rien à déduire, faute d'information). Sans
// heure de fermeture connue (séance ouverte mais pas encore fermée),
// applique uniquement la règle de retard — la fermeture, quand elle
// aura lieu, ne peut que retirer des heures, jamais en ajouter, donc pas
// besoin d'attendre pour appliquer déjà la pénalité de retard.
export function heuresEffectueesPourSeance(
  semaineISO: string,
  jour: string,
  creneau: string,
  heureOuvertureISO: string | null,
  heureFermetureISO?: string | null
): number {
  const { debut, fin } = bornesEffectives(creneau);
  const dureeNominale = (fin - debut) / 60;
  if (!heureOuvertureISO) return dureeNominale;

  const programme = debutProgramme(semaineISO, jour, creneau);
  const ouverture = new Date(heureOuvertureISO);
  const delaiOuverture = Math.max(
    0,
    (ouverture.getTime() - programme.getTime()) / 60000
  );

  // Délai de fermeture relatif au même repère (minutes depuis le début
  // programmé) — null si la séance n'est pas encore fermée, auquel cas
  // on ne pénalise pas pour une fermeture qui n'a pas encore eu lieu.
  const delaiFermeture = heureFermetureISO
    ? (new Date(heureFermetureISO).getTime() - programme.getTime()) / 60000
    : null;

  let heuresComptees = 0;
  for (let i = 0; i < dureeNominale; i++) {
    const debutHeure = i * 60;
    const finHeure = (i + 1) * 60;
    const arriveeATemps = delaiOuverture <= debutHeure + MARGE_MIN;
    const encoreOuverteAFin =
      delaiFermeture === null || delaiFermeture >= finHeure - MARGE_MIN;
    if (arriveeATemps && encoreOuverteAFin) heuresComptees++;
  }
  return heuresComptees;
}

// Vrai si l'ouverture a dépassé la marge de 15 min (donc au moins 1h
// perdue) — pour signaler un retard sans exposer l'heure exacte
// d'arrivée dans l'interface.
export function estEnRetard(
  semaineISO: string,
  jour: string,
  creneau: string,
  heureOuvertureISO: string | null
): boolean {
  if (!heureOuvertureISO) return false;
  const programme = debutProgramme(semaineISO, jour, creneau);
  const ouverture = new Date(heureOuvertureISO);
  return (ouverture.getTime() - programme.getTime()) / 60000 > MARGE_MIN;
}

// Retard exact en minutes (0 si à l'heure ou en avance) — pour les
// statistiques/cumuls, où le détail exact a du sens (contrairement à
// l'affichage courant, qui préfère juste un badge "Retard").
export function retardMinutes(
  semaineISO: string,
  jour: string,
  creneau: string,
  heureOuvertureISO: string | null
): number {
  if (!heureOuvertureISO) return 0;
  const programme = debutProgramme(semaineISO, jour, creneau);
  const ouverture = new Date(heureOuvertureISO);
  return Math.max(
    0,
    Math.round((ouverture.getTime() - programme.getTime()) / 60000)
  );
}

// Vrai si la fin programmée du créneau est déjà passée par rapport à
// "maintenant" — utilisé pour distinguer une ABSENCE (créneau terminé,
// jamais ouvert, pas annulé) d'une séance simplement pas encore arrivée
// (qu'il ne faut surtout pas compter comme une absence).
export function seanceEstTerminee(
  semaineISO: string,
  jour: string,
  creneau: string,
  maintenant: Date = new Date()
): boolean {
  return finProgrammee(semaineISO, jour, creneau).getTime() < maintenant.getTime();
}