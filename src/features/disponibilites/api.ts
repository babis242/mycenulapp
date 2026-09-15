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
export async function listUEsPourCampagne(
  paires: { specialiteId: string; semestre: string }[]
): Promise<UEPourCampagne[]> {
  if (paires.length === 0) return [];

  const resultats: UEPourCampagne[] = [];

  for (const { specialiteId, semestre } of paires) {
    const { data: offresData, error } = await supabase
      .from('offres')
      .select('id, semestre, ue:ues(id, nom), specialite:specialites(nom)')
      .eq('specialite_id', specialiteId)
      .eq('semestre', semestre);

    if (error) throw error;

    for (const o of (offresData ?? []) as any[]) {
      const { data: attribution } = await supabase
        .from('attributions')
        .select('enseignant_id, enseignant:enseignants(nom)')
        .eq('offre_id', o.id)
        .eq('statut', 'actif')
        .maybeSingle();

      const { data: lienTronc } = await supabase
        .from('troncs_communs_ues')
        .select('tronc_commun:troncs_communs(nom)')
        .eq('ue_id', o.ue.id)
        .maybeSingle();

      resultats.push({
        ueId: o.ue.id,
        ueNom: o.ue.nom,
        offreId: o.id,
        specialiteNom: o.specialite.nom,
        semestre: o.semestre,
        enseignantId: attribution?.enseignant_id ?? null,
        enseignantNom: (attribution as any)?.enseignant?.nom ?? null,
        troncCommunNom: (lienTronc as any)?.tronc_commun?.nom ?? null,
      });
    }
  }

  // Dédoublonnage (une même UE peut ressortir via plusieurs paires
  // spécialité/semestre sélectionnées, même si ce cas est rare vu qu'une
  // offre est propre à une spécialité+semestre).
  const vues = new Map<string, UEPourCampagne>();
  for (const r of resultats) vues.set(r.offreId, r);

  // Auto-inclusion des UEs sœurs d'un tronc commun : si l'une des UEs
  // trouvées appartient à un groupe, les autres UEs du même groupe sont
  // concernées elles aussi, même si leur spécialité/semestre n'a pas été
  // ajouté explicitement par l'admin — un tronc commun se demande/se
  // programme toujours en bloc.
  const idsDejaVus = new Set(Array.from(vues.values()).map((r) => r.ueId));
  const troncsDejaTraites = new Set<string>();
  for (const r of Array.from(vues.values())) {
    if (!r.troncCommunNom) continue;

    const { data: lien } = await supabase
      .from('troncs_communs_ues')
      .select('tronc_commun_id')
      .eq('ue_id', r.ueId)
      .maybeSingle();
    const troncId = lien?.tronc_commun_id;
    if (!troncId || troncsDejaTraites.has(troncId)) continue;
    troncsDejaTraites.add(troncId);

    const { data: liaisonsGroupe } = await supabase
      .from('troncs_communs_ues')
      .select(
        `
        ue:ues(
          id, nom,
          offres(id, semestre, specialite:specialites(nom))
        )
      `
      )
      .eq('tronc_commun_id', troncId);

    for (const l of (liaisonsGroupe ?? []) as any[]) {
      const ue = l.ue;
      const offre = ue?.offres?.[0];
      if (!ue || !offre || idsDejaVus.has(ue.id)) continue;

      const { data: attribution } = await supabase
        .from('attributions')
        .select('enseignant_id, enseignant:enseignants(nom)')
        .eq('offre_id', offre.id)
        .eq('statut', 'actif')
        .maybeSingle();

      idsDejaVus.add(ue.id);
      vues.set(offre.id, {
        ueId: ue.id,
        ueNom: ue.nom,
        offreId: offre.id,
        specialiteNom: offre.specialite?.nom ?? '',
        semestre: offre.semestre,
        enseignantId: attribution?.enseignant_id ?? null,
        enseignantNom: (attribution as any)?.enseignant?.nom ?? null,
        troncCommunNom: r.troncCommunNom,
      });
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

  const { JOURS, CRENEAUX } = await import('@/constants/enums');
  const lignes = JOURS.flatMap((jour) =>
    CRENEAUX.map((creneau) => ({
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