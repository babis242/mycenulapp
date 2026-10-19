// src/features/fiches-presence/components/FichesControlePdf.tsx
//
// Fiches de contrôle des enseignants (A4 portrait) : UNE fiche par créneau
// (jour + horaire) avec le tableau N° / Nom complet de l'enseignant /
// Présent / Absent / Observation. Même en-tête que les fiches de présence.
import { anneeAcademique, libelleSemaine } from './FichesPresencePdf';
import type { EnseignantControle } from '../controleApi';

export interface FicheControle {
  jour: string;
  creneau: string;
  date: string; // "AAAA-MM-JJ"
  enseignants: EnseignantControle[];
}

interface Props {
  fiches: FicheControle[];
  semaine: string; // lundi
  lignesSupplementaires?: number;
}

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

export function libelleDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MOIS[m - 1]} ${y}`;
}

const SERIF = "'Times New Roman', Times, serif";
const bord = '0.25mm solid #1f1f1f';
const HAUTEUR_UTILE_MM = 190; // zone des lignes du tableau
// Colonne du nom : 88 mm. Caractères par ligne, selon la taille de police.
const CAR_NOM = 34; // nom en gras 14 px
const CAR_COURS = 42; // intitulé du cours en italique 12 px

// Hauteur estimée d'une ligne : nom + (intitulé du cours, puis salle) par cours.
function hauteurLigneMm(e: EnseignantControle | null): number {
  if (!e) return 11;
  let h = 3.5 + Math.max(1, Math.ceil(e.nom.length / CAR_NOM)) * 6.2;
  for (const c of e.cours) {
    h += Math.max(1, Math.ceil(c.ue.length / CAR_COURS)) * 5 + 4.4;
  }
  return Math.max(11, h);
}

function Case() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '5.4mm',
        height: '5.4mm',
        border: '0.35mm solid #1f1f1f',
        borderRadius: '0.6mm',
        verticalAlign: 'middle',
        background: '#fff',
      }}
    />
  );
}

export default function FichesControlePdf({ fiches, semaine, lignesSupplementaires = 3 }: Props) {
  const annee = anneeAcademique(semaine);

  type Ligne = EnseignantControle | null;
  const pages: { fiche: FicheControle; lignes: Ligne[]; debut: number; index: number; total: number }[] = [];
  for (const fiche of fiches) {
    const toutes: Ligne[] = [...fiche.enseignants, ...Array.from({ length: lignesSupplementaires }, () => null)];
    const paquets: { lignes: Ligne[]; debut: number }[] = [];
    let courant: Ligne[] = [];
    let debut = 0;
    let hauteur = 0;
    toutes.forEach((l, i) => {
      const h = hauteurLigneMm(l);
      if (courant.length > 0 && hauteur + h > HAUTEUR_UTILE_MM) {
        paquets.push({ lignes: courant, debut });
        debut = i;
        courant = [];
        hauteur = 0;
      }
      courant.push(l);
      hauteur += h;
    });
    paquets.push({ lignes: courant, debut });
    paquets.forEach((p, k) =>
      pages.push({ fiche, lignes: p.lignes, debut: p.debut, index: k + 1, total: paquets.length })
    );
  }

  return (
    <div className="fiche-controle-doc">
      {pages.map((pg, idx) => {
        const derniere = pg.index === pg.total;
        return (
          <section
            key={`${pg.fiche.jour}-${pg.fiche.creneau}-${pg.index}`}
            className="fiche-controle-page"
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
              breakAfter: idx < pages.length - 1 ? 'page' : 'auto',
              pageBreakAfter: idx < pages.length - 1 ? 'always' : 'auto',
            }}
          >
            {/* En-tête institutionnel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 24mm 1fr', alignItems: 'center', height: '26mm' }}>
              <div style={{ textAlign: 'center', lineHeight: 1.65 }}>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '10px' }}>CENTRE UNIVERSITAIRE LA PERLE</div>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '10px' }}>(CENULAPE)</div>
                <div style={{ fontWeight: 700, fontSize: '9.5px' }}>BP : 760 YASSA DOUALA</div>
                <div style={{ fontWeight: 700, fontSize: '9.5px' }}>TEL : 658 09 34 70</div>
              </div>
              <img src="/logo-cenulape.png" alt="" style={{ height: '24mm', width: '24mm', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
              <div style={{ textAlign: 'center', lineHeight: 1.65 }}>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '10px' }}>THE PEARL UNIVERSITY CENTER</div>
                <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 700, fontSize: '10px' }}>(CENULAPE)</div>
                <div style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '9.5px' }}>Email: info@laperle-sup.com</div>
                <div style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '9.5px' }}>Site web: www.laperle-sup.com</div>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '9px', marginTop: '1.5mm' }}>
              Autorisation N°: 17-09460/L/MINESUP/SG/DDES/ESUP/SDA/OAGS du 20 Septembre 2017
            </div>

            {/* Titre */}
            <div style={{ textAlign: 'center', marginTop: '3mm' }}>
              <div style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.2px' }}>
                FICHE DE CONTRÔLE DES ENSEIGNANTS / TEACHERS CONTROL SHEET
              </div>
              <div style={{ width: '22mm', height: '0.7mm', background: '#dc2626', margin: '1.2mm auto 0', borderRadius: '1mm' }} />
            </div>

            {/* Infos du créneau */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4mm', marginBottom: '3mm', fontSize: '14px', lineHeight: 1.8 }}>
              <div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Jour</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{pg.fiche.jour} {libelleDate(pg.fiche.date)}</b>
                </div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Créneau</u> :{' '}
                  <b style={{ fontStyle: 'italic' }}>{pg.fiche.creneau}</b>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Année académique</u> : <b style={{ fontStyle: 'italic' }}>{annee}</b>
                </div>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Semaine</u> : <b style={{ fontStyle: 'italic' }}>{libelleSemaine(semaine)}</b>
                </div>
              </div>
            </div>

            {/* Tableau */}
            <table style={{ width: '186mm', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '13px' }}>
              <colgroup>
                <col style={{ width: '11mm' }} />
                <col style={{ width: '88mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '47mm' }} />
              </colgroup>
              <thead>
                <tr style={{ height: '10mm' }}>
                  {['N°', 'Nom complet de l\'enseignant', 'Présent', 'Absent', 'Observation'].map((h) => (
                    <th
                      key={h}
                      style={{ border: bord, background: '#f1f1f1', fontFamily: SERIF, fontStyle: 'italic', fontSize: '13px' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.lignes.map((ens, i) => (
                  <tr
                    key={i}
                    style={{ height: `${hauteurLigneMm(ens)}mm`, background: i % 2 === 1 ? '#fafafa' : '#fff' }}
                  >
                    <td style={{ border: bord, textAlign: 'center', fontSize: '13px', fontWeight: 700 }}>{ens ? pg.debut + i + 1 : ''}</td>
                    <td style={{ border: bord, padding: '1mm 2.5mm', verticalAlign: 'middle', lineHeight: 1.3 }}>
                      {ens && (
                        <>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{ens.nom}</div>
                          {ens.cours.map((c, k) => (
                            <div key={k} style={{ marginTop: '1mm' }}>
                              <div style={{ fontStyle: 'italic', fontSize: '12px', color: '#1f2937' }}>{c.ue}</div>
                              <div
                                style={{
                                  fontFamily: 'Arial, Helvetica, sans-serif',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#b91c1c',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.3px',
                                }}
                              >
                                Salle {c.salle ?? '—'}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </td>
                    <td style={{ border: bord, textAlign: 'center', lineHeight: 0 }}><Case /></td>
                    <td style={{ border: bord, textAlign: 'center', lineHeight: 0 }}><Case /></td>
                    <td style={{ border: bord }} />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Contrôleur — dernière page de la fiche */}
            {derniere && (
              <div style={{ position: 'absolute', left: '12mm', right: '12mm', bottom: '14mm', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <div>
                  <u style={{ fontStyle: 'italic' }}>Contrôleur</u> (nom et signature) : ______________________________
                </div>
              </div>
            )}

            {pg.total > 1 && (
              <div style={{ position: 'absolute', right: '12mm', bottom: '6mm', fontSize: '9px', fontStyle: 'italic', color: '#6b7280' }}>
                Page {pg.index}/{pg.total}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}