// src/lib/pdfExtraction.ts
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

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

// Même chose, mais renvoie le texte de CHAQUE page séparément — pour
// l'import d'un semestre complet (une UE par page), où chaque page est
// analysée indépendamment plutôt que tout le document d'un coup (plus
// fiable qu'une seule grosse extraction sur un document long).
export async function extraireTextePdfParPage(
  fichier: File
): Promise<string[]> {
  const buffer = await fichier.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const contenu = await page.getTextContent();
    const texte = contenu.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    pages.push(texte);
  }
  return pages;
}

// Découpe le PDF en un vrai fichier PDF par page (pas juste le texte) —
// pour que chaque UE importée depuis un semestre complet garde SA page
// comme syllabus téléchargeable, exactement comme si elle avait été
// importée individuellement.
export async function decouperPdfParPage(fichier: File): Promise<File[]> {
  const buffer = await fichier.arrayBuffer();
  const source = await PDFDocument.load(buffer);
  const nbPages = source.getPageCount();

  const fichiers: File[] = [];
  for (let i = 0; i < nbPages; i++) {
    const nouveauDoc = await PDFDocument.create();
    const [page] = await nouveauDoc.copyPages(source, [i]);
    nouveauDoc.addPage(page);
    const octets = await nouveauDoc.save();
    fichiers.push(
      new File(
        [octets as BlobPart],
        `${fichier.name.replace(/\.pdf$/i, '')}-page-${i + 1}.pdf`,
        { type: 'application/pdf' }
      )
    );
  }
  return fichiers;
}