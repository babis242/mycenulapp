// src/features/fiches-presence/components/RapportGlobalPdf.tsx
//
// Rapport de présence global (A4 portrait, pagination automatique), rédigé
// pour être lisible sans explication : résumé, évolution par semaine, par
// cycle (BTS, HND…), par spécialité (fiches enregistrées),
// liste des absents, puis synthèse des absences de la semaine.
import { anneeAcademique, libelleSemaine } from './FichesPresencePdf';
import {
  absencesDe,
  categorieAbsence,
  tauxDe,
  type CategorieAbsence,
  type EtudiantAbsent,
  type GroupeRapport,
  type Rapport,
  type Stat,
} from '../rapportGlobalApi';

const ROUGE = '#dc2626';
const VERT = '#16a34a';
const AMBRE = '#d97706';
const SANS = "'Nunito', 'Segoe UI', Arial, Helvetica, sans-serif";
const couleurTaux = (t: number | null) => (t === null ? '#6b7280' : t >= 75 ? VERT : t >= 50 ? AMBRE : ROUGE);
const pct = (s: Stat) => {
  const t = tauxDe(s);
  return t === null ? '—' : `${t} %`;
};
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const heures = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} h`;

function nomClasse(g: GroupeRapport): string {
  const n = Number(g.semestre.replace(/[^0-9]/g, ''));
  if (!g.semestre || !n) return `${g.specialite} — aucun étudiant enregistré`;
  return `${g.specialite} — Niveau ${Math.ceil(n / 2)} (S${n})`;
}

const th: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  fontSize: '8.5px',
  fontWeight: 700,
  letterSpacing: '0.3px',
  padding: '1.6mm 2mm',
  textAlign: 'center',
};
const td: React.CSSProperties = { borderBottom: '0.2mm solid #e5e7eb', padding: '1.4mm 2mm', fontSize: '9.5px', textAlign: 'center' };
const tdG: React.CSSProperties = { ...td, textAlign: 'left', fontWeight: 700 };

function Titre({ n, children, aide }: { n: string; children: React.ReactNode; aide?: string }) {
  return (
    <div style={{ margin: '7mm 0 2.5mm', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5mm' }}>
        <span
          style={{
            width: '6mm',
            height: '6mm',
            borderRadius: '50%',
            background: ROUGE,
            color: '#fff',
            fontWeight: 800,
            fontSize: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: '14px', fontWeight: 800 }}>{children}</span>
      </div>
      {aide && <div style={{ fontSize: '9px', color: '#4b5563', fontWeight: 600, marginTop: '1.2mm', lineHeight: 1.4 }}>{aide}</div>}
    </div>
  );
}

function Barre({ taux }: { taux: number | null }) {
  return (
    <div style={{ height: '2.2mm', background: '#f3f4f6', borderRadius: '1mm', width: '100%' }}>
      <div style={{ height: '100%', width: `${taux ?? 0}%`, background: couleurTaux(taux), borderRadius: '1mm' }} />
    </div>
  );
}

const Tableau = ({ children }: { children: React.ReactNode }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
);

export default function RapportGlobalPdf({ rapport, perimetre }: { rapport: Rapport; perimetre?: string }) {
  const { semaines, semaine, seuil, parSemaine, cycles } = rapport;
  const derniere = parSemaine.length - 1;
  const total = parSemaine[derniere] ?? { p: 0, t: 0 };
  const dateGeneration = new Date().toLocaleDateString('fr-FR');
  const fmt = (iso: string, plus = 0) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + plus);
    return d.toISOString().slice(0, 10).split('-').reverse().join('/');
  };
  const periode =
    semaines.length > 1
      ? `Comparaison sur ${semaines.length} semaines, du ${fmt(semaines[0])} au ${fmt(semaine, 5)}`
      : `Semaine du ${libelleSemaine(semaine)}`;

  const tous = cycles.flatMap((c) => c.groupes);
  const inscritsTotal = tous.reduce((n, g) => n + g.inscrits, 0);

  const parCat = (cat: CategorieAbsence) =>
    cycles
      .map((c) => ({
        cycle: c.nom,
        specs: c.groupes
          .map((g) => ({ g, liste: g.absents.filter((a) => categorieAbsence(a, seuil) === cat) }))
          .filter((x) => x.liste.length > 0),
      }))
      .filter((c) => c.specs.length > 0);
  const nbCat = (cat: CategorieAbsence) => parCat(cat).reduce((n, c) => n + c.specs.reduce((m, s) => m + s.liste.length, 0), 0);

  const ligneAbsent = (a: EtudiantAbsent) => (
    <div key={a.matricule + a.nom} style={{ display: 'flex', justifyContent: 'space-between', gap: '3mm', padding: '0.7mm 0', breakInside: 'avoid', fontSize: '9px' }}>
      <span style={{ fontWeight: 600 }}>{a.nom}</span>
      <span style={{ color: '#374151', whiteSpace: 'nowrap', fontWeight: 700 }}>
        {heures(a.absences)} d’absence sur {heures(a.total)}
      </span>
    </div>
  );

  const bloc = (cat: CategorieAbsence, titre: string, sous: string, couleur: string) => {
    const donnees = parCat(cat);
    const n = nbCat(cat);
    return (
      <div style={{ marginBottom: '5mm' }}>
        <div style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid', marginBottom: '1.5mm', borderLeft: `1.2mm solid ${couleur}`, paddingLeft: '2.5mm' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: couleur }}>
            {titre} — {pluriel(n, 'étudiant')}
          </div>
          <div style={{ fontSize: '8.5px', color: '#4b5563', fontWeight: 600 }}>{sous}</div>
        </div>
        {donnees.length === 0 ? (
          <div style={{ fontSize: '9px', color: '#9ca3af', fontStyle: 'italic' }}>Aucun étudiant dans cette situation.</div>
        ) : (
          donnees.map((c) => (
            <div key={c.cycle} style={{ marginBottom: '2.5mm' }}>
              <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#374151', borderBottom: '0.3mm solid #111827', paddingBottom: '0.6mm', breakAfter: 'avoid' }}>
                Cycle {c.cycle}
              </div>
              {c.specs.map(({ g, liste }) => (
                <div key={g.cle} style={{ marginTop: '1.5mm' }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, color: ROUGE, breakAfter: 'avoid' }}>
                    {nomClasse(g)} · {pluriel(liste.length, 'étudiant')}
                  </div>
                  <div style={{ columnCount: 2, columnGap: '8mm' }}>{liste.map(ligneAbsent)}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="rg-doc" style={{ width: '190mm', fontFamily: SANS, color: '#111827', background: '#fff' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5mm' }}>
        <img src="/logo-cenulape.png" alt="" style={{ height: '19mm', width: '19mm', objectFit: 'contain' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '1.6px', color: ROUGE, textTransform: 'uppercase' }}>
            Centre universitaire La Perle · Cenulape
          </div>
          <div style={{ fontSize: '21px', fontWeight: 800, lineHeight: 1.15, marginTop: '0.8mm' }}>Rapport de présence des étudiants</div>
          <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '1mm', fontWeight: 600 }}>
            Semaine étudiée : du {libelleSemaine(semaine)} &nbsp;•&nbsp; Année académique {anneeAcademique(semaine)}
          </div>
          <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: 600 }}>
            {periode} · établi le {dateGeneration}
          </div>
          {perimetre && <div style={{ fontSize: '9px', color: '#374151', fontWeight: 700 }}>Périmètre : {perimetre}</div>}
        </div>
      </div>
      <div style={{ height: '0.8mm', background: ROUGE, borderRadius: '1mm', margin: '3mm 0 3mm' }} />

      {/* Comment lire */}
      <div style={{ border: '0.25mm solid #e5e7eb', borderRadius: '2.5mm', padding: '3mm 4mm', fontSize: '8.8px', lineHeight: 1.55, color: '#374151' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#111827', marginBottom: '1mm' }}>Comment lire ce rapport</div>
        <div>
          <b>Créneau</b> : une demi-journée de cours (matin ou après-midi) sur la fiche de présence. &nbsp;
          <b>Présence</b> : une heure de cours suivie par un étudiant. &nbsp;
          <b>Absence</b> : une heure de cours manquée par un étudiant (cumul saisi chaque semaine). &nbsp;
          <b>Taux de présence</b> = présences ÷ (présences + absences). &nbsp;
          <b>Absent complet</b> : absent à toutes les heures de cours de la semaine. &nbsp;
          <b>« 3 h d’absence sur 12 h »</b> : 3 heures manquées sur 12 heures de cours dans la semaine.
        </div>
      </div>

      {/* 1. Résumé */}
      <Titre n="1" aide={`Chiffres de l’ensemble des classes retenues pour la semaine du ${libelleSemaine(semaine)}.`}>
        Résumé de la semaine
      </Titre>
      <div style={{ display: 'flex', gap: '3mm' }}>
        {[
          { l: 'Étudiants inscrits', v: String(inscritsTotal), s: `avec fiche cette semaine : ${rapport.semaineEtudiants}`, c: '#111827' },
          { l: 'Présences', v: heures(total.p), s: 'heures suivies', c: VERT },
          { l: 'Absences', v: heures(absencesDe(total)), s: 'heures manquées', c: ROUGE },
          { l: 'Taux de présence', v: pct(total), s: 'de l’ensemble', c: couleurTaux(tauxDe(total)) },
        ].map((k) => (
          <div key={k.l} style={{ flex: 1, border: '0.25mm solid #e5e7eb', borderRadius: '2.5mm', padding: '2.5mm', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: k.c, lineHeight: 1.1 }}>{k.v}</div>
            <div style={{ fontSize: '7.5px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '0.8mm' }}>{k.l}</div>
            <div style={{ fontSize: '7.5px', color: '#6b7280', marginTop: '0.4mm' }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* 2. Par semaine */}
      <Titre n="2" aide="Pour chaque semaine : combien de présences et d’absences au total, et quel pourcentage de présence.">
        Évolution semaine après semaine
      </Titre>
      <Tableau>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Semaine</th>
            <th style={th}>Présences</th>
            <th style={th}>Absences</th>
            <th style={th}>Taux de présence</th>
            <th style={{ ...th, width: '45mm' }}> </th>
          </tr>
        </thead>
        <tbody>
          {semaines.map((s, i) => (
            <tr key={s} style={{ breakInside: 'avoid' }}>
              <td style={tdG}>Du {libelleSemaine(s)}</td>
              <td style={td}>{heures(parSemaine[i].p)}</td>
              <td style={{ ...td, color: absencesDe(parSemaine[i]) ? ROUGE : '#111827' }}>{heures(absencesDe(parSemaine[i]))}</td>
              <td style={{ ...td, fontWeight: 800, color: couleurTaux(tauxDe(parSemaine[i])) }}>{pct(parSemaine[i])}</td>
              <td style={td}>
                <Barre taux={tauxDe(parSemaine[i])} />
              </td>
            </tr>
          ))}
        </tbody>
      </Tableau>

      {/* 3. Par cycle */}
      <Titre n="3" aide="Les spécialités sont regroupées par cycle (BTS, HND…). Les pourcentages sont ceux de chaque semaine comparée.">
        Résultats par cycle
      </Titre>
      <Tableau>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Cycle</th>
            {semaines.map((s) => (
              <th key={s} style={th}>
                Taux<br />
                sem. du {fmt(s).slice(0, 5)}
              </th>
            ))}
            <th style={th}>Présences<br />(semaine étudiée)</th>
            <th style={th}>Absences<br />(semaine étudiée)</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => (
            <tr key={c.nom} style={{ breakInside: 'avoid' }}>
              <td style={tdG}>{c.nom}</td>
              {c.parSemaine.map((s, i) => (
                <td key={semaines[i]} style={{ ...td, fontWeight: 700, color: couleurTaux(tauxDe(s)) }}>
                  {pct(s)}
                </td>
              ))}
              <td style={td}>{heures(c.parSemaine[derniere].p)}</td>
              <td style={{ ...td, color: absencesDe(c.parSemaine[derniere]) ? ROUGE : '#111827' }}>{heures(absencesDe(c.parSemaine[derniere]))}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...tdG, borderTop: '0.4mm solid #111827' }}>Total</td>
            {parSemaine.map((s, i) => (
              <td key={semaines[i]} style={{ ...td, fontWeight: 800, borderTop: '0.4mm solid #111827', color: couleurTaux(tauxDe(s)) }}>
                {pct(s)}
              </td>
            ))}
            <td style={{ ...td, fontWeight: 800, borderTop: '0.4mm solid #111827' }}>{heures(total.p)}</td>
            <td style={{ ...td, fontWeight: 800, borderTop: '0.4mm solid #111827', color: ROUGE }}>{heures(absencesDe(total))}</td>
          </tr>
        </tbody>
      </Tableau>

      {/* 4. Par spécialité */}
      <Titre
        n="4"
        aide={`Les spécialités dont la fiche de présence est enregistrée, classées par cycle puis par ordre alphabétique, pour la semaine du ${libelleSemaine(semaine)}.`}
      >
        Résultats par spécialité
      </Titre>
      {cycles.map((c) => (
        <div key={c.nom} style={{ marginBottom: '4mm' }}>
          <Tableau>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Cycle {c.nom} — spécialité</th>
                <th style={th}>Étudiants<br />inscrits</th>
                <th style={th}>Présences</th>
                <th style={th}>Absences</th>
                <th style={th}>Taux de<br />présence</th>
              </tr>
            </thead>
            <tbody>
              {c.groupes.map((g) => (
                <tr key={g.cle} style={{ breakInside: 'avoid' }}>
                  <td style={tdG}>{nomClasse(g)}</td>
                  <td style={td}>{g.inscrits}</td>
                  <td style={td}>{heures(g.semaine.p)}</td>
                  <td style={{ ...td, color: absencesDe(g.semaine) ? ROUGE : '#111827' }}>{heures(absencesDe(g.semaine))}</td>
                  <td style={{ ...td, fontWeight: 800, color: couleurTaux(tauxDe(g.semaine)) }}>{pct(g.semaine)}</td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        </div>
      ))}

      {/* 5. Absents par spécialité */}
      <Titre n="5" aide="Pour chaque spécialité : les étudiants qui ont manqué au moins une heure de cours cette semaine, du plus absent au moins absent.">
        Qui est absent ? Liste par spécialité
      </Titre>
      {cycles.map((c) => (
        <div key={c.nom} style={{ marginBottom: '3mm' }}>
          <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#374151', borderBottom: '0.3mm solid #111827', paddingBottom: '0.6mm', marginBottom: '1.5mm', breakAfter: 'avoid' }}>
            Cycle {c.nom}
          </div>
          {c.groupes.map((g) => (
            <div key={g.cle} style={{ marginBottom: '2.5mm', breakInside: 'avoid' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 800, borderBottom: '0.25mm solid #d1d5db', paddingBottom: '0.5mm', display: 'flex', justifyContent: 'space-between' }}>
                <span>{nomClasse(g)}</span>
                <span style={{ color: g.absents.length ? ROUGE : VERT }}>
                  {g.absents.length ? `${pluriel(g.absents.length, 'étudiant')} avec absence` : 'Aucune absence'}
                </span>
              </div>
              {g.absents.length > 0 && (
                <div style={{ columnCount: 2, columnGap: '8mm', paddingTop: '1mm' }}>{g.absents.map(ligneAbsent)}</div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* 6. Synthèse */}
      <Titre
        n="6"
        aide={`Les étudiants absents cette semaine, tous cycles confondus, rangés selon la gravité. Seuil utilisé : ${seuil} h d’absence.`}
      >
        Synthèse des absences de la semaine
      </Titre>
      <Tableau>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Situation</th>
            <th style={th}>Étudiants</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdG}>Absents complets (absents à toutes les heures)</td>
            <td style={{ ...td, fontWeight: 800, color: ROUGE }}>{nbCat('complet')}</td>
          </tr>
          <tr>
            <td style={tdG}>{seuil} h d’absence ou plus, mais pas complet</td>
            <td style={{ ...td, fontWeight: 800, color: AMBRE }}>{nbCat('eleve')}</td>
          </tr>
          <tr>
            <td style={tdG}>Moins de {seuil} h d’absence</td>
            <td style={{ ...td, fontWeight: 800 }}>{nbCat('faible')}</td>
          </tr>
        </tbody>
      </Tableau>
      <div style={{ height: '4mm' }} />
      {bloc('complet', 'Absents complets', 'Ces étudiants ont manqué TOUTES les heures de cours de la semaine.', ROUGE)}
      {bloc('eleve', `${seuil} h d’absence ou plus (pas complet)`, `Ces étudiants ont manqué au moins ${seuil} h de cours, mais sont venus au moins une fois.`, AMBRE)}
      {bloc('faible', `Moins de ${seuil} h d’absence`, `Ces étudiants ont manqué moins de ${seuil} h de cours.`, '#6b7280')}

    </div>
  );
}