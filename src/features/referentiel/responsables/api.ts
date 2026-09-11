// src/features/referentiel/responsables/api.ts
import { supabase } from '@/lib/supabase';

export interface ResponsableAvecPerimetre {
  id: string;
  matricule: string;
  nom: string;
  email: string;
  numero_telephone: string | null;
  statut: 'actif' | 'inactif';
  specialites: { id: string; nom: string }[];
}

export async function listResponsables(): Promise<ResponsableAvecPerimetre[]> {
  const { data, error } = await supabase
    .from('responsables')
    .select(
      `
      id, matricule, nom, email, numero_telephone, statut,
      responsables_specialites ( specialite:specialites ( id, nom ) )
    `
    )
    .order('nom', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    matricule: r.matricule,
    nom: r.nom,
    email: r.email,
    numero_telephone: r.numero_telephone,
    statut: r.statut,
    specialites: (r.responsables_specialites ?? [])
      .map((rs: any) => rs.specialite)
      .filter(Boolean),
  }));
}

export interface SpecialitePourPerimetre {
  id: string;
  nom: string;
  filiereNom: string;
  ecoleNom: string;
}

export async function listSpecialitesPourPerimetre(): Promise<
  SpecialitePourPerimetre[]
> {
  const { data, error } = await supabase
    .from('specialites')
    .select('id, nom, filiere:filieres(nom, ecole:ecoles(nom))')
    .order('nom', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as any[]).map((s) => ({
    id: s.id,
    nom: s.nom,
    filiereNom: s.filiere?.nom ?? '',
    ecoleNom: s.filiere?.ecole?.nom ?? '',
  }));
}

export interface NouveauResponsable {
  nom: string;
  email: string;
  numero_telephone?: string;
  specialiteIds: string[];
}

// Le matricule est généré côté base (trigger, migration 027). Comme pour
// les enseignants, la création du compte de connexion (email + mot de
// passe) est déclenchée séparément via une Edge Function — voir
// AjouterResponsablePage.
export async function createResponsable(
  input: NouveauResponsable
): Promise<{ id: string; matricule: string }> {
  const { data, error } = await supabase
    .from('responsables')
    .insert({
      nom: input.nom,
      email: input.email,
      numero_telephone: input.numero_telephone || null,
    })
    .select('id, matricule')
    .single();
  if (error) throw error;

  if (input.specialiteIds.length > 0) {
    const { error: perimetreError } = await supabase
      .from('responsables_specialites')
      .insert(
        input.specialiteIds.map((specialite_id) => ({
          responsable_id: data.id,
          specialite_id,
        }))
      );
    if (perimetreError) throw perimetreError;
  }

  return data;
}
