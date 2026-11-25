// src/features/fiches-presence/ficheImageApi.ts
//
// Photo de la fiche de présence physique, jointe à la saisie hebdomadaire d'une classe
// (spécialité + semestre + semaine) : une ou plusieurs photos. Le fichier est stocké sur Cloudflare R2 (Edge
// Function r2-fichier, purpose « fiche-presence ») ; la table fiches_presence_images
// garde sa clé. Nécessite sql/absences_hebdomadaires.sql.
import { supabase } from '@/lib/supabase';
import { televerserFichier, urlPubliqueR2 } from '@/lib/r2';

export interface FicheImage {
  id: string;
  chemin: string; // clé R2
  nomFichier: string | null;
  creeLe: string;
}

const TAILLE_MAX = 8 * 1024 * 1024;

function versFiche(r: any): FicheImage {
  return { id: r.id, chemin: r.chemin, nomFichier: r.nom_fichier, creeLe: r.created_at };
}

/** Toutes les photos jointes à la classe pour la semaine (la plus ancienne d'abord). */
export async function listerFichesImages(specialiteId: string, semestre: string, semaine: string): Promise<FicheImage[]> {
  const { data, error } = await supabase
    .from('fiches_presence_images')
    .select('id, chemin, nom_fichier, created_at')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre)
    .eq('semaine', semaine)
    .order('created_at', { ascending: true });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error('Tables absentes : exécutez sql/absences_hebdomadaires.sql dans Supabase.');
    }
    throw error;
  }
  return (data ?? []).map(versFiche);
}

// Réduit la photo (1800 px max, JPEG) : une photo de téléphone fait souvent plusieurs Mo.
export async function compresserImage(fichier: File): Promise<File> {
  if (!fichier.type.startsWith('image/')) throw new Error('Choisissez une image (photo de la fiche).');
  try {
    const bitmap = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (blob && blob.size < fichier.size) {
      return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  } catch {
    // format non décodable par le navigateur : on garde l'original
  }
  return fichier;
}

// Envoie UNE photo sur R2 puis l'ajoute à la classe pour la semaine.
export async function ajouterFicheImage(
  specialiteId: string,
  semestre: string,
  semaine: string,
  fichier: File
): Promise<FicheImage> {
  const image = await compresserImage(fichier);
  if (image.size > TAILLE_MAX) throw new Error(`« ${fichier.name} » dépasse 8 Mo.`);
  const { key, nom } = await televerserFichier('fiche-presence', `${specialiteId}_${semestre}_${semaine}`, image);

  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('fiches_presence_images')
    .insert({
      specialite_id: specialiteId,
      semestre,
      semaine,
      chemin: key,
      nom_fichier: nom || fichier.name,
      ajoute_par: u.user?.id ?? null,
    })
    .select('id, chemin, nom_fichier, created_at')
    .single();
  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Plusieurs photos impossibles : exécutez sql/fiches_presence_plusieurs_photos.sql dans Supabase.');
    }
    throw new Error(error.message);
  }
  return versFiche(data);
}

/** Retire une photo de la classe (la référence est supprimée ; le fichier reste dans le bucket R2). */
export async function retirerFicheImage(id: string): Promise<void> {
  const { error } = await supabase.from('fiches_presence_images').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Adresse publique de la photo sur R2. */
export function urlFicheImage(chemin: string): string {
  return urlPubliqueR2(chemin);
}