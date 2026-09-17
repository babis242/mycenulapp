// src/features/disponibilites/api.ts
import { supabase } from '@/lib/supabase';

export interface UEPourCampagne {
  ueId: string;
  ueNom: string;
  offreId: string;
  specialiteNom: string;
  semestre: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  troncCommunNom: string | null;
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
      'id, semestre, specialite_id, ue:ues(id, nom), specialite:specialites(nom)'
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
          id, nom,
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
        });
      }
    }
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

    const { data: comptesData } = await supabase
      .from('comptes_utilisateurs')
      .select('id, matricule')
      .in('matricule', matricules);

    if (comptesData && comptesData.length > 0) {
      await supabase.from('notifications').insert(
        comptesData.map((c) => ({
          compte_id: c.id,
          titre: 'Disponibilités demandées',
          message:
            'Merci de renseigner tes disponibilités pour la semaine à venir.',
          lien: '/disponibilites/saisie',
        }))
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
  return data;
}

export interface EnseignantSuivi {
  id: string;
  nom: string;
  matricule: string;
  email: string;
  numeroWhatsapp: string | null;
  numeroCellulaire: string | null;
  aRepondu: boolean;
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

  let resultats = ((liaisons ?? []) as any[]).map((l) => ({
    id: l.enseignant.id,
    nom: l.enseignant.nom,
    matricule: l.enseignant.matricule,
    email: l.enseignant.email,
    numeroWhatsapp: l.enseignant.numero_whatsapp,
    numeroCellulaire: l.enseignant.numero_cellulaire,
    aRepondu: idsAyantRepondu.has(l.enseignant.id),
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