// src/features/repartition/api.ts
import { supabase } from '@/lib/supabase';
import {
  getTroncCommunDeUE,
  setEnseignantTroncCommun,
  type TroncCommunAvecUEs,
} from '@/features/referentiel/troncs-communs/api';
import { getDetailCouverture } from '@/features/seances/api';

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
  ueId: string | null;
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
          id, nom,
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
          ueId: null,
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
        ueId: ue?.id ?? null,
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

  // Pour chaque UE du groupe, retrouve TOUTES ses offres (une UE de
  // tronc commun est par nature partagée par plusieurs spécialités —
  // donc plusieurs lignes "offres" avec le même ue_id, une par
  // spécialité) et attribue chacune. AVANT : .maybeSingle() exigeait au
  // plus une seule ligne ; dès qu'une UE avait 2+ offres (le cas normal
  // pour un vrai tronc commun), Supabase renvoyait une erreur interne,
  // data devenait null, et le code passait silencieusement à l'UE
  // suivante sans jamais l'attribuer — d'où la propagation qui semblait
  // s'arrêter en cours de route sans qu'aucune erreur ne s'affiche.
  for (const ue of cours.troncCommun.ues) {
    const { data: offresDeCetteUE, error: offresError } = await supabase
      .from('offres')
      .select('id')
      .eq('ue_id', ue.id);
    if (offresError) throw offresError;
    if (!offresDeCetteUE || offresDeCetteUE.length === 0) continue;

    for (const offre of offresDeCetteUE) {
      const { data: attributionActive } = await supabase
        .from('attributions')
        .select('id')
        .eq('offre_id', offre.id)
        .eq('statut', 'actif')
        .maybeSingle();

      await attribuerUneOffre(
        offre.id,
        enseignantId,
        attributionActive?.id ?? null
      );
    }
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

// ── État de couverture par spécialité/semestre (admin) ─────────────
// Basé sur le contenu du syllabus (points clés) et les rapports que les
// enseignants remplissent — PAS sur le support de cours envoyé (ça,
// c'est listSupportsCours, une notion différente, volontairement laissée
// de côté ici).

export interface LigneEtatCouverture {
  cle: string; // "ue:<id>" ou "tronc:<id>"
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  volumeHoraire: number | null;
  quantitatif: number | null;
  qualitatif: number | null;
}

export interface EtatCouvertureSpecialite {
  lignes: LigneEtatCouverture[];
  // Taux global du semestre pour cette spécialité — PONDÉRÉ (somme des
  // heures faites / somme des volumes horaires, somme des points
  // pondérés / somme du total des points), pas une simple moyenne des
  // pourcentages par UE, qui donnerait le même poids à une UE de 10h et
  // une UE de 60h.
  globalQuantitatif: number | null;
  globalQualitatif: number | null;
}

export async function getEtatCouvertureSpecialite(
  specialiteId: string,
  semestre: string
): Promise<EtatCouvertureSpecialite> {
  // Plusieurs requêtes simples et explicites plutôt qu'une jointure
  // imbriquée sur 3 niveaux (offres -> ues -> troncs_communs_ues ->
  // troncs_communs) — ce genre de jointure profonde échoue avec un 400
  // dès que PostgREST n'arrive pas à résoudre sans ambiguïté la relation
  // à un des niveaux, même quand chaque relation prise séparément existe
  // bien. Même correctif déjà appliqué ailleurs dans l'app pour la même
  // raison (détection des troncs communs à l'enregistrement d'une case
  // d'emploi du temps).
  const { data: offres, error: erreurOffres } = await supabase
    .from('offres')
    .select('id, ue_id')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre);
  if (erreurOffres) throw erreurOffres;

  const ueIds = Array.from(
    new Set((offres ?? []).map((o: any) => o.ue_id).filter(Boolean))
  );

  const [uesResult, liensTroncResult] = await Promise.all([
    ueIds.length > 0
      ? supabase.from('ues').select('id, nom, volume_horaire').in('id', ueIds)
      : Promise.resolve({ data: [], error: null }),
    ueIds.length > 0
      ? supabase
          .from('troncs_communs_ues')
          .select('ue_id, tronc_commun_id')
          .in('ue_id', ueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (uesResult.error) throw uesResult.error;
  if (liensTroncResult.error) throw liensTroncResult.error;

  const ueParId = new Map((uesResult.data ?? []).map((u: any) => [u.id, u]));
  const troncCommunIdParUe = new Map(
    (liensTroncResult.data ?? []).map((l: any) => [l.ue_id, l.tronc_commun_id])
  );

  const troncIds = Array.from(new Set(Array.from(troncCommunIdParUe.values())));
  const { data: troncs, error: erreurTroncs } =
    troncIds.length > 0
      ? await supabase
          .from('troncs_communs')
          .select('id, nom')
          .in('id', troncIds)
      : { data: [], error: null };
  if (erreurTroncs) throw erreurTroncs;
  const troncParId = new Map((troncs ?? []).map((t: any) => [t.id, t]));

  // Regroupe par UE simple, ou par tronc commun (une seule ligne pour
  // tout le groupe, même principe que listSupportsCours plus haut).
  // troncs_communs n'a pas de colonne volume_horaire propre — toutes les
  // UE membres du groupe partagent le même volume horaire, donc celui de
  // la première UE membre rencontrée sert de référence pour le tronc.
  const cibles = new Map<
    string,
    {
      ueId: string | null;
      troncCommunId: string | null;
      ueNom: string;
      volumeHoraire: number | null;
    }
  >();
  for (const ueId of ueIds) {
    const ue = ueParId.get(ueId);
    if (!ue) continue;
    const troncCommunId = troncCommunIdParUe.get(ueId);
    const tronc = troncCommunId ? troncParId.get(troncCommunId) : null;
    if (troncCommunId && tronc) {
      const cle = `tronc:${troncCommunId}`;
      if (!cibles.has(cle)) {
        cibles.set(cle, {
          ueId: null,
          troncCommunId,
          ueNom: tronc.nom,
          volumeHoraire: ue.volume_horaire,
        });
      }
    } else {
      cibles.set(`ue:${ue.id}`, {
        ueId: ue.id,
        troncCommunId: null,
        ueNom: ue.nom,
        volumeHoraire: ue.volume_horaire,
      });
    }
  }

  const detailsBruts = await Promise.all(
    Array.from(cibles.entries()).map(async ([cle, c]) => {
      const detail = await getDetailCouverture(c.ueId, c.troncCommunId);
      return { cle, ...c, ...detail };
    })
  );

  const lignes: LigneEtatCouverture[] = detailsBruts
    .map((d) => ({
      cle: d.cle,
      ueId: d.ueId,
      troncCommunId: d.troncCommunId,
      ueNom: d.ueNom,
      volumeHoraire: d.volumeHoraire,
      quantitatif: d.quantitatif,
      qualitatif: d.qualitatif,
    }))
    .sort((a, b) => a.ueNom.localeCompare(b.ueNom));

  const sommeHeuresFaites = detailsBruts.reduce((s, d) => s + d.heuresFaites, 0);
  const sommeVolumeHoraire = detailsBruts.reduce(
    (s, d) => s + (d.volumeHoraire ?? 0),
    0
  );
  const sommePointsPondere = detailsBruts.reduce((s, d) => s + d.pointsPondere, 0);
  const sommeTotalPoints = detailsBruts.reduce((s, d) => s + d.totalPoints, 0);

  return {
    lignes,
    globalQuantitatif:
      sommeVolumeHoraire > 0
        ? Math.min(100, Math.round((sommeHeuresFaites / sommeVolumeHoraire) * 100))
        : null,
    globalQualitatif:
      sommeTotalPoints > 0
        ? Math.round((sommePointsPondere / sommeTotalPoints) * 100)
        : null,
  };
}