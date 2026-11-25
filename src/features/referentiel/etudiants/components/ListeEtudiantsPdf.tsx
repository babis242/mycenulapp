// src/features/referentiel/etudiants/components/ListeEtudiantsPdf.tsx
//
// Liste des étudiants en PDF (A4 portrait) : une section par classe (spécialité + semestre).
const ROUGE = '#dc2626';
const SANS = "'Nunito', 'Segoe UI', Arial, Helvetica, sans-serif";

export interface EtudiantPdf {
  matricule: string;
  nom_complet: string;
  inscrit?: boolean;
}

export interface ClassePdf {
  cle: string;
  specialite: string;
  cycle: string;
  semestre: string;
  niveau: string;
  etudiants: EtudiantPdf[];
}

interface Props {
  classes: ClassePdf[];
  avecMatricule: boolean;
  uneParPage: boolean;
  anneeAcademique: string;
}

const th: React.CSSProperties = { border: '0.3mm solid #111827', background: '#f3f4f6', padding: '1.6mm 2mm', fontSize: '10.5px', fontWeight: 800, textAlign: 'left' };
const td: React.CSSProperties = { border: '0.3mm solid #9ca3af', padding: '1.4mm 2mm', fontSize: '11px', fontWeight: 600 };

function EnTete({ annee }: { annee: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5mm', borderBottom: `0.8mm solid ${ROUGE}`, paddingBottom: '3mm', marginBottom: '4mm' }}>
      <img src="/logo-cenulape.png" alt="" style={{ height: '20mm', width: '20mm', objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px' }}>CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)</div>
        <div style={{ fontSize: '9.5px', color: '#4b5563', fontWeight: 600, marginTop: '0.8mm' }}>BP : 760 Yassa, Douala · Tél : 658 09 34 70</div>
      </div>
      <div style={{ fontSize: '10.5px', fontWeight: 700, textAlign: 'right' }}>Année académique<br />{annee}</div>
    </div>
  );
}

export function ListeEtudiantsPdf({ classes, avecMatricule, uneParPage, anneeAcademique }: Props) {
  const dateEdition = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ fontFamily: SANS, color: '#111827', width: '180mm' }}>
      {classes.map((c, i) => {
        return (
          <div
            key={c.cle}
            style={{
              width: '180mm',
              boxSizing: 'border-box',
              breakBefore: uneParPage && i > 0 ? 'page' : 'auto',
              pageBreakBefore: uneParPage && i > 0 ? 'always' : 'auto',
              marginTop: !uneParPage && i > 0 ? '9mm' : 0,
            }}
          >
            {(uneParPage || i === 0) && <EnTete annee={anneeAcademique} />}
            <div style={{ breakInside: 'avoid', marginBottom: '3mm' }}>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>
                {c.specialite}
                {c.cycle && <span style={{ fontWeight: 700, color: '#4b5563' }}> ({c.cycle})</span>}
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#4b5563', marginTop: '0.8mm' }}>
                {c.semestre}{c.niveau ? ` · ${c.niveau}` : ''} · {c.etudiants.length} étudiant{c.etudiants.length > 1 ? 's' : ''}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ display: 'table-header-group' }}>
                <tr>
                  <th style={{ ...th, width: '10mm', textAlign: 'center' }}>N°</th>
                  {avecMatricule && <th style={{ ...th, width: '34mm' }}>Matricule</th>}
                  <th style={th}>Nom complet</th>
                </tr>
              </thead>
              <tbody>
                {c.etudiants.map((e, k) => (
                  <tr key={k} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                    <td style={{ ...td, textAlign: 'center' }}>{k + 1}</td>
                    {avecMatricule && <td style={td}>{e.matricule}</td>}
                    <td style={td}>{e.nom_complet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ marginTop: '6mm', fontSize: '9.5px', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>
        Liste éditée le {dateEdition}
      </div>
    </div>
  );
}