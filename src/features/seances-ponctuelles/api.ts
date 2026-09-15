// src/features/seances-ponctuelles/api.ts
import { supabase } from '@/lib/supabase';

// Même alphabet que les codes journaliers (src/features/codes-journaliers/api.ts)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genererCode(longueur = 6): string {
  let code = '';
  for (let i = 0; i < longueur; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

const JOURS_SEMAINE = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

// Lundi de la semaine contenant cette date (format YYYY-MM-DD).
function lundiDeLaSemaineDe(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const jour = date.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  date.setDate(date.getDate() + decalage);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Annulation par l'enseignant ─────────────────────────────────────
export async function annulerMaSeance(
  seanceId: string,
  motif: string
): Promise<void> {
  const { error } = await supabase.rpc('annuler_ma_seance', {
    p_seance_id: seanceId,
    p_motif: motif || null,
  });
  if (error) throw new Error(error.message);
}

// ── Suivi admin des annulations ─────────────────────────────────────
// Une séance annulée sort automatiquement de cette liste dès qu'elle est
// remplacée (programmerCoursVolant repasse annulee à false sur la même
// ligne) — pas besoin de vérifier un "déjà remplacée" séparément.
export interface SeanceAnnulee {
  id: string;
  ueNom: string;
  enseignantNom: string;
  jour: string;
  creneau: string;
  semaine: string;
  annuleeLe: string;
  motif: string | null;
  specialiteId: string | null;
  offreId: string | null;
  troncCommunId: string | null;
}

export async function listSeancesAnnulees(): Promise<SeanceAnnulee[]> {
  const { data, error } = await supabase
    .from('seances_edt')
    .select(
      `
      id, jour, creneau, annulee_le, motif_annulation, offre_id, tronc_commun_id, semaine,
      offre:offres(ue:ues(nom), specialite_id),
      tronc_commun:troncs_communs(nom),
      enseignant:enseignants(nom),
      emploi_du_temps:emplois_du_temps(semaine, specialite_id)
    `
    )
    .eq('annulee', true)
    .order('annulee_le', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as any[]).map((s) => ({
    id: s.id,
    ueNom: s.tronc_commun?.nom ?? s.offre?.ue?.nom ?? '',
    enseignantNom: s.enseignant?.nom ?? '',
    jour: s.jour,
    creneau: s.creneau,
    semaine: s.emploi_du_temps?.semaine ?? s.semaine ?? '',
    annuleeLe: s.annulee_le,
    motif: s.motif_annulation,
    specialiteId: s.offre?.specialite_id ?? s.emploi_du_temps?.specialite_id ?? null,
    offreId: s.offre_id,
    troncCommunId: s.tronc_commun_id,
  }));
}

export interface OffreOption {
  offreId: string | null;
  troncCommunId: string | null;
  nom: string;
  enseignantAttribueId: string | null;
}

export async function listOffresPourSpecialite(
  specialiteId: string
): Promise<OffreOption[]> {
  const { data, error } = await supabase
    .from('offres')
    .select(
      `
      id, ue:ues(nom, troncs_communs_ues(tronc_commun_id, tronc_commun:troncs_communs(nom, enseignant_id))),
      attributions(enseignant_id, statut)
    `
    )
    .eq('specialite_id', specialiteId);
  if (error) throw error;

  const vues = new Map<string, OffreOption>();
  for (const o of (data ?? []) as any[]) {
    const lien = o.ue?.troncs_communs_ues?.[0];
    const attributionActive = (o.attributions ?? []).find(
      (a: any) => a.statut === 'actif'
    );
    if (lien?.tronc_commun_id) {
      vues.set(`tronc:${lien.tronc_commun_id}`, {
        offreId: null,
        troncCommunId: lien.tronc_commun_id,
        nom: `${lien.tronc_commun.nom} (tronc commun)`,
        enseignantAttribueId: lien.tronc_commun.enseignant_id ?? null,
      });
    } else {
      vues.set(`offre:${o.id}`, {
        offreId: o.id,
        troncCommunId: null,
        nom: o.ue?.nom ?? '',
        enseignantAttribueId: attributionActive?.enseignant_id ?? null,
      });
    }
  }
  return Array.from(vues.values()).sort((a, b) => a.nom.localeCompare(b.nom));
}

// ── Programmation à la volée ─────────────────────────────────────────
// Crée directement une vraie séance dans la grille EDT de la semaine
// concernée (pas de mécanisme séparé) — ses codes vivent dans la même
// table que les codes normaux (codes_seances), donc tout écran qui
// affiche déjà les codes/séances de la semaine l'affiche automatiquement.
//
// Nécessite qu'un emploi du temps validé existe déjà pour cette semaine
// et cette spécialité (cas normal pour un remplacement). Sinon, demande
// de valider l'EDT de cette semaine d'abord (écran "Emploi du temps").
export interface NouveauCoursVolant {
  date: string; // YYYY-MM-DD
  creneau: string;
  offreId?: string;
  troncCommunId?: string;
  specialiteId: string;
  enseignantId: string;
  salleId?: string;
  remplaceSeanceEdtId?: string;
  motif?: string;
}

export interface CodesGeneres {
  seanceId: string;
  codeOuverture: string;
  codeFermeture: string;
}

export async function programmerCoursVolant(
  input: NouveauCoursVolant
): Promise<CodesGeneres> {
  const jour = JOURS_SEMAINE[new Date(input.date + 'T00:00:00').getDay()];
  const semaine = lundiDeLaSemaineDe(input.date);

  const { data: emploi, error: emploiError } = await supabase
    .from('emplois_du_temps')
    .select('id, statut')
    .eq('specialite_id', input.specialiteId)
    .eq('semaine', semaine)
    .maybeSingle();
  if (emploiError) throw emploiError;

  if (!emploi) {
    throw new Error(
      `Aucun emploi du temps trouvé pour cette spécialité la semaine du ${semaine} — valide d'abord l'emploi du temps de cette semaine (écran "Emploi du temps").`
    );
  }
  if (emploi.statut !== 'valide') {
    throw new Error(
      `L'emploi du temps de cette semaine n'est pas encore validé — valide-le d'abord (écran "Emploi du temps").`
    );
  }

  const estTronc = !!input.troncCommunId;

  const donneesSeance = {
    emploi_du_temps_id: estTronc ? null : emploi.id,
    semaine,
    jour,
    creneau: input.creneau,
    offre_id: input.offreId ?? null,
    tronc_commun_id: input.troncCommunId ?? null,
    enseignant_id: input.enseignantId,
    salle_id: input.salleId ?? null,
    annulee: false,
    motif_annulation: null,
    heure_ouverture: null,
    heure_fermeture: null,
  };

  // Toujours vérifier s'il existe déjà une séance sur ce créneau exact
  // (même sans passer par "Programmer un remplacement") — on la
  // remplace au lieu d'en créer une deuxième en double. Un tronc commun
  // n'a qu'UNE SEULE ligne partagée (retrouvée par tronc_commun_id +
  // semaine, pas par emploi_du_temps_id qu'elle n'a plus).
  let idCible = input.remplaceSeanceEdtId ?? null;
  if (!idCible) {
    const requete = estTronc
      ? supabase
          .from('seances_edt')
          .select('id')
          .eq('tronc_commun_id', input.troncCommunId)
          .eq('semaine', semaine)
          .eq('jour', jour)
          .eq('creneau', input.creneau)
      : supabase
          .from('seances_edt')
          .select('id')
          .eq('emploi_du_temps_id', emploi.id)
          .eq('jour', jour)
          .eq('creneau', input.creneau);
    const { data: existantes } = await requete;
    if (existantes && existantes.length > 0) {
      idCible = existantes[0].id;
      // Doublons déjà présents (bug passé, ou créneau saisi deux fois) —
      // on n'en garde qu'une, les autres sont supprimées.
      const doublons = existantes.slice(1).map((e) => e.id);
      if (doublons.length > 0) {
        await supabase.from('seances_edt').delete().in('id', doublons);
      }
    }
  }

  let seanceId: string;
  if (idCible) {
    const { data: seance, error } = await supabase
      .from('seances_edt')
      .update(donneesSeance)
      .eq('id', idCible)
      .select('id')
      .single();
    if (error) throw error;
    seanceId = seance.id;
  } else {
    const { data: seance, error } = await supabase
      .from('seances_edt')
      .insert(donneesSeance)
      .select('id')
      .single();
    if (error) throw error;
    seanceId = seance.id;
  }

  // (Re)génère les codes — supprime d'abord un éventuel code existant
  // (cas du remplacement d'une séance qui en avait déjà un).
  await supabase.from('codes_seances').delete().eq('seance_edt_id', seanceId);
  const codeOuverture = genererCode();
  const codeFermeture = genererCode();
  const { error: codeError } = await supabase.from('codes_seances').insert({
    seance_edt_id: seanceId,
    jour,
    creneau: input.creneau,
    code_ouverture: codeOuverture,
    code_fermeture: codeFermeture,
    statut: 'non_utilise',
  });
  if (codeError) throw codeError;

  // Notification à l'enseignant assigné — non bloquant.
  try {
    const { data: enseignant } = await supabase
      .from('enseignants')
      .select('matricule')
      .eq('id', input.enseignantId)
      .maybeSingle();
    if (enseignant?.matricule) {
      const { data: compte } = await supabase
        .from('comptes_utilisateurs')
        .select('id')
        .eq('matricule', enseignant.matricule)
        .maybeSingle();
      if (compte) {
        await supabase.from('notifications').insert({
          compte_id: compte.id,
          titre: 'Cours programmé',
          message: `Un cours t'a été programmé le ${input.date} (${input.creneau}).`,
          lien: '/ma-seance',
        });
      }
    }
  } catch {
    // Non bloquant.
  }

  return { seanceId, codeOuverture, codeFermeture };
}