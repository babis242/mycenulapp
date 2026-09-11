// src/features/seances/api.ts
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

function lundiDeLaSemaine(reference = new Date()): string {
  const d = new Date(reference);
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function decalerSemaine(semaineISO: string, nbSemaines: number): string {
  const [y, m, d] = semaineISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + nbSemaines * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

const NOMS_JOURS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

function jourDAujourdhui(): string | null {
  const nom = NOMS_JOURS[new Date().getDay()];
  return nom === 'Dimanche' ? null : nom;
}

// Heuristique simple : avant 13h → créneau du matin, sinon après-midi.
function creneauActuel(): '08h-12h' | '14h-17h' {
  return new Date().getHours() < 13 ? '08h-12h' : '14h-17h';
}

// ── Flux normal enseignant (écrans 6.1 / 6.2) ──────────────────────

export interface SeanceDuMoment {
  id: string;
  ueNom: string;
  salleCode: string | null;
  jour: string;
  creneau: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
}

// Le cours du moment pour l'enseignant connecté : celui prévu aujourd'hui,
// sur le créneau en cours, dans une semaine déjà validée. Ne renvoie rien
// en dehors des heures de cours ou un dimanche.
export async function getSeanceDuMoment(
  matricule: string
): Promise<SeanceDuMoment | null> {
  const jour = jourDAujourdhui();
  if (!jour) return null;

  const { data: enseignant } = await supabase
    .from('enseignants')
    .select('id')
    .eq('matricule', matricule)
    .maybeSingle();
  if (!enseignant) return null;

  const semaine = lundiDeLaSemaine();
  const creneau = creneauActuel();

  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id')
    .eq('semaine', semaine)
    .eq('statut', 'valide');
  const emploiIds = (emplois ?? []).map((e) => e.id);
  if (emploiIds.length === 0) return null;

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, heure_ouverture, heure_fermeture,
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom),
      salle:salles(code_salle)
    `
    )
    .eq('enseignant_id', enseignant.id)
    .eq('jour', jour)
    .eq('creneau', creneau)
    .in('emploi_du_temps_id', emploiIds)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const s = data as any;
  return {
    id: s.id,
    ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
    salleCode: s.salle?.code_salle ?? null,
    jour: s.jour,
    creneau: s.creneau,
    heureOuverture: s.heure_ouverture,
    heureFermeture: s.heure_fermeture,
  };
}

// Le code n'est jamais lu côté client : la fonction RPC "security definer"
// le vérifie elle-même côté base et renvoie une erreur explicite sinon.
export async function ouvrirSeance(
  seanceId: string,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('ouvrir_seance', {
    p_seance_id: seanceId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  const ligne = Array.isArray(data) ? data[0] : data;
  return ligne?.heure_ouverture;
}

export async function fermerSeance(
  seanceId: string,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('fermer_seance', {
    p_seance_id: seanceId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  const ligne = Array.isArray(data) ? data[0] : data;
  return ligne?.heure_fermeture;
}

// ── Flux de secours — saisie manuelle (écran 6.3) ──────────────────

export interface SeanceRecherche {
  id: string;
  ueNom: string;
  enseignantNom: string;
  jour: string;
  creneau: string;
  semaine: string;
  heureOuverture: string | null;
  heureFermeture: string | null;
}

// Recherche parmi les EDT validés de la semaine en cours et de la
// précédente (pour rattraper un oubli de la veille) — Admin, Responsable,
// Secrétaire.
// Reconstruit la même recherche depuis le cache Dexie — utilisée hors
// ligne (le cas d'usage même de cet écran : l'app était injoignable, la
// secrétaire a noté les heures sur papier, et rattrape ça maintenant,
// éventuellement encore hors ligne).
export async function lireSeancesPourSaisieManuelleDepuisCache(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaineActuelle = lundiDeLaSemaine();
  const semainePrecedente = decalerSemaine(semaineActuelle, -1);

  const [emplois, seancesToutes, offres, ues, enseignants, troncsCommuns] =
    await Promise.all([
      db.emploisDuTemps
        .where('semaine')
        .anyOf([semainePrecedente, semaineActuelle])
        .and((e: any) => e.statut === 'valide')
        .toArray(),
      db.seancesEDT.toArray(),
      db.offres.toArray(),
      db.ues.toArray(),
      db.enseignants.toArray(),
      db.troncsCommuns.toArray(),
    ]);
  if (emplois.length === 0) return [];

  const emploiParId = new Map(emplois.map((e: any) => [e.id, e]));
  const offreParId = new Map(offres.map((o: any) => [o.id, o]));
  const ueParId = new Map(ues.map((u: any) => [u.id, u]));
  const enseignantParId = new Map(enseignants.map((e: any) => [e.id, e]));
  const troncCommunParId = new Map(troncsCommuns.map((t: any) => [t.id, t]));

  const q = recherche.trim().toLowerCase();
  return (seancesToutes as any[])
    .filter((s) => emploiParId.has(s.emploi_du_temps_id))
    .map((s) => {
      const emploi = emploiParId.get(s.emploi_du_temps_id);
      const offre = s.offre_id ? offreParId.get(s.offre_id) : null;
      const ue = offre?.ue_id ? ueParId.get(offre.ue_id) : null;
      const troncCommun = s.tronc_commun_id
        ? troncCommunParId.get(s.tronc_commun_id)
        : null;
      const enseignant = s.enseignant_id
        ? enseignantParId.get(s.enseignant_id)
        : null;
      return {
        id: s.id,
        ueNom: troncCommun?.nom ?? ue?.nom ?? '',
        enseignantNom: enseignant?.nom ?? '',
        jour: s.jour,
        creneau: s.creneau,
        semaine: emploi?.semaine ?? '',
        heureOuverture: s.heure_ouverture ?? null,
        heureFermeture: s.heure_fermeture ?? null,
      } as SeanceRecherche;
    })
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

export async function rechercherSeancesPourSaisieManuelle(
  recherche: string
): Promise<SeanceRecherche[]> {
  const semaineActuelle = lundiDeLaSemaine();
  const semainePrecedente = decalerSemaine(semaineActuelle, -1);

  const { data: emplois } = await supabase
    .from('emplois_du_temps')
    .select('id, semaine')
    .in('semaine', [semainePrecedente, semaineActuelle])
    .eq('statut', 'valide');
  const emploiIds = (emplois ?? []).map((e) => e.id);
  if (emploiIds.length === 0) return [];
  const semaineParEmploi = new Map(
    (emplois ?? []).map((e) => [e.id, e.semaine])
  );

  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, emploi_du_temps_id, heure_ouverture, heure_fermeture,
      offre:offres(ue:ues(nom)),
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom)
    `
    )
    .in('emploi_du_temps_id', emploiIds);
  if (error) throw error;

  const q = recherche.trim().toLowerCase();
  return ((data ?? []) as any[])
    .map((s) => ({
      id: s.id,
      ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
      enseignantNom: s.enseignant?.nom ?? '',
      jour: s.jour,
      creneau: s.creneau,
      semaine: semaineParEmploi.get(s.emploi_du_temps_id) ?? '',
      heureOuverture: s.heure_ouverture,
      heureFermeture: s.heure_fermeture,
    }))
    .filter(
      (s) =>
        !q ||
        s.ueNom.toLowerCase().includes(q) ||
        s.enseignantNom.toLowerCase().includes(q) ||
        s.jour.toLowerCase().includes(q)
    );
}

export async function saisirHeureManuelle(
  seanceId: string,
  heures: { heureOuverture?: string | null; heureFermeture?: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('saisir_heure_manuelle', {
    p_seance_id: seanceId,
    p_heure_ouverture: heures.heureOuverture || null,
    p_heure_fermeture: heures.heureFermeture || null,
  });
  if (error) throw new Error(error.message);
}
