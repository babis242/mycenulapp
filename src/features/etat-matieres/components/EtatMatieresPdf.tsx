import type { LigneEtatMatiere, ModeSeuil } from '../api';
import { formaterHeures } from '../api';
import { DocumentSimple, Titre } from '@/features/rapports-pdf/components/marqueSimple';

const cellule: React.CSSProperties = { border: '1px solid #000', padding: '1.4mm 2mm', fontSize: '10px', textAlign: 'left', verticalAlign: 'middle' };

export default function EtatMatieresPdf({
  lignes, libelleCycle, semestre, seuil, mode, genereLe,
}: {
  lignes: LigneEtatMatiere[]; libelleCycle: string; semestre: string; seuil: number; mode: ModeSeuil; genereLe: string;
}) {
  const parSpecialite = new Map<string, LigneEtatMatiere[]>();
  for (const l of lignes) parSpecialite.set(l.specialiteNom, [...(parSpecialite.get(l.specialiteNom) ?? []), l]);

  return (
    <DocumentSimple genereLe={genereLe}>
      <Titre
        titre="ÉTAT DES MATIÈRES"
        sous={`${libelleCycle} — Semestre ${semestre} — matières ${mode === 'au_moins' ? 'ayant atteint au moins' : 'à moins de'} ${seuil} % des heures`}
      />
      <div style={{ fontSize: '10px', textAlign: 'center', marginBottom: '3mm' }}>
        {lignes.length} matière(s) · {parSpecialite.size} spécialité(s) · heures réellement effectuées / volume horaire
      </div>
      {lignes.length === 0 && <p style={{ textAlign: 'center', fontSize: '11px' }}>Aucune matière ne correspond à ce critère.</p>}
      {Array.from(parSpecialite.entries()).map(([specialite, ls]) => (
        <div key={specialite} style={{ marginBottom: '5mm', breakInside: 'avoid-page' }}>
          <div style={{ background: '#e5e7eb', border: '1px solid #000', borderBottom: 0, padding: '1.4mm 2mm', fontWeight: 700, fontSize: '11px' }}>{specialite}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ ...cellule, width: '30%' }}>Matière</th>
                <th style={{ ...cellule, width: '22%' }}>Enseignant</th>
                <th style={{ ...cellule, width: '16%' }}>WhatsApp</th>
                <th style={{ ...cellule, width: '11%', textAlign: 'center' }}>Effectuées</th>
                <th style={{ ...cellule, width: '11%', textAlign: 'center' }}>Volume</th>
                <th style={{ ...cellule, width: '10%', textAlign: 'center' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {ls.map((l) => (
                <tr key={l.offreId} style={{ breakInside: 'avoid' }}>
                  <td style={cellule}>{l.ueNom}{l.troncCommunNom ? <span style={{ color: '#666' }}> (tronc commun)</span> : null}</td>
                  <td style={cellule}>{l.enseignantNom ?? '—'}</td>
                  <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{l.enseignantWhatsapp ?? '—'}</td>
                  <td style={{ ...cellule, textAlign: 'center' }}>{formaterHeures(l.heuresEffectuees)} h</td>
                  <td style={{ ...cellule, textAlign: 'center' }}>{formaterHeures(l.volumeHoraire)} h</td>
                  <td style={{ ...cellule, textAlign: 'center', fontWeight: 700 }}>{String(l.pourcentage).replace('.', ',')} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </DocumentSimple>
  );
}