// src/lib/niveau.ts
// Un niveau regroupe deux semestres : S1-S2 → niveau 1, S3-S4 → niveau 2, etc.
export function niveauDeSemestre(semestre: string | number | null | undefined): number | null {
    if (semestre == null) return null;
    const n = typeof semestre === 'number' ? semestre : parseInt(String(semestre).replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.ceil(n / 2);
  }