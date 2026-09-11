// src/features/codes-journaliers/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

// Alphabet sans caractères ambigus (pas de 0/O ni de 1/I) — le code est
// recopié à la main par la secrétaire puis ressaisi par l'enseignant
// (Scénario 8), donc la lisibilité prime.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genererCode(longueur = 6): string {
  let code = '';
  for (let i = 0; i < longueur; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// Déclenché automatiquement à la validation de l'emploi du temps
// (Scénario 6 → 7, journal.md) : un code d'ouverture + un code de
// fermeture par séance de la semaine validée. Idempotent — ne recrée pas
// de code pour une séance qui en possède déjà un (utile si la fonction est
// rappelée après une re-validation).
export async function genererCodesPourEmploi(emploiId: string): Promise<void> {
  const { data: seances, error } = await supabase
    .from('seances_edt')
    .select('id, jour, creneau')
    .eq('emploi_du_temps_id', emploiId);
  if (error) throw error;
  if (!seances || seances.length === 0) return;

  const { data: existants } = await supabase
    .from('codes_seances')
    .select('seance_edt_id')
    .in(
      'seance_edt_id',
      seances.map((s) => s.id)
    );
  const dejaGeneres = new Set((existants ?? []).map((e) => e.seance_edt_id));

  const aCreer = seances
    .filter((s) => !dejaGeneres.has(s.id))
    .map((s) => ({
      seance_edt_id: s.id,
      jour: s.jour,
      creneau: s.creneau,
      code_ouverture: genererCode(),
      code_fermeture: genererCode(),
      statut: 'non_utilise' as const,
    }));
  if (aCreer.length === 0) return;

  const { error: insertError } = await supabase
    .from('codes_seances')
    .insert(aCreer);
  if (insertError) throw insertError;
}

export interface CodeSeanceDetail {
  id: string;
  seanceId: string;
  ueNom: string;
  enseignantNom: string;
  salleCode: string | null;
  specialiteId: string;
  specialiteNom: string;
  jour: string;
  creneau: string;
  codeOuverture: string;
  codeFermeture: string;
  statut: 'utilise' | 'non_utilise';
}

const OFFSET_JOUR: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
};

// Date réelle (ISO, YYYY-MM-DD) d'une séance = lundi de la semaine +
// décalage du jour. Utile pour proposer par défaut "aujourd'hui" à la
// secrétaire (journal.md : elle reçoit les codes jour par jour).
export function dateReelleDuJour(semaineISO: string, jour: string): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + (OFFSET_JOUR[jour] ?? 0));
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Nom du jour (enum Jour) correspondant à la date du jour, si elle tombe
// dans la semaine donnée — sert à pré-sélectionner "aujourd'hui" pour la
// secrétaire. Retourne null si la date du jour est hors de cette semaine
// (dimanche compris, puisqu'il n'y a pas cours ce jour-là).
export function jourDAujourdhuiDansSemaine(semaineISO: string): string | null {
  const auj = new Date();
  const ajISO = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(auj.getDate()).padStart(2, '0')}`;
  for (const [jour, offset] of Object.entries(OFFSET_JOUR)) {
    const [y, m, d] = semaineISO.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + offset);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
    if (iso === ajISO) return jour;
  }
  return null;
}

// Liste des codes journaliers pour une semaine donnée, toutes spécialités
// validées confondues — écran "Liste des codes journaliers" (Admin,
// Responsable, Secrétaire).
// Reconstruit la liste des codes journaliers depuis le cache Dexie —
// mêmes règles que listCodesPourSemaine (EDT validé de la semaine
// uniquement), mais sans jointure Supabase. NB : les séances de tronc
// commun n'ont pas de nom d'UE en cache (pas de table Dexie dédiée aux
// troncs communs) — elles s'affichent avec un nom vide plutôt que planter.
export async function lireCodesDepuisCache(
  semaineISO: string
): Promise<CodeSeanceDetail[]> {
  const [
    emplois,
    seancesToutes,
    codesToutes,
    offres,
    ues,
    enseignants,
    salles,
    troncsCommuns,
  ] = await Promise.all([
    db.emploisDuTemps
      .where('semaine')
      .equals(semaineISO)
      .and((e: any) => e.statut === 'valide')
      .toArray(),
    db.seancesEDT.toArray(),
    db.codesSeance.toArray(),
    db.offres.toArray(),
    db.ues.toArray(),
    db.enseignants.toArray(),
    db.salles.toArray(),
    db.troncsCommuns.toArray(),
  ]);
  if (emplois.length === 0) return [];

  const specialites = await db.specialites.toArray();
  const specialiteParId = new Map(specialites.map((s: any) => [s.id, s]));
  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));
  const codeParSeanceId = new Map(
    codesToutes.map((c: any) => [c.seance_edt_id, c])
  );

  return (seancesToutes as any[])
    .filter((s) => emploiParId.has(s.emploi_du_temps_id))
    .map((s) => {
      const code = codeParSeanceId.get(s.id);
      if (!code) return null;
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      const specialite = emploi
        ? specialiteParId.get(emploi.specialite_id)
        : null;
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = s.enseignant_id
        ? enseignantParId.get(s.enseignant_id)
        : null;
      const salle = s.salle_id ? salleParId.get(s.salle_id) : null;
      return {
        id: code.id,
        seanceId: s.id,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '',
        enseignantNom: enseignant?.nom ?? '',
        salleCode: salle?.code_salle ?? null,
        specialiteId: specialite?.id ?? '',
        specialiteNom: specialite?.nom ?? '',
        jour: s.jour,
        creneau: s.creneau,
        codeOuverture: code.code_ouverture,
        codeFermeture: code.code_fermeture,
        statut: code.statut,
      } as CodeSeanceDetail;
    })
    .filter((c): c is CodeSeanceDetail => c !== null)
    .sort((a, b) => {
      const diffJour = (OFFSET_JOUR[a.jour] ?? 0) - (OFFSET_JOUR[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      if (a.creneau !== b.creneau) return a.creneau.localeCompare(b.creneau);
      return a.ueNom.localeCompare(b.ueNom);
    });
}

export async function listCodesPourSemaine(
  semaineISO: string
): Promise<CodeSeanceDetail[]> {
  const { data: emplois, error: emploisError } = await supabase
    .from('emplois_du_temps')
    .select('id, specialite_id, specialite:specialites(nom)')
    .eq('semaine', semaineISO)
    .eq('statut', 'valide');
  if (emploisError) throw emploisError;
  const emploiIds = (emplois ?? []).map((e) => e.id);
  if (emploiIds.length === 0) return [];

  const specialiteParEmploi = new Map(
    (emplois ?? []).map((e) => [
      e.id,
      {
        id: (e as any).specialite_id as string,
        nom: (e as any).specialite?.nom ?? '',
      },
    ])
  );

  const { data: seances, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, emploi_du_temps_id,
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom),
      salle:salles(code_salle)
    `
    )
    .in('emploi_du_temps_id', emploiIds);
  if (error) throw error;
  if (!seances || seances.length === 0) return [];

  const { data: codes, error: codesError } = await supabase
    .from('codes_seances')
    .select(
      'id, seance_edt_id, jour, creneau, code_ouverture, code_fermeture, statut'
    )
    .in(
      'seance_edt_id',
      seances.map((s) => s.id)
    );
  if (codesError) throw codesError;
  const codeParSeance = new Map((codes ?? []).map((c) => [c.seance_edt_id, c]));

  return (seances as any[])
    .map((s) => {
      const code = codeParSeance.get(s.id);
      if (!code) return null;
      const specialite = specialiteParEmploi.get(s.emploi_du_temps_id);
      return {
        id: code.id,
        seanceId: s.id,
        ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
        enseignantNom: s.enseignant?.nom ?? '',
        salleCode: s.salle?.code_salle ?? null,
        specialiteId: specialite?.id ?? '',
        specialiteNom: specialite?.nom ?? '',
        jour: s.jour,
        creneau: s.creneau,
        codeOuverture: code.code_ouverture,
        codeFermeture: code.code_fermeture,
        statut: code.statut,
      } as CodeSeanceDetail;
    })
    .filter((x): x is CodeSeanceDetail => x !== null)
    .sort((a, b) => {
      const diffJour = (OFFSET_JOUR[a.jour] ?? 0) - (OFFSET_JOUR[b.jour] ?? 0);
      if (diffJour !== 0) return diffJour;
      if (a.creneau !== b.creneau) return a.creneau.localeCompare(b.creneau);
      return a.ueNom.localeCompare(b.ueNom);
    });
}
