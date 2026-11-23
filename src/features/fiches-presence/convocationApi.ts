// src/features/fiches-presence/convocationApi.ts
//
// Conseil de discipline : pour une semaine donnée, repère les étudiants dont
// le cumul d'heures d'absence dépasse un seuil. Les heures viennent de
// l'étiquette du créneau (« 08h-12h » = 4 h, « 14h-17h » = 3 h).
import type { DonneesBrutes } from './rapportGlobalApi';


// Durée en heures d'un créneau « 08h-12h », « 13h30-17h », « 8h à 12h »… (4 h si illisible).
export function dureeCreneau(label: string): number {
  const m = label.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:-|–|à)\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return 4;
  const debut = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  const fin = Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0);
  return fin > debut ? fin - debut : 4;
}

export function formatHeures(h: number): string {
  const entier = Math.floor(h + 1e-9);
  const min = Math.round((h - entier) * 60);
  return min ? `${entier} h ${String(min).padStart(2, '0')}` : `${entier} h`;
}

export function niveauDe(semestre: string): string {
  const n = Number(semestre.replace(/[^0-9]/g, ''));
  return n ? `Niveau ${Math.ceil(n / 2)}` : semestre;
}

export interface EtudiantConvoque {
  id: string;
  matricule: string;
  nom: string;
  specialiteId: string;
  specialite: string;
  cycle: string;
  semestre: string;
  niveau: string;
  heures: number; // heures d'absence dans la semaine
  absences: number; // créneaux manqués
  total: number; // créneaux renseignés
}

// `inclure` : clés « specialiteId|semestre » retenues. Un étudiant est
// convoqué si ses heures d'absence sont STRICTEMENT supérieures au seuil.
export function calculerConvocations(
  donnees: DonneesBrutes,
  semaine: string,
  seuilHeures: number,
  inclure: Set<string>
): EtudiantConvoque[] {
  const specParId = new Map(donnees.specialites.map((s) => [s.id, s]));
  const etuParId = new Map(donnees.etudiants.map((e) => [e.id, e]));
  const cumul = new Map<string, { heures: number; absences: number; total: number; specId: string; semestre: string }>();

  for (const pr of donnees.presences) {
    if (pr.semaine !== semaine) continue;
    if (!inclure.has(`${pr.specialite_id}|${pr.semestre}`)) continue;
    let c = cumul.get(pr.etudiant_id);
    if (!c) {
      c = { heures: 0, absences: 0, total: 0, specId: pr.specialite_id, semestre: pr.semestre };
      cumul.set(pr.etudiant_id, c);
    }
    c.total += 1;
    if (!pr.present) {
      c.absences += 1;
      c.heures += dureeCreneau(pr.creneau ?? '');
    }
  }

  const out: EtudiantConvoque[] = [];
  for (const [id, c] of cumul) {
    if (c.heures <= seuilHeures + 1e-9) continue;
    const spec = specParId.get(c.specId);
    const etu = etuParId.get(id);
    if (!spec) continue;
    out.push({
      id,
      matricule: etu?.matricule ?? '—',
      nom: etu?.nom_complet ?? 'Étudiant inconnu',
      specialiteId: c.specId,
      specialite: spec.nom,
      cycle: (spec.cycle ?? '').trim() || 'Autre',
      semestre: c.semestre,
      niveau: niveauDe(c.semestre),
      heures: c.heures,
      absences: c.absences,
      total: c.total,
    });
  }
  const num = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;
  return out.sort(
    (a, b) =>
      a.cycle.localeCompare(b.cycle, 'fr') ||
      a.specialite.localeCompare(b.specialite, 'fr') ||
      num(a.semestre) - num(b.semestre) ||
      b.heures - a.heures ||
      a.nom.localeCompare(b.nom, 'fr')
  );
}

export interface InfosConseil {
  dateConseil: string; // AAAA-MM-JJ
  heure: string; // HH:MM
  lieu: string;
  motif: string;
  reference: string;
  note: string;
  signataireFonction: string;
  signataireNom: string;
}

export function dateLongue(iso: string): string {
  if (!iso) return '…………………';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function heureLongue(hhmm: string): string {
  if (!hhmm) return '…………';
  const [h, m] = hhmm.split(':');
  return m && m !== '00' ? `${Number(h)} h ${m}` : `${Number(h)} h`;
}