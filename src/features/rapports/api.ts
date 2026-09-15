// src/features/rapports/api.ts
import { supabase } from '@/lib/supabase';
import { getGroupesSpecialitesTronc } from '@/features/referentiel/troncs-communs/api';

export interface RapportLigne {
  id: string;
  ueNom: string;
  specialiteNoms: string[];
  enseignantNom: string;
  niveau: string;
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
        offre:offres(ue:ues(nom), specialite:specialites(nom)),
        tronc_commun:troncs_communs(nom),
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
    const troncId = r.seance?.tronc_commun_id;
    const specialiteNoms = troncId
      ? (specialitesParTronc.get(troncId) ?? [])
      : [r.seance?.offre?.specialite?.nom ?? r.seance?.emploi_du_temps?.specialite?.nom].filter(Boolean);
    return {
      id: r.id,
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