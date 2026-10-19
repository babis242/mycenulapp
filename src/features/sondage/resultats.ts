// src/features/sondage/resultats.ts — agrégation des réponses du sondage.
import type { LigneReponse } from './api';

export interface StatEnseignant {
  nom: string;
  avis: number; // cours effectivement donnés et évalués
  bien: number;
  mal: number;
  comprisOui: number;
  comprisMoyen: number;
  comprisNon: number;
  supportOui: number;
  supportPartiel: number;
  supportNon: number;
  retards: number;
  grosRetards: number;
  nonTenus: number;
  negatifs: Map<string, number>;
  positifs: Map<string, number>;
  commentaires: { ue: string; texte: string }[];
  voteMeilleur: number;
  voteAmeliorer: number;
  /** Détail par matière enseignée : avis reçus et « pas compris ». */
  parCours: Map<string, { avis: number; pasCompris: number }>;
}

export interface StatCours {
  ue: string;
  avis: number;
  pasCompris: number;
  aRevoir: number;
  precisions: string[];
}

export interface Resume {
  reponses: number;
  noteMoyenne: number | null;
  pctCompris: number | null; // « bien compris »
  pctPasCompris: number | null;
  pctSupport: number | null;
  coursNonTenus: number;
  enseignants: StatEnseignant[];
  cours: StatCours[];
  conditions: Map<string, number>;
  suggestions: { texte: string; niveau: string }[];
  infos: { oui: number; parfois: number; non: number };
}

const incr = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export function agreger(lignes: LigneReponse[]): Resume {
  const ens = new Map<string, StatEnseignant>();
  const cours = new Map<string, StatCours>();
  const conditions = new Map<string, number>();
  const suggestions: Resume['suggestions'] = [];
  const infos = { oui: 0, parfois: 0, non: 0 };
  let sommeNotes = 0;
  let nbNotes = 0;
  let nbCompris = 0, nbPasCompris = 0, nbComprisTotal = 0;
  let nbSupportOui = 0, nbSupportTotal = 0;
  let nonTenus = 0;

  const getEns = (nom: string): StatEnseignant => {
    if (!ens.has(nom)) {
      ens.set(nom, {
        nom, avis: 0, bien: 0, mal: 0, comprisOui: 0, comprisMoyen: 0, comprisNon: 0,
        supportOui: 0, supportPartiel: 0, supportNon: 0, retards: 0, grosRetards: 0, nonTenus: 0,
        negatifs: new Map(), positifs: new Map(), commentaires: [], voteMeilleur: 0, voteAmeliorer: 0,
        parCours: new Map(),
      });
    }
    return ens.get(nom)!;
  };
  const getCours = (ue: string): StatCours => {
    if (!cours.has(ue)) cours.set(ue, { ue, avis: 0, pasCompris: 0, aRevoir: 0, precisions: [] });
    return cours.get(ue)!;
  };

  for (const l of lignes) {
    const r = l.reponses;
    if (l.note) { sommeNotes += l.note; nbNotes++; }
    for (const c of r.cours ?? []) {
      const e = getEns(c.enseignant);
      if (c.tenu === 'non') { e.nonTenus++; nonTenus++; continue; }
      e.avis++;
      const sc = getCours(c.ue);
      sc.avis++;
      const pc = e.parCours.get(c.ue) ?? { avis: 0, pasCompris: 0 };
      pc.avis++;
      if (c.compris === 'non') pc.pasCompris++;
      e.parCours.set(c.ue, pc);
      if (c.qualite === 'bien') e.bien++;
      if (c.qualite === 'mal') e.mal++;
      if (c.compris) {
        nbComprisTotal++;
        if (c.compris === 'oui') { e.comprisOui++; nbCompris++; }
        if (c.compris === 'moyen') e.comprisMoyen++;
        if (c.compris === 'non') { e.comprisNon++; nbPasCompris++; sc.pasCompris++; }
      }
      if (c.support) {
        nbSupportTotal++;
        if (c.support === 'oui') { e.supportOui++; nbSupportOui++; }
        if (c.support === 'partiel') e.supportPartiel++;
        if (c.support === 'non') e.supportNon++;
      }
      if (c.ponctualite === 'retard') e.retards++;
      if (c.ponctualite === 'gros') { e.retards++; e.grosRetards++; }
      (c.negatifs ?? []).forEach((k) => incr(e.negatifs, k));
      (c.positifs ?? []).forEach((k) => incr(e.positifs, k));
      if (c.commentaire) e.commentaires.push({ ue: c.ue, texte: c.commentaire });
    }
    if (r.meilleur?.enseignant) {
      getEns(r.meilleur.enseignant).voteMeilleur++;
      (r.meilleur.raisons ?? []).forEach((k) => incr(getEns(r.meilleur!.enseignant).positifs, k));
    }
    if (r.ameliorer?.enseignant) {
      const e = getEns(r.ameliorer.enseignant);
      e.voteAmeliorer++;
      (r.ameliorer.raisons ?? []).forEach((k) => incr(e.negatifs, k));
      if (r.ameliorer.commentaire) e.commentaires.push({ ue: '—', texte: r.ameliorer.commentaire });
    }
    if (r.revoir) {
      for (const ue of r.revoir.cours ?? []) getCours(ue).aRevoir++;
      if (r.revoir.precision) {
        const cibles = r.revoir.cours?.length ? r.revoir.cours : [];
        cibles.forEach((ue) => getCours(ue).precisions.push(r.revoir!.precision!));
      }
    }
    (r.ecole?.conditions ?? []).forEach((k) => incr(conditions, k));
    if (r.ecole?.infos) infos[r.ecole.infos]++;
    if (r.ecole?.suggestion) suggestions.push({ texte: r.ecole.suggestion, niveau: l.niveau });
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return {
    reponses: lignes.length,
    noteMoyenne: nbNotes ? Math.round((sommeNotes / nbNotes) * 10) / 10 : null,
    pctCompris: pct(nbCompris, nbComprisTotal),
    pctPasCompris: pct(nbPasCompris, nbComprisTotal),
    pctSupport: pct(nbSupportOui, nbSupportTotal),
    coursNonTenus: nonTenus,
    enseignants: Array.from(ens.values()).sort(
      (a, b) => b.bien / Math.max(1, b.avis) - a.bien / Math.max(1, a.avis) || b.avis - a.avis
    ),
    cours: Array.from(cours.values()).sort(
      (a, b) => b.pasCompris / Math.max(1, b.avis) - a.pasCompris / Math.max(1, a.avis) || b.aRevoir - a.aRevoir
    ),
    conditions,
    suggestions,
    infos,
  };
}

export const pourcent = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);