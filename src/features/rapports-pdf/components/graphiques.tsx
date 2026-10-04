// src/features/rapports-pdf/components/graphiques.tsx
//
// Graphiques SVG sans dépendance, pensés pour l'impression PDF :
// courbes lissées (interpolation monotone : jamais de creux sous zéro),
// aires dégradées, points annotés, donut. Tout est du SVG pur → net à
// n'importe quelle échelle, couleurs fidèles à l'impression.

import { useId } from 'react';

export function formaterNombre(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}

export interface SerieCourbe {
  nom: string;
  couleur: string;
  valeurs: number[];
  // Affiche les valeurs au-dessus des points (si peu de points).
  annoter?: boolean;
}

interface Point {
  x: number;
  y: number;
}

// Courbe lissée passant exactement par les points, sans dépassement
// (interpolation cubique monotone, Fritsch–Carlson).
function cheminLisse(pts: Point[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        t[i] = tau * a * m[i];
        t[i + 1] = tau * b * m[i];
      }
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

// Plus petit "beau" maximum ≥ v (1, 2, 4, 5, 8, 10, 20…) et son pas.
function echelle(max: number): { max: number; pas: number } {
  if (max <= 0) return { max: 4, pas: 1 };
  const puissance = Math.pow(10, Math.floor(Math.log10(max)));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidat = k * puissance;
    if (candidat >= max) {
      const pas = candidat / 4;
      return { max: candidat, pas };
    }
  }
  return { max: 10 * puissance, pas: (10 * puissance) / 4 };
}

export function CourbesLissees({
  labels,
  series,
  largeur = 700,
  hauteur = 280,
  unite = '',
}: {
  labels: string[];
  series: SerieCourbe[];
  largeur?: number;
  hauteur?: number;
  unite?: string;
}) {
  const id = useId().replace(/:/g, '');
  const marge = { g: 46, d: 22, h: 24, b: 40 };
  const w = largeur - marge.g - marge.d;
  const h = hauteur - marge.h - marge.b;
  const maxValeur = Math.max(0, ...series.flatMap((s) => s.valeurs));
  const { max: yMax, pas } = echelle(maxValeur);
  const nbLignes = Math.round(yMax / pas);

  const xDe = (i: number) =>
    labels.length <= 1 ? marge.g + w / 2 : marge.g + (i * w) / (labels.length - 1);
  const yDe = (v: number) => marge.h + h - (v / yMax) * h;
  const annoter = labels.length <= 8;

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 6 }}>
        {series.map((s) => (
          <span
            key={s.nom}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11,
              fontWeight: 700,
              color: '#374151',
            }}
          >
            <span
              style={{
                width: 22,
                height: 5,
                borderRadius: 4,
                background: s.couleur,
                display: 'inline-block',
              }}
            />
            {s.nom}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${largeur} ${hauteur}`}
        width="100%"
        style={{ display: 'block' }}
        role="img"
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.nom} id={`${id}-aire-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.couleur} stopOpacity={0.34} />
              <stop offset="100%" stopColor={s.couleur} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* Grille horizontale + graduations */}
        {Array.from({ length: nbLignes + 1 }, (_, k) => {
          const v = k * pas;
          const y = yDe(v);
          return (
            <g key={k}>
              <line
                x1={marge.g}
                x2={marge.g + w}
                y1={y}
                y2={y}
                stroke={k === 0 ? '#9ca3af' : '#e5e7eb'}
                strokeWidth={k === 0 ? 1.2 : 1}
                strokeDasharray={k === 0 ? undefined : '4 4'}
              />
              <text
                x={marge.g - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                fill="#6b7280"
              >
                {formaterNombre(v)}
                {unite}
              </text>
            </g>
          );
        })}

        {/* Libellés de l'axe horizontal */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={xDe(i)}
            y={hauteur - 14}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="#4b5563"
          >
            {l}
          </text>
        ))}

        {/* Aires puis courbes puis points */}
        {series.map((s, i) => {
          const pts = s.valeurs.map((v, k) => ({ x: xDe(k), y: yDe(v) }));
          const ligne = cheminLisse(pts);
          const base = marge.h + h;
          const aire =
            pts.length > 1
              ? `${ligne} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`
              : '';
          return (
            <g key={s.nom}>
              {aire && <path d={aire} fill={`url(#${id}-aire-${i})`} />}
                            <path
                d={ligne}
                fill="none"
                stroke={s.couleur}
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
        {series.map((s) =>
          s.valeurs.map((v, k) => (
            <g key={`${s.nom}-${k}`}>
              <circle
                cx={xDe(k)}
                cy={yDe(v)}
                r={5}
                fill="#ffffff"
                stroke={s.couleur}
                strokeWidth={3}
              />
              {annoter && (s.annoter ?? true) && (
                <text
                  x={xDe(k)}
                  y={yDe(v) - 11}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={800}
                  fill={s.couleur}
                >
                  {formaterNombre(v)}
                </text>
              )}
            </g>
          ))
        )}
      </svg>
    </div>
  );
}

export interface PartDonut {
  label: string;
  valeur: number;
  couleur: string;
}

export function Donut({
  parts,
  centre,
  sousCentre,
  taille = 168,
}: {
  parts: PartDonut[];
  centre: string;
  sousCentre: string;
  taille?: number;
}) {
  const rayon = taille / 2 - 16;
  const circonference = 2 * Math.PI * rayon;
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  let cumul = 0;
  return (
    <svg viewBox={`0 0 ${taille} ${taille}`} width={taille} height={taille} role="img">
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={rayon}
        fill="none"
        stroke="#eef0f6"
        strokeWidth={20}
      />
      {total > 0 &&
        parts
          .filter((p) => p.valeur > 0)
          .map((p) => {
            const longueur = (p.valeur / total) * circonference;
            const decalage = cumul;
            cumul += longueur;
            return (
              <circle
                key={p.label}
                cx={taille / 2}
                cy={taille / 2}
                r={rayon}
                fill="none"
                stroke={p.couleur}
                strokeWidth={20}
                strokeDasharray={`${Math.max(0, longueur - 1.5)} ${circonference - Math.max(0, longueur - 1.5)}`}
                strokeDashoffset={-decalage}
                transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
              />
            );
          })}
      <text
        x={taille / 2}
        y={taille / 2 + 4}
        textAnchor="middle"
        fontSize={28}
        fontWeight={900}
        fill="#1e2a78"
      >
        {centre}
      </text>
      <text
        x={taille / 2}
        y={taille / 2 + 22}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill="#6b7280"
      >
        {sousCentre}
      </text>
    </svg>
  );
}