// src/features/codes-journaliers/components/CouponsCodesPdf.tsx
//
// Planche de coupons à imprimer, découper et remettre aux enseignants : un
// coupon d'OUVERTURE et un coupon de FERMETURE par séance, en grille serrée
// (3 colonnes × 14 lignes = 42 coupons par page A4) pour économiser le papier.
// Noir sur blanc ; les pages d'ouverture et de fermeture sont séparées.
// Chaque coupon porte l'essentiel : enseignant, salle, jour + date + créneau,
// et le code en gros. Pas de logo. Pointillés de découpe partagés entre coupons.
import { dateReelleDuJour, type CodeSeanceDetail } from '../api';

const COLONNES = 3;
const LIGNES = 14;
const PAR_PAGE = COLONNES * LIGNES;
const HAUT_MM = 19.5;
const POLICE = 'Arial, Helvetica, sans-serif';
const MONO = "'Courier New', Courier, monospace";
const NOIR = '#000';

type TypeCode = 'ouverture' | 'fermeture';
interface Coupon {
  cle: string;
  type: TypeCode;
  enseignant: string;
  salle: string | null;
  jour: string;
  date: string; // JJ/MM/AAAA
  creneau: string;
  code: string;
}

function dateFr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Coupons d'un type (jour → créneau, dans l'ordre reçu). */
export function construireCoupons(codes: CodeSeanceDetail[], semaine: string, type: TypeCode): Coupon[] {
  return codes.map((l) => ({
    cle: `${l.id}-${type}`,
    type,
    enseignant: l.enseignantNom || '—',
    salle: l.salleCode,
    jour: l.jour,
    date: dateFr(dateReelleDuJour(semaine, l.jour)),
    creneau: l.creneau,
    code: type === 'ouverture' ? l.codeOuverture : l.codeFermeture,
  }));
}

function CouponCase({ c, dernierCol, derniereLigne }: { c: Coupon | null; dernierCol: boolean; derniereLigne: boolean }) {
  return (
    <div
      style={{
        height: `${HAUT_MM}mm`,
        boxSizing: 'border-box',
        padding: '1.3mm 2.2mm 1.2mm',
        borderRight: dernierCol ? 'none' : '0.25mm dashed #000',
        borderBottom: derniereLigne ? 'none' : '0.25mm dashed #000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        fontFamily: POLICE,
        color: '#000',
      }}
    >
      {c && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5mm' }}>
            <span
              style={{
                fontSize: '7px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '0.5mm 1.8mm',
                borderRadius: '2mm',
                background: c.type === 'ouverture' ? '#000' : '#fff',
                color: c.type === 'ouverture' ? '#fff' : '#000',
                border: `0.3mm solid ${NOIR}`,
                whiteSpace: 'nowrap',
              }}
            >
              {c.type === 'ouverture' ? 'OUVERTURE' : 'FERMETURE'}
            </span>
            <span style={{ fontSize: '7.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {c.jour} {c.date} · {c.creneau}
            </span>
          </div>
          <div
            style={{
              fontSize: '9px',
              fontWeight: 800,
              lineHeight: 1.12,
              height: '6.6mm',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span>{c.enseignant}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2mm' }}>
            <span style={{ fontSize: '9px', fontWeight: 800 }}>
              Salle <span style={{ fontSize: '10.5px' }}>{c.salle ?? '—'}</span>
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontWeight: 900,
                fontSize: '17px',
                letterSpacing: '0.12em',
                lineHeight: 1,
                padding: '0.7mm 1.8mm 0.7mm 2.2mm',
                border: `0.6mm solid ${NOIR}`,
                borderRadius: '1.2mm',
              }}
            >
              {c.code}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function CouponsCodesPdf({ codes, semaine }: { codes: CodeSeanceDetail[]; semaine: string }) {
  // Les pages d'OUVERTURE d'abord, puis les pages de FERMETURE : jamais mélangées.
  const pages: (Coupon | null)[][] = [];
  for (const type of ['ouverture', 'fermeture'] as TypeCode[]) {
    const coupons = construireCoupons(codes, semaine, type);
    for (let i = 0; i < coupons.length; i += PAR_PAGE) {
      const lot: (Coupon | null)[] = coupons.slice(i, i + PAR_PAGE);
      while (lot.length % COLONNES !== 0) lot.push(null);
      pages.push(lot);
    }
  }
  return (
    <div className="coupons-doc" style={{ background: '#fff' }}>
      {pages.map((lot, p) => {
        const lignes = lot.length / COLONNES;
        return (
          <div
            key={p}
            style={{
              width: '198mm',
              display: 'grid',
              gridTemplateColumns: `repeat(${COLONNES}, 1fr)`,
              border: '0.25mm dashed #000',
              breakAfter: p < pages.length - 1 ? 'page' : 'auto',
              pageBreakAfter: p < pages.length - 1 ? 'always' : 'auto',
            }}
          >
            {lot.map((c, i) => (
              <CouponCase
                key={c?.cle ?? `vide-${i}`}
                c={c}
                dernierCol={i % COLONNES === COLONNES - 1}
                derniereLigne={Math.floor(i / COLONNES) === lignes - 1}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}