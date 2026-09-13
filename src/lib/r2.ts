// src/lib/r2.ts
import { supabase } from './supabase';

export type PurposeR2 =
  | 'syllabus'
  | 'syllabus-tronc-commun'
  | 'support-cours'
  | 'support-cours-tronc-commun'
  | 'cahier-texte';

// Bucket R2 en accès public (choix fait volontairement, pour simplifier :
// pas besoin d'URL signée pour télécharger, juste l'adresse publique du
// bucket + la clé du fichier). Variable d'environnement Vite, à définir
// aussi bien en local (.env) que sur Cloudflare Pages.
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL as string | undefined;

// Construit l'URL publique d'un fichier à partir de sa clé — aucune
// requête réseau, juste une concaténation.
export function urlPubliqueR2(key: string): string {
  if (!R2_PUBLIC_URL) {
    throw new Error(
      "VITE_R2_PUBLIC_URL n'est pas configurée — voir la configuration Cloudflare R2."
    );
  }
  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

// L'envoi, lui, reste protégé : seule l'Edge Function connaît les
// identifiants R2, et elle vérifie les droits (rôle, périmètre, ou
// enseignant propriétaire de l'attribution) avant de signer une URL
// d'upload valable quelques minutes.
async function obtenirUrlUpload(
  purpose: PurposeR2,
  id: string,
  fileName: string
): Promise<{ url: string; key: string; nom: string | null }> {
  const { data, error } = await supabase.functions.invoke('r2-fichier', {
    body: { purpose, action: 'upload', id, fileName },
  });

  if (error) {
    // Le client Supabase renvoie un message générique ("Edge Function
    // returned a non-2xx status code") qui ne dit rien — le vrai détail
    // est dans le corps de la réponse HTTP, accessible via error.context.
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

export async function televerserFichier(
  purpose: PurposeR2,
  id: string,
  fichier: File
): Promise<{ key: string; nom: string }> {
  const { url, key, nom } = await obtenirUrlUpload(purpose, id, fichier.name);
  const res = await fetch(url, {
    method: 'PUT',
    body: fichier,
    headers: { 'Content-Type': fichier.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error("Échec de l'envoi du fichier.");
  return { key, nom: nom ?? fichier.name };
}