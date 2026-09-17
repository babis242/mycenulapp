// src/lib/creneaux.ts
//
// Source unique de vérité pour la liste des créneaux (08h-12h, 14h-17h,
// et tout créneau ajouté depuis Référentiel → Créneaux). Vraie donnée
// serveur (table Supabase "creneaux"), synchronisée hors ligne comme le
// reste des données de référence (voir TABLES_A_SYNCHRONISER dans
// lib/sync.ts) — PAS une astuce locale au navigateur.
//
// Beaucoup d'écrans utilisent la liste des créneaux de façon SYNCHRONE
// (CRENEAUX.map(...) directement dans le rendu). Pour ne pas transformer
// tous ces écrans en composants asynchrones, on garde un petit cache en
// mémoire (rempli depuis Dexie, donc dispo hors ligne), rafraîchi :
//  - une fois au démarrage de l'app,
//  - après chaque synchronisation (un autre admin a pu ajouter/retirer
//    un créneau entre-temps),
//  - immédiatement après un ajout/suppression depuis l'écran dédié.

import { supabase } from './supabase';
import { db } from './db';

export interface CreneauDB {
  code: string;
  debut: number; // minutes depuis minuit
  fin: number; // minutes depuis minuit
  ordre: number;
}

// Filet de sécurité : les deux créneaux officiels, utilisés tant que le
// cache n'a encore rien chargé (tout premier démarrage avant la
// première synchronisation, ou table "creneaux" pas encore migrée) —
// l'app ne doit jamais se retrouver sans aucun créneau affichable.
const CRENEAUX_PAR_DEFAUT: CreneauDB[] = [
  { code: '08h-12h', debut: 8 * 60, fin: 12 * 60, ordre: 0 },
  { code: '14h-17h', debut: 14 * 60, fin: 17 * 60, ordre: 1 },
];

let cache: CreneauDB[] = CRENEAUX_PAR_DEFAUT;

export async function rafraichirCacheCreneaux(): Promise<void> {
  try {
    const data = await db.creneaux.toArray();
    if (data.length > 0) {
      cache = (data as any[])
        .map((c) => ({
          code: c.code,
          debut: c.heure_debut,
          fin: c.heure_fin,
          ordre: c.ordre ?? 0,
        }))
        .sort((a, b) => a.ordre - b.ordre);
    }
    // Si Dexie est vide (rien synchronisé pour l'instant), on garde le
    // cache déjà en mémoire (par défaut, ou celui du dernier
    // rafraîchissement réussi) plutôt que de le vider.
  } catch {
    // Pas grave — le cache garde sa dernière valeur connue.
  }
}

// Synchro DIRECTE et légère (juste la table "creneaux", quelques lignes)
// depuis Supabase — sans passer par le cycle complet de
// synchroniserTout()/syncReferenceData() (19 tables, déclenché
// seulement au démarrage, au retour réseau, ou au refresh du token
// toutes les ~heures). Sans ça, un enseignant dont l'app était déjà
// ouverte quand un admin ajoute un nouveau créneau ne le voit JAMAIS
// dans "Ma séance", même en rafraîchissant la page en boucle — le cache
// mémoire reste bloqué sur les créneaux connus au dernier chargement.
// À appeler à chaque ouverture/rafraîchissement de "Ma séance" : c'est
// une table minuscule, le coût réseau est négligeable, et ça garantit
// que "quel créneau est-ce maintenant ?" est toujours calculé avec les
// bonnes bornes.
export async function synchroniserCreneaux(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const { data, error } = await supabase
      .from('creneaux')
      .select('code, heure_debut, heure_fin, ordre');
    if (error || !data) return;
    if (data.length > 0) {
      await db.creneaux.bulkPut(data);
    }
    await rafraichirCacheCreneaux();
  } catch {
    // Pas de réseau au moment de l'appel, ou table pas encore migrée —
    // pas grave, on continue avec le cache déjà en mémoire.
  }
}

// Codes des créneaux, dans l'ordre — pour les grilles (.map() dans les
// écrans). Synchrone : lit le cache déjà en mémoire, jamais Dexie
// directement (IndexedDB est asynchrone, incompatible avec un rendu
// React synchrone).
export function tousLesCreneaux(): string[] {
  return cache.map((c) => c.code);
}

// Bornes horaires d'un créneau (minutes depuis minuit) — pour détecter
// le créneau en cours ("Ma séance") ou calculer la fin programmée
// (verrouillage du rapport).
export function bornesCreneau(
  code: string
): { debut: number; fin: number } | undefined {
  const c = cache.find((x) => x.code === code);
  return c ? { debut: c.debut, fin: c.fin } : undefined;
}

export function toutesLesBornesCreneaux(): Record<
  string,
  { debut: number; fin: number }
> {
  const bornes: Record<string, { debut: number; fin: number }> = {};
  for (const c of cache) bornes[c.code] = { debut: c.debut, fin: c.fin };
  return bornes;
}