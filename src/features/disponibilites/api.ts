// src/features/disponibilites/api.ts
import { supabase } from '@/lib/supabase';
import { getHeuresTotalesValideesParOffre } from '@/features/emploi-du-temps/api';

// ── Date limite de la collecte : mercredi 17h (heure du Cameroun, UTC+1) ──
// Calculée à partir de la date de lancement (aucune colonne en base) : le
// premier mercredi 17h qui suit le lancement (le jour même si lancée un
// mercredi avant 17h).
export function dateLimiteCampagne(dateLancement: string): Date {
  const DECALAGE = 60 * 60 * 1000; // UTC+1
  const local = new Date(new Date(dateLancement).getTime() + DECALAGE);
  const limite = new Date(local);
  limite.setUTCHours(17, 0, 0, 0);
  let jours = (3 - local.getUTCDay() + 7) % 7;
  if (jours === 0 && local.getTime() >= limite.getTime()) jours = 7;
  limite.setUTCDate(limite.getUTCDate() + jours);
  return new Date(limite.getTime() - DECALAGE);
}

export function campagneExpiree(dateLancement: string): boolean {
  return Date.now() >= dateLimiteCampagne(dateLancement).getTime();
}

export function libelleDateLimite(estHND: boolean): string {
  return estHND ? 'Wednesday 5 PM' : 'mercredi 17h';
}

// Enseignants (ids) ayant au moins une attribution active sur une
// spécialité du cycle HND — pour envoyer les messages en anglais.
export async function getEnseignantsHND(
  enseignantIds: string[]
): Promise<Set<string>> {
  const resultat = new Set<string>();
  if (enseignantIds.length === 0) return resultat;
  for (let i = 0; i < enseignantIds.length; i += 80) {
    const lot = enseignantIds.slice(i, i + 80);
    const { data: attrs } = await supabase
      .from('attributions')
      .select('enseignant_id, offre_id')
      .in('enseignant_id', lot)
      .eq('statut', 'actif');
    const offreIds = Array.from(new Set((attrs ?? []).map((a) => a.offre_id)));
    if (offreIds.length === 0) continue;
    const { data: offres } = await supabase
      .from('offres')
      .select('id, specialite_id')
      .in('id', offreIds);
    const specIds = Array.from(
      new Set((offres ?? []).map((o) => o.specialite_id))
    );
    const { data: specs } = await supabase
      .from('specialites')
      .select('id, cycle')
      .in('id', specIds);
    const hnd = new Set(
      (specs ?? [])
        .filter((sp) => String(sp.cycle).toUpperCase() === 'HND')
        .map((sp) => sp.id)
    );
    const offreHnd = new Set(
      (offres ?? []).filter((o) => hnd.has(o.specialite_id)).map((o) => o.id)
    );
    for (const a of attrs ?? []) {
      if (offreHnd.has(a.offre_id)) resultat.add(a.enseignant_id);
    }
  }
  return resultat;
}

export interface UEPourCampagne {
  ueId: string;
  ueNom: string;
  offreId: string;
  specialiteNom: string;
  semestre: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  troncCommunNom: string | null;
  volumeHoraire: number | null;
  // Heures déjà validées (réellement effectuées, cf. calculHeures.ts) sur
  // l'ensemble des semaines déjà programmées pour cette UE — null tant
  // que le volume horaire de l'UE n'est pas renseigné (impossible de
  // savoir si elle est achevée).
  heuresEffectuees: number;
  // true si heuresEffectuees >= volumeHoraire (UE achevée, plus besoin
  // de redemander les disponibilités des enseignants dessus).
  estTerminee: boolean;
}

// Liste les UEs offertes pour un ensemble de (spécialité, semestre), avec
// l'enseignant actuellement attribué. Note : le "quota horaire restant"
// (heures totales - heures déjà effectuées) et la pré-sélection automatique
// des UEs non achevées (Scénario 4) nécessitent les données de séances, pas
// encore disponibles (Scénario 5/9) — à ajouter plus tard.
//
// AVANT : une requête "offres" par paire (spécialité, semestre), PUIS deux
// requêtes ("attributions" + "troncs_communs_ues") par offre trouvée, PUIS
// une requête "tronc" + une requête "liaisons groupe" + une requête
// "attribution" par UE sœur de tronc commun — pour une campagne portant sur
// une quinzaine de spécialités, ça faisait facilement 300+ requêtes
// séquentielles, chacune attendant la précédente.
// MAINTENANT : chaque étape est une seule requête groupée (.in(...)) sur
// l'ensemble des identifiants concernés — 5 requêtes au total, peu importe
// le nombre de spécialités/semestres demandés.
export async function listUEsPourCampagne(
  paires: { specialiteId: string; semestre: string }[]
): Promise<UEPourCampagne[]> {
  if (paires.length === 0) return [];

  // 1) Toutes les offres des spécialités concernées, en une requête —
  // puis on filtre en mémoire sur les paires (spécialité, semestre)
  // exactes demandées (une même spécialité peut apparaître avec des
  // semestres différents selon l'appelant).
  const specialiteIds = Array.from(new Set(paires.map((p) => p.specialiteId)));
  const clesPaires = new Set(
    paires.map((p) => `${p.specialiteId}|${p.semestre}`)
  );
  const { data: offresBrutes, error: offresError } = await supabase
    .from('offres')
    .select(
      'id, semestre, specialite_id, ue:ues(id, nom, volume_horaire), specialite:specialites(nom)'
    )
    .in('specialite_id', specialiteIds);
  if (offresError) throw offresError;

  const offresRetenues = ((offresBrutes ?? []) as any[]).filter((o) =>
    clesPaires.has(`${o.specialite_id}|${o.semestre}`)
  );
  if (offresRetenues.length === 0) return [];

  const offreIds = offresRetenues.map((o) => o.id);
  const ueIds = Array.from(new Set(offresRetenues.map((o) => o.ue.id)));

  // 2) Toutes les attributions actives des offres retenues, en une
  // requête (au lieu d'une par offre).
  const { data: attributionsData, error: attribError } = await supabase
    .from('attributions')
    .select('offre_id, enseignant_id, enseignant:enseignants(nom)')
    .in('offre_id', offreIds)
    .eq('statut', 'actif');
  if (attribError) throw attribError;
  const attributionParOffre = new Map(
    (attributionsData ?? []).map((a: any) => [a.offre_id, a])
  );

  // 3) Tous les liens tronc commun des UEs retenues, en une requête (au
  // lieu d'une par UE).
  const { data: liensTronc, error: liensError } = await supabase
    .from('troncs_communs_ues')
    .select('ue_id, tronc_commun_id, tronc_commun:troncs_communs(nom)')
    .in('ue_id', ueIds);
  if (liensError) throw liensError;
  const troncParUe = new Map(
    (liensTronc ?? []).map((l: any) => [l.ue_id, l])
  );

  const vues = new Map<string, UEPourCampagne>();
  for (const o of offresRetenues) {
    const attribution = attributionParOffre.get(o.id);
    const lienTronc = troncParUe.get(o.ue.id);
    vues.set(o.id, {
      ueId: o.ue.id,
      ueNom: o.ue.nom,
      offreId: o.id,
      specialiteNom: o.specialite.nom,
      semestre: o.semestre,
      enseignantId: attribution?.enseignant_id ?? null,
      enseignantNom: (attribution as any)?.enseignant?.nom ?? null,
      troncCommunNom: lienTronc?.tronc_commun?.nom ?? null,
      volumeHoraire: o.ue.volume_horaire ?? null,
      heuresEffectuees: 0, // calculé plus bas, une fois tous les offreIds connus
      estTerminee: false,
    });
  }

  // 4) Auto-inclusion des UEs sœurs d'un tronc commun : si l'une des UEs
  // trouvées appartient à un groupe, les autres UEs du même groupe sont
  // concernées elles aussi, même si leur spécialité/semestre n'a pas été
  // ajouté explicitement par l'admin. Une seule requête pour TOUS les
  // troncs concernés à la fois (au lieu d'une par tronc + une par UE
  // sœur).
  const idsDejaVus = new Set(Array.from(vues.values()).map((r) => r.ueId));
  const troncIdsConcernes = Array.from(
    new Set(
      Array.from(vues.values())
        .map((r) => troncParUe.get(r.ueId)?.tronc_commun_id)
        .filter((id): id is string => !!id)
    )
  );

  if (troncIdsConcernes.length > 0) {
    const { data: liaisonsGroupe, error: groupeError } = await supabase
      .from('troncs_communs_ues')
      .select(
        `
        tronc_commun_id,
        tronc_commun:troncs_communs(nom),
        ue:ues(
          id, nom, volume_horaire,
          offres(id, semestre, specialite_id, specialite:specialites(nom))
        )
      `
      )
      .in('tronc_commun_id', troncIdsConcernes);
    if (groupeError) throw groupeError;

    const nouvellesLignes: {
      ueId: string;
      ueNom: string;
      offreId: string;
      specialiteNom: string;
      semestre: string;
      troncCommunNom: string | null;
      volumeHoraire: number | null;
    }[] = [];
    for (const l of (liaisonsGroupe ?? []) as any[]) {
      const ue = l.ue;
      const offre = ue?.offres?.[0];
      if (!ue || !offre || idsDejaVus.has(ue.id)) continue;
      idsDejaVus.add(ue.id);
      nouvellesLignes.push({
        ueId: ue.id,
        ueNom: ue.nom,
        offreId: offre.id,
        specialiteNom: offre.specialite?.nom ?? '',
        semestre: offre.semestre,
        troncCommunNom: l.tronc_commun?.nom ?? null,
        volumeHoraire: ue.volume_horaire ?? null,
      });
    }

    if (nouvellesLignes.length > 0) {
      // Attributions des UEs sœurs nouvellement incluses — une seule
      // requête pour toutes, au lieu d'une par UE sœur.
      const { data: attributionsSoeurs, error: attribSoeursError } =
        await supabase
          .from('attributions')
          .select('offre_id, enseignant_id, enseignant:enseignants(nom)')
          .in(
            'offre_id',
            nouvellesLignes.map((l) => l.offreId)
          )
          .eq('statut', 'actif');
      if (attribSoeursError) throw attribSoeursError;
      const attributionParOffreSoeur = new Map(
        (attributionsSoeurs ?? []).map((a: any) => [a.offre_id, a])
      );

      for (const l of nouvellesLignes) {
        const attribution = attributionParOffreSoeur.get(l.offreId);
        vues.set(l.offreId, {
          ueId: l.ueId,
          ueNom: l.ueNom,
          offreId: l.offreId,
          specialiteNom: l.specialiteNom,
          semestre: l.semestre,
          enseignantId: attribution?.enseignant_id ?? null,
          enseignantNom: (attribution as any)?.enseignant?.nom ?? null,
          troncCommunNom: l.troncCommunNom,
          volumeHoraire: l.volumeHoraire,
          heuresEffectuees: 0,
          estTerminee: false,
        });
      }
    }
  }

  // Heures déjà validées (réellement effectuées, toutes semaines déjà
  // programmées confondues) par offre — une seule requête groupée pour
  // toutes les UEs de la sélection, réutilisant exactement la même
  // logique que le PDF de la page Validation (calculHeures.ts), pour
  // qu'une UE soit considérée "achevée" ici de la même façon que sur
  // le PDF (pas de double définition qui pourrait diverger).
  const tousLesOffreIds = Array.from(vues.values()).map((v) => v.offreId);
  const heuresParOffre = await getHeuresTotalesValideesParOffre(
    tousLesOffreIds
  );
  for (const v of vues.values()) {
    const heures = heuresParOffre.get(v.offreId) ?? 0;
    v.heuresEffectuees = heures;
    v.estTerminee = v.volumeHoraire != null && heures >= v.volumeHoraire;
  }

  return Array.from(vues.values());
}

export async function lancerCampagne(
  ueIds: string[]
): Promise<{ id: string; nbEnseignants: number }> {
  // Récupère les offres correspondant aux UEs cochées, puis les enseignants
  // actuellement attribués à ces offres.
  const { data: offresData } = await supabase
    .from('offres')
    .select('id, ue_id')
    .in('ue_id', ueIds);
  const offreIds = (offresData ?? []).map((o) => o.id);

  const { data: attributionsData } = await supabase
    .from('attributions')
    .select('enseignant_id')
    .in('offre_id', offreIds)
    .eq('statut', 'actif');

  const enseignantIds = Array.from(
    new Set((attributionsData ?? []).map((a) => a.enseignant_id))
  );

  // Réutilise la campagne déjà active s'il y en a une — évite que deux
  // responsables demandant des disponibilités qui se recoupent créent
  // deux campagnes séparées et sollicitent deux fois les mêmes
  // enseignants. Une seule campagne active à la fois, partagée par
  // tous les responsables.
  const campagneActive = await getDerniereCampagne();
  let campagneId: string;
  if (campagneActive && campagneActive.statut === 'active') {
    campagneId = campagneActive.id;
  } else {
    const { data: campagne, error } = await supabase
      .from('campagnes_disponibilite')
      .insert({ statut: 'active' })
      .select('id')
      .single();
    if (error) throw error;
    campagneId = campagne.id;
  }

  // Enseignants déjà sollicités dans cette campagne — pas besoin de les
  // relier ni de les notifier une deuxième fois.
  const { data: dejaLies } = await supabase
    .from('campagne_enseignants')
    .select('enseignant_id')
    .eq('campagne_id', campagneId);
  const dejaLiesIds = new Set((dejaLies ?? []).map((l) => l.enseignant_id));
  const nouveauxEnseignantIds = enseignantIds.filter(
    (id) => !dejaLiesIds.has(id)
  );

  if (nouveauxEnseignantIds.length > 0) {
    const { error: liaisonError } = await supabase
      .from('campagne_enseignants')
      .insert(
        nouveauxEnseignantIds.map((enseignant_id) => ({
          campagne_id: campagneId,
          enseignant_id,
        }))
      );
    if (liaisonError) throw liaisonError;

    // Notification immédiate (journal.md, Étape 2) — les rappels
    // automatiques 9h/18h nécessitent une tâche planifiée, pas encore en
    // place.
    const { data: enseignantsData } = await supabase
      .from('enseignants')
      .select('id, matricule')
      .in('id', nouveauxEnseignantIds);
    const matricules = (enseignantsData ?? []).map((e) => e.matricule);
    const idParMatricule = new Map(
      (enseignantsData ?? []).map((e) => [e.matricule, e.id])
    );
    const hndIds = await getEnseignantsHND(nouveauxEnseignantIds);

    const { data: comptesData } = await supabase
      .from('comptes_utilisateurs')
      .select('id, matricule')
      .in('matricule', matricules);

    if (comptesData && comptesData.length > 0) {
      await supabase.from('notifications').insert(
        comptesData.map((c) => {
          const estHND = hndIds.has(idParMatricule.get(c.matricule) ?? '');
          return {
            compte_id: c.id,
            titre: estHND ? 'Availability requested' : 'Disponibilités demandées',
            message: estHND
              ? 'Please fill in your availabilities for the coming week before Wednesday 5 PM.'
              : 'Merci de renseigner tes disponibilités pour la semaine à venir avant mercredi 17h.',
            lien: '/disponibilites/saisie',
          };
        })
      );
    }
  }

  return { id: campagneId, nbEnseignants: enseignantIds.length };
}

// ── Étape 4 — Suivi (responsable/admin) ───────────────────────────

export interface CampagneResume {
  id: string;
  date_lancement: string;
  statut: 'active' | 'arretee';
}

export async function getDerniereCampagne(): Promise<CampagneResume | null> {
  const { data, error } = await supabase
    .from('campagnes_disponibilite')
    .select('id, date_lancement, statut')
    .order('date_lancement', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  // Date limite dépassée (mercredi 17h) : la campagne s'arrête d'elle-même.
  if (data && data.statut === 'active' && campagneExpiree(data.date_lancement)) {
    try {
      await arreterCampagne(data.id);
    } catch {
      // droits insuffisants (enseignant) : on l'affiche quand même arrêtée
    }
    return { ...data, statut: 'arretee' };
  }
  return data;
}

// BUG corrigé : "la dernière campagne" au sens GLOBAL (toutes
// spécialités/cycles confondus) n'est PAS forcément celle à laquelle un
// enseignant donné a répondu. Dès qu'une collecte est lancée pour un
// AUTRE groupe de spécialités après que la campagne précédente a été
// arrêtée (ce que fait automatiquement creerOuChargerEDT dès qu'on ouvre
// l'écran "Emploi du temps" pour une spécialité pas encore programmée),
// une toute nouvelle ligne "campagnes_disponibilite" est créée — plus
// récente, donc renvoyée par getDerniereCampagne() — mais dans laquelle
// les enseignants de l'ancien groupe n'ont jamais été invités ni n'ont
// répondu. Résultat observé : la génération automatique (et l'ancienne
// version de getEnseignantsDisponibles) les traitait comme des
// enseignants n'ayant "pas encore renseigné leurs disponibilités",
// alors qu'ils avaient bien répondu à LEUR campagne.
//
// Cette fonction résout, pour un ensemble d'enseignants donné (ou pour
// tous si non précisé), la campagne la plus récente à laquelle CHACUN
// a été effectivement rattaché (table campagne_enseignants) — et non la
// plus récente toutes campagnes confondues.
export async function getDernieresCampagnesParEnseignant(
  enseignantIds?: string[]
): Promise<Map<string, string>> {
  if (enseignantIds && enseignantIds.length === 0) return new Map();

  let requete = supabase
    .from('campagne_enseignants')
    .select(
      'enseignant_id, campagne_id, campagne:campagnes_disponibilite(date_lancement)'
    );
  if (enseignantIds) {
    requete = requete.in('enseignant_id', enseignantIds);
  }
  const { data, error } = await requete;
  if (error) throw error;

  const meilleure = new Map<string, { campagneId: string; date: string }>();
  for (const l of (data ?? []) as any[]) {
    const date = l.campagne?.date_lancement;
    if (!date) continue;
    const actuel = meilleure.get(l.enseignant_id);
    if (!actuel || date > actuel.date) {
      meilleure.set(l.enseignant_id, { campagneId: l.campagne_id, date });
    }
  }
  return new Map(
    Array.from(meilleure.entries()).map(([id, v]) => [id, v.campagneId])
  );
}

export interface EnseignantSuivi {
  id: string;
  nom: string;
  matricule: string;
  email: string;
  numeroWhatsapp: string | null;
  numeroCellulaire: string | null;
  aRepondu: boolean;
  estHND: boolean;
}

export async function listSuiviCampagne(
  campagneId: string,
  specialiteIdsPerimetre?: string[]
): Promise<EnseignantSuivi[]> {
  const { data: liaisons, error } = await supabase
    .from('campagne_enseignants')
    .select(
      'enseignant:enseignants(id, nom, matricule, email, numero_whatsapp, numero_cellulaire)'
    )
    .eq('campagne_id', campagneId);
  if (error) throw error;

  const { data: reponses } = await supabase
    .from('disponibilites')
    .select('enseignant_id')
    .eq('campagne_id', campagneId);
  const idsAyantRepondu = new Set((reponses ?? []).map((r) => r.enseignant_id));

  const hndIds = await getEnseignantsHND(
    ((liaisons ?? []) as any[]).map((l) => l.enseignant.id)
  );
  let resultats = ((liaisons ?? []) as any[]).map((l) => ({
    id: l.enseignant.id,
    nom: l.enseignant.nom,
    matricule: l.enseignant.matricule,
    email: l.enseignant.email,
    numeroWhatsapp: l.enseignant.numero_whatsapp,
    numeroCellulaire: l.enseignant.numero_cellulaire,
    aRepondu: idsAyantRepondu.has(l.enseignant.id),
    estHND: hndIds.has(l.enseignant.id),
  }));

  // Périmètre (règle transversale, journal.md) : un Responsable ne voit
  // que les enseignants ayant au moins une attribution active sur une UE
  // d'une de ses spécialités assignées.
  if (specialiteIdsPerimetre) {
    const enseignantIds = resultats.map((r) => r.id);
    if (enseignantIds.length === 0) return [];
    const { data: attributionsData } = await supabase
      .from('attributions')
      .select('enseignant_id, offre:offres(specialite_id)')
      .in('enseignant_id', enseignantIds)
      .eq('statut', 'actif');
    const perimetreSet = new Set(specialiteIdsPerimetre);
    const enseignantsDansPerimetre = new Set(
      ((attributionsData ?? []) as any[])
        .filter((a) => perimetreSet.has(a.offre?.specialite_id))
        .map((a) => a.enseignant_id)
    );
    resultats = resultats.filter((r) => enseignantsDansPerimetre.has(r.id));
  }

  return resultats;
}

export async function arreterCampagne(campagneId: string) {
  const { error } = await supabase
    .from('campagnes_disponibilite')
    .update({ statut: 'arretee' })
    .eq('id', campagneId);
  if (error) throw error;
}

// Ajout manuel d'une disponibilité pour un enseignant (journal.md, Étape 4)
export async function enregistrerDisponibiliteManuelle(
  campagneId: string,
  enseignantId: string,
  cases: { jour: string; creneau: string }[]
) {
  await supabase
    .from('disponibilites')
    .delete()
    .eq('campagne_id', campagneId)
    .eq('enseignant_id', enseignantId);

  const { JOURS, tousLesCreneaux } = await import('@/constants/enums');
  const lignes = JOURS.flatMap((jour) =>
    tousLesCreneaux().map((creneau) => ({
      campagne_id: campagneId,
      enseignant_id: enseignantId,
      jour,
      creneau,
      disponible: cases.some((c) => c.jour === jour && c.creneau === creneau),
    }))
  );
  const { error } = await supabase.from('disponibilites').insert(lignes);
  if (error) throw error;
}

export async function getDisponibilitesEnseignant(
  campagneId: string,
  enseignantId: string
) {
  const { data } = await supabase
    .from('disponibilites')
    .select('jour, creneau, disponible')
    .eq('campagne_id', campagneId)
    .eq('enseignant_id', enseignantId);
  return data ?? [];
}
// ── PDF des disponibilités par cycle + spécialités ───────────────────

export interface SpecialiteDuCycle {
  id: string;
  nom: string;
  ecoleNom: string;
  filiereNom: string;
}

// Toutes les spécialités d'un cycle (sans filtre de semestre), pour les
// cocher avant de générer le PDF.
export async function listSpecialitesDuCycle(
  cycle: string,
  sousCycle: string | null,
  perimetreSpecialiteIds: string[] | null
): Promise<SpecialiteDuCycle[]> {
  let query = supabase
    .from('specialites')
    .select('id, nom, filiere:filieres(nom, ecole:ecoles(nom))')
    .eq('cycle', cycle);
  query = sousCycle
    ? query.eq('sous_cycle', sousCycle)
    : query.is('sous_cycle', null);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter((s) => !perimetreSpecialiteIds || perimetreSpecialiteIds.includes(s.id))
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      ecoleNom: s.filiere?.ecole?.nom ?? '',
      filiereNom: s.filiere?.nom ?? '',
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

export interface LigneDisponibilitesEnseignant {
  enseignantId: string;
  nom: string;
  matricule: string;
  specialites: string[];
  specialiteIds: string[];
  // niveau (1, 2…; 0 = non précisé) → spécialités où il enseigne à ce niveau
  niveaux: Map<number, { specialiteIds: string[]; specialites: string[] }>;
  aRepondu: boolean;
  // clés "jour|creneau" cochées par l'enseignant
  cases: Set<string>;
}

function parLots<T>(liste: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

// Pour chaque enseignant ayant une attribution active sur l'une des
// spécialités choisies : les disponibilités qu'il a cochées dans la
// campagne la plus récente à laquelle il a été rattaché (requêtes à plat,
// par lots, pour rester sous la limite de 1000 lignes).
export async function getDisponibilitesParSpecialites(
  specialiteIds: string[]
): Promise<LigneDisponibilitesEnseignant[]> {
  if (specialiteIds.length === 0) return [];

  const { data: specs, error: specsError } = await supabase
    .from('specialites')
    .select('id, nom')
    .in('id', specialiteIds);
  if (specsError) throw specsError;
  const nomSpecialite = new Map((specs ?? []).map((s: any) => [s.id, s.nom as string]));

  const { data: offres, error: offresError } = await supabase
    .from('offres')
    .select('id, specialite_id, semestre')
    .in('specialite_id', specialiteIds);
  if (offresError) throw offresError;
  const specialiteParOffre = new Map(
    (offres ?? []).map((o: any) => [o.id, o.specialite_id as string])
  );
  // Niveau d'une offre = ceil(semestre / 2) : S1-S2 → 1, S3-S4 → 2…
  const niveauParOffre = new Map<string, number>(
    (offres ?? []).map((o: any) => {
      const n = Number(String(o.semestre ?? '').replace(/[^0-9]/g, ''));
      return [o.id, n > 0 ? Math.ceil(n / 2) : 0];
    })
  );
  const niveauxParEnseignant = new Map<string, Map<number, Set<string>>>();
  const offreIds = Array.from(specialiteParOffre.keys());
  if (offreIds.length === 0) return [];

  const specialitesParEnseignant = new Map<string, Set<string>>();
  const specialiteIdsParEnseignant = new Map<string, Set<string>>();
  for (const lot of parLots(offreIds, 80)) {
    const { data: attributions, error } = await supabase
      .from('attributions')
      .select('offre_id, enseignant_id')
      .in('offre_id', lot)
      .eq('statut', 'actif');
    if (error) throw error;
    for (const a of (attributions ?? []) as any[]) {
      const specId = specialiteParOffre.get(a.offre_id) ?? '';
      const nom = nomSpecialite.get(specId);
      if (!nom) continue;
      if (!specialiteIdsParEnseignant.has(a.enseignant_id))
        specialiteIdsParEnseignant.set(a.enseignant_id, new Set());
      specialiteIdsParEnseignant.get(a.enseignant_id)!.add(specId);
      if (!niveauxParEnseignant.has(a.enseignant_id))
        niveauxParEnseignant.set(a.enseignant_id, new Map());
      const parNiv = niveauxParEnseignant.get(a.enseignant_id)!;
      const niv = niveauParOffre.get(a.offre_id) ?? 0;
      if (!parNiv.has(niv)) parNiv.set(niv, new Set());
      parNiv.get(niv)!.add(specId);
      if (!specialitesParEnseignant.has(a.enseignant_id))
        specialitesParEnseignant.set(a.enseignant_id, new Set());
      specialitesParEnseignant.get(a.enseignant_id)!.add(nom);
    }
  }
  const enseignantIds = Array.from(specialitesParEnseignant.keys());
  if (enseignantIds.length === 0) return [];

  const infos = new Map<string, { nom: string; matricule: string }>();
  for (const lot of parLots(enseignantIds, 80)) {
    const { data, error } = await supabase
      .from('enseignants')
      .select('id, nom, matricule')
      .in('id', lot);
    if (error) throw error;
    for (const e of (data ?? []) as any[]) infos.set(e.id, { nom: e.nom, matricule: e.matricule });
  }

  // Campagne la plus récente de chaque enseignant.
  const campagneParEnseignant = new Map<string, string>();
  for (const lot of parLots(enseignantIds, 80)) {
    const m = await getDernieresCampagnesParEnseignant(lot);
    m.forEach((campagneId, ensId) => campagneParEnseignant.set(ensId, campagneId));
  }

  // Disponibilités cochées, par campagne puis par lots d'enseignants.
  const casesParEnseignant = new Map<string, Set<string>>();
  const aReponduIds = new Set<string>();
  const parCampagne = new Map<string, string[]>();
  campagneParEnseignant.forEach((campagneId, ensId) => {
    if (!parCampagne.has(campagneId)) parCampagne.set(campagneId, []);
    parCampagne.get(campagneId)!.push(ensId);
  });
  for (const [campagneId, ids] of parCampagne) {
    for (const lot of parLots(ids, 40)) {
      // 40 enseignants × 12 cases ≈ 480 lignes (< 1000), toutes lignes
      // (cochées ou non) pour savoir qui a répondu.
      const { data, error } = await supabase
        .from('disponibilites')
        .select('enseignant_id, jour, creneau, disponible')
        .eq('campagne_id', campagneId)
        .in('enseignant_id', lot)
        .range(0, 999);
      if (error) throw error;
      for (const d of (data ?? []) as any[]) {
        aReponduIds.add(d.enseignant_id);
        if (!d.disponible) continue;
        if (!casesParEnseignant.has(d.enseignant_id))
          casesParEnseignant.set(d.enseignant_id, new Set());
        casesParEnseignant.get(d.enseignant_id)!.add(`${d.jour}|${d.creneau}`);
      }
    }
  }

  return enseignantIds
    .map((id) => ({
      enseignantId: id,
      nom: infos.get(id)?.nom ?? '(inconnu)',
      matricule: infos.get(id)?.matricule ?? '',
      specialites: Array.from(specialitesParEnseignant.get(id) ?? []).sort(),
      specialiteIds: Array.from(specialiteIdsParEnseignant.get(id) ?? []),
      niveaux: new Map(
        Array.from(niveauxParEnseignant.get(id) ?? []).map(([niv, specs]) => [
          niv,
          {
            specialiteIds: Array.from(specs),
            specialites: Array.from(specs).map((sid) => nomSpecialite.get(sid) ?? '').filter(Boolean).sort(),
          },
        ])
      ),
      aRepondu: aReponduIds.has(id),
      cases: casesParEnseignant.get(id) ?? new Set<string>(),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}