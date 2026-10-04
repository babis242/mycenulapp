// src/features/rapports-pdf/components/marque.tsx
//
// Identité visuelle du rapport hebdomadaire / mensuel : couleurs du logo
// CENULAPE (marine + or) et couleurs vives pour les graphiques, en-tête
// avec logo, pied de page. Pages sur fond blanc.

import type { ReactNode } from 'react';

export const COULEURS = {
  marineFonce: '#121a5a',
  marine: '#1e2a78',
  violet: '#6d3bdc',
  prune: '#a23bd8',
  or: '#f2a900',
  orClair: '#ffd36a',
  turquoise: '#0ea5a4',
  vert: '#10b981',
  orange: '#f97316',
  rose: '#e11d48',
  bleu: '#3b82f6',
  texte: '#1f2937',
  discret: '#6b7280',
};

export const DEGRADE_MARQUE =
  'linear-gradient(120deg, #121a5a 0%, #1e2a78 38%, #5b2bd6 78%, #a23bd8 100%)';
export const DEGRADE_OR = 'linear-gradient(90deg, #f2a900, #ffd36a, #f2a900)';

export function formaterDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Douala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ETOILE = 'M30 4 L35 25 L56 30 L35 35 L30 56 L25 35 L4 30 L25 25 Z';

// Grand en-tête (première page) : logo + SERVICE DE LA SCOLARITÉ.
export function EnteteHero({ titre, periode }: { titre: string; periode: string }) {
  return (
    <>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: DEGRADE_MARQUE,
          color: '#fff',
          padding: '9mm 10mm 8mm',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: '-14mm',
            top: '-20mm',
            width: '70mm',
            height: '70mm',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '22mm',
            bottom: '-26mm',
            width: '52mm',
            height: '52mm',
            borderRadius: '50%',
            background: 'rgba(242,169,0,0.22)',
          }}
        />
        <svg
          width="60"
          height="60"
          viewBox="0 0 60 60"
          style={{ position: 'absolute', right: '12mm', top: '8mm', opacity: 0.9 }}
        >
          <path d={ETOILE} fill="#ffd36a" opacity="0.85" />
        </svg>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '7mm' }}>
          <div
            style={{
              width: '30mm',
              height: '30mm',
              flexShrink: 0,
              background: '#ffffff',
              borderRadius: '6mm',
              padding: '2mm',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/logo-cenulape.png"
              alt="Logo CENULAPE"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.16em',
                color: COULEURS.orClair,
              }}
            >
              CENTRE UNIVERSITAIRE LA PERLE · CENULAPE
            </div>
            <div
              style={{
                fontSize: '31px',
                fontWeight: 900,
                letterSpacing: '0.045em',
                lineHeight: 1.08,
                marginTop: '1.5mm',
              }}
            >
              SERVICE DE LA SCOLARITÉ
            </div>
            <div
              style={{
                height: '1.3mm',
                width: '46mm',
                borderRadius: '1mm',
                background: DEGRADE_OR,
                margin: '2.4mm 0 2mm',
              }}
            />
            <div style={{ fontSize: '10px', fontStyle: 'italic', opacity: 0.85 }}>
              Une formation, un métier
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            marginTop: '6mm',
            display: 'flex',
            alignItems: 'center',
            gap: '4mm',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              background: DEGRADE_OR,
              color: COULEURS.marineFonce,
              fontWeight: 900,
              fontSize: '13px',
              borderRadius: '6mm',
              padding: '1.6mm 5mm',
              letterSpacing: '0.03em',
            }}
          >
            {titre}
          </span>
          <span style={{ fontWeight: 800, fontSize: '15px' }}>{periode}</span>
        </div>
      </div>
      <div style={{ height: '2.2mm', background: DEGRADE_OR }} />
    </>
  );
}

// En-tête compact (pages suivantes).
export function EnteteCompact({ titre, periode }: { titre: string; periode: string }) {
  return (
    <>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: DEGRADE_MARQUE,
          color: '#fff',
          padding: '4.5mm 10mm',
          display: 'flex',
          alignItems: 'center',
          gap: '4.5mm',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: '-10mm',
            top: '-16mm',
            width: '42mm',
            height: '42mm',
            borderRadius: '50%',
            background: 'rgba(242,169,0,0.22)',
          }}
        />
        <div
          style={{
            width: '15mm',
            height: '15mm',
            flexShrink: 0,
            background: '#fff',
            borderRadius: '3.5mm',
            padding: '1mm',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          <img
            src="/logo-cenulape.png"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '0.05em' }}>
            SERVICE DE LA SCOLARITÉ
          </div>
          <div style={{ fontSize: '9px', fontWeight: 700, color: COULEURS.orClair, letterSpacing: '0.12em' }}>
            CENTRE UNIVERSITAIRE LA PERLE · CENULAPE
          </div>
        </div>
        <div style={{ position: 'relative', textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: 900, color: COULEURS.orClair }}>{titre}</div>
          <div style={{ fontSize: '10.5px', fontWeight: 700 }}>{periode}</div>
        </div>
      </div>
      <div style={{ height: '1.6mm', background: DEGRADE_OR }} />
    </>
  );
}

export function PiedDePage({ genereLe }: { genereLe: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '11mm',
        borderTop: `0.6mm solid ${COULEURS.or}`,
        background: '#ffffff',
        padding: '0 10mm',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '8.5px',
        fontWeight: 700,
        color: COULEURS.discret,
      }}
    >
      <span>
        Service de la scolarité — CENULAPE · BP 760 Yassa, Douala · Tél : 658 09 34 70 ·
        info@laperle-sup.com
      </span>
      <span style={{ color: COULEURS.marine }}>Édité le {formaterDateHeure(genereLe)}</span>
    </div>
  );
}

// Page A4 portrait sur fond blanc : hauteur minimale d'une page, elle
// s'allonge si la liste est longue (pas de limite de pages).
export function PageA4({
  enTete,
  pied,
  derniere,
  children,
}: {
  enTete: ReactNode;
  pied: ReactNode;
  derniere?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="rapport-page"
      style={{
        width: '210mm',
        minHeight: '296mm',
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
        boxSizing: 'border-box',
        paddingBottom: '15mm',
        breakAfter: derniere ? 'auto' : 'page',
        pageBreakAfter: derniere ? 'auto' : 'always',
        color: COULEURS.texte,
      }}
    >
      <div style={{ position: 'relative' }}>{enTete}</div>
      <div style={{ position: 'relative', padding: '6mm 10mm 0' }}>{children}</div>
      {pied}
    </section>
  );
}

// Carte à coins arrondis avec titre coloré.
export function Carte({
  titre,
  sousTitre,
  couleur = COULEURS.marine,
  children,
  style,
}: {
  titre: string;
  sousTitre?: string;
  couleur?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e8e9f4',
        borderRadius: '4.5mm',
        boxShadow: '0 1mm 3mm rgba(30,42,120,0.07)',
        padding: '4.5mm 5mm',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '1.6mm',
          background: couleur,
        }}
      />
      <div style={{ fontSize: '13px', fontWeight: 900, color: couleur }}>{titre}</div>
      {sousTitre && (
        <div style={{ fontSize: '9.5px', fontWeight: 600, color: COULEURS.discret, marginBottom: '2.5mm' }}>
          {sousTitre}
        </div>
      )}
      {children}
    </div>
  );
}