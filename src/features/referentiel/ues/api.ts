// src/features/referentiel/ues/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { UE, Offre, Specialite, Filiere, Ecole } from '@/types';

// ── Extraction IA du syllabus (nom, code, volume, points clés) ────
// N'écrit rien : renvoie juste l'extraction, à valider/corriger côté
// client avant tout enregistrement (aucune donnée publiée sans
// validation humaine).
export interface ExtractionSyllabus {
  nom: string | null;
  code: string | null;
  volume_horaire: number | null;
  coefficient: number | null;
  points_cles: string[];
}

export async function extraireSyllabusPdf(
  texte: string
): Promise<ExtractionSyllabus> {
  const { data, error } = await supabase.functions.invoke(
    'extraire-syllabus-pdf',
    { body: { texte } }
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
      // Pas grave, on garde le message générique.
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Remplace intégralement les points clés d'une UE — l'envoi d'un syllabus
// (création ou sur une UE existante) fournit toujours la liste complète,
// jamais un ajout partiel.
export async function enregistrerPointsCles(
  ueId: string,
  points: string[]
): Promise<void> {
  await supabase.from('ue_points_cles').delete().eq('ue_id', ueId);
  if (points.length === 0) return;
  const { error } = await supabase.from('ue_points_cles').insert(
    points.map((libelle, i) => ({ ue_id: ueId, ordre: i, libelle }))
  );
  if (error) throw error;
}

export interface PointCle {
  id: string;
  ordre: number;
  libelle: string;
}

export async function listPointsCles(ueId: string): Promise<PointCle[]> {
  const { data, error } = await supabase
    .from('ue_points_cles')
    .select('id, ordre, libelle')
    .eq('ue_id', ueId)
    .order('ordre');
  if (error) throw error;
  return data ?? [];
}

// Une UE = une spécialité désormais (plus de multi-offres à la création —
// le tronc commun se gère via un Jumelage créé a posteriori, cf.
// src/features/referentiel/jumelages/api.ts).
export interface UEAvecOffre extends UE {
  syllabus_key: string | null;
  syllabus_nom: string | null;
  syllabus_uploaded_at: string | null;
  // Si cette UE appartient à un tronc commun, son syllabus vit sur le
  // tronc commun lui-même, pas sur l'UE — ce champ reflète donc l'état
  // réel du syllabus, peu importe où il est stocké.
  troncCommunId: string | null;
  troncCommunNom: string | null;
  aSyllabus: boolean;
  offre:
    | (Offre & {
        specialite: Pick<Specialite, 'id' | 'nom' | 'cycle'> & {
          filiere: Pick<Filiere, 'id' | 'nom'> & {
            ecole: Pick<Ecole, 'id' | 'nom'>;
          };
        };
      })
    | null;
}

// Reconstruit "UE + offre + spécialité + filière + école" depuis Dexie —
// quatre niveaux de jointure à assembler à la main, contrairement à
// Supabase qui le fait en une requête.
export async function lireUEsDepuisCache(): Promise<UEAvecOffre[]> {
  const [ues, offres, specialites, filieres, ecoles, troncsCommunsUes, troncsCommuns] =
    await Promise.all([
      db.ues.toArray(),
      db.offres.toArray(),
      db.specialites.toArray(),
      db.filieres.toArray(),
      db.ecoles.toArray(),
      db.troncsCommunsUes.toArray(),
      db.troncsCommuns.toArray(),
    ]);

  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));
  const filiereParId = new Map(filieres.map((f: any) => [f.id, f]));
  const ecoleParId = new Map(ecoles.map((e: any) => [e.id, e]));
  const offreParUeId = new Map<string, any>();
  for (const o of offres as any[]) {
    if (!offreParUeId.has(o.ue_id)) offreParUeId.set(o.ue_id, o);
  }
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const troncParUeId = new Map<string, any>();
  for (const l of troncsCommunsUes as any[]) {
    troncParUeId.set(l.ue_id, troncCommunParId.get(l.tronc_commun_id));
  }

  return (ues as any[])
    .map((ue) => {
      const offre = offreParUeId.get(ue.id);
      const tronc = troncParUeId.get(ue.id);
      const champsSyllabus = {
        troncCommunId: tronc?.id ?? null,
        troncCommunNom: tronc?.nom ?? null,
        aSyllabus: tronc ? !!tronc.syllabus_key : !!ue.syllabus_key,
      };
      if (!offre) return { ...ue, ...champsSyllabus, offre: null } as UEAvecOffre;
      const specialite = specialiteParId.get(offre.specialite_id);
      const filiere = specialite ? filiereParId.get(specialite.filiere_id) : null;
      const ecole = filiere ? ecoleParId.get(filiere.ecole_id) : null;
      return {
        ...ue,
        ...champsSyllabus,
        offre: {
          ...offre,
          specialite: specialite
            ? {
                id: specialite.id,
                nom: specialite.nom,
                cycle: specialite.cycle,
                filiere: {
                  id: filiere?.id ?? '',
                  nom: filiere?.nom ?? '',
                  ecole: { id: ecole?.id ?? '', nom: ecole?.nom ?? '' },
                },
              }
            : null,
        },
      } as UEAvecOffre;
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

export async function listUEsAvecOffre(): Promise<UEAvecOffre[]> {
  const { data, error } = await supabase
    .from('ues')
    .select(
      `
      id, nom, code, volume_horaire, coefficient,
      syllabus_key, syllabus_nom, syllabus_uploaded_at,
      offres (
        id, semestre, specialite_id,
        specialite:specialites (
          id, nom, cycle,
          filiere:filieres (
            id, nom,
            ecole:ecoles ( id, nom )
          )
        )
      )
    `
    )
    .order('nom', { ascending: true });

  if (error) throw error;

  // Requête séparée (plutôt qu'une jointure imbriquée via la table de
  // liaison) — plus robuste, ne dépend pas de la façon dont PostgREST
  // applique les règles de sécurité sur un embed à deux niveaux.
  const { data: liens, error: liensError } = await supabase
    .from('troncs_communs_ues')
    .select('ue_id, tronc_commun:troncs_communs(id, nom, syllabus_key)');
  if (liensError) throw liensError;
  const troncParUeId = new Map(
    (liens ?? []).map((l: any) => [l.ue_id, l.tronc_commun])
  );

  return (data ?? []).map((ue: any) => {
    const tronc = troncParUeId.get(ue.id);
    return {
      ...ue,
      offre: ue.offres?.[0] ?? null,
      troncCommunId: tronc?.id ?? null,
      troncCommunNom: tronc?.nom ?? null,
      aSyllabus: tronc ? !!tronc.syllabus_key : !!ue.syllabus_key,
    };
  }) as UEAvecOffre[];
}

export async function listEcoles() {
  const { data, error } = await supabase
    .from('ecoles')
    .select('id, nom')
    .order('nom');
  if (error) throw error;
  return data ?? [];
}

export async function listFilieres(ecoleId?: string) {
  let query = supabase
    .from('filieres')
    .select('id, nom, ecole_id')
    .order('nom');
  if (ecoleId) query = query.eq('ecole_id', ecoleId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listSpecialites(filiereId?: string) {
  let query = supabase
    .from('specialites')
    .select('id, nom, filiere_id, cycle, type_cursus')
    .order('nom');
  if (filiereId) query = query.eq('filiere_id', filiereId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Création (Scénario 1.1, mode manuel — écran 1.2) ─────────────

export async function createEcole(nom: string) {
  const { data, error } = await supabase
    .from('ecoles')
    .insert({ nom })
    .select('id, nom')
    .single();
  if (error) throw error;
  return data;
}

export async function createFiliere(nom: string, ecole_id: string) {
  const { data, error } = await supabase
    .from('filieres')
    .insert({ nom, ecole_id })
    .select('id, nom, ecole_id')
    .single();
  if (error) throw error;
  return data;
}

export async function createSpecialite(
  nom: string,
  filiere_id: string,
  cycle: string,
  type_cursus: string
) {
  const { data, error } = await supabase
    .from('specialites')
    .insert({ nom, filiere_id, cycle, type_cursus })
    .select('id, nom, filiere_id, cycle, type_cursus')
    .single();
  if (error) throw error;
  return data;
}

export interface NouvelleUE {
  nom: string;
  code?: string;
  volume_horaire?: number;
  coefficient?: number;
  specialite_id: string;
  semestre: string;
}

export async function createUE(input: NouvelleUE) {
  const { data: ue, error: ueError } = await supabase
    .from('ues')
    .insert({
      nom: input.nom,
      code: input.code || null,
      volume_horaire: input.volume_horaire ?? null,
      coefficient: input.coefficient ?? null,
    })
    .select('id')
    .single();

  if (ueError) throw ueError;

  const { error: offreError } = await supabase.from('offres').insert({
    ue_id: ue.id,
    specialite_id: input.specialite_id,
    semestre: input.semestre,
  });
  if (offreError) throw offreError;

  return ue;
}

// ── Détail / Modification / Suppression (écran 1.5) ──────────────

export async function getUE(id: string): Promise<UEAvecOffre | null> {
  const { data, error } = await supabase
    .from('ues')
    .select(
      `
      id, nom, code, volume_horaire, coefficient,
      syllabus_key, syllabus_nom, syllabus_uploaded_at,
      offres (
        id, semestre, specialite_id,
        specialite:specialites (
          id, nom, cycle,
          filiere:filieres (
            id, nom,
            ecole:ecoles ( id, nom )
          )
        )
      )
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const anyData = data as any;
  return { ...anyData, offre: anyData.offres?.[0] ?? null } as UEAvecOffre;
}

export interface UEModifiable {
  nom: string;
  code?: string;
  volume_horaire?: number;
  coefficient?: number;
}

export async function updateUE(id: string, input: UEModifiable) {
  const { error } = await supabase
    .from('ues')
    .update({
      nom: input.nom,
      code: input.code || null,
      volume_horaire: input.volume_horaire ?? null,
      coefficient: input.coefficient ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

// Vérifie si l'UE est déjà utilisée ailleurs dans le système (attribution à
// un enseignant, séance déjà planifiée, jumelage...) avant suppression —
// cf. ecrans_ui.md 1.5. Les tables concernées (attributions, seances_edt)
// ne sont pas toutes encore là (Scénario 5) : vérification partielle.
export async function ueEstUtilisee(id: string): Promise<boolean> {
  const { data: jumelagesLies, error } = await supabase
    .from('jumelage_ues')
    .select('jumelage_id')
    .eq('ue_id', id)
    .limit(1);
  if (error) throw error;
  return (jumelagesLies?.length ?? 0) > 0;
}

export async function deleteUE(id: string) {
  const { error } = await supabase.from('ues').delete().eq('id', id);
  if (error) throw error;
}