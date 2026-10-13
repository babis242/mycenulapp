// src/features/fiches-presence/lecturePdf.ts
//
// Lecture d'un PDF de présence (type « Présence BTS 2 … — Semaine du … ») :
// tableau N° / Nom et prénoms / jours × créneaux avec « P » (présent) et
// « A » (absent). Aucune IA : on lit le texte du PDF avec sa position, ce
// qui permet de distinguer une case vide d'une case remplie.
import * as pdfjsLib from 'pdfjs-dist';
import '@/lib/pdfExtraction'; // configure le worker pdf.js
import type { LigneLue } from './lectureApi';

export interface ItemTexte {
  str: string;
  x: number; // début
  w: number; // largeur
  y: number;
}

export interface LecturePdf {
  titre: string | null;
  semaineDetectee: string | null; // lundi "AAAA-MM-JJ" si lisible dans le titre
  lignes: LigneLue[];
}

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function detecterSemaine(texte: string): string | null {
  const t = sansAccent(texte);
  const m = t.match(/du\s+(\d{1,2})(?:\s+([a-z]+))?\s+au\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const jour = Number(m[1]);
  const moisFin = MOIS[m[4]];
  if (!moisFin) return null;
  let mois = m[2] && MOIS[m[2]] ? MOIS[m[2]] : moisFin;
  let annee = Number(m[5]);
  if (mois > moisFin) annee -= 1; // « du 28 décembre au 02 janvier »
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// Analyse pure (testable) des éléments de texte d'UNE page.
export function analyserPage(items: ItemTexte[], jours: string[], nbCreneaux: number): { titre: string | null; lignes: LigneLue[] } {
  const nbCases = jours.length * nbCreneaux;
  const vides = { titre: null, lignes: [] as LigneLue[] };
  const propres = items.map((i) => ({ ...i, str: i.str.trim() })).filter((i) => i.str);

  // En-tête : étiquettes de créneaux (« 08h-12h »)
  const etiquettes = propres.filter((i) => /^\d{1,2}\s?h\s?-\s?\d{1,2}\s?h$/i.test(i.str));
  if (etiquettes.length === 0) return vides;
  const yEntete = Math.max(...etiquettes.map((e) => e.y));
  const slots = etiquettes
    .filter((e) => Math.abs(e.y - yEntete) < 3)
    .map((e) => ({ cx: e.x + e.w / 2 }))
    .sort((a, b) => a.cx - b.cx);

  // Rattache chaque créneau à son jour (étiquette de jour la plus proche).
  const enteteJours = jours
    .map((j, ji) => {
      const it = propres.find((i) => sansAccent(i.str) === sansAccent(j) && i.y > yEntete);
      return it ? { ji, cx: it.x + it.w / 2 } : null;
    })
    .filter((x): x is { ji: number; cx: number } => !!x);

  let colonnes: number[]; // centre x de chaque case, dans l'ordre jour × créneau
  if (slots.length === nbCases) {
    colonnes = slots.map((s) => s.cx);
  } else if (enteteJours.length === jours.length) {
    const parJour: number[][] = jours.map(() => []);
    for (const s of slots) {
      const proche = enteteJours.reduce((a, b) => (Math.abs(b.cx - s.cx) < Math.abs(a.cx - s.cx) ? b : a));
      parJour[proche.ji].push(s.cx);
    }
    colonnes = parJour.flatMap((l) => {
      const tri = [...l].sort((a, b) => a - b);
      return Array.from({ length: nbCreneaux }, (_, k) => tri[k] ?? NaN);
    });
  } else {
    return vides;
  }

  const premiereX = Math.min(...colonnes.filter((c) => !Number.isNaN(c)));
  const largeurCol = colonnes.length > 1 ? Math.min(...colonnes.slice(1).map((c, i) => c - colonnes[i]).filter((d) => d > 1)) : 20;
  const limiteDonnees = premiereX - largeurCol / 2;

  const enteteNom = propres.find((i) => /^nom/i.test(i.str) && Math.abs(i.y - yEntete) < 25);
  const enteteMatricule = propres.find((i) => /^matricule/i.test(i.str) && Math.abs(i.y - yEntete) < 25);
  const xNom = enteteNom ? enteteNom.x - 1.5 : -Infinity;

  // Titre : le texte le plus haut dans la page.
  const yMax = Math.max(...propres.map((i) => i.y));
  const titre = propres
    .filter((i) => Math.abs(i.y - yMax) < 3)
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join(' ');

  // Lignes de données : sous l'en-tête, groupées par ordonnée.
  const corps = propres.filter((i) => i.y < yEntete - 2);
  const groupes: { y: number; items: typeof corps }[] = [];
  for (const it of [...corps].sort((a, b) => b.y - a.y)) {
    const g = groupes.find((x) => Math.abs(x.y - it.y) < 3.5);
    if (g) g.items.push(it);
    else groupes.push({ y: it.y, items: [it] });
  }

  const lignes: LigneLue[] = [];
  for (const g of groupes) {
    const tri = [...g.items].sort((a, b) => a.x - b.x);
    const premier = tri[0];
    if (!/^\d{1,3}$/.test(premier.str)) continue; // légende, bas de page…
    const gauche = tri.slice(1).filter((i) => i.x + i.w / 2 < limiteDonnees);
    const nomItems = gauche.filter((i) => !enteteMatricule || i.x >= xNom);
    const matItems = enteteMatricule ? gauche.filter((i) => i.x < xNom) : [];
    const nom = nomItems.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!nom) continue;

    const cases: (boolean | null)[] = Array(nbCases).fill(null);
    for (const it of tri) {
      const cx = it.x + it.w / 2;
      if (cx < limiteDonnees) continue;
      const lettre = it.str.toUpperCase();
      if (lettre !== 'P' && lettre !== 'A') continue;
      let meilleur = -1;
      let dist = Infinity;
      colonnes.forEach((c, k) => {
        if (Number.isNaN(c)) return;
        const d = Math.abs(c - cx);
        if (d < dist) {
          dist = d;
          meilleur = k;
        }
      });
      if (meilleur >= 0 && dist < largeurCol * 0.6) cases[meilleur] = lettre === 'P';
    }
    lignes.push({
      numero: Number(premier.str),
      matricule: matItems.map((i) => i.str).join('').trim(),
      nom,
      cases,
    });
  }
  return { titre: titre || null, lignes };
}

export async function lirePdfPresence(fichier: File, jours: string[], nbCreneaux: number): Promise<LecturePdf> {
  const buffer = await fichier.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lignes: LigneLue[] = [];
  let titre: string | null = null;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    const items: ItemTexte[] = (contenu.items as any[])
      .filter((i) => 'str' in i)
      .map((i) => ({ str: i.str, x: i.transform[4], w: i.width, y: i.transform[5] }));
    const r = analyserPage(items, jours, nbCreneaux);
    if (!titre && r.titre) titre = r.titre;
    lignes.push(...r.lignes);
  }
  if (lignes.length === 0) {
    throw new Error(
      "Aucune ligne de présence reconnue dans ce PDF (tableau N° / Nom / jours × créneaux avec P et A attendu). Un PDF scanné (image) n'est pas lisible."
    );
  }
  return { titre, semaineDetectee: titre ? detecterSemaine(titre) : null, lignes };
}