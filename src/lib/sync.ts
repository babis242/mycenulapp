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

// Descend chaque table de référence de Supabase vers Dexie. Chaque table
// est isolée dans son propre try/catch : si une table échoue (droit RLS
// refusé pour ce rôle, par exemple — un enseignant n'a pas accès à
// codes_seances), les autres continuent d'être synchronisées normalement.
export async function syncReferenceData(): Promise<void> {
  if (!navigator.onLine) return;
  notifier('syncing');
  let uneErreur = false;

  for (const [tableDexie, tableSupabase] of Object.entries(
    TABLES_A_SYNCHRONISER
  )) {
    try {
      const { data, error } = await supabase.from(tableSupabase).select('*');
      if (error) throw error;
      if (!data) continue;

      const table = (db as any)[tableDexie];
      if (!table) continue;

      await db.transaction('rw', table, async () => {
        await table.clear();
        if (data.length > 0) await table.bulkPut(data);
      });
    } catch {
      // Une table indisponible pour ce rôle (RLS) ou hors ligne ne doit
      // pas bloquer la synchronisation des autres.
      uneErreur = true;
    }
  }

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
        const {
          id,
          nom,
          code,
          volume_horaire,
          coefficient,
          specialite_id,
          semestre,
        } = payload as {
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
        const { id, nom, email, numero_telephone, specialiteIds } = payload as {
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
            .insert(aLier.map((ue_id) => ({ tronc_commun_id: id, ue_id })));
          if (liaisonError) throw liaisonError;
        }
      }
      return;
    }
    default:
      // Entité pas encore câblée pour le rejeu automatique — laissée en
      // 'pending' volontairement (voir note dans le composant OfflineBanner).
      throw new Error(`Rejeu non implémenté pour l'entité "${action.entity}".`);
  }
}

export async function processSyncQueue(): Promise<{
  traitees: number;
  restantes: number;
}> {
  if (!navigator.onLine) return { traitees: 0, restantes: 0 };

  const enAttente = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'error'])
    .toArray();

  let traitees = 0;
  for (const action of enAttente) {
    try {
      await db.syncQueue.update(action.id!, { status: 'syncing' });
      await rejouerAction(action);
      await db.syncQueue.update(action.id!, { status: 'done' });
      traitees++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Toujours visible en console, même sans ouvrir le composant qui
      // affiche l'erreur — utile pour diagnostiquer sans deviner.
      console.error(
        `[sync] Échec de "${action.entity}" (${action.operation}) :`,
        message,
        action.payload
      );
      await db.syncQueue.update(action.id!, {
        status: 'error',
        error: message,
      });
    }
  }

  const restantes = await db.syncQueue
    .where('status')
    .anyOf(['pending', 'error'])
    .count();

  return { traitees, restantes };
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
