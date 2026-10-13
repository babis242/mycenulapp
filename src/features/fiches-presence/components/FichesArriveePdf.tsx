// src/features/fiches-presence/components/FichesArriveePdf.tsx
//
// Fiches d'arrivée et de retard (A4 portrait) : une fiche par NIVEAU (BTS 1, HND 2…) avec tous
// les étudiants de l'école de ce niveau ; elle se poursuit sur plusieurs pages si besoin (« Page 1/2 »). Le nombre de
// lignes = nombre d'étudiants + quelques lignes libres (étudiants
// arrivés en cours de route) — pas de remplissage fixe.
import { JOURS } from '@/constants/enums';
import { anneeAcademique, libelleSemaine } from './FichesPresencePdf';

export interface EtudiantArrivee {
  matricule: string;
  nom: string;
  specialite: string;
}

// Un niveau (ex. « BTS 2 ») = une ou plusieurs pages ; tous les étudiants
// de l'école de ce niveau, toutes spécialités confondues.
export interface FicheArrivee {
  niveau: string;
  etudiants: EtudiantArrivee[]; // déjà triés
}

interface Props {
  fiches: FicheArrivee[];
  semaine: string; // lundi, "AAAA-MM-JJ"
  lignesSupplementaires?: number;
}


function dateDuJour(semaineISO: string, index: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d + index);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

const MAX_LIGNES_PAGE = 24;
const HAUTEUR_LIGNES_MM = 200; // zone du tableau sous l'en-tête
const SERIF = "'Times New Roman', Times, serif";

const bord = '0.25mm solid #1f1f1f';

export default function FichesArriveePdf({ fiches, semaine, lignesSupplementaires = 5 }: Props) {
  const annee = anneeAcademique(semaine);
  const libelle = libelleSemaine(semaine);

  // Découpage en pages : étudiants + lignes libres, 22 lignes max / page.
  const toutesLesPages: {
    fiche: FicheArrivee;
    lignes: (EtudiantArrivee | null)[];
    debut: number;
    index: number;
    total: number;
  }[] = [];
  for (const fiche of fiches) {
    const lignes: (EtudiantArrivee | null)[] = [
      ...fiche.etudiants,
      ...Array.from({ length: lignesSupplementaires }, () => null),
    ];
    const total = Math.ceil(lignes.length / MAX_LIGNES_PAGE);
    for (let p = 0; p < total; p++) {
      toutesLesPages.push({
        fiche,
        lignes: lignes.slice(p * MAX_LIGNES_PAGE, (p + 1) * MAX_LIGNES_PAGE),
        debut: p * MAX_LIGNES_PAGE,
        index: p + 1,
        total,
      });
    }
  }

  return (
    <div className="fiche-arrivee-doc">
      {toutesLesPages.map((pg, idx) => {
        // Lignes un peu plus hautes quand il y en a peu (plus de place
        // pour signer), plafonnées pour rester sobres.
        const hauteurLigne = Math.min(8.2, HAUTEUR_LIGNES_MM / pg.lignes.length);
        return (
          <section
            key={`${pg.fiche.niveau}-${pg.index}`}
            className="fiche-arrivee-page"
            style={{
              width: '210mm',
              height: '297mm',
              boxSizing: 'border-box',
              padding: '10mm 12mm 14mm',
              position: 'relative',
              overflow: 'hidden',
              background: '#fff',
              color: '#111',
              fontFamily: SERIF,
              breakAfter: idx < toutesLesPages.length - 1 ? 'page' : 'auto',
              pageBreakAfter: idx < toutesLesPages.length - 1 ? 'always' : 'auto',
            }}
          >
            {/* En-tête institutionnel */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 24mm 1fr',
                alignItems: 'center',
                height: '26mm',
              }}
            >
              <div style={{ textAlign: 'center', lineHeight: 1.65 }}>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '11px' }}>
                  CENTRE UNIVERSITAIRE LA PERLE
                </div>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '11px' }}>
                  (CENULAPE)
                </div>
                <div style={{ fontWeight: 700, fontSize: '10.5px' }}>BP : 760 YASSA DOUALA</div>
                <div style={{ fontWeight: 700, fontSize: '10.5px' }}>TEL : 658 09 34 70</div>
              </div>
              <img
                src="/logo-cenulape.png"
                alt=""
                style={{ height: '24mm', width: '24mm', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
              <div style={{ textAlign: 'center', lineHeight: 1.65 }}>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '11px' }}>
                  THE PEARL UNIVERSITY CENTER
                </div>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '11px' }}>
                  (CENULAPE)
                </div>
                <div style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '10.5px' }}>
                  Email: info@laperle-sup.com
                </div>
                <div style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '10.5px' }}>
                  Site web: www.laperle-sup.com
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '9.5px', marginTop: '1.5mm' }}>
              Autorisation N°: 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS du 20 Septembre 2017
            </div>

            {/* Titre */}
            <div style={{ textAlign: 'center', marginTop: '2mm' }}>
              <div style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.2px' }}>
                FICHE D'ARRIVÉE ET DE RETARD / ARRIVAL & LATENESS SHEET
              </div>
              <div
                style={{
                  width: '22mm',
                  height: '0.7mm',
                  background: '#dc2626',
                  margin: '1.2mm auto 0',
                  borderRadius: '1mm',
                }}
              />
            </div>

            {/* Infos */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '3mm',
                marginBottom: '2.5mm',
                fontSize: '12px',
                lineHeight: 1.7,
              }}
            >
              <div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Niveau</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{pg.fiche.niveau}</b>
                </div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Effectif</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{pg.fiche.etudiants.length}</b>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Année académique</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{annee}</b>
                </div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Semaine</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{libelle}</b>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '9.5px', fontStyle: 'italic', color: '#374151', marginBottom: '1.5mm' }}>
              Noter dans la case du jour l'<b>heure d'arrivée</b> de l'étudiant (ex. 08h25) ; en cas de retard, ajouter la durée en minutes.
            </div>

            {/* Tableau */}
            <table
              style={{
                width: '186mm',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              <colgroup>
                <col style={{ width: '8mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '44mm' }} />
                <col style={{ width: '30mm' }} />
                {JOURS.map((j) => (
                  <col key={j} style={{ width: `${84 / JOURS.length}mm` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ height: '11mm' }}>
                  {['N°', 'Matricule', 'Nom complet', 'Spécialité'].map((h) => (
                    <th key={h} style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '10.5px' }}>{h}</th>
                  ))}
                  {JOURS.map((j, ji) => (
                    <th key={j} style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, padding: 0, lineHeight: 1.25 }}>
                      <div style={{ fontStyle: 'italic', fontSize: '9.5px' }}>{j}</div>
                      <div style={{ fontSize: '6.8px', fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 400 }}>{dateDuJour(semaine, ji)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((nom, i) => (
                  <tr
                    key={i}
                    style={{
                      height: `${hauteurLigne}mm`,
                      background: i % 2 === 1 ? '#fafafa' : '#fff',
                    }}
                  >
                    <td style={{ border: bord, textAlign: 'center', fontSize: '9.5px' }}>
                      {nom !== null ? pg.debut + i + 1 : ''}
                    </td>
                    <td style={{ border: bord, textAlign: 'center', fontSize: '8px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {nom?.matricule ?? ''}
                    </td>
                    <td style={{ border: bord, padding: '0 2mm', fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nom?.nom ?? ''}
                    </td>
                    <td style={{ border: bord, padding: '0 2mm', fontSize: '7.5px', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nom?.specialite ?? ''}
                    </td>
                    {JOURS.map((j) => (
                      <td key={j} style={{ border: bord }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {pg.total > 1 && (
              <div
                style={{
                  position: 'absolute',
                  right: '12mm',
                  bottom: '6mm',
                  fontSize: '9px',
                  fontStyle: 'italic',
                  color: '#6b7280',
                }}
              >
                Page {pg.index}/{pg.total}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}