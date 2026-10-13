// src/features/fiches-presence/components/FichesPresencePdf.tsx
//
// Fiches de présence (A4 paysage) : une fiche par spécialité, qui se
// poursuit sur plusieurs pages si besoin (« Page 1/2 »). Le nombre de
// lignes = nombre d'étudiants + quelques lignes libres (étudiants
// arrivés en cours de route) — pas de remplissage fixe.
import { creneauxFiables } from '../creneauxFiables';
import { niveauDeSemestre } from '@/constants/enums';
import { JOURS } from '@/constants/enums';

export interface FicheSpecialite {
  specialiteId: string;
  nom: string;
  etudiants: { matricule: string; nom: string }[]; // déjà triés
}

interface Props {
  fiches: FicheSpecialite[];
  semestre: string;
  cycle?: string; // ex. "BTS", "HND"
  semaine: string; // lundi, "AAAA-MM-JJ"
  lignesSupplementaires?: number;
}

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function bornesSemaine(semaineISO: string) {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const lundi = new Date(y, m - 1, d);
  const samedi = new Date(lundi);
  samedi.setDate(lundi.getDate() + 5);
  return { lundi, samedi };
}

export function libelleSemaine(semaineISO: string): string {
  const { lundi, samedi } = bornesSemaine(semaineISO);
  const jj = (dt: Date) => String(dt.getDate()).padStart(2, '0');
  if (lundi.getMonth() === samedi.getMonth()) {
    return `${jj(lundi)} au ${jj(samedi)} ${MOIS[samedi.getMonth()]} ${samedi.getFullYear()}`;
  }
  const fin = `${jj(samedi)} ${MOIS[samedi.getMonth()]} ${samedi.getFullYear()}`;
  return lundi.getFullYear() === samedi.getFullYear()
    ? `${jj(lundi)} ${MOIS[lundi.getMonth()]} au ${fin}`
    : `${jj(lundi)} ${MOIS[lundi.getMonth()]} ${lundi.getFullYear()} au ${fin}`;
}

// Année académique : de septembre à août.
export function anneeAcademique(semaineISO: string): string {
  const { lundi } = bornesSemaine(semaineISO);
  const y = lundi.getFullYear();
  return lundi.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

const MAX_LIGNES_PAGE = 22;
const HAUTEUR_LIGNES_MM = 122; // zone du tableau sous l'en-tête
const SERIF = "'Times New Roman', Times, serif";

const bord = '0.25mm solid #1f1f1f';

export default function FichesPresencePdf({
  fiches,
  semestre,
  cycle,
  semaine,
  lignesSupplementaires = 5,
}: Props) {
  const creneaux = creneauxFiables();
  const numeroSemestre = semestre.replace(/[^0-9]/g, '') || semestre;
  const annee = anneeAcademique(semaine);
  // Niveau affiché comme dans les emplois du temps : "BTS 2", "HND 1"…
  const niveauNumero = (niveauDeSemestre('standard', semestre) ?? '').replace(/[^0-9]/g, '');
  const niveauLabel = cycle && niveauNumero ? `${cycle.toUpperCase()} ${niveauNumero}` : null;
  const libelle = libelleSemaine(semaine);

  // Découpage en pages : étudiants + lignes libres, 22 lignes max / page.
  const toutesLesPages: {
    fiche: FicheSpecialite;
    lignes: ({ matricule: string; nom: string } | null)[];
    debut: number;
    index: number;
    total: number;
  }[] = [];
  for (const fiche of fiches) {
    const lignes: ({ matricule: string; nom: string } | null)[] = [
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
    <div className="fiche-presence-doc">
      {toutesLesPages.map((pg, idx) => {
        // Lignes un peu plus hautes quand il y en a peu (plus de place
        // pour signer), plafonnées pour rester sobres.
        const hauteurLigne = Math.min(9, HAUTEUR_LIGNES_MM / pg.lignes.length);
        return (
          <section
            key={`${pg.fiche.specialiteId}-${pg.index}`}
            className="fiche-presence-page"
            style={{
              width: '297mm',
              height: '209mm',
              boxSizing: 'border-box',
              padding: '9mm 10mm 14mm',
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
                FICHE DE PRESENCE / ATTENDANCE LIST
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
                  <u style={{ fontStyle: 'italic' }}>Spécialité</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>
                    {pg.fiche.nom}
                    {niveauLabel ? ` (${niveauLabel})` : ''}
                  </b>
                </div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Semestre</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{numeroSemestre}</b>
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

            {/* Tableau */}
            <table
              style={{
                width: '277mm',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              <colgroup>
                <col style={{ width: '9.5mm' }} />
                <col style={{ width: '28mm' }} />
                <col style={{ width: '60mm' }} />
                {JOURS.flatMap((j) =>
                  creneaux.map((c) => (
                    <col key={`${j}-${c}`} style={{ width: `${179.5 / (JOURS.length * creneaux.length)}mm` }} />
                  ))
                )}
              </colgroup>
              <thead>
                <tr style={{ height: '6.5mm' }}>
                  <th
                    rowSpan={2}
                    style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '11px' }}
                  >
                    N°
                  </th>
                  <th
                    rowSpan={2}
                    style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '12px' }}
                  >
                    Matricule
                  </th>
                  <th
                    rowSpan={2}
                    style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '12px' }}
                  >
                    Noms et Prénoms
                  </th>
                  {JOURS.map((j) => (
                    <th
                      key={j}
                      colSpan={creneaux.length}
                      style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '11px' }}
                    >
                      {j}
                    </th>
                  ))}
                </tr>
                <tr style={{ height: '4.5mm' }}>
                  {JOURS.flatMap((j) =>
                    creneaux.map((c) => (
                      <th
                        key={`${j}-${c}`}
                        style={{ border: bord, background: '#f7f7f7', fontFamily: SERIF, fontSize: '8px', padding: 0 }}
                      >
                        {c}
                      </th>
                    ))
                  )}
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
                    <td style={{ border: bord, textAlign: 'center', fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {nom?.matricule ?? ''}
                    </td>
                    <td
                      style={{
                        border: bord,
                        padding: '0 2mm',
                        fontSize: '10px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {nom?.nom ?? ''}
                    </td>
                    {JOURS.flatMap((j) =>
                      creneaux.map((c) => <td key={`${j}-${c}`} style={{ border: bord }} />)
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {pg.total > 1 && (
              <div
                style={{
                  position: 'absolute',
                  right: '10mm',
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