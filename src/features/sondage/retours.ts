// src/features/sondage/retours.ts
//
// Retours aux enseignants : transforme les résultats du sondage en un message
// WhatsApp poli (français ou anglais) — d'abord ce qui est apprécié, puis des
// pistes d'amélioration formulées avec bienveillance — et fabrique le lien
// wa.me. Aucune donnée n'est envoyée automatiquement : l'administration relit
// et modifie le message avant de l'ouvrir dans WhatsApp.
import type { Langue } from './codes';
import { pourcent, type StatCours, type StatEnseignant } from './resultats';

type Phrase = { fr: string; en: string };

// Ce que les étudiants apprécient.
const APPRECIE: Record<string, Phrase> = {
  explique_clairement: { fr: 'la clarté de vos explications', en: 'the clarity of your explanations' },
  donne_exemples: { fr: 'les exemples concrets que vous donnez', en: 'the concrete examples you give' },
  ponctuel: { fr: 'votre ponctualité', en: 'your punctuality' },
  interactif: { fr: 'le caractère interactif de vos cours', en: 'the interactive nature of your classes' },
  repond_questions: { fr: 'votre écoute et vos réponses aux questions', en: 'your attentiveness to their questions' },
  bonne_pedagogie: { fr: 'votre pédagogie', en: 'your teaching approach' },
  respectueux: { fr: 'votre attitude respectueuse', en: 'your respectful attitude' },
};

// Pistes d'amélioration, formulées de façon constructive (jamais accusatoire).
const AMELIORER: Record<string, Phrase> = {
  telephone: {
    fr: 'limiter l’usage du téléphone pendant les séances, pour rester pleinement disponible',
    en: 'limit phone use during sessions, so as to stay fully available to the class',
  },
  dicte: {
    fr: 'varier la méthode en alternant explications, échanges et exercices plutôt que la dictée du cours',
    en: 'vary the method by alternating explanations, discussion and exercises rather than dictating the lesson',
  },
  ne_repond_pas: {
    fr: 'prendre davantage de temps pour répondre aux questions des étudiants',
    en: 'take more time to answer students’ questions',
  },
  lit_diapos: {
    fr: 'commenter et illustrer les diapositives plutôt que de les lire',
    en: 'comment on and illustrate the slides rather than simply reading them',
  },
  trop_vite: {
    fr: 'ralentir légèrement le rythme afin que chacun puisse suivre',
    en: 'slow the pace slightly so that everyone can follow',
  },
  confus: {
    fr: 'structurer davantage les explications, avec un fil conducteur plus net',
    en: 'structure the explanations more, with a clearer common thread',
  },
  quitte_tot: {
    fr: 'utiliser la totalité du créneau prévu pour chaque séance',
    en: 'use the whole scheduled slot for each session',
  },
  impoli: {
    fr: 'veiller à une communication toujours bienveillante envers les étudiants',
    en: 'ensure communication with the students always remains kind and encouraging',
  },
  favoritisme: {
    fr: 'veiller à ce que chaque étudiant se sente traité de façon équitable',
    en: 'make sure every student feels treated fairly',
  },
  pas_exercices: {
    fr: 'proposer davantage d’exercices et d’exemples d’application',
    en: 'offer more exercises and worked examples',
  },
  retards_frequents: {
    fr: 'veiller à débuter les séances à l’heure prévue',
    en: 'make sure sessions start at the scheduled time',
  },
  pas_support: {
    fr: 'mettre le support de cours à la disposition des étudiants',
    en: 'make the course material available to the students',
  },
};

export interface OptionsMessage {
  nom: string;
  langue: Langue;
  /** Lundi (YYYY-MM-DD) de la semaine du sondage. */
  semaine: string;
  /** Commentaires d'étudiants à citer tels quels (choisis par l'administration). */
  commentaires?: string[];
  /** Précisions « à revoir » par matière (issues du sondage). */
  coursGlobaux?: StatCours[];
}

export interface PointsRetour {
  appreciations: string[];
  ameliorations: string[];
}

const top = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]);

/**
 * Un signalement isolé n'est pas repris (un seul étudiant sur plusieurs
 * dizaines) : il faut au moins 2 étudiants, ou 20 % des avis.
 */
function assezSignale(n: number, avis: number): boolean {
  return n >= 2 || (avis > 0 && n / avis >= 0.2);
}

export function libelleSemaineRetour(iso: string, langue: Langue): string {
  const [y, m, d] = iso.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 5);
  const loc = langue === 'en' ? 'en-GB' : 'fr-FR';
  const jourMois: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  return `${a.toLocaleDateString(loc, jourMois)} – ${b.toLocaleDateString(loc, { ...jourMois, year: 'numeric' })}`;
}

/** Les points qui ressortent des avis, avant mise en forme. */
export function analyserRetour(e: StatEnseignant, langue: Langue, coursGlobaux: StatCours[] = []): PointsRetour {
  const L = langue;
  const appreciations: string[] = [];
  const ameliorations: string[] = [];

  // — Appréciations —
  const bienPct = pourcent(e.bien, e.bien + e.mal);
  const comprisPct = pourcent(e.comprisOui, e.comprisOui + e.comprisMoyen + e.comprisNon);
  if (bienPct !== null && bienPct >= 60 && e.bien + e.mal >= 3) {
    appreciations.push(
      L === 'en'
        ? `${bienPct}% of students felt your sessions went well`
        : `${bienPct} % des étudiants estiment que vos séances se sont bien passées`
    );
  }
  if (comprisPct !== null && comprisPct >= 60 && e.comprisOui + e.comprisMoyen + e.comprisNon >= 3) {
    appreciations.push(
      L === 'en'
        ? `${comprisPct}% of students said they understood your lessons well`
        : `${comprisPct} % des étudiants disent avoir bien compris vos cours`
    );
  }
  for (const [code, n] of top(e.positifs)) {
    if (appreciations.length >= 4) break;
    if (!APPRECIE[code] || !assezSignale(n, e.avis)) continue;
    appreciations.push(
      L === 'en' ? `Students value ${APPRECIE[code].en}` : `Les étudiants apprécient ${APPRECIE[code].fr}`
    );
  }
  if (e.voteMeilleur > 0) {
    appreciations.push(
      L === 'en'
        ? `${e.voteMeilleur} student${e.voteMeilleur > 1 ? 's' : ''} named you as the teacher who taught them best this week`
        : e.voteMeilleur > 1
          ? `${e.voteMeilleur} étudiants vous ont cité parmi les enseignants qui leur ont le mieux donné cours cette semaine`
          : 'Un étudiant vous a cité parmi les enseignants qui lui ont le mieux donné cours cette semaine'
    );
  }

  // — Pistes d'amélioration —
  const dejaDit = new Set<string>();
  const ajouterCode = (code: string) => {
    const p = AMELIORER[code];
    if (!p || dejaDit.has(code)) return;
    dejaDit.add(code);
    ameliorations.push(L === 'en' ? `It could be helpful to ${p.en}` : `Il serait souhaitable de ${p.fr}`);
  };
  // Ponctualité : retards signalés ou code « souvent en retard ».
  const nbRetards = e.retards;
  if (assezSignale(nbRetards, e.avis)) ajouterCode('retards_frequents');
  // Support de cours.
  const supportTotal = e.supportOui + e.supportPartiel + e.supportNon;
  const supportManquant = e.supportPartiel + e.supportNon;
  if (supportTotal >= 2 && supportManquant / supportTotal >= 0.4) ajouterCode('pas_support');
  // Comportements signalés par code.
  for (const [code, n] of top(e.negatifs)) {
    if (ameliorations.length >= 5) break;
    if (!assezSignale(n, e.avis)) continue;
    ajouterCode(code);
  }
  // Matières mal comprises.
  const parUe = Array.from(e.parCours.entries())
    .filter(([, v]) => v.pasCompris >= 2 && v.pasCompris / Math.max(1, v.avis) >= 0.35)
    .sort((a, b) => b[1].pasCompris / b[1].avis - a[1].pasCompris / a[1].avis);
  for (const [ue, v] of parUe.slice(0, 2)) {
    const pct = pourcent(v.pasCompris, v.avis);
    const g = coursGlobaux.find((c) => c.ue === ue);
    const precisions = Array.from(new Set((g?.precisions ?? []).map((p) => p.trim()).filter(Boolean))).slice(0, 2);
    const suite = precisions.length
      ? L === 'en'
        ? ` (parts mentioned: ${precisions.join('; ')})`
        : ` (parties citées : ${precisions.join(' ; ')})`
      : '';
    ameliorations.push(
      L === 'en'
        ? `${pct}% of students found “${ue}” hard to follow: a short recap or extra examples on the key points would help${suite}`
        : `${pct} % des étudiants ont eu du mal à suivre « ${ue} » : une courte reprise ou des exemples supplémentaires sur les points clés les aideraient${suite}`
    );
  }
  return { appreciations, ameliorations };
}

export function construireMessage(e: StatEnseignant, o: OptionsMessage): string {
  const L = o.langue;
  const { appreciations, ameliorations } = analyserRetour(e, L, o.coursGlobaux);
  const semaine = libelleSemaineRetour(o.semaine, L);
  const puce = (t: string) => `• ${t}`;
  const lignes: string[] = [];

  if (L === 'en') {
    lignes.push(`Dear Sir/Madam ${o.nom},`, '');
    lignes.push(
      'The Academic Affairs Office of CENULAPE sincerely thanks you for your commitment to our students.',
      ''
    );
    lignes.push(
      `Each week we collect students’ anonymous feedback on the classes taught. For the week of ${semaine}, ` +
        `${e.avis} response${e.avis > 1 ? 's were' : ' was'} received about your teaching.`,
      ''
    );
    if (appreciations.length) {
      lignes.push('✅ What students appreciated:', ...appreciations.map(puce), '');
    }
    if (ameliorations.length) {
      lignes.push(
        '📌 A few suggestions, shared in a spirit of support:',
        ...ameliorations.map(puce),
        ''
      );
    }
    if (o.commentaires?.length) {
      lignes.push('💬 Students’ comments:', ...o.commentaires.map((c) => puce(`“${c.trim()}”`)), '');
    }
    if (!ameliorations.length) {
      lignes.push('No particular concern was raised this week. We encourage you to keep up the good work.', '');
    } else {
      lignes.push(
        'We kindly invite you to take these remarks into account in your upcoming sessions. We remain at your disposal to discuss them and support you.',
        ''
      );
    }
    lignes.push('Thank you for your understanding and your continued dedication.', '', 'Kind regards,', 'Academic Affairs Office — CENULAPE');
  } else {
    lignes.push(`Bonjour Monsieur/Madame ${o.nom},`, '');
    lignes.push('Le Service de la scolarité du CENULAPE vous remercie sincèrement pour votre engagement auprès de nos étudiants.', '');
    lignes.push(
      `Chaque semaine, nous recueillons de façon anonyme l’avis des étudiants sur les cours dispensés. Pour la semaine du ${semaine}, ` +
        `${e.avis > 1 ? `${e.avis} avis ont été exprimés` : '1 avis a été exprimé'} au sujet de vos enseignements.`,
      ''
    );
    if (appreciations.length) {
      lignes.push('✅ Ce que les étudiants ont apprécié :', ...appreciations.map(puce), '');
    }
    if (ameliorations.length) {
      lignes.push(
        '📌 Quelques pistes d’amélioration, partagées avec bienveillance :',
        ...ameliorations.map(puce),
        ''
      );
    }
    if (o.commentaires?.length) {
      lignes.push('💬 Commentaires d’étudiants :', ...o.commentaires.map((c) => puce(`« ${c.trim()} »`)), '');
    }
    if (!ameliorations.length) {
      lignes.push('Aucune remarque particulière n’a été relevée cette semaine. Nous vous encourageons à poursuivre sur cette lancée.', '');
    } else {
      lignes.push(
        'Nous vous invitons à tenir compte de ces remarques lors de vos prochaines séances. Nous restons à votre disposition pour en discuter et vous accompagner.',
        ''
      );
    }
    lignes.push('Merci pour votre compréhension et votre engagement.', '', 'Cordialement,', 'Le Service de la scolarité — CENULAPE');
  }
  return lignes.join('\n');
}

/**
 * Numéro utilisable avec wa.me : chiffres uniquement, avec l'indicatif du
 * Cameroun (237) ajouté quand le numéro est saisi sans indicatif.
 */
export function normaliserNumero(brut: string | null | undefined): string | null {
  if (!brut) return null;
  let n = brut.replace(/[^\d]/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length === 9 && n.startsWith('6')) n = `237${n}`;
  return n.length >= 8 && n.length <= 15 ? n : null;
}

export function lienWhatsApp(numero: string | null | undefined, texte: string): string | null {
  const n = normaliserNumero(numero);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texte)}` : null;
}

export interface RepereEnseignant {
  bienPct: number | null;
  comprisPct: number | null;
  supportPct: number | null;
  retardPct: number | null;
}

export function reperes(e: StatEnseignant): RepereEnseignant {
  return {
    bienPct: pourcent(e.bien, e.bien + e.mal),
    comprisPct: pourcent(e.comprisOui, e.comprisOui + e.comprisMoyen + e.comprisNon),
    supportPct: pourcent(e.supportOui, e.supportOui + e.supportPartiel + e.supportNon),
    retardPct: pourcent(e.retards, e.avis),
  };
}