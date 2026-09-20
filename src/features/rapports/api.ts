// src/features/rapports/api.ts
import { supabase } from '@/lib/supabase';
import {
  getGroupesSpecialitesTronc,
} from '@/features/referentiel/troncs-communs/api';
import { listPointsCles } from '@/features/referentiel/ues/api';
import { listPointsClesTronc } from '@/features/referentiel/troncs-communs/api';
import {
  getPointsAbordesExistants,
  getTauxCouverture,
  type TauxCouverture,
} from '@/features/seances/api';

export interface RapportLigne {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  specialiteNoms: string[];
  enseignantNom: string;
  niveau: string; // en réalité le semestre (S1, S2...) — nom de champ historique
  semaine: string;
  jour: string;
  creneau: string;
  cahierTexteKeys: string[];
  nbPresents: number;
  nbTotal: number;
}

// Consultation des rapports de séance (Scénario 13) — périmètre du
// responsable appliqué automatiquement par RLS.
export async function listRapports(): Promise<RapportLigne[]> {
  const { data, error } = await supabase
    .from('rapports_seances')
    .select(
      `
      id, niveau, cahier_texte_keys,
      seance:seances_edt(
        jour, creneau, tronc_commun_id, semaine,
        offre:offres(ue:ues(id, nom), specialite:specialites(nom)),
        tronc_commun:troncs_communs(id, nom),
        emploi_du_temps:emplois_du_temps(semaine, specialite:specialites(nom))
      ),
      enseignant:enseignants(nom)
    `
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (data ?? []).map((r: any) => r.id);
  const { data: appels } =
    ids.length > 0
      ? await supabase
          .from('appels_etudiants')
          .select('rapport_id, present')
          .in('rapport_id', ids)
      : { data: [] };

  const compteurs = new Map<string, { presents: number; total: number }>();
  for (const a of appels ?? []) {
    const c = compteurs.get(a.rapport_id) ?? { presents: 0, total: 0 };
    c.total += 1;
    if (a.present) c.presents += 1;
    compteurs.set(a.rapport_id, c);
  }

  // Pour un tronc commun, on va chercher TOUTES les spécialités
  // concernées (une requête par groupe distinct, pas par rapport).
  const troncIds = Array.from(
    new Set(
      (data ?? [])
        .map((r: any) => r.seance?.tronc_commun_id)
        .filter(Boolean)
    )
  );
  const specialitesParTronc = new Map<string, string[]>();
  await Promise.all(
    troncIds.map(async (troncId: string) => {
      const groupes = await getGroupesSpecialitesTronc(troncId);
      specialitesParTronc.set(
        troncId,
        groupes.map((g) => g.specialiteNom)
      );
    })
  );

  return (data ?? []).map((r: any) => {
    const c = compteurs.get(r.id) ?? { presents: 0, total: 0 };
    const troncId = r.seance?.tronc_commun_id ?? null;
    const specialiteNoms = troncId
      ? (specialitesParTronc.get(troncId) ?? [])
      : [r.seance?.offre?.specialite?.nom ?? r.seance?.emploi_du_temps?.specialite?.nom].filter(Boolean);
    return {
      id: r.id,
      ueId: r.seance?.offre?.ue?.id ?? null,
      troncCommunId: troncId,
      ueNom: r.seance?.tronc_commun?.nom ?? r.seance?.offre?.ue?.nom ?? '',
      specialiteNoms,
      enseignantNom: r.enseignant?.nom ?? '',
      niveau: r.niveau,
      semaine: r.seance?.emploi_du_temps?.semaine ?? r.seance?.semaine ?? '',
      jour: r.seance?.jour ?? '',
      creneau: r.seance?.creneau ?? '',
      cahierTexteKeys: r.cahier_texte_keys ?? [],
      nbPresents: c.presents,
      nbTotal: c.total,
    };
  });
}

// ── Détail complet d'un rapport (admin) ─────────────────────────────

export interface PresenceLigne {
  etudiantNom: string;
  present: boolean;
}

export interface PointAbordeLigne {
  id: string;
  ordre: number;
  libelle: string;
  etat: 'non_aborde' | 'partiel' | 'fini';
}

export interface DetailRapportAdmin {
  id: string;
  ueId: string | null;
  troncCommunId: string | null;
  ueNom: string;
  specialiteNoms: string[];
  enseignantNom: string;
  semestre: string;
  jour: string;
  creneau: string;
  semaine: string;
  presences: PresenceLigne[];
  points: PointAbordeLigne[];
  cahierTexteKeys: string[];
  cahierTexteNoms: string[];
  contenu: string | null;
  tauxCouverture: TauxCouverture;
}

export async function getDetailRapportAdmin(
  rapportId: string
): Promise<DetailRapportAdmin | null> {
  const { data: r, error } = await supabase
    .from('rapports_seances')
    .select(
      `
      id, niveau, contenu, cahier_texte_keys, cahier_texte_noms,
      seance:seances_edt(
        jour, creneau, tronc_commun_id, semaine,
        offre:offres(ue:ues(id, nom), specialite:specialites(nom)),
        tronc_commun:troncs_communs(id, nom),
        emploi_du_temps:emplois_du_temps(semaine, specialite:specialites(nom))
      ),
      enseignant:enseignants(nom)
    `
    )
    .eq('id', rapportId)
    .maybeSingle();
  if (error) throw error;
  if (!r) return null;

  const seance = (r as any).seance;
  const troncId: string | null = seance?.tronc_commun_id ?? null;
  const ueId: string | null = seance?.offre?.ue?.id ?? null;

  const [specialiteNoms, presencesResult, pointsDefinis, etatPoints, taux] =
    await Promise.all([
      troncId
        ? getGroupesSpecialitesTronc(troncId).then((g) =>
            g.map((x) => x.specialiteNom)
          )
        : Promise.resolve(
            [
              seance?.offre?.specialite?.nom ??
                seance?.emploi_du_temps?.specialite?.nom,
            ].filter(Boolean) as string[]
          ),
      supabase
        .from('appels_etudiants')
        .select('present, etudiant:etudiants(nom)')
        .eq('rapport_id', rapportId),
      troncId
        ? listPointsClesTronc(troncId)
        : ueId
          ? listPointsCles(ueId)
          : Promise.resolve([]),
      getPointsAbordesExistants(rapportId),
      getTauxCouverture(ueId, troncId),
    ]);

  const presences: PresenceLigne[] = ((presencesResult.data ?? []) as any[])
    .map((p) => ({
      etudiantNom: p.etudiant?.nom ?? '',
      present: !!p.present,
    }))
    .sort((a, b) => a.etudiantNom.localeCompare(b.etudiantNom));

  const points: PointAbordeLigne[] = pointsDefinis
    .map((p) => {
      const t = etatPoints.get(p.id);
      const etat: PointAbordeLigne['etat'] =
        t === undefined ? 'non_aborde' : t ? 'fini' : 'partiel';
      return { id: p.id, ordre: p.ordre, libelle: p.libelle, etat };
    })
    .sort((a, b) => a.ordre - b.ordre);

  return {
    id: r.id,
    ueId,
    troncCommunId: troncId,
    ueNom: seance?.tronc_commun?.nom ?? seance?.offre?.ue?.nom ?? '',
    specialiteNoms,
    enseignantNom: (r as any).enseignant?.nom ?? '',
    semestre: r.niveau,
    jour: seance?.jour ?? '',
    creneau: seance?.creneau ?? '',
    semaine: seance?.emploi_du_temps?.semaine ?? seance?.semaine ?? '',
    presences,
    points,
    cahierTexteKeys: r.cahier_texte_keys ?? [],
    cahierTexteNoms: r.cahier_texte_noms ?? [],
    contenu: r.contenu ?? null,
    tauxCouverture: taux,
  };
}