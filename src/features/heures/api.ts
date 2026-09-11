// src/features/heures/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

// "YYYY-MM" → bornes [début du mois, début du mois suivant[ (ISO date,
// comparées à heure_ouverture qui porte la date réelle du cours).
function bornesDuMois(anneeMois: string): { debut: string; fin: string } {
  const [y, m] = anneeMois.split('-').map(Number);
  const debut = new Date(y, m - 1, 1);
  const fin = new Date(y, m, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  return { debut: fmt(debut), fin: fmt(fin) };
}

function versDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

export function moisEnCours(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Une ligne = une séance fermée (un créneau réellement effectué), pas un
// agrégat — nécessaire pour voir le détail jour par jour, heure d'arrivée
// et de fermeture (le fichier détaillé ET l'app doivent montrer chaque
// entrée, pas juste un total par UE).
export interface LigneHeureSeance {
  seanceId: string;
  enseignantId: string;
  enseignantNom: string;
  ueNom: string;
  specialiteId: string;
  jour: string;
  date: string; // YYYY-MM-DD, dérivée de heure_ouverture
  creneau: string;
  heureOuverture: string; // ISO
  heureFermeture: string; // ISO
  heures: number;
}

export interface LigneHeureTotal {
  enseignantId: string;
  enseignantNom: string;
  totalHeures: number;
}

// Reconstruit le détail heures depuis le cache Dexie — mêmes règles que
// listHeuresDetailMois/listMesHeuresMois, sans jointure Supabase.
// `enseignantId` filtre sur un seul enseignant (vue "Mes heures") ; omis,
// renvoie tout le monde (vue globale Admin/Responsable).
export async function lireHeuresDepuisCache(
  anneeMois: string,
  enseignantId?: string
): Promise<LigneHeureSeance[]> {
  const { debut, fin } = bornesDuMois(anneeMois);
  const [seances, offres, ues, enseignants, emplois, troncsCommuns] =
    await Promise.all([
      db.seancesEDT.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.enseignants.toArray(),
      db.emploisDuTemps.toArray(),
      db.troncsCommuns.toArray(),
    ]);

  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));

  return (seances as any[])
    .filter((s) => s.duree_calculee != null && s.heure_ouverture)
    .filter((s) => s.heure_ouverture >= debut && s.heure_ouverture < fin)
    .filter((s) => !enseignantId || s.enseignant_id === enseignantId)
    .map((s) => {
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = enseignantParId.get(s.enseignant_id);
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      return {
        seanceId: s.id,
        enseignantId: s.enseignant_id,
        enseignantNom: enseignant?.nom ?? '',
        ueNom: troncCommun?.nom ?? ue?.nom ?? '(UE inconnue)',
        specialiteId: emploi?.specialite_id ?? '',
        jour: s.jour,
        date: versDateISO(s.heure_ouverture),
        creneau: s.creneau,
        heureOuverture: s.heure_ouverture,
        heureFermeture: s.heure_fermeture,
        heures: Number(s.duree_calculee),
      } as LigneHeureSeance;
    })
    .sort(
      (a, b) =>
        a.enseignantNom.localeCompare(b.enseignantNom) ||
        a.date.localeCompare(b.date) ||
        a.creneau.localeCompare(b.creneau)
    );
}

// Détail séance par séance, pour tous les enseignants, sur le mois donné —
// Admin et Responsable (vue globale, écran 7.1 + export "détail"). Le
// filtrage par périmètre de spécialités se fait côté appelant (via
// specialiteId), puisque seule la page sait quel rôle consulte.
export async function listHeuresDetailMois(
  anneeMois: string
): Promise<LigneHeureSeance[]> {
  const { debut, fin } = bornesDuMois(anneeMois);

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture, duree_calculee,
      enseignant_id,
      enseignant:enseignants(nom),
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom),
      emploi_du_temps:emplois_du_temps(specialite_id)
    `
    )
    .not('duree_calculee', 'is', null)
    .gte('heure_ouverture', debut)
    .lt('heure_ouverture', fin);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map((s) => ({
      seanceId: s.id,
      enseignantId: s.enseignant_id,
      enseignantNom: s.enseignant?.nom ?? '',
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '(UE inconnue)',
      specialiteId: s.emploi_du_temps?.specialite_id ?? '',
      jour: s.jour,
      date: versDateISO(s.heure_ouverture),
      creneau: s.creneau,
      heureOuverture: s.heure_ouverture,
      heureFermeture: s.heure_fermeture,
      heures: Number(s.duree_calculee),
    }))
    .sort(
      (a, b) =>
        a.enseignantNom.localeCompare(b.enseignantNom) ||
        a.date.localeCompare(b.date) ||
        a.creneau.localeCompare(b.creneau)
    );
}

// Totaux par enseignant (sans détail) — dérivés du détail ci-dessus.
export async function listHeuresTotalMois(
  anneeMois: string
): Promise<LigneHeureTotal[]> {
  const detail = await listHeuresDetailMois(anneeMois);
  return totauxDepuisDetail(detail);
}

export function totauxDepuisDetail(
  detail: LigneHeureSeance[]
): LigneHeureTotal[] {
  const parEnseignant = new Map<string, LigneHeureTotal>();
  for (const d of detail) {
    const existant = parEnseignant.get(d.enseignantId);
    if (existant) existant.totalHeures += d.heures;
    else
      parEnseignant.set(d.enseignantId, {
        enseignantId: d.enseignantId,
        enseignantNom: d.enseignantNom,
        totalHeures: d.heures,
      });
  }
  return Array.from(parEnseignant.values()).sort((a, b) =>
    a.enseignantNom.localeCompare(b.enseignantNom)
  );
}

// Vue personnelle de l'enseignant (écran 7.2) — ses propres séances,
// jour par jour, avec heure d'ouverture et de fermeture de chacune.
export async function listMesHeuresMois(
  matricule: string,
  anneeMois: string
): Promise<LigneHeureSeance[]> {
  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return [];

  const { debut, fin } = bornesDuMois(anneeMois);
  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture, duree_calculee,
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom)
    `
    )
    .eq('enseignant_id', enseignant.id)
    .not('duree_calculee', 'is', null)
    .gte('heure_ouverture', debut)
    .lt('heure_ouverture', fin);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map((s) => ({
      seanceId: s.id,
      enseignantId: enseignant.id,
      enseignantNom: '',
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '(UE inconnue)',
      specialiteId: '',
      jour: s.jour,
      date: versDateISO(s.heure_ouverture),
      creneau: s.creneau,
      heureOuverture: s.heure_ouverture,
      heureFermeture: s.heure_fermeture,
      heures: Number(s.duree_calculee),
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.creneau.localeCompare(b.creneau)
    );
}
