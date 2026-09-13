// src/lib/pdfExtraction.ts
import * as pdfjsLib from 'pdfjs-dist';

// new URL(..., import.meta.url) est la façon recommandée par Vite pour
// référencer un fichier binaire/asset depuis une dépendance — plus fiable
// ici que l'import `?url`, qui pouvait mal résoudre le chemin du worker
// selon l'environnement (StackBlitz notamment).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// Extrait le texte brut d'un PDF (syllabus, support de cours...) — fait
// dans le navigateur, avant tout envoi à l'IA. Ne gère pas les PDF
// scannés/images (pas d'OCR) ; pour un syllabus dactylographié classique,
// ça couvre le cas normal.
export async function extraireTextePdf(fichier: File): Promise<string> {
  const buffer = await fichier.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let texte = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const contenu = await page.getTextContent();
    texte +=
      contenu.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') +
      '\n';
  }

  const nettoye = texte.trim();
  if (!nettoye) {
    throw new Error(
      'Impossible de lire ce PDF (probablement un scan sans texte) — remplis le formulaire manuellement.'
    );
  }
  return nettoye;
}