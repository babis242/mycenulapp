// src/features/disponibilites/components/DisponibilitesParSpecialitePdf.tsx
//
// PDF « par spécialité » : une page A4 paysage par spécialité. Une grille
// Jour × Créneau où chaque enseignant qui a coché ce créneau apparaît
// dans une pastille de SA couleur ; légende des enseignants en bas.
import { JOURS, tousLesCreneaux } from '@/constants/enums';
import type {
  LigneDisponibilitesEnseignant,
  SpecialiteDuCycle,
} from '../api';

const PALETTE = [
  { bg: '#fee2e2', fort: '#dc2626' },
  { bg: '#dbeafe', fort: '#2563eb' },
  { bg: '#dcfce7', fort: '#16a34a' },
  { bg: '#fef3c7', fort: '#d97706' },
  { bg: '#ede9fe', fort: '#7c3aed' },
  { bg: '#fce7f3', fort: '#db2777' },
  { bg: '#ccfbf1', fort: '#0d9488' },
  { bg: '#ffedd5', fort: '#ea580c' },
  { bg: '#e0e7ff', fort: '#4f46e5' },
  { bg: '#ecfccb', fort: '#65a30d' },
  { bg: '#cffafe', fort: '#0891b2' },
  { bg: '#fae8ff', fort: '#c026d3' },
];

function formaterDateHeure(d: Date): string {
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  });
}

interface Props {
  lignes: LigneDisponibilitesEnseignant[];
  specialites: SpecialiteDuCycle[];
  cycleLabel: string;
  cycle?: string; // code du cycle (BTS, HND…) pour afficher « BTS 1 »
  genereLe: Date;
}

export function libelleNiveau(cycle: string | undefined, niveau: number): string {
  if (niveau <= 0) return 'Niveau non précisé';
  return cycle ? `${cycle.toUpperCase()} ${niveau}` : `Niveau ${niveau}`;
}

export default function DisponibilitesParSpecialitePdf({
  lignes,
  specialites,
  cycleLabel,
  cycle,
  genereLe,
}: Props) {
  const creneaux = tousLesCreneaux();

  // Une page par (spécialité, niveau) : niveau 1, puis niveau 2…
  const pages: { spec: SpecialiteDuCycle; niveau: number | null }[] = [];
  for (const spec of specialites) {
    const niveaux = new Set<number>();
    for (const l of lignes) {
      for (const [niv, d] of l.niveaux) if (d.specialiteIds.includes(spec.id)) niveaux.add(niv);
    }
    if (niveaux.size === 0) pages.push({ spec, niveau: null });
    else Array.from(niveaux).sort((a, b) => a - b).forEach((niveau) => pages.push({ spec, niveau }));
  }

  return (
    <div className="dispo-pdf" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
      {pages.map(({ spec, niveau }, idxSpec) => {
        const enseignants = lignes
          .filter((l) =>
            niveau === null
              ? l.specialiteIds.includes(spec.id)
              : l.niveaux.get(niveau)?.specialiteIds.includes(spec.id)
          )
          .sort((a, b) => a.nom.localeCompare(b.nom));
        const couleur = new Map(
          enseignants.map((e, i) => [e.enseignantId, PALETTE[i % PALETTE.length]])
        );
        const nbRepondu = enseignants.filter((e) => e.aRepondu).length;

        return (
          <section
            key={`${spec.id}-${niveau ?? 'x'}`}
            style={{
              width: '297mm',
              height: '209mm',
              boxSizing: 'border-box',
              padding: '9mm 11mm',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              breakAfter: idxSpec < pages.length - 1 ? 'page' : 'auto',
              pageBreakAfter: idxSpec < pages.length - 1 ? 'always' : 'auto',
              overflow: 'hidden',
            }}
          >
            {/* En-tête */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6mm' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 700, lineHeight: 1.5, width: '75mm' }}>
                CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)
                <div style={{ fontWeight: 400 }}>Service de la scolarité</div>
              </div>
              <img src="/logo-cenulape.png" alt="" style={{ height: '16mm' }} />
              <div style={{ fontSize: '9.5px', textAlign: 'right', lineHeight: 1.5, width: '75mm' }}>
                THE PEARL UNIVERSITY CENTER
                <div>Généré le {formaterDateHeure(genereLe)}</div>
              </div>
            </div>

            {/* Bandeau spécialité */}
            <div
              style={{
                marginTop: '4mm',
                background: '#dc2626',
                color: '#fff',
                borderRadius: '3mm',
                padding: '3.2mm 5mm',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '4mm',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              <div>
                <div style={{ fontSize: '8.5px', letterSpacing: '1.2px', opacity: 0.85, fontWeight: 700 }}>
                  DISPONIBILITÉS DES ENSEIGNANTS · {cycleLabel.toUpperCase()}
                </div>
                <div style={{ fontSize: '19px', fontWeight: 800, marginTop: '0.5mm' }}>
                  {spec.nom}
                  {niveau !== null && (
                    <span style={{ marginLeft: '3mm', background: '#fff', color: '#dc2626', borderRadius: '99px', padding: '0.4mm 3mm', fontSize: '13px' }}>
                      {libelleNiveau(cycle, niveau)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '9.5px', opacity: 0.9 }}>
                  {[spec.ecoleNom, spec.filiereNom].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: 700, lineHeight: 1.5 }}>
                {enseignants.length} enseignant{enseignants.length > 1 ? 's' : ''}
                <div style={{ fontWeight: 400 }}>
                  {nbRepondu} ont répondu · {enseignants.length - nbRepondu} sans réponse
                </div>
              </div>
            </div>

            {/* Grille */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: '0 1.6mm',
                marginTop: '2mm',
                tableLayout: 'fixed',
                flex: '0 0 auto',
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: '24mm' }} />
                  {creneaux.map((c) => (
                    <th
                      key={c}
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: '#444',
                        letterSpacing: '0.8px',
                        textAlign: 'left',
                        padding: '0 3mm 0.5mm',
                      }}
                    >
                      {c.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOURS.map((jour) => (
                  <tr key={jour} style={{ breakInside: 'avoid' }}>
                    <td
                      style={{
                        background: '#f3f4f6',
                        borderRadius: '2.5mm 0 0 2.5mm',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '0 3mm',
                        verticalAlign: 'middle',
                        WebkitPrintColorAdjust: 'exact',
                        printColorAdjust: 'exact',
                      }}
                    >
                      {jour}
                    </td>
                    {creneaux.map((c, ci) => {
                      const choisis = enseignants.filter((e) => e.cases.has(`${jour}|${c}`));
                      return (
                        <td
                          key={c}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderLeft: 'none',
                            borderRadius: ci === creneaux.length - 1 ? '0 2.5mm 2.5mm 0' : 0,
                            padding: '1.6mm 2.2mm',
                            verticalAlign: 'top',
                            minHeight: '14mm',
                            height: '15mm',
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1mm' }}>
                            {choisis.length === 0 ? (
                              <span style={{ fontSize: '8.5px', color: '#bbb', fontStyle: 'italic' }}>—</span>
                            ) : (
                              choisis.map((e) => {
                                const col = couleur.get(e.enseignantId)!;
                                return (
                                  <span
                                    key={e.enseignantId}
                                    style={{
                                      background: col.bg,
                                      borderLeft: `2.2mm solid ${col.fort}`,
                                      borderRadius: '1.2mm',
                                      padding: '0.6mm 1.8mm',
                                      fontSize: '8.5px',
                                      fontWeight: 700,
                                      lineHeight: 1.25,
                                      WebkitPrintColorAdjust: 'exact',
                                      printColorAdjust: 'exact',
                                    }}
                                  >
                                    {e.nom}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Légende */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: '2.5mm' }}>
              <div style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '1px', color: '#555', marginBottom: '1.5mm' }}>
                ENSEIGNANTS
              </div>
              {enseignants.length === 0 ? (
                <div style={{ fontSize: '9px', color: '#888' }}>Aucun enseignant attribué à cette spécialité.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2mm 5mm' }}>
                  {enseignants.map((e) => {
                    const col = couleur.get(e.enseignantId)!;
                    return (
                      <div key={e.enseignantId} style={{ display: 'flex', alignItems: 'center', gap: '2mm', fontSize: '8.5px' }}>
                        <span
                          style={{
                            width: '3.2mm',
                            height: '3.2mm',
                            borderRadius: '1mm',
                            background: col.fort,
                            flexShrink: 0,
                            WebkitPrintColorAdjust: 'exact',
                            printColorAdjust: 'exact',
                          }}
                        />
                        <span style={{ fontWeight: 700 }}>{e.nom}</span>
                        <span style={{ color: '#777', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                          {e.aRepondu ? `${e.cases.size} créneau${e.cases.size > 1 ? 'x' : ''}` : 'pas de réponse'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}