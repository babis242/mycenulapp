import Dexie, { type EntityTable } from 'dexie';
import type {
  Ecole,
  Filiere,
  Specialite,
  UE,
  Offre,
  Enseignant,
  Responsable,
  Secretaire,
  Salle,
  Attribution,
  CampagneDisponibilite,
  DisponibiliteEnseignant,
  EmploiDuTemps,
  SeanceEDT,
  CodeSeance,
  SyncAction,
} from '@/types';

// Base locale IndexedDB (Dexie) — miroir hors ligne du schéma Supabase/Postgres.
// Pas de sync native façon Firebase → on gère nous-mêmes une file d'actions
// (SyncAction) rejouée vers Supabase dès que la connexion revient.
class AppDatabase extends Dexie {
  ecoles!: EntityTable<Ecole, 'id'>;
  filieres!: EntityTable<Filiere, 'id'>;
  specialites!: EntityTable<Specialite, 'id'>;
  ues!: EntityTable<UE, 'id'>;
  offres!: EntityTable<Offre, 'id'>;
  enseignants!: EntityTable<Enseignant, 'id'>;
  responsables!: EntityTable<Responsable, 'id'>;
  secretaires!: EntityTable<Secretaire, 'id'>;
  salles!: EntityTable<Salle, 'id'>;
  attributions!: EntityTable<Attribution, 'id'>;
  campagnesDisponibilite!: EntityTable<CampagneDisponibilite, 'id'>;
  disponibilites!: EntityTable<DisponibiliteEnseignant, 'id'>;
  emploisDuTemps!: EntityTable<EmploiDuTemps, 'id'>;
  seancesEDT!: EntityTable<SeanceEDT, 'id'>;
  codesSeance!: EntityTable<CodeSeance, 'id'>;
  troncsCommuns!: EntityTable<any, 'id'>;
  troncsCommunsUes!: EntityTable<any, 'id'>;
  campagneEnseignants!: EntityTable<any, 'id'>;
  etudiants!: EntityTable<any, 'id'>;
  creneaux!: EntityTable<any, 'code'>;
  syncQueue!: EntityTable<SyncAction, 'id'>;

  constructor() {
    super('gestion-pedagogique-db');

    this.version(1).stores({
      ecoles: 'id, nom',
      filieres: 'id, nom, ecole_id',
      specialites: 'id, nom, filiere_id, cycle, type_cursus',
      ues: 'id, nom, code, tronc_commun',
      offres: 'id, ue_id, specialite_id, semestre',
      enseignants: 'id, matricule, nom, email, statut',
      responsables: 'id, matricule, nom, email, statut',
      secretaires: 'id, matricule, nom, email, statut',
      salles: 'id, code_salle, specialite_par_defaut_id',
      attributions: 'id, offre_id, enseignant_id, statut',
      campagnesDisponibilite: 'id, statut, date_lancement',
      disponibilites: 'id, campagne_id, enseignant_id, jour, creneau',
      emploisDuTemps: 'id, specialite_id, semaine, statut',
      seancesEDT:
        'id, emploi_du_temps_id, offre_id, groupe_jumelage_id, enseignant_id, salle_id, statut',
      codesSeance: 'id, seance_edt_id, jour, creneau',
      syncQueue: '++id, entity, createdAt, status',
    });

    // v2 — ajout des troncs communs (manquaient : les séances de tronc
    // commun ne pouvaient pas afficher leur nom d'UE hors ligne).
    this.version(2).stores({
      troncsCommuns: 'id, nom, enseignant_id',
      troncsCommunsUes: '++localId, tronc_commun_id, ue_id',
    });

    // v3 — liaison campagne ↔ enseignant (manquait : impossible de
    // retrouver la campagne de disponibilités active d'un enseignant hors
    // ligne).
    this.version(3).stores({
      campagneEnseignants: '++localId, campagne_id, enseignant_id',
    });

    // v4 — étudiants (Scénario 11).
    this.version(4).stores({
      etudiants: 'id, matricule, specialite_id, niveau',
    });

    // v5 — les étudiants sont rattachés à un semestre précis plutôt qu'à
    // un niveau dérivé (plus fin : un niveau regroupe 2 semestres) —
    // suppression des semestres combinés (S3&4, S5&6). L'ancien index
    // "niveau" disparaît, remplacé par "semestre" ; Dexie garde les
    // anciennes données déjà en cache, elles seront simplement
    // remplacées à la prochaine synchronisation complète.
    this.version(5).stores({
      etudiants: 'id, matricule, specialite_id, semestre',
    });

    // v6 — créneaux configurables (Référentiel → Créneaux), remplace les
    // deux créneaux officiels figés en dur par une vraie table, éditable
    // et synchronisée comme les autres données de référence.
    this.version(6).stores({
      creneaux: 'code, ordre',
    });
  }
}

export const db = new AppDatabase();

export async function enqueueSyncAction(
  action: Omit<SyncAction, 'id' | 'createdAt' | 'status'>
) {
  return db.syncQueue.add({
    ...action,
    createdAt: new Date().toISOString(),
    status: 'pending',
  } as SyncAction);
}