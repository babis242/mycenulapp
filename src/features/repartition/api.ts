// src/features/repartition/api.ts
import { supabase } from '@/lib/supabase';
import {
  getTroncCommunDeUE,
  setEnseignantTroncCommun,
  type TroncCommunAvecUEs,
} from '@/features/referentiel/troncs-communs/api';

export interface SpecialiteOption {
  id: string;
  nom: string;
  type_cursus: 'standard' | 'sante_culinaire';
  filiere_nom: string;
  ecole_nom: string;
}

export async function listSpecialitesOptions(): Promise<SpecialiteOption[]> {
  const { data, error } = await supabase
    .from('specialites')
    .select('id, nom, type_cursus, filiere:filieres(nom, ecole:ecoles(nom))')
    .order('nom');
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id,
    nom: s.nom,
    type_cursus: s.type_cursus,
    filiere_nom: s.filiere?.nom ?? '',
    ecole_nom: s.filiere?.ecole?.nom ?? '',
  }));
}

export interface CoursAAttribuer {
  offreId: string;
  ueId: string;
  ueNom: string;
  attributionId: string | null;
  enseignantId: string | null;
  enseignantNom: string | null;
  troncCommun: TroncCommunAvecUEs | null;
}

// Liste des UEs offertes pour une spécialité + semestre donnés, avec
// l'attribution active (le cas échéant) et le tronc commun dont elle fait
// partie s'il y en a un — écran "Mode A" (journal.md 2).
export async function listCoursPourSpecialiteSemestre(
  specialiteId: string,
  semestre: string
): Promise<CoursAAttribuer[]> {
  const { data: offresData, error: offresError } = await supabase
    .from('offres')
    .select('id, ue:ues(id, nom)')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre);

  if (offresError) throw offresError;
  const offres = (offresData ?? []) as any[];
  if (offres.length === 0) return [];

  const offreIds = offres.map((o) => o.id);
  const { data: attributionsData, error: attError } = await supabase
    .from('attributions')
    .select('id, offre_id, enseignant_id, enseignant:enseignants(nom)')
    .in('offre_id', offreIds)
    .eq('statut', 'actif');

  if (attError) throw attError;
  const attributionsParOffre = new Map(
    (attributionsData ?? []).map((a: any) => [a.offre_id, a])
  );

  const cours = await Promise.all(
    offres.map(async (o) => {
      const attribution = attributionsParOffre.get(o.id) as any;
      const troncCommun = await getTroncCommunDeUE(o.ue.id);
      return {
        offreId: o.id,
        ueId: o.ue.id,
        ueNom: o.ue.nom,
        attributionId: attribution?.id ?? null,
        enseignantId: attribution?.enseignant_id ?? null,
        enseignantNom: attribution?.enseignant?.nom ?? null,
        troncCommun,
      };
    })
  );

  return cours;
}

export interface EnseignantOption {
  id: string;
  nom: string;
  matricule: string;
}

export async function listEnseignantsOptions(): Promise<EnseignantOption[]> {
  const { data, error } = await supabase
    .from('enseignants')
    .select('id, nom, matricule')
    .order('nom');
  if (error) throw error;
  return data ?? [];
}

// Attribue (ou réattribue) une seule offre à un enseignant, sans toucher au
// reste d'un éventuel tronc commun — utilisé en interne par
// attribuerCoursEtGroupe ci-dessous.
async function attribuerUneOffre(
  offreId: string,
  enseignantId: string,
  attributionExistanteId: string | null
) {
  if (attributionExistanteId) {
    const { error } = await supabase
      .from('attributions')
      .update({ statut: 'reattribue' })
      .eq('id', attributionExistanteId);
    if (error) throw error;
  }
  const { error } = await supabase
    .from('attributions')
    .insert({
      offre_id: offreId,
      enseignant_id: enseignantId,
      statut: 'actif',
    });
  if (error) throw error;
}

// Attribue une offre à un enseignant. Si l'UE fait partie d'un tronc
// commun, l'enseignant est propagé à TOUTES les UEs du groupe (chacune
// reçoit sa propre attribution pour sa propre offre) et devient
// l'enseignant du tronc commun lui-même — un tronc commun n'a jamais deux
// enseignants différents en simultané.
export async function attribuerCoursEtGroupe(
  cours: CoursAAttribuer,
  enseignantId: string
) {
  if (!cours.troncCommun) {
    await attribuerUneOffre(cours.offreId, enseignantId, cours.attributionId);
    return;
  }

  // Pour chaque UE du groupe, retrouve son offre (même spécialité+semestre
  // n'est pas garanti pour toutes — chaque UE du tronc commun a sa propre
  // offre indépendante) et son attribution active éventuelle, puis attribue.
  for (const ue of cours.troncCommun.ues) {
    const { data: offreDeCetteUE } = await supabase
      .from('offres')
      .select('id')
      .eq('ue_id', ue.id)
      .maybeSingle();
    if (!offreDeCetteUE) continue;

    const { data: attributionActive } = await supabase
      .from('attributions')
      .select('id')
      .eq('offre_id', offreDeCetteUE.id)
      .eq('statut', 'actif')
      .maybeSingle();

    await attribuerUneOffre(
      offreDeCetteUE.id,
      enseignantId,
      attributionActive?.id ?? null
    );
  }

  await setEnseignantTroncCommun(cours.troncCommun.id, enseignantId);
}
