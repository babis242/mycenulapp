// src/features/fiches-presence/components/RapportPresencePdf.tsx
//
// Rapport de présence d'une spécialité pour UNE semaine (A4 paysage),
// généré à partir des fiches lues : carré vert = présent, croix rouge =
// absent, tiret gris = non renseigné. Pagination automatique.
import { anneeAcademique, libelleSemaine } from './FichesPresencePdf';

export interface EtudiantRapport {
  id: string;
  matricule: string;
  nom: string;
}

interface Props {
  specialiteNom: string;
  niveauLabel: string | null; // ex. "BTS 2"
  semestre: string;
  semaine: string; // lundi "AAAA-MM-JJ"
  jours: string[];
  creneaux: string[];
  etudiants: EtudiantRapport[];
  valeurs: Map<string, boolean>; // "etudiantId|jour|creneau" → présent ?
}

const LIGNES_PAR_PAGE = 18;
const VERT = '#16a34a';
const ROUGE = '#dc2626';
const SANS = "'Inter', 'Segoe UI', Arial, Helvetica, sans-serif";

function Carre() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '3.6mm',
        height: '3.6mm',
        borderRadius: '0.8mm',
        background: VERT,
        verticalAlign: 'middle',
      }}
    />
  );
}

function Croix() {
  return (
    <svg width="3.8mm" height="3.8mm" viewBox="0 0 10 10" style={{ verticalAlign: 'middle' }}>
      <path d="M1.8 1.8 L8.2 8.2 M8.2 1.8 L1.8 8.2" stroke={ROUGE} strokeWidth="1.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Tiret() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '1.6mm',
        height: '0.5mm',
        borderRadius: '1mm',
        background: '#d1d5db',
        verticalAlign: 'middle',
      }}
    />
  );
}

const couleurTaux = (t: number) => (t >= 75 ? VERT : t >= 50 ? '#d97706' : ROUGE);

export default function RapportPresencePdf({
  specialiteNom,
  niveauLabel,
  semestre,
  semaine,
  jours,
  creneaux,
  etudiants,
  valeurs,
}: Props) {
  const nbCr = creneaux.length;
  const numeroSemestre = semestre.replace(/[^0-9]/g, '') || semestre;
  const dateGeneration = new Date().toLocaleDateString('fr-FR');

  const lignes = etudiants.map((e, i) => {
    let p = 0;
    let t = 0;
    const cases = jours.flatMap((j) =>
      creneaux.map((c) => {
        const v = valeurs.get(`${e.id}|${j}|${c}`);
        if (v !== undefined) {
          t++;
          if (v) p++;
        }
        return v;
      })
    );
    return { ...e, numero: i + 1, cases, p, t, taux: t ? Math.round((p / t) * 100) : null };
  });

  const totalP = lignes.reduce((n, l) => n + l.p, 0);
  const totalT = lignes.reduce((n, l) => n + l.t, 0);
  const tauxGlobal = totalT ? Math.round((totalP / totalT) * 100) : null;

  const pages: (typeof lignes)[] = [];
  for (let i = 0; i < lignes.length; i += LIGNES_PAR_PAGE) pages.push(lignes.slice(i, i + LIGNES_PAR_PAGE));
  if (pages.length === 0) pages.push([]);

  const bord = '0.2mm solid #e5e7eb';
  const bordJour = '0.35mm solid #cbd5e1';

  return (
    <div className="rapport-presence-doc">
      {pages.map((page, pi) => (
        <section
          key={pi}
          className="rapport-presence-page"
          style={{
            width: '297mm',
            height: '209mm',
            boxSizing: 'border-box',
            padding: '9mm 10mm 12mm',
            position: 'relative',
            overflow: 'hidden',
            background: '#fff',
            color: '#111827',
            fontFamily: SANS,
            breakAfter: pi < pages.length - 1 ? 'page' : 'auto',
            pageBreakAfter: pi < pages.length - 1 ? 'always' : 'auto',
          }}
        >
          {/* En-tête */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5mm', height: '21mm' }}>
            <img src="/logo-cenulape.png" alt="" style={{ height: '19mm', width: '19mm', objectFit: 'contain' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '1.6px', color: ROUGE, textTransform: 'uppercase' }}>
                Rapport de présence
              </div>
              <div style={{ fontSize: '21px', fontWeight: 800, lineHeight: 1.15, marginTop: '0.8mm' }}>
                {specialiteNom}
                {niveauLabel ? <span style={{ color: '#6b7280', fontWeight: 600 }}> · {niveauLabel}</span> : null}
              </div>
              <div style={{ fontSize: '10.5px', color: '#4b5563', marginTop: '1mm', fontWeight: 500 }}>
                Semestre {numeroSemestre} &nbsp;•&nbsp; Semaine du {libelleSemaine(semaine)} &nbsp;•&nbsp; Année académique{' '}
                {anneeAcademique(semaine)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '3mm' }}>
              {[
                { l: 'Étudiants', v: String(etudiants.length), c: '#111827' },
                { l: 'Présence', v: tauxGlobal === null ? '—' : `${tauxGlobal} %`, c: tauxGlobal === null ? '#111827' : couleurTaux(tauxGlobal) },
                { l: 'Absences', v: String(totalT - totalP), c: totalT - totalP > 0 ? ROUGE : '#111827' },
              ].map((k) => (
                <div
                  key={k.l}
                  style={{
                    border: '0.25mm solid #e5e7eb',
                    background: '#f9fafb',
                    borderRadius: '2.5mm',
                    padding: '2mm 4mm',
                    textAlign: 'center',
                    minWidth: '22mm',
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 800, color: k.c, lineHeight: 1.1 }}>{k.v}</div>
                  <div style={{ fontSize: '7.5px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '0.6mm' }}>
                    {k.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: '0.8mm', background: ROUGE, borderRadius: '1mm', margin: '3mm 0 4mm', width: '100%' }} />

          {/* Tableau */}
          <table style={{ width: '277mm', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', fontSize: '9.5px' }}>
            <colgroup>
              <col style={{ width: '8mm' }} />
              <col style={{ width: '24mm' }} />
              <col style={{ width: '60mm' }} />
              {jours.flatMap((j) => creneaux.map((c) => <col key={`${j}-${c}`} style={{ width: `${138 / (jours.length * nbCr)}mm` }} />))}
              <col style={{ width: '18mm' }} />
              <col style={{ width: '29mm' }} />
            </colgroup>
            <thead>
              <tr style={{ height: '6.5mm' }}>
                {['N°', 'Matricule', 'Nom et prénoms'].map((h, k) => (
                  <th
                    key={h}
                    rowSpan={2}
                    style={{
                      background: '#111827',
                      color: '#fff',
                      textAlign: k === 2 ? 'left' : 'center',
                      padding: k === 2 ? '0 2.5mm' : 0,
                      fontSize: '8.5px',
                      fontWeight: 700,
                      letterSpacing: '0.4px',
                      borderTopLeftRadius: k === 0 ? '2mm' : 0,
                    }}
                  >
                    {h}
                  </th>
                ))}
                {jours.map((j) => (
                  <th
                    key={j}
                    colSpan={nbCr}
                    style={{ background: '#111827', color: '#fff', fontSize: '9px', fontWeight: 700, borderLeft: '0.35mm solid #374151' }}
                  >
                    {j}
                  </th>
                ))}
                {['Présences', 'Taux'].map((h, k) => (
                  <th
                    key={h}
                    rowSpan={2}
                    style={{
                      background: '#111827',
                      color: '#fff',
                      fontSize: '8.5px',
                      fontWeight: 700,
                      borderLeft: '0.35mm solid #374151',
                      borderTopRightRadius: k === 1 ? '2mm' : 0,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
              <tr style={{ height: '5mm' }}>
                {jours.flatMap((j) =>
                  creneaux.map((c, ci) => (
                    <th
                      key={`${j}-${c}`}
                      style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        fontSize: '7px',
                        fontWeight: 600,
                        borderLeft: ci === 0 ? bordJour : bord,
                        borderBottom: bordJour,
                      }}
                    >
                      {c}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {page.map((l, i) => (
                <tr key={l.id} style={{ height: '7.2mm', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                  <td style={{ borderBottom: bord, textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>{l.numero}</td>
                  <td style={{ borderBottom: bord, textAlign: 'center', color: '#6b7280', fontSize: '8.5px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {l.matricule}
                  </td>
                  <td
                    style={{
                      borderBottom: bord,
                      padding: '0 2.5mm',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {l.nom}
                  </td>
                  {l.cases.map((v, k) => (
                    <td
                      key={k}
                      style={{
                        borderBottom: bord,
                        borderLeft: k % nbCr === 0 ? bordJour : bord,
                        textAlign: 'center',
                        lineHeight: 0,
                      }}
                    >
                      {v === undefined ? <Tiret /> : v ? <Carre /> : <Croix />}
                    </td>
                  ))}
                  <td style={{ borderBottom: bord, borderLeft: bordJour, textAlign: 'center', fontWeight: 700 }}>
                    {l.t ? `${l.p}/${l.t}` : '—'}
                  </td>
                  <td style={{ borderBottom: bord, padding: '0 2mm' }}>
                    {l.taux === null ? (
                      <div style={{ textAlign: 'center', color: '#9ca3af' }}>—</div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm' }}>
                        <div style={{ flex: 1, height: '1.6mm', background: '#e5e7eb', borderRadius: '1mm', overflow: 'hidden' }}>
                          <div style={{ width: `${l.taux}%`, height: '100%', background: couleurTaux(l.taux) }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '8.5px', color: couleurTaux(l.taux), minWidth: '8mm', textAlign: 'right' }}>
                          {l.taux} %
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pied de page */}
          <div
            style={{
              position: 'absolute',
              left: '10mm',
              right: '10mm',
              bottom: '5mm',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '8.5px',
              color: '#6b7280',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5mm' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
                <Carre /> Présent
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
                <Croix /> Absent
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
                <Tiret /> Non renseigné
              </span>
            </div>
            <div>Centre Universitaire La Perle (CENULAPE) — généré le {dateGeneration}</div>
            <div style={{ fontStyle: 'italic' }}>
              Page {pi + 1}/{pages.length}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}