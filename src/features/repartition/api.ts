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

export interface SupportCoursLigne {
  cle: string;
  attributionIds: string[];
  troncCommunId: string | null;
  ueNom: string;
  specialiteNoms: string[];
  enseignantNom: string;
  supportEnvoye: boolean;
  supportKey: string | null;
  supportNom: string | null;
  supportUploadedAt: string | null;
  tauxCouverture: number | null;
}

// Suivi des supports de cours (Scénario 12) — regroupé par cours
// réellement enseigné : une UE simple = une ligne, un tronc commun =
// une seule ligne pour tout le groupe (support de cours partagé, pas un
// par spécialité). Le périmètre du responsable s'applique via RLS.
export async function listSupportsCours(): Promise<SupportCoursLigne[]> {
  const { data, error } = await supabase
    .from('attributions')
    .select(
      `
      id, support_cours_key, support_cours_nom, support_cours_uploaded_at,
      support_cours_taux_couverture,
      enseignant:enseignants(nom),
      offre:offres(
        specialite:specialites(nom),
        ue:ues(
          nom,
          troncs_communs_ues(
            tronc_commun_id,
            tronc_commun:troncs_communs(
              nom, support_cours_key, support_cours_nom,
              support_cours_uploaded_at, support_cours_taux_couverture
            )
          )
        )
      )
    `
    )
    .eq('statut', 'actif');
  if (error) throw error;

  const groupes = new Map<string, SupportCoursLigne>();

  for (const a of (data ?? []) as any[]) {
    const ue = a.offre?.ue;
    const specialiteNom = a.offre?.specialite?.nom ?? '';
    const enseignantNom = a.enseignant?.nom ?? '';
    const lienTronc = ue?.troncs_communs_ues?.[0];
    const tronc = lienTronc?.tronc_commun;

    if (lienTronc?.tronc_commun_id && tronc) {
      const cle = `tronc:${lienTronc.tronc_commun_id}`;
      const existant = groupes.get(cle);
      if (existant) {
        existant.attributionIds.push(a.id);
        if (!existant.specialiteNoms.includes(specialiteNom)) {
          existant.specialiteNoms.push(specialiteNom);
        }
      } else {
        groupes.set(cle, {
          cle,
          attributionIds: [a.id],
          troncCommunId: lienTronc.tronc_commun_id,
          ueNom: tronc.nom,
          specialiteNoms: [specialiteNom],
          enseignantNom,
          supportEnvoye: !!tronc.support_cours_key,
          supportKey: tronc.support_cours_key,
          supportNom: tronc.support_cours_nom,
          supportUploadedAt: tronc.support_cours_uploaded_at,
          tauxCouverture: tronc.support_cours_taux_couverture,
        });
      }
    } else {
      groupes.set(a.id, {
        cle: a.id,
        attributionIds: [a.id],
        troncCommunId: null,
        ueNom: ue?.nom ?? '',
        specialiteNoms: [specialiteNom],
        enseignantNom,
        supportEnvoye: !!a.support_cours_key,
        supportKey: a.support_cours_key,
        supportNom: a.support_cours_nom,
        supportUploadedAt: a.support_cours_uploaded_at,
        tauxCouverture: a.support_cours_taux_couverture,
      });
    }
  }

  return Array.from(groupes.values()).sort((x, y) =>
    x.enseignantNom.localeCompare(y.enseignantNom)
  );
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
// attribuerCoursEtGroupe ci-dessous. Refuse si l'UE n'a pas de syllabus
// (Scénario 12) — un enseignant ne doit jamais recevoir un cours sans le
// document qui le décrit.
async function attribuerUneOffre(
  offreId: string,
  enseignantId: string,
  attributionExistanteId: string | null
) {
  const { data: offre } = await supabase
    .from('offres')
    .select('ue:ues(id, nom, syllabus_key)')
    .eq('id', offreId)
    .single();
  const ue = (offre as any)?.ue;

  // Le syllabus peut être géré au niveau du tronc commun si l'UE en fait
  // partie (refonte : source unique pour tout le groupe, plus de copie
  // par UE) — sinon, celui de l'UE elle-même.
  const { data: lienTronc } = await supabase
    .from('troncs_communs_ues')
    .select('tronc_commun:troncs_communs(nom, syllabus_key)')
    .eq('ue_id', ue?.id)
    .maybeSingle();
  const tronc = (lienTronc as any)?.tronc_commun;
  const syllabusPresent = tronc ? !!tronc.syllabus_key : !!ue?.syllabus_key;

  if (!syllabusPresent) {
    const cible = tronc
      ? `le tronc commun "${tronc.nom}"`
      : `"${ue?.nom ?? 'cette UE'}"`;
    throw new Error(
      `Impossible d'attribuer ${cible} : aucun syllabus n'a été envoyé.`
    );
  }

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

  // Notifie l'enseignant — le syllabus est accessible depuis "Mes cours".
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('matricule')
    .eq('id', enseignantId)
    .maybeSingle();
  if (enseignant) {
    const { data: compte } = await supabase
      .from('comptes_utilisateurs')
      .select('id')
      .eq('matricule', enseignant.matricule)
      .maybeSingle();
    if (compte) {
      await supabase.from('notifications').insert({
        compte_id: compte.id,
        titre: 'Nouveau cours attribué',
        message: `Tu t'es vu attribuer "${ue.nom}". Le syllabus est disponible dans "Mes cours".`,
        lien: '/mes-cours',
      });
    }
  }
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

  // Vérifie que le tronc commun a un syllabus avant de commencer — sinon
  // l'attribution s'arrêterait à mi-chemin, avec certaines UEs attribuées
  // et d'autres non. Le syllabus est partagé par tout le groupe (refonte
  // tronc commun) : une seule vérification suffit.
  const { data: troncData } = await supabase
    .from('troncs_communs')
    .select('syllabus_key')
    .eq('id', cours.troncCommun.id)
    .maybeSingle();
  if (!troncData?.syllabus_key) {
    throw new Error(
      `Impossible d'attribuer ce tronc commun : aucun syllabus n'a été envoyé pour "${cours.troncCommun.nom}".`
    );
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

// Annule le support de cours d'une attribution (admin/responsable) — le
// fichier reste sur R2 (pas critique de le supprimer), mais l'attribution
// repasse "en attente" : l'enseignant redevient visible comme n'ayant pas
// encore envoyé de support, et les rappels 10h/16h reprennent.
export async function annulerSupportCours(
  cible: { attributionId: string } | { troncCommunId: string }
): Promise<void> {
  if ('troncCommunId' in cible) {
    const { error } = await supabase
      .from('troncs_communs')
      .update({
        support_cours_key: null,
        support_cours_nom: null,
        support_cours_uploaded_at: null,
        support_cours_taux_couverture: null,
      })
      .eq('id', cible.troncCommunId);
    if (error) throw error;
    await supabase
      .from('troncs_communs_couverture')
      .delete()
      .eq('tronc_commun_id', cible.troncCommunId);
    return;
  }
  const { error } = await supabase
    .from('attributions')
    .update({
      support_cours_key: null,
      support_cours_nom: null,
      support_cours_uploaded_at: null,
      support_cours_taux_couverture: null,
    })
    .eq('id', cible.attributionId);
  if (error) throw error;
  await supabase
    .from('support_cours_couverture')
    .delete()
    .eq('attribution_id', cible.attributionId);
}