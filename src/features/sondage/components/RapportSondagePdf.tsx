// src/features/sondage/components/RapportSondagePdf.tsx
//
// Rapport PDF des résultats du sondage étudiants — A4 portrait, même identité
// visuelle que les autres rapports du Service de la scolarité :
//   1. synthèse : chiffres clés, compréhension, lecture rapide ;
//   2. participation et résultats par spécialité ;
//   3. classement des enseignants (tableau chiffré) ;
//   4. détail par enseignant (points positifs, comportements, commentaires) ;
//   5. cours à revoir, conditions d'études, suggestions.
import type { ReactNode } from 'react';
import { Donut } from '@/features/rapports-pdf/components/graphiques';
import {
  COULEURS,
  Carte,
  EnteteCompact,
  EnteteHero,
  PageA4,
  PiedDePage,
} from '@/features/rapports-pdf/components/marque';
import { libelleCode } from '../codes';
import { pourcent, type Resume, type StatEnseignant } from '../resultats';

export interface GroupeSondage {
  libelle: string; // spécialité
  niveau: string;
  reponses: number;
  note: number | null;
  compris: number | null;
  nonTenus: number;
}

export type LangueRapport = 'fr' | 'en';

export interface RapportSondage {
  langue?: LangueRapport;
  semaineLibelle: string;
  perimetre: string;
  genereLe: string;
  resume: Resume;
  groupes: GroupeSondage[];
}


const TXT = {
  fr: {
    titre: 'SONDAGE ÉTUDIANTS',
    perimetre: 'Périmètre :',
    anonymes: 'Réponses anonymes des étudiants, lues de façon groupée.',
    kReponses: 'Réponses reçues',
    kNote: 'Note de la semaine',
    kCompris: 'Cours bien compris',
    kSupport: 'Support fourni',
    kNonTenus: 'Cours non tenus signalés',
    comprTitre: 'Compréhension des cours',
    comprSous: 'Ensemble des avis par cours',
    bienCompris: 'bien compris',
    moyen: 'Moyen',
    pasCompris: 'Pas compris',
    total: (n: number) => `Total : ${n} avis`,
    ambiance: 'Ambiance générale',
    ambianceSous: "Informations de l'école",
    infosClaires: 'Informations claires :',
    oui: 'Oui',
    parfois: 'Parfois',
    non: 'Non',
    ensEvalues: 'Enseignants évalués :',
    coursEvalues: 'Cours évalués :',
    lecture: 'Lecture rapide',
    lectureSous: 'Enseignants évalués par au moins 3 avis',
    meilleurs: 'LES MIEUX ÉVALUÉS',
    pasAssez: "Pas assez d'avis pour établir un classement fiable.",
    accompagner: 'À ACCOMPAGNER EN PRIORITÉ',
    aucunEns: 'Aucun enseignant ne ressort particulièrement.',
    moinsCompris: 'COURS LES MOINS COMPRIS',
    aucunCours: 'Aucun cours ne ressort particulièrement.',
    pasComprisSur: (p: number | null, n: number) => `${p}% « pas compris » sur ${n} avis`,
    ligneEns: (n: number, bien: string, compris: string) => `${n} avis · bien passé ${bien} · compris ${compris}`,
    partTitre: 'Participation et résultats par spécialité',
    partSous: 'Une ligne par spécialité et niveau',
    thSpec: 'SPÉCIALITÉ',
    thNiveau: 'NIVEAU',
    thReponses: 'RÉPONSES',
    thNote: 'NOTE /5',
    thBienCompris: 'BIEN COMPRIS',
    thNonTenus: 'NON TENUS',
    classTitre: 'Classement des enseignants',
    classSous: 'Trié par part de séances « bien passées » · vert : bon résultat · rouge : à surveiller',
    thEns: 'ENSEIGNANT',
    thAvis: 'AVIS',
    thBienPasse: 'BIEN PASSÉ',
    thComprisC: 'COMPRIS',
    thSupportC: 'SUPPORT',
    thRetards: 'RETARDS',
    peuAvis: " · peu d'avis",
    lectureNote: "« Bien passé » = part des avis jugeant la séance bien passée · « Compris » = part des étudiants ayant bien compris · « Support » = support de cours fourni complet · « Retards » = part des séances commencées en retard (plus c'est bas, mieux c'est) · ★ = votes « meilleur enseignant », ▲ = votes « doit s'améliorer ».",
    lectureLabel: 'Lecture :',
    detailTitre: 'Détail par enseignant',
    detailSous: 'Ce que les étudiants ont signalé, regroupé par enseignant.',
    positifs: 'POINTS POSITIFS',
    aucunPoint: 'Aucun point signalé',
    comportements: 'COMPORTEMENTS SIGNALÉS',
    aucunComp: 'Aucun comportement signalé',
    votes: 'VOTES',
    meilleurEns: 'Meilleur enseignant :',
    aAmeliorer: 'À améliorer :',
    nonTenue: 'Séance non tenue :',
    autresComs: (n: number) => `+ ${n} autre(s) commentaire(s)`,
    revoirTitre: 'Cours à revoir',
    revoirSous: 'Cours où les étudiants ont du mal à suivre',
    aucunDifficile: "Aucun cours n'est signalé comme difficile.",
    thCours: 'COURS',
    thPasCompris: 'PAS COMPRIS',
    thARevoir: 'À REVOIR',
    fortsTitre: "Points forts de l'école",
    difficultesTitre: 'Difficultés signalées',
    suggTitre: 'Suggestions des étudiants',
    suggSous: 'Reprises telles quelles, de façon anonyme',
    aucuneSugg: 'Aucune suggestion cette semaine.',
    autresSugg: (n: number) => `+ ${n} autre(s) suggestion(s)`,
    page: 'Page',
  },
  en: {
    titre: 'STUDENT SURVEY',
    perimetre: 'Scope:',
    anonymes: 'Anonymous student responses, read in aggregate.',
    kReponses: 'Responses received',
    kNote: 'Weekly rating',
    kCompris: 'Lessons well understood',
    kSupport: 'Course material provided',
    kNonTenus: 'Classes reported as not held',
    comprTitre: 'Understanding of lessons',
    comprSous: 'All lesson-level responses',
    bienCompris: 'well understood',
    moyen: 'Fairly',
    pasCompris: 'Not understood',
    total: (n: number) => `Total: ${n} responses`,
    ambiance: 'General climate',
    ambianceSous: 'Information from the school',
    infosClaires: 'Information clear:',
    oui: 'Yes',
    parfois: 'Sometimes',
    non: 'No',
    ensEvalues: 'Teachers evaluated:',
    coursEvalues: 'Courses evaluated:',
    lecture: 'Quick overview',
    lectureSous: 'Teachers with at least 3 responses',
    meilleurs: 'BEST RATED',
    pasAssez: 'Not enough responses for a reliable ranking.',
    accompagner: 'PRIORITY FOR SUPPORT',
    aucunEns: 'No teacher stands out in particular.',
    moinsCompris: 'LEAST UNDERSTOOD COURSES',
    aucunCours: 'No course stands out in particular.',
    pasComprisSur: (p: number | null, n: number) => `${p}% “not understood” out of ${n} responses`,
    ligneEns: (n: number, bien: string, compris: string) => `${n} responses · went well ${bien} · understood ${compris}`,
    partTitre: 'Participation and results by programme',
    partSous: 'One line per programme and level',
    thSpec: 'PROGRAMME',
    thNiveau: 'LEVEL',
    thReponses: 'RESPONSES',
    thNote: 'RATING /5',
    thBienCompris: 'UNDERSTOOD',
    thNonTenus: 'NOT HELD',
    classTitre: 'Teacher ranking',
    classSous: 'Sorted by share of sessions that “went well” · green: good result · red: to watch',
    thEns: 'TEACHER',
    thAvis: 'RESP.',
    thBienPasse: 'WENT WELL',
    thComprisC: 'UNDERSTOOD',
    thSupportC: 'MATERIAL',
    thRetards: 'LATE',
    peuAvis: ' · few responses',
    lectureNote: '“Went well” = share of responses saying the session went well · “Understood” = share of students who understood well · “Material” = complete course material provided · “Late” = share of sessions that started late (lower is better) · ★ = “best teacher” votes, ▲ = “needs to improve” votes.',
    lectureLabel: 'How to read:',
    detailTitre: 'Detail by teacher',
    detailSous: 'What students reported, grouped by teacher.',
    positifs: 'STRENGTHS',
    aucunPoint: 'No strength reported',
    comportements: 'BEHAVIOURS REPORTED',
    aucunComp: 'No behaviour reported',
    votes: 'VOTES',
    meilleurEns: 'Best teacher:',
    aAmeliorer: 'Needs to improve:',
    nonTenue: 'Class not held:',
    autresComs: (n: number) => `+ ${n} more comment(s)`,
    revoirTitre: 'Courses to revisit',
    revoirSous: 'Courses students find hard to follow',
    aucunDifficile: 'No course is reported as difficult.',
    thCours: 'COURSE',
    thPasCompris: 'NOT UNDERSTOOD',
    thARevoir: 'TO REVISIT',
    fortsTitre: "School's strengths",
    difficultesTitre: 'Difficulties reported',
    suggTitre: 'Student suggestions',
    suggSous: 'Reproduced as written, anonymously',
    aucuneSugg: 'No suggestion this week.',
    autresSugg: (n: number) => `+ ${n} more suggestion(s)`,
    page: 'Page',
  },
} as const;

const BON = '#16a34a';
const MOYEN = '#f59e0b';
const MAUVAIS = '#dc2626';
const POSITIFS_ECOLE = ['salles_propres', 'bon_materiel', 'horaires_respectes', 'bonne_ambiance'];

function couleurNiveau(valeur: number | null, bon: boolean): string {
  if (valeur === null) return '#9ca3af';
  if (bon) return valeur >= 70 ? BON : valeur >= 40 ? MOYEN : MAUVAIS;
  return valeur >= 40 ? MAUVAIS : valeur >= 20 ? MOYEN : BON;
}

function Barre({ valeur, bon }: { valeur: number | null; bon: boolean }) {
  const c = couleurNiveau(valeur, bon);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm' }}>
      <div style={{ flex: 1, height: '2.2mm', background: '#eef0f6', borderRadius: '2mm', overflow: 'hidden' }}>
        {valeur !== null && <div style={{ width: `${valeur}%`, height: '100%', background: c, borderRadius: '2mm' }} />}
      </div>
      <span style={{ width: '9mm', textAlign: 'right', fontSize: '9.5px', fontWeight: 800, color: c }}>
        {valeur === null ? '—' : `${valeur}%`}
      </span>
    </div>
  );
}

function Kpi({ valeur, label, couleur }: { valeur: string; label: string; couleur: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid #e8e9f4',
        borderRadius: '4mm',
        padding: '3.5mm 3mm',
        textAlign: 'center',
        borderTop: `1.2mm solid ${couleur}`,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 900, color: COULEURS.marine, lineHeight: 1.1 }}>{valeur}</div>
      <div style={{ fontSize: '8.5px', fontWeight: 700, color: COULEURS.discret, marginTop: '1mm' }}>{label}</div>
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '8.5px',
  fontWeight: 800,
  color: COULEURS.discret,
  padding: '1.6mm 1.5mm',
  borderBottom: `0.4mm solid ${COULEURS.marine}`,
  letterSpacing: '0.03em',
};
const TD: React.CSSProperties = { padding: '1.7mm 1.5mm', fontSize: '10px', borderBottom: '1px solid #eef0f6', verticalAlign: 'middle' };

function top(m: Map<string, number>, n: number): [string, number][] {
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function morceaux<T>(liste: T[], taille: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille));
  return out;
}

const pctTxt = (v: number | null): string => (v === null ? '—' : `${v}%`);
const bienPct = (e: StatEnseignant) => pourcent(e.bien, e.bien + e.mal);
const comprisPct = (e: StatEnseignant) => pourcent(e.comprisOui, e.comprisOui + e.comprisMoyen + e.comprisNon);
const supportPct = (e: StatEnseignant) => pourcent(e.supportOui, e.supportOui + e.supportPartiel + e.supportNon);
const retardPct = (e: StatEnseignant) => pourcent(e.retards, e.avis);

/** Hauteur approximative (mm) d'une fiche enseignant, pour remplir les pages sans débordement. */
function poids(e: StatEnseignant): number {
  const lignesCom = Math.min(3, e.commentaires.length);
  return 30 + (lignesCom ? 3 : 0) + lignesCom * 4.3 + (e.commentaires.length > lignesCom ? 3 : 0) + 3;
}

function regrouperFiches(liste: StatEnseignant[]): StatEnseignant[][] {
  const pages: StatEnseignant[][] = [];
  let courante: StatEnseignant[] = [];
  let somme = 0;
  for (const e of liste) {
    const p = poids(e);
    if (courante.length > 0 && somme + p > 218) {
      pages.push(courante);
      courante = [];
      somme = 0;
    }
    courante.push(e);
    somme += p;
  }
  if (courante.length) pages.push(courante);
  return pages;
}

function FicheEnseignant({ e, L }: { e: StatEnseignant; L: LangueRapport }) {
  const t = TXT[L];
  const positifs = top(e.positifs, 3);
  const negatifs = top(e.negatifs, 4);
  const coms = e.commentaires.slice(0, 3);
  return (
    <div
      style={{
        border: '1px solid #e8e9f4',
        borderRadius: '3.5mm',
        padding: '3mm 4mm',
        marginBottom: '3mm',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4mm' }}>
        <div style={{ fontSize: '12px', fontWeight: 900, color: COULEURS.marine }}>{e.nom}</div>
        <div style={{ fontSize: '9px', fontWeight: 700, color: COULEURS.discret, whiteSpace: 'nowrap' }}>
          {t.ligneEns(e.avis, pctTxt(bienPct(e)), pctTxt(comprisPct(e)))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6mm', marginTop: '2mm' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8.5px', fontWeight: 900, color: BON, marginBottom: '1mm', letterSpacing: '0.05em' }}>
            {t.positifs}
          </div>
          {positifs.length === 0 ? (
            <div style={{ fontSize: '9.5px', color: '#9ca3af' }}>{t.aucunPoint}</div>
          ) : (
            positifs.map(([k, n]) => (
              <div key={k} style={{ fontSize: '9.5px', marginBottom: '0.6mm' }}>
                ＋ {libelleCode(k, L)} <b>×{n}</b>
              </div>
            ))
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8.5px', fontWeight: 900, color: MAUVAIS, marginBottom: '1mm', letterSpacing: '0.05em' }}>
            {t.comportements}
          </div>
          {negatifs.length === 0 ? (
            <div style={{ fontSize: '9.5px', color: '#9ca3af' }}>{t.aucunComp}</div>
          ) : (
            negatifs.map(([k, n]) => (
              <div key={k} style={{ fontSize: '9.5px', marginBottom: '0.6mm' }}>
                － {libelleCode(k, L)} <b>×{n}</b>
              </div>
            ))
          )}
        </div>
        <div style={{ width: '34mm' }}>
          <div style={{ fontSize: '8.5px', fontWeight: 900, color: COULEURS.marine, marginBottom: '1mm', letterSpacing: '0.05em' }}>
            {t.votes}
          </div>
          <div style={{ fontSize: '9.5px', marginBottom: '0.6mm' }}>
            {t.meilleurEns} <b>{e.voteMeilleur}</b>
          </div>
          <div style={{ fontSize: '9.5px', marginBottom: '0.6mm' }}>
            {t.aAmeliorer} <b>{e.voteAmeliorer}</b>
          </div>
          {e.nonTenus > 0 && (
            <div style={{ fontSize: '9.5px', color: MAUVAIS }}>{t.nonTenue} <b>{e.nonTenus}</b></div>
          )}
        </div>
      </div>
      {coms.length > 0 && (
        <div style={{ marginTop: '2mm', borderTop: '1px dashed #e5e7eb', paddingTop: '1.6mm' }}>
          {coms.map((c, i) => (
            <div key={i} style={{ fontSize: '9px', color: '#4b5563', fontStyle: 'italic', marginBottom: '0.8mm' }}>
              « {c.texte} »{c.ue !== '—' && <span style={{ color: '#9ca3af', fontStyle: 'normal' }}> — {c.ue}</span>}
            </div>
          ))}
          {e.commentaires.length > coms.length && (
            <div style={{ fontSize: '8.5px', color: '#9ca3af' }}>{t.autresComs(e.commentaires.length - coms.length)}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function RapportSondagePdf({ rapport }: { rapport: RapportSondage }) {
  const { resume } = rapport;
  const L: LangueRapport = rapport.langue ?? 'fr';
  const t = TXT[L];
  const titre = t.titre;
  const periode = rapport.semaineLibelle;
  const entete = <EnteteCompact titre={titre} periode={periode} langue={L} />;
  const pied = <PiedDePage genereLe={rapport.genereLe} langue={L} />;

  const ens = resume.enseignants;
  const classes = ens.filter((e) => e.avis > 0);
  const fiables = classes.filter((e) => e.avis >= 3);

  const totalCompris = ens.reduce((s, e) => s + e.comprisOui + e.comprisMoyen + e.comprisNon, 0);
  const sommeOui = ens.reduce((s, e) => s + e.comprisOui, 0);
  const sommeMoyen = ens.reduce((s, e) => s + e.comprisMoyen, 0);
  const sommeNon = ens.reduce((s, e) => s + e.comprisNon, 0);

  const scoreHaut = (e: StatEnseignant) => (bienPct(e) ?? 0) + (comprisPct(e) ?? 0);
  const meilleurs = [...fiables].sort((a, b) => scoreHaut(b) - scoreHaut(a)).slice(0, 3);
  const aAccompagner = [...fiables]
    .filter((e) => (bienPct(e) ?? 100) < 60 || (comprisPct(e) ?? 100) < 60 || e.voteAmeliorer > 0)
    .sort((a, b) => scoreHaut(a) - scoreHaut(b) || b.voteAmeliorer - a.voteAmeliorer)
    .slice(0, 3);
  const coursDifficiles = resume.cours.filter((c) => c.avis >= 2 && c.pasCompris > 0).slice(0, 3);

  const pagesClassement = morceaux(classes, 24);
  const pagesGroupes = morceaux(rapport.groupes, 30);
  const pagesFiches = regrouperFiches(classes);
  const total = 1 + pagesGroupes.length + pagesClassement.length + pagesFiches.length + 1;
  let numero = 0;
  const pageSuivante = () => ++numero;

  const LigneLecture = ({ e }: { e: StatEnseignant }) => (
    <div style={{ fontSize: '10px', marginBottom: '1.2mm' }}>
      <b>{e.nom}</b>
      <span style={{ color: COULEURS.discret }}>
        {' '}
        — {t.ligneEns(e.avis, pctTxt(bienPct(e)), pctTxt(comprisPct(e)))}
      </span>
    </div>
  );

  const NumeroPage = ({ n }: { n: number }) => (
    <div style={{ textAlign: 'right', fontSize: '8.5px', fontWeight: 700, color: COULEURS.discret, marginTop: '3mm' }}>
      {t.page} {n} / {total}
    </div>
  );

  const pages: ReactNode[] = [];

  // ── 1. Synthèse ──
  const n1 = pageSuivante();
  pages.push(
    <PageA4 key="synthese" enTete={<EnteteHero titre={titre} periode={periode} langue={L} />} pied={pied}>
      <div style={{ fontSize: '10px', color: COULEURS.discret, marginBottom: '4mm' }}>
        {t.perimetre} <b style={{ color: COULEURS.texte }}>{rapport.perimetre}</b> · {t.anonymes}
      </div>

      <div style={{ display: 'flex', gap: '3mm', marginBottom: '5mm' }}>
        <Kpi valeur={String(resume.reponses)} label={t.kReponses} couleur={COULEURS.marine} />
        <Kpi valeur={resume.noteMoyenne !== null ? `${resume.noteMoyenne}/5` : '—'} label={t.kNote} couleur={COULEURS.or} />
        <Kpi valeur={resume.pctCompris !== null ? `${resume.pctCompris}%` : '—'} label={t.kCompris} couleur={COULEURS.vert} />
        <Kpi valeur={resume.pctSupport !== null ? `${resume.pctSupport}%` : '—'} label={t.kSupport} couleur={COULEURS.turquoise} />
        <Kpi valeur={String(resume.coursNonTenus)} label={t.kNonTenus} couleur={COULEURS.rose} />
      </div>

      <div style={{ display: 'flex', gap: '5mm', marginBottom: '5mm' }}>
        <Carte titre={t.comprTitre} sousTitre={t.comprSous} style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
            <Donut
              taille={150}
              centre={resume.pctCompris !== null ? `${resume.pctCompris}%` : '—'}
              sousCentre={t.bienCompris}
              parts={[
                { label: t.bienCompris, valeur: sommeOui, couleur: BON },
                { label: t.moyen, valeur: sommeMoyen, couleur: MOYEN },
                { label: t.pasCompris, valeur: sommeNon, couleur: MAUVAIS },
              ]}
            />
            <div style={{ fontSize: '10px', lineHeight: 1.9 }}>
              <div><span style={{ color: BON }}>●</span> {t.bienCompris}{L === 'en' ? ':' : ' :'} <b>{sommeOui}</b></div>
              <div><span style={{ color: MOYEN }}>●</span> {t.moyen}{L === 'en' ? ':' : ' :'} <b>{sommeMoyen}</b></div>
              <div><span style={{ color: MAUVAIS }}>●</span> {t.pasCompris}{L === 'en' ? ':' : ' :'} <b>{sommeNon}</b></div>
              <div style={{ color: COULEURS.discret }}>{t.total(totalCompris)}</div>
            </div>
          </div>
        </Carte>
        <Carte titre={t.ambiance} sousTitre={t.ambianceSous} couleur={COULEURS.turquoise} style={{ width: '62mm' }}>
          <div style={{ fontSize: '10px', lineHeight: 1.9 }}>
            <div>{t.infosClaires}</div>
            <div>{t.oui} <b>{resume.infos.oui}</b> · {t.parfois} <b>{resume.infos.parfois}</b> · {t.non} <b>{resume.infos.non}</b></div>
            <div style={{ marginTop: '1.5mm' }}>{t.ensEvalues} <b>{classes.length}</b></div>
            <div>{t.coursEvalues} <b>{resume.cours.length}</b></div>
          </div>
        </Carte>
      </div>

      <Carte titre={t.lecture} sousTitre={t.lectureSous} couleur={COULEURS.vert}>
        <div style={{ fontSize: '9px', fontWeight: 900, color: BON, letterSpacing: '0.05em', marginBottom: '1.2mm' }}>
          {t.meilleurs}
        </div>
        {meilleurs.length === 0 ? (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{t.pasAssez}</div>
        ) : (
          meilleurs.map((e) => <LigneLecture key={e.nom} e={e} />)
        )}
        <div style={{ fontSize: '9px', fontWeight: 900, color: MAUVAIS, letterSpacing: '0.05em', margin: '3mm 0 1.2mm' }}>
          {t.accompagner}
        </div>
        {aAccompagner.length === 0 ? (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{t.aucunEns}</div>
        ) : (
          aAccompagner.map((e) => <LigneLecture key={e.nom} e={e} />)
        )}
        <div style={{ fontSize: '9px', fontWeight: 900, color: MOYEN, letterSpacing: '0.05em', margin: '3mm 0 1.2mm' }}>
          {t.moinsCompris}
        </div>
        {coursDifficiles.length === 0 ? (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{t.aucunCours}</div>
        ) : (
          coursDifficiles.map((c) => (
            <div key={c.ue} style={{ fontSize: '10px', marginBottom: '1.2mm' }}>
              <b>{c.ue}</b>
              <span style={{ color: COULEURS.discret }}> — {t.pasComprisSur(pourcent(c.pasCompris, c.avis), c.avis)}</span>
            </div>
          ))
        )}
      </Carte>
      <NumeroPage n={n1} />
    </PageA4>
  );

  // ── 2. Participation par spécialité ──
  pagesGroupes.forEach((groupe, i) => {
    const n = pageSuivante();
    pages.push(
      <PageA4 key={`groupes-${i}`} enTete={entete} pied={pied}>
        <Carte titre={t.partTitre} sousTitre={t.partSous} couleur={COULEURS.marine}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>{t.thSpec}</th>
                <th style={TH}>{t.thNiveau}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{t.thReponses}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{t.thNote}</th>
                <th style={{ ...TH, width: '38mm' }}>{t.thBienCompris}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{t.thNonTenus}</th>
              </tr>
            </thead>
            <tbody>
              {groupe.map((g) => (
                <tr key={`${g.libelle}|${g.niveau}`} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...TD, fontWeight: 700 }}>{g.libelle}</td>
                  <td style={TD}>{g.niveau}</td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: g.reponses === 0 ? '#9ca3af' : COULEURS.texte }}>
                    {g.reponses}
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>{g.note !== null ? g.note : '—'}</td>
                  <td style={TD}><Barre valeur={g.compris} bon /></td>
                  <td style={{ ...TD, textAlign: 'right', color: g.nonTenus > 0 ? MAUVAIS : COULEURS.texte }}>{g.nonTenus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
        <NumeroPage n={n} />
      </PageA4>
    );
  });

  // ── 3. Classement des enseignants ──
  pagesClassement.forEach((lot, i) => {
    const n = pageSuivante();
    const decalage = i * 24;
    pages.push(
      <PageA4 key={`classement-${i}`} enTete={entete} pied={pied}>
        <Carte
          titre={t.classTitre}
          sousTitre={t.classSous}
          couleur={COULEURS.violet}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: '6mm' }}>#</th>
                <th style={TH}>{t.thEns}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{t.thAvis}</th>
                <th style={{ ...TH, width: '26mm' }}>{t.thBienPasse}</th>
                <th style={{ ...TH, width: '26mm' }}>{t.thComprisC}</th>
                <th style={{ ...TH, width: '26mm' }}>{t.thSupportC}</th>
                <th style={{ ...TH, width: '26mm' }}>{t.thRetards}</th>
                <th style={{ ...TH, textAlign: 'center' }}>★ / ▲</th>
              </tr>
            </thead>
            <tbody>
              {lot.map((e, j) => (
                <tr key={e.nom} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...TD, color: COULEURS.discret }}>{decalage + j + 1}</td>
                  <td style={{ ...TD, fontWeight: 700 }}>
                    {e.nom}
                    {e.avis < 3 && <span style={{ color: '#9ca3af', fontWeight: 600, fontSize: '8px' }}>{t.peuAvis}</span>}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 800 }}>{e.avis}</td>
                  <td style={TD}><Barre valeur={bienPct(e)} bon /></td>
                  <td style={TD}><Barre valeur={comprisPct(e)} bon /></td>
                  <td style={TD}><Barre valeur={supportPct(e)} bon /></td>
                  <td style={TD}><Barre valeur={retardPct(e)} bon={false} /></td>
                  <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{ color: BON, fontWeight: 800 }}>{e.voteMeilleur}</span>
                    {' / '}
                    <span style={{ color: e.voteAmeliorer > 0 ? MAUVAIS : COULEURS.texte, fontWeight: 800 }}>{e.voteAmeliorer}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '8.5px', color: COULEURS.discret, marginTop: '2.5mm', lineHeight: 1.5 }}>
            <b>{t.lectureLabel}</b> {t.lectureNote}
          </div>
        </Carte>
        <NumeroPage n={n} />
      </PageA4>
    );
  });

  // ── 4. Détail par enseignant ──
  pagesFiches.forEach((lot, i) => {
    const n = pageSuivante();
    pages.push(
      <PageA4 key={`fiches-${i}`} enTete={entete} pied={pied}>
        <div style={{ fontSize: '13px', fontWeight: 900, color: COULEURS.marine, marginBottom: '1mm' }}>
          {t.detailTitre}
        </div>
        <div style={{ fontSize: '9.5px', fontWeight: 600, color: COULEURS.discret, marginBottom: '3mm' }}>
          {t.detailSous}
        </div>
        {lot.map((e) => (
          <FicheEnseignant key={e.nom} e={e} L={L} />
        ))}
        <NumeroPage n={n} />
      </PageA4>
    );
  });

  // ── 5. Cours à revoir, conditions, suggestions ──
  const n5 = pageSuivante();
  const conditionsPos = top(
    new Map(Array.from(resume.conditions.entries()).filter(([k]) => POSITIFS_ECOLE.includes(k))),
    6
  );
  const conditionsNeg = top(
    new Map(Array.from(resume.conditions.entries()).filter(([k]) => !POSITIFS_ECOLE.includes(k))),
    8
  );
  pages.push(
    <PageA4 key="fin" enTete={entete} pied={pied} derniere>
      <Carte titre={t.revoirTitre} sousTitre={t.revoirSous} couleur={COULEURS.orange}>
        {resume.cours.filter((c) => c.pasCompris > 0 || c.aRevoir > 0).length === 0 ? (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{t.aucunDifficile}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>{t.thCours}</th>
                <th style={{ ...TH, textAlign: 'right' }}>AVIS</th>
                <th style={{ ...TH, width: '30mm' }}>{t.thPasCompris}</th>
                <th style={{ ...TH, textAlign: 'right' }}>{t.thARevoir}</th>
              </tr>
            </thead>
            <tbody>
              {resume.cours
                .filter((c) => c.pasCompris > 0 || c.aRevoir > 0)
                .slice(0, 10)
                .map((c) => (
                  <tr key={c.ue} style={{ pageBreakInside: 'avoid' }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 700 }}>{c.ue}</div>
                      {Array.from(new Set(c.precisions)).slice(0, 2).map((p, i) => (
                        <div key={i} style={{ fontSize: '8.5px', color: COULEURS.discret }}>↳ {p}</div>
                      ))}
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>{c.avis}</td>
                    <td style={TD}><Barre valeur={pourcent(c.pasCompris, c.avis)} bon={false} /></td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800 }}>{c.aRevoir}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Carte>

      <div style={{ display: 'flex', gap: '5mm', margin: '5mm 0' }}>
        <Carte titre={t.fortsTitre} couleur={BON} style={{ flex: 1 }}>
          {conditionsPos.length === 0 ? (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>—</div>
          ) : (
            conditionsPos.map(([k, n]) => (
              <div key={k} style={{ fontSize: '10px', marginBottom: '1.2mm' }}>
                ＋ {libelleCode(k, L)} <b>×{n}</b>
              </div>
            ))
          )}
        </Carte>
        <Carte titre={t.difficultesTitre} couleur={MAUVAIS} style={{ flex: 1 }}>
          {conditionsNeg.length === 0 ? (
            <div style={{ fontSize: '10px', color: '#9ca3af' }}>—</div>
          ) : (
            conditionsNeg.map(([k, n]) => (
              <div key={k} style={{ fontSize: '10px', marginBottom: '1.2mm' }}>
                － {libelleCode(k, L)} <b>×{n}</b>
              </div>
            ))
          )}
        </Carte>
      </div>

      <Carte titre={t.suggTitre} sousTitre={t.suggSous} couleur={COULEURS.violet}>
        {resume.suggestions.length === 0 ? (
          <div style={{ fontSize: '10px', color: '#9ca3af' }}>{t.aucuneSugg}</div>
        ) : (
          resume.suggestions.slice(0, 14).map((s, i) => (
            <div key={i} style={{ fontSize: '9.5px', marginBottom: '1.8mm', pageBreakInside: 'avoid' }}>
              <span style={{ color: '#9ca3af', fontWeight: 700 }}>{s.niveau} · </span>
              {s.texte}
            </div>
          ))
        )}
        {resume.suggestions.length > 14 && (
          <div style={{ fontSize: '8.5px', color: '#9ca3af' }}>{t.autresSugg(resume.suggestions.length - 14)}</div>
        )}
      </Carte>
      <NumeroPage n={n5} />
    </PageA4>
  );

  return <div className="rapport-pdf">{pages}</div>;
}