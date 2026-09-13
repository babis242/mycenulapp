// src/features/mes-ues/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

// Déclenche l'analyse IA du support de cours juste envoyé — compare son
// contenu aux points clés (de l'UE, ou du tronc commun si le cours est
// partagé) et calcule un taux de couverture. Purement informatif :
// n'empêche jamais l'envoi, ne bloque rien.
export async function analyserSupportCours(
  cible: { attributionId: string } | { troncCommunId: string },
  texteSupport: string
): Promise<{ tauxCouverture: number }> {
  const body =
    'attributionId' in cible
      ? { attribution_id: cible.attributionId, texte_support: texteSupport }
      : { tronc_commun_id: cible.troncCommunId, texte_support: texteSupport };

  const { data, error } = await supabase.functions.invoke(
    'analyser-support-cours',
    { body }
  );
  if (error) {
    let detail = error.message;
    try {
      const contexte = (error as any).context;
      if (contexte && typeof contexte.json === 'function') {
        const corps = await contexte.json();
        if (corps?.error) detail = corps.error;
      }
    } catch {
      // Pas grave.
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return { tauxCouverture: data.taux_couverture };
}

// Une carte par cours réellement enseigné — une UE simple = un
// attributionId ; un tronc commun = plusieurs attributions (une par
// spécialité du groupe) mais regroupées en UNE seule carte, avec un seul
// syllabus/support de cours partagé (l'enseignant ne l'envoie qu'une
// fois pour tout le groupe).
export interface MonUE {
  cle: string;
  ueId: string | null;
  troncCommunId: string | null;
  attributionIds: string[];
  ueNom: string;
  specialiteNoms: string[];
  syllabusKey: string | null;
  syllabusNom: string | null;
  supportKey: string | null;
  supportNom: string | null;
  supportUploadedAt: string | null;
  tauxCouverture: number | null;
}

export async function listMesUEs(matricule: string): Promise<MonUE[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  const { data, error } = await supabase
    .from('attributions')
    .select(
      `
      id, support_cours_key, support_cours_nom, support_cours_uploaded_at,
      support_cours_taux_couverture,
      offre:offres(
        specialite:specialites(nom),
        ue:ues(
          id, nom, syllabus_key, syllabus_nom,
          troncs_communs_ues(
            tronc_commun_id,
            tronc_commun:troncs_communs(
              nom, syllabus_key, syllabus_nom,
              support_cours_key, support_cours_nom, support_cours_uploaded_at,
              support_cours_taux_couverture
            )
          )
        )
      )
    `
    )
    .eq('enseignant_id', enseignant.id)
    .eq('statut', 'actif');
  if (error) throw error;

  const groupes = new Map<string, MonUE>();

  for (const a of (data ?? []) as any[]) {
    const ue = a.offre?.ue;
    if (!ue) continue;
    const specialiteNom = a.offre?.specialite?.nom ?? '';
    const lienTronc = ue.troncs_communs_ues?.[0];
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
          ueId: null,
          troncCommunId: lienTronc.tronc_commun_id,
          attributionIds: [a.id],
          ueNom: tronc.nom,
          specialiteNoms: [specialiteNom],
          syllabusKey: tronc.syllabus_key,
          syllabusNom: tronc.syllabus_nom,
          supportKey: tronc.support_cours_key,
          supportNom: tronc.support_cours_nom,
          supportUploadedAt: tronc.support_cours_uploaded_at,
          tauxCouverture: tronc.support_cours_taux_couverture,
        });
      }
    } else {
      groupes.set(a.id, {
        cle: a.id,
        ueId: ue.id,
        troncCommunId: null,
        attributionIds: [a.id],
        ueNom: ue.nom,
        specialiteNoms: [specialiteNom],
        syllabusKey: ue.syllabus_key,
        syllabusNom: ue.syllabus_nom,
        supportKey: a.support_cours_key,
        supportNom: a.support_cours_nom,
        supportUploadedAt: a.support_cours_uploaded_at,
        tauxCouverture: a.support_cours_taux_couverture,
      });
    }
  }

  return Array.from(groupes.values()).sort((x, y) =>
    x.ueNom.localeCompare(y.ueNom)
  );
}

// Lecture hors-ligne — même logique de regroupement, depuis Dexie.
export async function lireMesUEsDepuisCache(
  matricule: string
): Promise<MonUE[]> {
  const enseignant = await db.enseignants
    .where('matricule')
    .equals(matricule)
    .first();
  if (!enseignant) return [];

  const [attributions, offres, ues, troncsCommunsUes, troncsCommuns, specialites] =
    await Promise.all([
      db.attributions
        .where('enseignant_id')
        .equals(enseignant.id)
        .and((a: any) => a.statut === 'actif')
        .toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.troncsCommunsUes.toArray(),
      db.troncsCommuns.toArray(),
      db.specialites.toArray(),
    ]);
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const troncParUeId = new Map(
    (troncsCommunsUes as any[]).map((l) => [l.ue_id, l.tronc_commun_id])
  );
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));

  const groupes = new Map<string, MonUE>();

  for (const a of attributions as any[]) {
    const offre = a.offre_id ? offreParId.get(a.offre_id) : null;
    const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
    if (!ue) continue;
    const specialiteNom = offre?.specialite_id
      ? (specialiteParId.get(offre.specialite_id)?.nom ?? '')
      : '';
    const troncId = troncParUeId.get(ue.id);
    const tronc = troncId ? troncCommunParId.get(troncId) : null;

    if (troncId && tronc) {
      const cle = `tronc:${troncId}`;
      const existant = groupes.get(cle);
      if (existant) {
        existant.attributionIds.push(a.id);
        if (!existant.specialiteNoms.includes(specialiteNom)) {
          existant.specialiteNoms.push(specialiteNom);
        }
      } else {
        groupes.set(cle, {
          cle,
          ueId: null,
          troncCommunId: troncId,
          attributionIds: [a.id],
          ueNom: tronc.nom,
          specialiteNoms: [specialiteNom],
          syllabusKey: tronc.syllabus_key ?? null,
          syllabusNom: tronc.syllabus_nom ?? null,
          supportKey: tronc.support_cours_key ?? null,
          supportNom: tronc.support_cours_nom ?? null,
          supportUploadedAt: tronc.support_cours_uploaded_at ?? null,
          tauxCouverture: tronc.support_cours_taux_couverture ?? null,
        });
      }
    } else {
      groupes.set(a.id, {
        cle: a.id,
        ueId: ue.id,
        troncCommunId: null,
        attributionIds: [a.id],
        ueNom: ue.nom,
        specialiteNoms: [specialiteNom],
        syllabusKey: ue.syllabus_key ?? null,
        syllabusNom: ue.syllabus_nom ?? null,
        supportKey: a.support_cours_key ?? null,
        supportNom: a.support_cours_nom ?? null,
        supportUploadedAt: a.support_cours_uploaded_at ?? null,
        tauxCouverture: a.support_cours_taux_couverture ?? null,
      });
    }
  }

  return Array.from(groupes.values()).sort((x, y) =>
    x.ueNom.localeCompare(y.ueNom)
  );
}