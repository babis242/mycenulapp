// src/features/referentiel/etudiants/components/ListeControleEtudiantsPdf.tsx
//
// Liste de CONTRÔLE des étudiants en PDF (A4 paysage) : une section par classe (spécialité + semestre)
// avec N°, matricule, nom, statut d'inscription, case « Démissionnaire » et colonne « Observation »
// à remplir à la main. Pas de champ « démissionnaire » en base pour l'instant : la case reste vide
// (à cocher à la main) sauf si `demissionnaire` est renseigné.
import type { ClassePdf } from './ListeEtudiantsPdf';

const ROUGE = '#dc2626';
const SANS = "'Nunito', 'Segoe UI', Arial, Helvetica, sans-serif";
const LARGEUR = '273mm'; // A4 paysage (297 mm) - marges de 12 mm

export interface EtudiantControle {
  matricule: string;
  nom_complet: string;
  inscrit?: boolean;
  demissionnaire?: boolean;
  observation?: string;
}
export interface ClasseControle extends Omit<ClassePdf, 'etudiants'> {
  etudiants: EtudiantControle[];
}

interface Props {
  classes: ClasseControle[];
  anneeAcademique: string;
  uneParPage?: boolean;
  /** Lignes vides ajoutées en fin de tableau pour noter à la main les étudiants absents de la liste. */
  lignesVides?: number;
}

const th: React.CSSProperties = {
  border: '0.3mm solid #111827', background: '#f3f4f6', padding: '1.8mm 2mm',
  fontSize: '10.5px', fontWeight: 800, textAlign: 'left', verticalAlign: 'middle',
};
const td: React.CSSProperties = {
  border: '0.3mm solid #9ca3af', padding: '0 2mm', height: '9mm',
  fontSize: '11px', fontWeight: 600, verticalAlign: 'middle',
};

function EnTete({ annee }: { annee: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5mm', borderBottom: `0.8mm solid ${ROUGE}`, paddingBottom: '3mm', marginBottom: '3mm' }}>
      <img src="/logo-cenulape.png" alt="" style={{ height: '18mm', width: '18mm', objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px' }}>CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)</div>
        <div style={{ fontSize: '9.5px', color: '#4b5563', fontWeight: 600, marginTop: '0.8mm' }}>BP : 760 Yassa, Douala · Tél : 658 09 34 70</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: ROUGE, letterSpacing: '0.6px' }}>LISTE DE CONTRÔLE DES ÉTUDIANTS</div>
        <div style={{ fontSize: '10.5px', fontWeight: 700, marginTop: '0.8mm' }}>Année académique {annee}</div>
      </div>
    </div>
  );
}

function Case({ coche }: { coche?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: '4.6mm', height: '4.6mm', border: '0.35mm solid #111827', borderRadius: '0.6mm',
      verticalAlign: 'middle', textAlign: 'center', lineHeight: '4.2mm', fontSize: '11px', fontWeight: 800,
    }}>{coche ? '✕' : ''}</span>
  );
}

export function ListeControleEtudiantsPdf({ classes, anneeAcademique, uneParPage = true, lignesVides = 10 }: Props) {
  const dateEdition = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ fontFamily: SANS, color: '#111827', width: LARGEUR }}>
      {classes.map((c, i) => {
        const nbInscrits = c.etudiants.filter((e) => e.inscrit !== false).length;
        const nbDemission = c.etudiants.filter((e) => e.demissionnaire).length;
        return (
          <div
            key={c.cle}
            style={{
              width: LARGEUR, boxSizing: 'border-box',
              breakBefore: uneParPage && i > 0 ? 'page' : 'auto',
              pageBreakBefore: uneParPage && i > 0 ? 'always' : 'auto',
              marginTop: !uneParPage && i > 0 ? '9mm' : 0,
            }}
          >
            {(uneParPage || i === 0) && <EnTete annee={anneeAcademique} />}

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6mm', marginBottom: '3mm', breakInside: 'avoid' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>
                  {c.specialite}
                  {c.cycle && <span style={{ fontWeight: 700, color: '#4b5563' }}> ({c.cycle})</span>}
                </div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#4b5563', marginTop: '0.8mm' }}>
                  {c.niveau}{c.semestre ? ` · ${c.semestre}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '3mm', fontSize: '10.5px', fontWeight: 800 }}>
                {[
                  ['Effectif', c.etudiants.length, '#111827'],
                  ['Inscrits', nbInscrits, '#15803d'],
                  ['Pas inscrits', c.etudiants.length - nbInscrits, '#b45309'],
                  ['Démissionnaires', nbDemission, '#b91c1c'],
                ].map(([lib, n, col]) => (
                  <div key={String(lib)} style={{ border: '0.3mm solid #9ca3af', borderRadius: '1mm', padding: '1.2mm 3mm', textAlign: 'center', minWidth: '22mm' }}>
                    <div style={{ fontSize: '15px', color: String(col) }}>{n}</div>
                    <div style={{ fontSize: '8.5px', color: '#4b5563', fontWeight: 700 }}>{lib}</div>
                  </div>
                ))}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '10mm' }} />
                <col style={{ width: '30mm' }} />
                <col style={{ width: '78mm' }} />
                <col style={{ width: '24mm' }} />
                <col style={{ width: '27mm' }} />
                <col />
              </colgroup>
              <thead style={{ display: 'table-header-group' }}>
                <tr>
                  <th style={{ ...th, textAlign: 'center' }}>N°</th>
                  <th style={th}>Matricule</th>
                  <th style={th}>Nom complet</th>
                  <th style={{ ...th, textAlign: 'center' }}>Statut</th>
                  <th style={{ ...th, textAlign: 'center' }}>Démissionnaire</th>
                  <th style={th}>Observation</th>
                </tr>
              </thead>
              <tbody>
                {c.etudiants.map((e, k) => {
                  const inscrit = e.inscrit !== false;
                  return (
                    <tr key={k} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <td style={{ ...td, textAlign: 'center' }}>{k + 1}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.matricule}</td>
                      <td style={td}>{e.nom_complet}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: inscrit ? '#15803d' : '#b45309' }}>
                        {inscrit ? 'Inscrit' : 'Pas inscrit'}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}><Case coche={e.demissionnaire} /></td>
                      <td style={{ ...td, fontWeight: 500 }}>{e.observation ?? ''}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: Math.max(0, lignesVides) }, (_, k) => (
                  <tr key={`v${k}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#9ca3af' }}>{c.etudiants.length + k + 1}</td>
                    <td style={td}></td>
                    <td style={td}></td>
                    <td style={td}></td>
                    <td style={{ ...td, textAlign: 'center' }}><Case /></td>
                    <td style={td}></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10mm', marginTop: '6mm', fontSize: '10.5px', fontWeight: 700, breakInside: 'avoid' }}>
              <div>Contrôlé par : ______________________________</div>
              <div>Date : ____ / ____ / ________</div>
              <div>Visa : ______________________</div>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: '5mm', fontSize: '9.5px', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>
        Liste éditée le {dateEdition}
      </div>
    </div>
  );
}