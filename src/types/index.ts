export type Role =
  | 'administrateur'
  | 'responsable'
  | 'secretaire'
  | 'enseignant';

export type Cycle = 'BTS' | 'Licence' | 'Master' | 'HND' | 'Bachelor';
export type TypeCursus = 'standard' | 'sante_culinaire';
export type Semestre = 'S1' | 'S2' | 'S3&4' | 'S3' | 'S4' | 'S5&6';
export type Jour =
  | 'Lundi'
  | 'Mardi'
  | 'Mercredi'
  | 'Jeudi'
  | 'Vendredi'
  | 'Samedi';
export type Creneau = '08h-12h' | '14h-17h';
export type StatutCompte = 'actif' | 'inactif';

// 1. Référentiel académique
export interface Ecole {
  id: string;
  nom: string;
}

export interface Filiere {
  id: string;
  nom: string;
  ecole_id: string;
}

export interface Specialite {
  id: string;
  nom: string;
  filiere_id: string;
  cycle: Cycle;
  type_cursus: TypeCursus;
}

export interface UE {
  id: string;
  nom: string;
  code?: string;
  volume_horaire?: number;
  coefficient?: number;
  tronc_commun: boolean;
}

export interface Offre {
  id: string;
  ue_id: string;
  specialite_id: string;
  semestre: Semestre;
}

// 2. Utilisateurs & personnel
export interface Enseignant {
  id: string;
  matricule: string;
  nom: string;
  email: string;
  numero_whatsapp?: string;
  numero_cellulaire?: string;
  statut: StatutCompte;
  date_creation: string;
}

export interface Responsable {
  id: string;
  matricule: string;
  nom: string;
  email: string;
  numero_telephone?: string;
  statut: StatutCompte;
  date_creation: string;
}

export interface Secretaire {
  id: string;
  matricule: string;
  nom: string;
  email: string;
  numero_telephone?: string;
  statut: StatutCompte;
  date_creation: string;
}

export interface ResponsableSpecialite {
  responsable_id: string;
  specialite_id: string;
}

// 3. Salles
export interface Salle {
  id: string;
  code_salle: string;
  capacite: number;
  specialite_par_defaut_id: string;
  date_creation: string;
}

// 4. Attribution
export type StatutAttribution = 'actif' | 'reattribue';

export interface Attribution {
  id: string;
  offre_id: string;
  enseignant_id: string;
  date_attribution: string;
  statut: StatutAttribution;
}

// 5. Disponibilités
export type StatutCampagne = 'active' | 'arretee';

export interface CampagneDisponibilite {
  id: string;
  date_lancement: string;
  statut: StatutCampagne;
  lance_par: string;
}

export interface DisponibiliteEnseignant {
  id: string;
  campagne_id: string;
  enseignant_id: string;
  jour: Jour;
  creneau: Creneau;
  disponible: boolean;
  date_saisie: string;
}

// 6. Emploi du temps
export type StatutEDT = 'genere' | 'en_attente_validation' | 'valide';
export type StatutSeance = 'ok' | 'conflit';
export type ModeOuvertureFermeture = 'code' | 'manuel';

export interface EmploiDuTemps {
  id: string;
  specialite_id: string;
  semaine: string;
  statut: StatutEDT;
  pdf_signe_url?: string;
}

export interface JumelageUE {
  id: string;
  nom: string;
  liste_ue_ids: string[];
  enseignant_id: string;
}

export interface SeanceEDT {
  id: string;
  emploi_du_temps_id: string;
  offre_id?: string;
  groupe_jumelage_id?: string;
  enseignant_id: string;
  salle_id: string;
  jour: Jour;
  creneau: Creneau;
  statut: StatutSeance;
  heure_ouverture?: string;
  heure_fermeture?: string;
  mode_ouverture?: ModeOuvertureFermeture;
  mode_fermeture?: ModeOuvertureFermeture;
  duree_calculee?: number;
}

// 7. Codes journaliers
export interface CodeSeance {
  id: string;
  seance_edt_id: string;
  code_ouverture: string;
  code_fermeture: string;
  jour: Jour;
  creneau: Creneau;
  statut: 'utilise' | 'non_utilise';
}

// Synchronisation offline (Dexie → Supabase)
export type SyncEntity =
  | 'ues'
  | 'offres'
  | 'enseignants'
  | 'responsables'
  | 'secretaires'
  | 'salles'
  | 'attributions'
  | 'disponibilites'
  | 'emploisDuTemps'
  | 'seancesEDT'
  | 'troncsCommuns';

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'error' | 'done';

export interface SyncAction {
  id?: number;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: unknown;
  createdAt: string;
  status: SyncStatus;
  error?: string;
}

// Utilisateur authentifié (session)
export interface AuthUser {
  id: string;
  matricule: string;
  nom: string;
  email: string;
  role: Role;
  perimetre_specialite_ids?: string[];
}
