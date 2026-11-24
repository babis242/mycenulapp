// src/features/fiches-presence/components/ConvocationsPdf.tsx
//
// Conseil de discipline : liste récapitulative des étudiants convoqués et
// convocations individuelles (une page A4 portrait par étudiant).
import { anneeAcademique, libelleSemaine } from './FichesPresencePdf';
import { dateLongue, formatHeures, heureLongue, type EtudiantConvoque, type InfosConseil } from '../convocationApi';

const ROUGE = '#dc2626';
const SANS = "'Nunito', 'Segoe UI', Arial, Helvetica, sans-serif";

function EnTete() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5mm', borderBottom: `0.8mm solid ${ROUGE}`, paddingBottom: '3mm' }}>
      <img src="/logo-cenulape.png" alt="" style={{ height: '22mm', width: '22mm', objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px' }}>CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)</div>
        <div style={{ fontSize: '9.5px', color: '#4b5563', fontWeight: 600, marginTop: '0.8mm' }}>BP : 760 Yassa, Douala · Tél : 658 09 34 70</div>
      </div>
    </div>
  );
}

const cadre: React.CSSProperties = { border: '0.3mm solid #111827', borderRadius: '2mm', padding: '4mm 5mm' };
const ligne: React.CSSProperties = { display: 'flex', gap: '3mm', padding: '1.2mm 0', fontSize: '12px' };
const etiquette: React.CSSProperties = { width: '38mm', fontWeight: 700, color: '#4b5563', flexShrink: 0 };

interface Props {
  convoques: EtudiantConvoque[];
  semaine: string;
  seuilHeures: number;
  infos: InfosConseil;
}

const dateEmission = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function ConvocationsPdf({ convoques, semaine, seuilHeures, infos }: Props) {
  return (
    <div style={{ fontFamily: SANS, color: '#111827', width: '180mm' }}>
      {convoques.map((e, i) => (
        <div
          key={e.id}
          style={{
            width: '180mm',
            minHeight: '265mm',
            boxSizing: 'border-box',
            breakAfter: i < convoques.length - 1 ? 'page' : 'auto',
            pageBreakAfter: i < convoques.length - 1 ? 'always' : 'auto',
          }}
        >
          <EnTete />
          <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, marginTop: '5mm' }}>Douala, le {dateEmission()}</div>
          {infos.reference && <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '1mm' }}>Réf. : {infos.reference}</div>}

          <div style={{ textAlign: 'center', margin: '9mm 0 7mm' }}>
            <div style={{ display: 'inline-block', fontSize: '19px', fontWeight: 800, letterSpacing: '1px', borderBottom: `0.8mm solid ${ROUGE}`, paddingBottom: '1.5mm' }}>
              CONVOCATION AU CONSEIL DE DISCIPLINE
            </div>
          </div>

          <div style={cadre}>
            <div style={ligne}>
              <span style={etiquette}>Étudiant(e)</span>
              <span style={{ fontWeight: 800 }}>{e.nom}</span>
            </div>
            <div style={ligne}>
              <span style={etiquette}>Spécialité</span>
              <span style={{ fontWeight: 700 }}>
                {e.specialite} ({e.cycle})
              </span>
            </div>
            <div style={ligne}>
              <span style={etiquette}>Niveau</span>
              <span style={{ fontWeight: 700 }}>
                {e.niveau} — {e.semestre} · Année académique {anneeAcademique(semaine)}
              </span>
            </div>
          </div>

          <p style={{ fontSize: '12.5px', lineHeight: 1.65, margin: '7mm 0 4mm', textAlign: 'justify' }}>
            Madame, Monsieur,
          </p>
          <p style={{ fontSize: '12.5px', lineHeight: 1.65, margin: '0 0 4mm', textAlign: 'justify' }}>
            Le suivi des présences fait apparaître que vous avez cumulé <b>{formatHeures(e.heures)} d’absence</b> (sur {formatHeures(e.total)} de cours) au cours de la semaine du{' '}
            <b>{libelleSemaine(semaine)}</b>, soit plus de <b>{seuilHeures} heures</b>, seuil au-delà duquel un étudiant est convoqué devant le conseil
            de discipline.
          </p>
          <p style={{ fontSize: '12.5px', lineHeight: 1.65, margin: '0 0 4mm' }}>En conséquence, vous êtes prié(e) de vous présenter devant le conseil de discipline :</p>

          <div style={{ ...cadre, borderColor: ROUGE, borderWidth: '0.6mm' }}>
            <div style={ligne}>
              <span style={etiquette}>Date</span>
              <span style={{ fontWeight: 800, textTransform: 'capitalize' }}>{dateLongue(infos.dateConseil)}</span>
            </div>
            <div style={ligne}>
              <span style={etiquette}>Heure</span>
              <span style={{ fontWeight: 800 }}>{heureLongue(infos.heure)}</span>
            </div>
            <div style={ligne}>
              <span style={etiquette}>Lieu</span>
              <span style={{ fontWeight: 800 }}>{infos.lieu || '…………………………………'}</span>
            </div>
            <div style={ligne}>
              <span style={etiquette}>Motif</span>
              <span style={{ fontWeight: 700 }}>{infos.motif || 'Absences répétées'}</span>
            </div>
          </div>

          <p style={{ fontSize: '12.5px', lineHeight: 1.65, margin: '5mm 0 0', textAlign: 'justify' }}>
            Votre présence est obligatoire. Vous voudrez bien vous munir de tout justificatif de vos absences.
          </p>
          {infos.note && <p style={{ fontSize: '12.5px', lineHeight: 1.65, margin: '2mm 0 0', textAlign: 'justify' }}>{infos.note}</p>}

          <div style={{ marginTop: '10mm', textAlign: 'right', fontSize: '12.5px' }}>
            <div style={{ fontWeight: 800 }}>{infos.signataireFonction || 'La Direction'}</div>
            <div style={{ height: '18mm' }} />
            {infos.signataireNom && <div style={{ fontWeight: 700 }}>{infos.signataireNom}</div>}
          </div>

          <div style={{ marginTop: '9mm', borderTop: '0.3mm dashed #6b7280', paddingTop: '3mm', fontSize: '10.5px', color: '#374151' }}>
            <b>Accusé de réception</b> — Je soussigné(e) <b>{e.nom}</b> reconnais avoir reçu la présente convocation le ……… / ……… / …………
            <div style={{ textAlign: 'right', marginTop: '3mm' }}>Signature de l’étudiant(e) : ……………………………………</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const th: React.CSSProperties = { background: '#111827', color: '#fff', fontSize: '9.5px', fontWeight: 700, padding: '1.8mm 2mm', textAlign: 'center' };
const td: React.CSSProperties = { borderBottom: '0.2mm solid #e5e7eb', padding: '1.5mm 2mm', fontSize: '10px', textAlign: 'center' };

export function ListeConvoquesPdf({ convoques, semaine, seuilHeures, infos }: Props) {
  const groupes: { cle: string; titre: string; liste: EtudiantConvoque[] }[] = [];
  for (const e of convoques) {
    const cle = `${e.specialiteId}|${e.semestre}`;
    let g = groupes.find((x) => x.cle === cle);
    if (!g) {
      g = { cle, titre: `${e.specialite} (${e.cycle}) — ${e.niveau} (${e.semestre})`, liste: [] };
      groupes.push(g);
    }
    g.liste.push(e);
  }
  let n = 0;
  return (
    <div style={{ fontFamily: SANS, color: '#111827', width: '180mm' }}>
      <EnTete />
      <div style={{ textAlign: 'center', margin: '6mm 0 4mm' }}>
        <div style={{ fontSize: '17px', fontWeight: 800 }}>LISTE DES ÉTUDIANTS CONVOQUÉS AU CONSEIL DE DISCIPLINE</div>
        <div style={{ fontSize: '10.5px', color: '#4b5563', fontWeight: 600, marginTop: '1.5mm' }}>
          Absences de la semaine du {libelleSemaine(semaine)} · plus de {seuilHeures} heures · Année académique {anneeAcademique(semaine)}
        </div>
      </div>
      <div style={{ ...cadre, padding: '3mm 5mm', marginBottom: '5mm' }}>
        <div style={{ ...ligne, fontSize: '11px', padding: '0.8mm 0' }}>
          <span style={{ ...etiquette, width: '22mm' }}>Date</span>
          <b style={{ textTransform: 'capitalize' }}>{dateLongue(infos.dateConseil)}</b>
          <span style={{ marginLeft: '6mm', fontWeight: 700, color: '#4b5563' }}>Heure</span>
          <b>{heureLongue(infos.heure)}</b>
        </div>
        <div style={{ ...ligne, fontSize: '11px', padding: '0.8mm 0' }}>
          <span style={{ ...etiquette, width: '22mm' }}>Lieu</span>
          <b>{infos.lieu || '…………………………'}</b>
        </div>
        <div style={{ ...ligne, fontSize: '11px', padding: '0.8mm 0' }}>
          <span style={{ ...etiquette, width: '22mm' }}>Motif</span>
          <b>{infos.motif || 'Absences répétées'}</b>
        </div>
      </div>

      <div style={{ fontSize: '11px', fontWeight: 800, marginBottom: '2mm' }}>
        {convoques.length} étudiant{convoques.length > 1 ? 's' : ''} convoqué{convoques.length > 1 ? 's' : ''}
      </div>
      {groupes.map((g) => (
        <div key={g.cle} style={{ marginBottom: '5mm', breakInside: 'avoid' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }} colSpan={4}>
                  {g.titre}
                </th>
              </tr>
              <tr>
                {['N°', 'Nom et prénoms', 'Heures d’absence', 'Heures de cours'].map((h, i) => (
                  <th key={h} style={{ ...th, background: '#374151', textAlign: i === 1 ? 'left' : 'center' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.liste.map((e) => (
                <tr key={e.id} style={{ breakInside: 'avoid' }}>
                  <td style={td}>{++n}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{e.nom}</td>
                  <td style={{ ...td, fontWeight: 800, color: ROUGE }}>{formatHeures(e.heures)}</td>
                  <td style={td}>
                    {formatHeures(e.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}