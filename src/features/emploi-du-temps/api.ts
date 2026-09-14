// src/features/emploi-du-temps/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import {
  arreterCampagne,
  getDerniereCampagne,
} from '@/features/disponibilites/api';
import { genererCodesPourEmploi } from '@/features/codes-journaliers/api';

// ── Chargement de l'emploi du temps (vierge si nouveau) ────────────
// Nouvelle procédure : on ne génère plus rien automatiquement. Cas A
// (existe déjà) → on charge tel quel. Cas B (n'existe pas) → on arrête la
// collecte de disponibilités en cours (comme avant) et on crée un emploi du
// temps VIERGE, prêt à être rempli créneau par créneau à la main.

export interface EmploiExistant {
  id: string;
  statut: 'genere' | 'en_attente_validation' | 'valide';
}

export async function getEmploiExistant(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant | null> {
  const { data, error } = await supabase
    .from('emplois_du_temps')
    .select('id, statut')
    .eq('specialite_id', specialiteId)
    .eq('semaine', semaine)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function creerOuChargerEDT(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant> {
  const existant = await getEmploiExistant(specialiteId, semaine);
  if (existant) return existant;

  const campagne = await getDerniereCampagne();
  if (campagne && campagne.statut === 'active') {
    await arreterCampagne(campagne.id);
  }

  const { data, error } = await supabase
    .from('emplois_du_temps')
    .insert({ specialite_id: specialiteId, semaine, statut: 'genere' })
    .select('id, statut')
    .single();
  if (error) throw error;
  return data;
}

// ── UEs de la spécialité (pour le choix "quelle UE programmer") ───

export interface OffreDeSpecialite {
  offreId: string;
  ueId: string;
  ueNom: string;
  volumeHoraire: number | null;
  enseignantAttribueId: string | null;
  enseignantAttribueNom: string | null;
}

export async function listOffresDeSpecialite(
  specialiteId: string
): Promise<OffreDeSpecialite[]> {
  const { data: offresData } = await supabase
    .from('offres')
    .select('id, ue:ues(id, nom, volume_horaire)')
    .eq('specialite_id', specialiteId);

  const resultats: OffreDeSpecialite[] = [];
  for (const o of (offresData ?? []) as any[]) {
    const { data: attribution } = await supabase
      .from('attributions')
      .select('enseignant_id, enseignant:enseignants(nom)')
      .eq('offre_id', o.id)
      .eq('statut', 'actif')
      .maybeSingle();

    resultats.push({
      offreId: o.id,
      ueId: o.ue.id,
      ueNom: o.ue.nom,
      volumeHoraire: o.ue.volume_horaire ?? null,
      enseignantAttribueId: attribution?.enseignant_id ?? null,
      enseignantAttribueNom: (attribution as any)?.enseignant?.nom ?? null,
    });
  }
  return resultats;
}

// ── Enseignants disponibles à un créneau donné ──────────────────────
// Basé sur la dernière campagne de disponibilités (peu importe son statut
// actif/arrêtée — les réponses restent valables pour la construction de
// l'EDT).

export interface EnseignantDisponible {
  id: string;
  nom: string;
  matricule: string;
}

export async function getEnseignantsDisponibles(
  jour: string,
  creneau: string
): Promise<EnseignantDisponible[]> {
  const campagne = await getDerniereCampagne();
  if (!campagne) return [];

  const { data, error } = await supabase
    .from('disponibilites')
    .select('enseignant:enseignants(id, nom, matricule)')
    .eq('campagne_id', campagne.id)
    .eq('jour', jour)
    .eq('creneau', creneau)
    .eq('disponible', true);
  if (error) throw error;

  return ((data ?? []) as any[]).map((d) => d.enseignant).filter(Boolean);
}

export async function listTousLesEnseignants(): Promise<
  EnseignantDisponible[]
> {
  const { data, error } = await supabase
    .from('enseignants')
    .select('id, nom, matricule')
    .order('nom');
  if (error) throw error;
  return data ?? [];
}

export async function getSalleParDefautSpecialite(specialiteId: string) {
  const { data } = await supabase
    .from('salles')
    .select('id, code_salle, capacite')
    .eq('specialite_par_defaut_id', specialiteId)
    .maybeSingle();
  return data;
}

export async function listToutesLesSalles() {
  const { data } = await supabase
    .from('salles')
    .select('id, code_salle, capacite')
    .order('code_salle');
  return data ?? [];
}

// ── Détail des séances ──────────────────────────────────────────────

export interface SeanceDetail {
  id: string;
  offreId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  volumeHoraire: number | null;
  semestre: string | null;
  enseignantNom: string;
  salleCode: string | null;
  salleId: string | null;
  jour: string;
  creneau: string;
  statut: 'ok' | 'conflit';
}

export async function getSeances(emploiId: string): Promise<SeanceDetail[]> {
  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, statut, offre_id, tronc_commun_id, salle_id,
      offre:offres(semestre, ue:ues(nom, volume_horaire)),
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom),
      salle:salles(code_salle)
    `
    )
    .eq('emploi_du_temps_id', emploiId);
  if (error) throw error;

  return ((data ?? []) as any[]).map((s) => {
    if (s.tronc_commun) {
      return {
        id: s.id,
        offreId: null,
        troncCommunId: s.tronc_commun_id,
        ueNom: s.tronc_commun.nom,
        volumeHoraire: null,
        semestre: null,
        enseignantNom: s.enseignant?.nom ?? '',
        salleCode: s.salle?.code_salle ?? null,
        salleId: s.salle_id,
        jour: s.jour,
        creneau: s.creneau,
        statut: s.statut,
      };
    }
    return {
      id: s.id,
      offreId: s.offre_id,
      troncCommunId: null,
      ueNom: s.offre?.ue?.nom ?? '',
      volumeHoraire: s.offre?.ue?.volume_horaire ?? null,
      semestre: s.offre?.semestre ?? null,
      enseignantNom: s.enseignant?.nom ?? '',
      salleCode: s.salle?.code_salle ?? null,
      salleId: s.salle_id,
      jour: s.jour,
      creneau: s.creneau,
      statut: s.statut,
    };
  });
}

// Heures déjà effectuées AVANT la semaine donnée (semaines validées
// antérieures) pour chaque offre — sert à afficher "XX/YYh (-ZZh)" dans le
// PDF, comme dans le modèle Cenulape. Une séance = 4h.
export async function getHeuresEffectuees(
  offreIds: string[],
  semaineActuelle: string
): Promise<Map<string, number>> {
  if (offreIds.length === 0) return new Map();

  const { data } = await supabase
    .from('seances_edt')
    .select('offre_id, emploi_du_temps:emplois_du_temps(statut, semaine)')
    .in('offre_id', offreIds);

  const heuresParOffre = new Map<string, number>();
  for (const s of (data ?? []) as any[]) {
    const emploi = s.emploi_du_temps;
    if (emploi?.statut === 'valide' && emploi.semaine < semaineActuelle) {
      heuresParOffre.set(s.offre_id, (heuresParOffre.get(s.offre_id) ?? 0) + 4);
    }
  }
  return heuresParOffre;
}

export async function listSallesLibres(
  jour: string,
  creneau: string,
  emploiId: string
) {
  const { data: sallesData } = await supabase
    .from('salles')
    .select('id, code_salle');
  const { data: occupees } = await supabase
    .from('seances_edt')
    .select('salle_id')
    .eq('emploi_du_temps_id', emploiId)
    .eq('jour', jour)
    .eq('creneau', creneau);
  const idsOccupes = new Set((occupees ?? []).map((o) => o.salle_id));
  return (sallesData ?? []).filter((s) => !idsOccupes.has(s.id));
}

// ── Lecture hors ligne (Palier 1 — consultation) ───────────────────
// Pas d'écriture ici : ouvrir/remplir/supprimer une séance reste
// strictement en ligne (conflits de salle vérifiés en direct, propagation
// aux troncs communs). Ces fonctions ne font que RE-LIRE depuis Dexie ce
// qui a déjà été synchronisé, pour pouvoir au moins consulter un EDT déjà
// généré quand la connexion est coupée.

export async function lireEmploiExistantDepuisCache(
  specialiteId: string,
  semaine: string
): Promise<EmploiExistant | null> {
  const emploi = await db.emploisDuTemps
    .where('specialite_id')
    .equals(specialiteId)
    .and((e: any) => e.semaine === semaine)
    .first();
  return emploi ? { id: (emploi as any).id, statut: (emploi as any).statut } : null;
}

export async function lireSeancesDepuisCache(
  emploiId: string
): Promise<SeanceDetail[]> {
  const [seances, offres, ues, troncsCommuns, enseignants, salles] =
    await Promise.all([
      db.seancesEDT.where('emploi_du_temps_id').equals(emploiId).toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.troncsCommuns.toArray(),
      db.enseignants.toArray(),
      db.salles.toArray(),
    ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));

  return (seances as any[]).map((s) => {
    const salle = s.salle_id ? salleParId.get(s.salle_id) : null;
    const enseignant = s.enseignant_id
      ? enseignantParId.get(s.enseignant_id)
      : null;

    if (s.tronc_commun_id) {
      const tronc = troncCommunParId.get(s.tronc_commun_id);
      return {
        id: s.id,
        offreId: null,
        troncCommunId: s.tronc_commun_id,
        ueNom: tronc?.nom ?? '',
        volumeHoraire: null,
        semestre: null,
        enseignantNom: enseignant?.nom ?? '',
        salleCode: salle?.code_salle ?? null,
        salleId: s.salle_id,
        jour: s.jour,
        creneau: s.creneau,
        statut: s.statut,
      } as SeanceDetail;
    }

    const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
    const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
    return {
      id: s.id,
      offreId: s.offre_id,
      troncCommunId: null,
      ueNom: ue?.nom ?? '',
      volumeHoraire: ue?.volume_horaire ?? null,
      semestre: offre?.semestre ?? null,
      enseignantNom: enseignant?.nom ?? '',
      salleCode: salle?.code_salle ?? null,
      salleId: s.salle_id,
      jour: s.jour,
      creneau: s.creneau,
      statut: s.statut,
    } as SeanceDetail;
  });
}

export async function lireOffresDeSpecialiteDepuisCache(
  specialiteId: string
): Promise<OffreDeSpecialite[]> {
  const [offres, ues, attributions, enseignants] = await Promise.all([
    db.offres.where('specialite_id').equals(specialiteId).toArray(),
    db.ues.toArray(),
    db.attributions.toArray(),
    db.enseignants.toArray(),
  ]);
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));

  return (offres as any[]).map((o) => {
    const ue = ueParId.get(o.ue_id);
    const attribution = (attributions as any[]).find(
      (a) => a.offre_id === o.id && a.statut === 'actif'
    );
    const enseignant = attribution
      ? enseignantParId.get(attribution.enseignant_id)
      : null;
    return {
      offreId: o.id,
      ueId: o.ue_id,
      ueNom: ue?.nom ?? '',
      volumeHoraire: ue?.volume_horaire ?? null,
      enseignantAttribueId: attribution?.enseignant_id ?? null,
      enseignantAttribueNom: enseignant?.nom ?? null,
    } as OffreDeSpecialite;
  });
}

export async function lireEnseignantsDisponiblesDepuisCache(
  jour: string,
  creneau: string
): Promise<EnseignantDisponible[]> {
  const campagnes = await db.campagnesDisponibilite.toArray();
  if (campagnes.length === 0) return [];
  // La plus récente, comme getDerniereCampagne côté réseau.
  const derniere = (campagnes as any[]).sort((a, b) =>
    b.date_lancement.localeCompare(a.date_lancement)
  )[0];

  const [dispos, enseignants] = await Promise.all([
    db.disponibilites
      .where('campagne_id')
      .equals(derniere.id)
      .and((d: any) => d.jour === jour && d.creneau === creneau && d.disponible)
      .toArray(),
    db.enseignants.toArray(),
  ]);
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));

  return (dispos as any[])
    .map((d) => enseignantParId.get(d.enseignant_id))
    .filter(Boolean)
    .map((e: any) => ({ id: e.id, nom: e.nom, matricule: e.matricule }));
}

export async function lireSalleParDefautDepuisCache(specialiteId: string) {
  const salle = await db.salles
    .where('specialite_par_defaut_id')
    .equals(specialiteId)
    .first();
  return salle
    ? {
        id: (salle as any).id,
        code_salle: (salle as any).code_salle,
        capacite: (salle as any).capacite,
      }
    : null;
}

export async function lireToutesLesSallesDepuisCache() {
  const salles = await db.salles.toArray();
  return (salles as any[])
    .map((s) => ({ id: s.id, code_salle: s.code_salle, capacite: s.capacite }))
    .sort((a, b) => a.code_salle.localeCompare(b.code_salle));
}

// ── Assignation manuelle d'une séance (cœur de la nouvelle procédure) ──
// Utilisée aussi bien pour une case vide que pour modifier une case déjà
// remplie. Si l'UE choisie appartient à un tronc commun, la séance est
// automatiquement propagée (créée/mise à jour) dans les emplois du temps
// de TOUTES les spécialités concernées par ce tronc commun — en créant
// leur emploi du temps s'il n'existe pas encore.

interface ParamsAssignation {
  emploiId: string;
  specialiteId: string;
  semaine: string;
  seanceIdExistante?: string | null;
  offreId: string;
  enseignantId: string;
  salleId: string | null;
  jour: string;
  creneau: string;
}

async function propagerVersGroupe(
  troncCommunId: string,
  semaine: string,
  jour: string,
  creneau: string,
  salleId: string | null,
  enseignantId: string
) {
  const { data: toutesLesUEsDuGroupe } = await supabase
    .from('troncs_communs_ues')
    .select('ue:ues(offres(specialite_id))')
    .eq('tronc_commun_id', troncCommunId);

  const specialitesDuGroupe = new Set<string>();
  for (const l of (toutesLesUEsDuGroupe ?? []) as any[]) {
    for (const o of l.ue?.offres ?? [])
      specialitesDuGroupe.add(o.specialite_id);
  }

  for (const specialiteId of specialitesDuGroupe) {
    let { data: emploi } = await supabase
      .from('emplois_du_temps')
      .select('id')
      .eq('specialite_id', specialiteId)
      .eq('semaine', semaine)
      .maybeSingle();

    if (!emploi) {
      const { data: nouvelEmploi, error } = await supabase
        .from('emplois_du_temps')
        .insert({ specialite_id: specialiteId, semaine, statut: 'genere' })
        .select('id')
        .single();
      if (error) throw error;
      emploi = nouvelEmploi;
    }

    const { data: seanceExistante } = await supabase
      .from('seances_edt')
      .select('id')
      .eq('emploi_du_temps_id', emploi.id)
      .eq('tronc_commun_id', troncCommunId)
      .eq('jour', jour)
      .eq('creneau', creneau)
      .maybeSingle();

    if (seanceExistante) {
      await supabase
        .from('seances_edt')
        .update({
          jour,
          creneau,
          salle_id: salleId,
          enseignant_id: enseignantId,
          statut: 'ok',
        })
        .eq('id', seanceExistante.id);
    } else {
      await supabase.from('seances_edt').insert({
        emploi_du_temps_id: emploi.id,
        tronc_commun_id: troncCommunId,
        enseignant_id: enseignantId,
        salle_id: salleId,
        jour,
        creneau,
        statut: 'ok',
      });
    }
  }
}

export async function assignerSeance(params: ParamsAssignation) {
  const {
    emploiId,
    specialiteId,
    semaine,
    seanceIdExistante,
    offreId,
    enseignantId,
    salleId,
    jour,
    creneau,
  } = params;

  const { data: offre, error: offreError } = await supabase
    .from('offres')
    .select('ue_id')
    .eq('id', offreId)
    .single();
  if (offreError || !offre) throw offreError ?? new Error('Offre introuvable.');
  const { data: lienTronc } = await supabase
    .from('troncs_communs_ues')
    .select('tronc_commun_id')
    .eq('ue_id', offre.ue_id)
    .maybeSingle();

  if (lienTronc) {
    await propagerVersGroupe(
      lienTronc.tronc_commun_id,
      semaine,
      jour,
      creneau,
      salleId,
      enseignantId
    );
    // Si on modifiait une ancienne séance "simple" (offre_id) sur cette
    // case et qu'elle devient une séance de groupe, on supprime l'ancienne
    // pour ne pas dupliquer la case.
    if (seanceIdExistante) {
      await supabase
        .from('seances_edt')
        .delete()
        .eq('id', seanceIdExistante)
        .is('tronc_commun_id', null);
    }
    return;
  }

  // Cas simple (pas de tronc commun)
  let statut: 'ok' | 'conflit' = 'ok';
  if (!salleId) {
    statut = 'conflit';
  } else {
    const { data: occupees } = await supabase
      .from('seances_edt')
      .select('id, salle_id')
      .eq('emploi_du_temps_id', emploiId)
      .eq('jour', jour)
      .eq('creneau', creneau)
      .eq('salle_id', salleId);
    const conflit = (occupees ?? []).some((o) => o.id !== seanceIdExistante);
    if (conflit) statut = 'conflit';
  }

  if (seanceIdExistante) {
    const { error } = await supabase
      .from('seances_edt')
      .update({
        offre_id: offreId,
        tronc_commun_id: null,
        enseignant_id: enseignantId,
        salle_id: salleId,
        statut,
      })
      .eq('id', seanceIdExistante);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('seances_edt').insert({
      emploi_du_temps_id: emploiId,
      offre_id: offreId,
      enseignant_id: enseignantId,
      salle_id: salleId,
      jour,
      creneau,
      statut,
    });
    if (error) throw error;
  }
  void specialiteId;
}

export async function supprimerSeance(seanceId: string) {
  const { error } = await supabase
    .from('seances_edt')
    .delete()
    .eq('id', seanceId);
  if (error) throw error;
}

// ── Scénario 6 — Validation et publication ────────────────────────

export async function uploaderDocumentSigne(
  emploiId: string,
  fichier: File
): Promise<string> {
  const extension = fichier.name.split('.').pop() ?? 'pdf';
  const chemin = `${emploiId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('documents-edt')
    .upload(chemin, fichier, {
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('documents-edt').getPublicUrl(chemin);
  const url = data.publicUrl;

  const { error } = await supabase
    .from('emplois_du_temps')
    .update({ pdf_signe_url: url })
    .eq('id', emploiId);
  if (error) throw error;

  return url;
}

// Valide l'emploi du temps (statut → 'valide', verrouillé) et notifie
// chaque enseignant concerné avec SES SEULS cours (jour, créneau, salle) —
// journal.md Scénario 6, étapes 7-8. Le rappel automatique la veille de
// chaque cours nécessite une tâche planifiée, pas encore en place.
export async function validerEDT(emploiId: string) {
  const { data: emploi } = await supabase
    .from('emplois_du_temps')
    .select('pdf_signe_url')
    .eq('id', emploiId)
    .maybeSingle();
  if (!emploi?.pdf_signe_url) {
    throw new Error('Le document signé doit être téléversé avant validation.');
  }

  const { error } = await supabase
    .from('emplois_du_temps')
    .update({ statut: 'valide' })
    .eq('id', emploiId);
  if (error) throw error;

  // Scénario 7 — génération automatique des codes d'ouverture/fermeture
  // pour toute la semaine qui vient d'être validée.
  await genererCodesPourEmploi(emploiId);

  const seances = await getSeances(emploiId);
  const { data: seancesData } = await supabase
    .from('seances_edt')
    .select(
      'enseignant_id, jour, creneau, offre:offres(ue:ues(nom)), salle:salles(code_salle)'
    )
    .eq('emploi_du_temps_id', emploiId);

  const parEnseignant = new Map<string, string[]>();
  for (const s of (seancesData ?? []) as any[]) {
    const ligne = `${s.offre?.ue?.nom ?? 'Cours'} — ${s.jour} ${s.creneau} — ${
      s.salle?.code_salle ?? 'salle à confirmer'
    }`;
    const liste = parEnseignant.get(s.enseignant_id) ?? [];
    liste.push(ligne);
    parEnseignant.set(s.enseignant_id, liste);
  }

  const enseignantIds = Array.from(parEnseignant.keys());
  if (enseignantIds.length === 0) return;

  const { data: enseignantsData } = await supabase
    .from('enseignants')
    .select('id, matricule')
    .in('id', enseignantIds);
  const matricules = (enseignantsData ?? []).map((e) => e.matricule);
  const { data: comptesData } = await supabase
    .from('comptes_utilisateurs')
    .select('id, matricule')
    .in('matricule', matricules);
  const enseignantParMatricule = new Map(
    (enseignantsData ?? []).map((e) => [e.matricule, e.id])
  );

  if (comptesData) {
    await supabase.from('notifications').insert(
      comptesData.map((c) => {
        const enseignantId = enseignantParMatricule.get(c.matricule);
        const cours = parEnseignant.get(enseignantId ?? '') ?? [];
        return {
          compte_id: c.id,
          titre: 'Emploi du temps publié',
          message: `Tes cours de la semaine : ${cours.join(' · ')}`,
          lien: '/mes-cours',
        };
      })
    );
  }

  return seances;
}

// ── "Mes cours" (enseignant) ───────────────────────────────────────

export interface MonCours {
  id: string;
  ueId: string | null;
  syllabusKey: string | null;
  attributionId: string | null;
  ueNom: string;
  jour: string;
  creneau: string;
  salleCode: string | null;
  semaine: string;
  pdfSigneUrl: string | null;
}

// Reconstruit "mes cours" depuis les tables Dexie brutes (pas de jointure
// côté cache local, contrairement à Supabase) — utilisée par MesCoursPage
// et par le tableau de bord enseignant.
export async function lireMesCoursDepuisCache(
  matricule: string
): Promise<MonCours[]> {
  const enseignant = await db.enseignants
    .where('matricule')
    .equals(matricule)
    .first();
  if (!enseignant) return [];

  const [seances, offres, ues, salles, emplois, troncsCommuns, attributions] =
    await Promise.all([
      db.seancesEDT.where('enseignant_id').equals(enseignant.id).toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.salles.toArray(),
      db.emploisDuTemps.toArray(),
      db.troncsCommuns.toArray(),
      db.attributions
        .where('enseignant_id')
        .equals(enseignant.id)
        .and((a: any) => a.statut === 'actif')
        .toArray(),
    ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));
  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const attributionParOffre = new Map(
    (attributions as any[]).map((a) => [a.offre_id, a.id])
  );

  return (seances as any[])
    .map((s) => {
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      if (!emploi || emploi.statut !== 'valide') return null;
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const salle = s.salle_id ? salleParId.get(s.salle_id) : null;
      return {
        id: s.id,
        ueId: ue?.id ?? null,
        syllabusKey: ue?.syllabus_key ?? null,
        attributionId: s.offre_id
          ? (attributionParOffre.get(s.offre_id) ?? null)
          : null,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '(tronc commun)',
        jour: s.jour,
        creneau: s.creneau,
        salleCode: salle?.code_salle ?? null,
        semaine: emploi.semaine,
        pdfSigneUrl: emploi.pdf_signe_url ?? null,
      } as MonCours;
    })
    .filter((c): c is MonCours => c !== null)
    .sort((a, b) => a.semaine.localeCompare(b.semaine));
}

export async function listMesCours(matricule: string): Promise<MonCours[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, offre_id,
      offre:offres(ue:ues(id, nom, syllabus_key)),
      salle:salles(code_salle),
      emploi_du_temps:emplois_du_temps(semaine, statut, pdf_signe_url)
    `
    )
    .eq('enseignant_id', enseignant.id);
  if (error) throw error;

  // Attribution active de cet enseignant, par offre — nécessaire pour
  // retrouver l'espace "support de cours" de chaque UE (Scénario 12).
  const { data: attributions } = await supabase
    .from('attributions')
    .select('id, offre_id')
    .eq('enseignant_id', enseignant.id)
    .eq('statut', 'actif');
  const attributionParOffre = new Map(
    (attributions ?? []).map((a) => [a.offre_id, a.id])
  );

  return ((data ?? []) as any[])
    .filter((s) => s.emploi_du_temps?.statut === 'valide')
    .map((s) => ({
      id: s.id,
      ueId: s.offre?.ue?.id ?? null,
      syllabusKey: s.offre?.ue?.syllabus_key ?? null,
      attributionId: s.offre_id
        ? (attributionParOffre.get(s.offre_id) ?? null)
        : null,
      ueNom: s.offre?.ue?.nom ?? '(tronc commun)',
      jour: s.jour,
      creneau: s.creneau,
      salleCode: s.salle?.code_salle ?? null,
      semaine: s.emploi_du_temps.semaine,
      pdfSigneUrl: s.emploi_du_temps.pdf_signe_url,
    }))
    .sort((a, b) => a.semaine.localeCompare(b.semaine));
}