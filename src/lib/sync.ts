// src/lib/sync.ts
import { supabase } from './supabase';
import { db, enqueueSyncAction } from './db';
import type { SyncAction } from '@/types';

// Tables « de référence » — peu volumineuses, changent rarement, utiles
// hors ligne (référentiel, personnel, EDT/séances/codes de la semaine en
// cours...). Nom de table Dexie → nom de table Supabase.
const TABLES_A_SYNCHRONISER: Record<string, string> = {
  ecoles: 'ecoles',
  filieres: 'filieres',
  specialites: 'specialites',
  ues: 'ues',
  offres: 'offres',
  enseignants: 'enseignants',
  responsables: 'responsables',
  secretaires: 'secretaires',
  salles: 'salles',
  attributions: 'attributions',
  campagnesDisponibilite: 'campagnes_disponibilite',
  disponibilites: 'disponibilites',
  emploisDuTemps: 'emplois_du_temps',
  seancesEDT: 'seances_edt',
  codesSeance: 'codes_seances',
  troncsCommuns: 'troncs_communs',
  troncsCommunsUes: 'troncs_communs_ues',
  campagneEnseignants: 'campagne_enseignants',
  etudiants: 'etudiants',
  creneaux: 'creneaux',
};

export type EtatSync = 'idle' | 'syncing' | 'error';

let etatActuel: EtatSync = 'idle';
const abonnes = new Set<(etat: EtatSync) => void>();

function notifier(etat: EtatSync) {
  etatActuel = etat;
  abonnes.forEach((cb) => cb(etat));
}

export function onSyncStateChange(cb: (etat: EtatSync) => void) {
  abonnes.add(cb);
  cb(etatActuel);
  return () => abonnes.delete(cb);
}

// Descend chaque table de référence de Supabase vers Dexie.
//
// AVANT : select('*') sans filtre sur les 19 tables, à CHAQUE sync — donc
// à chaque refresh automatique du token (~toutes les heures) et à chaque
// retour de réseau. Sur des tables qui grossissent (disponibilites,
// seances_edt, etudiants...), ça retéléchargeait des Mo de données déjà
// connues, en boucle, ce qui expliquait une bonne partie de la lenteur.
//
// MAINTENANT : chaque table retient (dans localStorage) la date/heure de
// son dernier sync réussi, et ne redemande que les lignes dont
// updated_at est postérieur à cette date (".gt('updated_at', ...)"),
// via upsert (bulkPut) — jamais de clear() en mode incrémental, donc
// aucune donnée locale perdue entre deux syncs. Nécessite la colonne
// updated_at + trigger sur chaque table (voir migration SQL fournie
// séparément).
//
// Limite connue : une synchro incrémentale ne peut PAS détecter une
// ligne supprimée côté serveur (elle n'apparaît simplement plus dans les
// résultats, mais reste dans Dexie). Filet de sécurité : une fois par
// jour calendaire, la sync redevient complète (clear + tout retélécharger)
// pour rattraper d'éventuelles suppressions — un coût qu'on accepte une
// fois par jour, pas à chaque refresh de token.
//
// Chaque table reste isolée dans son propre try/catch : si une table
// échoue (droit RLS refusé pour ce rôle, par exemple — un enseignant n'a
// pas accès à codes_seances), les autres continuent d'être synchronisées
// normalement.
const PREFIXE_CLE_DERNIER_SYNC = 'edt-sync:derniere-maj:';
const CLE_DERNIER_SYNC_COMPLET_JOUR = 'edt-sync:dernier-complet-jour';

function lireDernierSync(tableDexie: string): string | null {
  try {
    return localStorage.getItem(PREFIXE_CLE_DERNIER_SYNC + tableDexie);
  } catch {
    return null;
  }
}

function ecrireDernierSync(tableDexie: string, isoMaintenant: string) {
  try {
    localStorage.setItem(PREFIXE_CLE_DERNIER_SYNC + tableDexie, isoMaintenant);
  } catch {
    // Stockage indisponible — pas bloquant, la prochaine sync sera juste
    // complète par défaut (pas de date de référence trouvée).
  }
}

// Un resync complet est dû si on n'en a jamais fait, ou si le dernier
// remonte à un jour calendaire différent d'aujourd'hui (peu importe
// l'heure exacte — juste "au moins une fois par jour").
function resyncCompletDu(): boolean {
  try {
    const dernier = localStorage.getItem(CLE_DERNIER_SYNC_COMPLET_JOUR);
    const aujourdHui = new Date().toISOString().slice(0, 10);
    return dernier !== aujourdHui;
  } catch {
    return true;
  }
}

function marquerResyncCompletFait() {
  try {
    const aujourdHui = new Date().toISOString().slice(0, 10);
    localStorage.setItem(CLE_DERNIER_SYNC_COMPLET_JOUR, aujourdHui);
  } catch {
    // Pas bloquant — au pire on refait un resync complet à la prochaine
    // sync aussi, ce qui reste correct, juste pas optimal.
  }
}

async function synchroniserUneTable(
  tableDexie: string,
  tableSupabase: string,
  complet: boolean
): Promise<void> {
  const table = (db as any)[tableDexie];
  if (!table) return;

  const maintenant = new Date().toISOString();

  if (complet) {
    const { data, error } = await supabase.from(tableSupabase).select('*');
    if (error) throw error;
    await db.transaction('rw', table, async () => {
      await table.clear();
      if (data && data.length > 0) await table.bulkPut(data);
    });
  } else {
    const depuis = lireDernierSync(tableDexie);
    let requete = supabase.from(tableSupabase).select('*');
    if (depuis) requete = requete.gt('updated_at', depuis);
    const { data, error } = await requete;
    if (error) throw error;
    // Upsert seulement — jamais de clear() en incrémental, sinon on
    // perdrait toutes les lignes non renvoyées (= non modifiées).
    if (data && data.length > 0) await table.bulkPut(data);
  }

  ecrireDernierSync(tableDexie, maintenant);
}

export async function syncReferenceData(): Promise<void> {
  if (!navigator.onLine) return;
  notifier('syncing');
  let uneErreur = false;

  const complet = resyncCompletDu();

  // En parallèle plutôt qu'en séquence : sur une connexion à forte
  // latence, attendre chaque table l'une après l'autre (19 allers-retours
  // successifs) coûte bien plus cher que la bande passante elle-même.
  // Chaque table garde son propre try/catch (via synchroniserUneTable
  // qui peut lever), donc une table en échec (RLS, etc.) ne bloque pas
  // les autres.
  const resultats = await Promise.allSettled(
    Object.entries(TABLES_A_SYNCHRONISER).map(([tableDexie, tableSupabase]) =>
      synchroniserUneTable(tableDexie, tableSupabase, complet)
    )
  );
  uneErreur = resultats.some((r) => r.status === 'rejected');

  // Les créneaux sont lus depuis un petit cache mémoire (lib/creneaux.ts,
  // pour un accès synchrone dans les grilles) — on le rafraîchit depuis
  // Dexie juste après chaque sync, pour refléter un créneau ajouté par
  // un autre admin entre-temps.
  const { rafraichirCacheCreneaux } = await import('./creneaux');
  await rafraichirCacheCreneaux();

  if (complet && !uneErreur) marquerResyncCompletFait();
  notifier(uneErreur ? 'error' : 'idle');
}

// Rejoue la file d'actions en attente (créées hors ligne) vers Supabase.
// N'implémente pour l'instant que les entités listées ci-dessous — les
// autres restent en file (status 'pending') jusqu'à ce qu'un traitement
// leur soit ajouté ici, sans jamais être perdues.
// Le compte de connexion ne peut être créé que si le réseau répond — ce qui
// est justement le cas ici puisqu'on est en train de synchroniser. Un échec
// de cette étape ne fait PAS échouer toute l'action : la fiche existe déjà
// en base, l'admin pourra relancer l'envoi des identifiants depuis l'écran
// concerné.
async function tenterCreationCompte(
  fonction: string,
  body: Record<string, string>
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke(fonction, { body });
    if (error) throw error;
  } catch (err) {
    console.warn(
      `[sync] Fiche créée mais le compte de connexion n'a pas pu être créé automatiquement (${fonction}) :`,
      err
    );
  }
}

async function rejouerAction(action: SyncAction): Promise<void> {
  const payload = action.payload as Record<string, unknown>;

  switch (action.entity) {
    case 'disponibilites': {
      if (action.operation === 'update') {
        const { campagneId, enseignantId, lignes } = payload as {
          campagneId: string;
          enseignantId: string;
          lignes: { jour: string; creneau: string; disponible: boolean }[];
        };
        await supabase
          .from('disponibilites')
          .delete()
          .eq('campagne_id', campagneId)
          .eq('enseignant_id', enseignantId);
        const { error } = await supabase.from('disponibilites').insert(
          lignes.map((l) => ({
            campagne_id: campagneId,
            enseignant_id: enseignantId,
            jour: l.jour,
            creneau: l.creneau,
            disponible: l.disponible,
          }))
        );
        if (error) throw error;
      }
      return;
    }
    case 'ues': {
      if (action.operation === 'create') {
        const { id, nom, code, volume_horaire, coefficient, specialite_id, semestre } =
          payload as {
            id: string;
            nom: string;
            code: string | null;
            volume_horaire: number | null;
            coefficient: number | null;
            specialite_id: string;
            semestre: string;
          };
        // upsert (pas insert) : rejouer la même action deux fois ne doit
        // jamais produire de conflit d'id.
        const { error: ueError } = await supabase
          .from('ues')
          .upsert({ id, nom, code, volume_horaire, coefficient });
        if (ueError) throw ueError;

        const { data: offreExistante } = await supabase
          .from('offres')
          .select('id')
          .eq('ue_id', id)
          .maybeSingle();
        if (!offreExistante) {
          const { error: offreError } = await supabase
            .from('offres')
            .insert({ ue_id: id, specialite_id, semestre });
          if (offreError) throw offreError;
        }
      }
      return;
    }
    case 'salles': {
      if (action.operation === 'create') {
        const { id, code_salle, capacite, specialite_par_defaut_id } =
          payload as {
            id: string;
            code_salle: string;
            capacite: number;
            specialite_par_defaut_id: string;
          };
        const { error } = await supabase
          .from('salles')
          .upsert({ id, code_salle, capacite, specialite_par_defaut_id });
        if (error) throw error;
      }
      return;
    }
    case 'enseignants': {
      if (action.operation === 'create') {
        const { id, nom, email, numero_whatsapp, numero_cellulaire } =
          payload as {
            id: string;
            nom: string;
            email: string;
            numero_whatsapp: string | null;
            numero_cellulaire: string | null;
          };
        const { error } = await supabase
          .from('enseignants')
          .upsert({ id, nom, email, numero_whatsapp, numero_cellulaire });
        if (error) throw error;
        await tenterCreationCompte('create-enseignant-account', {
          enseignantId: id,
        });
      }
      return;
    }
    case 'responsables': {
      if (action.operation === 'create') {
        const { id, nom, email, numero_telephone, specialiteIds } =
          payload as {
            id: string;
            nom: string;
            email: string;
            numero_telephone: string | null;
            specialiteIds?: string[];
          };
        const { error } = await supabase
          .from('responsables')
          .upsert({ id, nom, email, numero_telephone });
        if (error) throw error;
        if (specialiteIds && specialiteIds.length > 0) {
          const { error: perimetreError } = await supabase
            .from('responsables_specialites')
            .upsert(
              specialiteIds.map((specialite_id) => ({
                responsable_id: id,
                specialite_id,
              }))
            );
          if (perimetreError) throw perimetreError;
        }
        await tenterCreationCompte('create-responsable-account', {
          responsableId: id,
        });
      }
      return;
    }
    case 'secretaires': {
      if (action.operation === 'create') {
        const { id, nom, email, numero_telephone } = payload as {
          id: string;
          nom: string;
          email: string;
          numero_telephone: string | null;
        };
        const { error } = await supabase
          .from('secretaires')
          .upsert({ id, nom, email, numero_telephone });
        if (error) throw error;
        await tenterCreationCompte('create-secretaire-account', {
          secretaireId: id,
        });
      }
      return;
    }
    case 'seancesEDT': {
      if (action.operation === 'update') {
        const { seanceId, heureOuverture, heureFermeture } = payload as {
          seanceId: string;
          heureOuverture: string | null;
          heureFermeture: string | null;
        };
        const { error } = await supabase.rpc('saisir_heure_manuelle', {
          p_seance_id: seanceId,
          p_heure_ouverture: heureOuverture || null,
          p_heure_fermeture: heureFermeture || null,
        });
        if (error) throw error;
      }
      return;
    }
    // Ouverture/fermeture de séance saisie hors ligne (code d'ouverture ou
    // de fermeture tapé sans réseau) — le code n'est vérifié qu'ici, au
    // moment du rejeu, par la fonction RPC "security definer" côté base
    // (jamais côté client). Si le code s'avère invalide, l'action reste en
    // erreur dans la file (visible dans le bandeau hors ligne) — impossible
    // de la corriger automatiquement, l'enseignant doit retaper le bon code.
    case 'ouvertureFermetureSeance': {
      const { seanceId, code, type } = payload as {
        seanceId: string;
        code: string;
        type: 'ouvrir' | 'fermer';
      };
      const { error } = await supabase.rpc(
        type === 'ouvrir' ? 'ouvrir_seance' : 'fermer_seance',
        { p_seance_id: seanceId, p_code: code }
      );
      if (error) throw new Error(error.message);
      return;
    }
    // Rapport de séance saisi hors ligne (appel, points abordés, niveau et
    // contenu texte) — le "kind" du payload distingue les trois écritures,
    // rejouées indépendamment (l'échec de l'une ne bloque pas les autres,
    // chacune est sa propre entrée de file). L'id du rapport est généré
    // côté client (crypto.randomUUID()) dès le départ — pas besoin
    // d'attendre un aller-retour réseau pour l'obtenir, et pas de
    // réconciliation d'id à faire après coup : le même id sert partout,
    // en ligne comme hors ligne.
    case 'rapportsSeances': {
      const kind = (payload as any).kind as 'rapport' | 'appel' | 'points';
      if (kind === 'rapport') {
        const { rapportId, seanceId, enseignantId, niveau } = payload as {
          rapportId: string;
          seanceId: string;
          enseignantId: string;
          niveau: string;
        };
        const { error } = await supabase.from('rapports_seances').upsert({
          id: rapportId,
          seance_edt_id: seanceId,
          enseignant_id: enseignantId,
          niveau,
        });
        if (error) throw error;
      } else if (kind === 'appel') {
        const { rapportId, presences } = payload as {
          rapportId: string;
          presences: { etudiantId: string; present: boolean }[];
        };
        // upsert (pas insert) + suppression ciblée des seuls étudiants
        // qui ne sont plus dans la liste — idempotent : rejouer deux
        // fois la même action (ex: retry après un souci réseau) ne
        // provoque plus de conflit de clé unique (409), contrairement à
        // l'ancien "delete tout puis insert tout" qui laissait une
        // fenêtre où une exécution concurrente pouvait percuter l'autre.
        if (presences.length > 0) {
          const { error } = await supabase.from('appels_etudiants').upsert(
            presences.map((p) => ({
              rapport_id: rapportId,
              etudiant_id: p.etudiantId,
              present: p.present,
            })),
            { onConflict: 'rapport_id,etudiant_id' }
          );
          if (error) throw error;
          await supabase
            .from('appels_etudiants')
            .delete()
            .eq('rapport_id', rapportId)
            .not(
              'etudiant_id',
              'in',
              `(${presences.map((p) => p.etudiantId).join(',')})`
            );
        } else {
          await supabase
            .from('appels_etudiants')
            .delete()
            .eq('rapport_id', rapportId);
        }
      } else if (kind === 'points') {
        const { rapportId, pointIds } = payload as {
          rapportId: string;
          pointIds: string[];
        };
        if (pointIds.length > 0) {
          const { error } = await supabase
            .from('rapports_points_abordes')
            .upsert(
              pointIds.map((point_cle_id) => ({
                rapport_id: rapportId,
                point_cle_id,
              })),
              { onConflict: 'rapport_id,point_cle_id' }
            );
          if (error) throw error;
          await supabase
            .from('rapports_points_abordes')
            .delete()
            .eq('rapport_id', rapportId)
            .not(
              'point_cle_id',
              'in',
              `(${pointIds.join(',')})`
            );
        } else {
          await supabase
            .from('rapports_points_abordes')
            .delete()
            .eq('rapport_id', rapportId);
        }
      }
      return;
    }
    case 'troncsCommuns': {
      if (action.operation === 'create') {
        const { id, nom, enseignant_id, ue_ids } = payload as {
          id: string;
          nom: string;
          enseignant_id: string | null;
          ue_ids: string[];
        };
        const { error: troncError } = await supabase
          .from('troncs_communs')
          .upsert({ id, nom, enseignant_id });
        if (troncError) throw troncError;

        const { data: liaisonsExistantes } = await supabase
          .from('troncs_communs_ues')
          .select('ue_id')
          .eq('tronc_commun_id', id);
        const dejaLiees = new Set(
          (liaisonsExistantes ?? []).map((l: any) => l.ue_id)
        );
        const aLier = ue_ids.filter((ueId) => !dejaLiees.has(ueId));
        if (aLier.length > 0) {
          const { error: liaisonError } = await supabase
            .from('troncs_communs_ues')
            .insert(
              aLier.map((ue_id) => ({ tronc_commun_id: id, ue_id }))
            );
          if (liaisonError) throw liaisonError;
        }
      }
      return;
    }
    default:
      // Entité pas encore câblée pour le rejeu automatique — laissée en
      // 'pending' volontairement (voir note dans le composant OfflineBanner).
      throw new Error(
        `Rejeu non implémenté pour l'entité "${action.entity}".`
      );
  }
}

// Verrou anti-concurrence : processSyncQueue est appelée depuis
// plusieurs endroits (tâche de fond après chaque enqueueSyncAction,
// synchro périodique, et maintenant explicitement attendue avant
// l'envoi des photos de rapport) — sans ce verrou, deux exécutions en
// parallèle pouvaient traiter LA MÊME action en même temps (ex : deux
// "delete puis insert" sur rapports_points_abordes qui se percutent),
// provoquant un conflit de clé unique (409) qui échoue, reste en
// attente, et se relance indéfiniment à chaque nouvel appel.
let syncEnCours = false;

export async function processSyncQueue(): Promise<{
  traitees: number;
  restantes: number;
}> {
  if (!navigator.onLine) return { traitees: 0, restantes: 0 };
  if (syncEnCours) return { traitees: 0, restantes: 0 };
  syncEnCours = true;

  try {
    // Trié explicitement par id (= ordre de création) — sans ça, rien ne
    // garantit que l'action "rapport" (qui crée la ligne rapports_seances)
    // soit traitée AVANT les actions "appel"/"points" du même rapport, qui
    // en dépendent (clé étrangère rapport_id). where().anyOf() ne garantit
    // aucun ordre particulier.
    const enAttente = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'error'])
      .sortBy('id');

    let traitees = 0;
    for (const action of enAttente) {
      try {
        await db.syncQueue.update(action.id!, { status: 'syncing' });
        await rejouerAction(action);
        await db.syncQueue.update(action.id!, { status: 'done' });
        traitees++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const tentatives = (action.tentatives ?? 0) + 1;
        // Toujours visible en console, même sans ouvrir le composant qui
        // affiche l'erreur — utile pour diagnostiquer sans deviner.
        console.error(
          `[sync] Échec de "${action.entity}" (${action.operation}) — tentative ${tentatives} :`,
          message,
          action.payload
        );
        // Après plusieurs échecs, on arrête de relancer automatiquement
        // cette action — sinon une entrée durablement cassée (ex :
        // rapport orphelin jamais créé côté serveur) martèle le serveur
        // indéfiniment à chaque synchro, sans jamais réussir. L'erreur
        // reste visible (statut "abandonnee"), mais n'est plus rejouée
        // toute seule.
        await db.syncQueue.update(action.id!, {
          status: tentatives >= 5 ? 'abandonnee' : 'error',
          error: message,
          tentatives,
        });
      }
    }

    const restantes = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'error'])
      .count();

    return { traitees, restantes };
  } finally {
    syncEnCours = false;
  }
}

// À appeler une fois à la connexion, puis à chaque retour de réseau.
// Verrouillé : si un appel est déjà en cours (ex: getSession() et
// onAuthStateChange() se déclenchent tous les deux au démarrage), les
// appels suivants attendent le même run au lieu d'en lancer un deuxième
// en parallèle — sans ce verrou, la même action de la file pouvait être
// rejouée deux fois (conflit d'id côté Supabase).
let syncEnVol: Promise<void> | null = null;

export async function synchroniserTout(): Promise<void> {
  if (syncEnVol) return syncEnVol;
  syncEnVol = (async () => {
    await processSyncQueue();
    await syncReferenceData();
  })();
  try {
    await syncEnVol;
  } finally {
    syncEnVol = null;
  }
}

export function demarrerEcouteReseau() {
  window.addEventListener('online', () => {
    synchroniserTout();
  });
}

export { enqueueSyncAction };