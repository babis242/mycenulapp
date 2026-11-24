// src/features/fiches-presence/saisieApi.ts
//
// Saisie HEBDOMADAIRE des absences : créneaux réellement programmés pour une classe
// (spécialité + semestre) sur une semaine (pour connaître le total d'heures de cours),
// et enregistrement du cumul d'heures d'absence de chaque étudiant.
import { supabase } from '@/lib/supabase';
import { JOURS } from '@/constants/enums';
import {
  filtrerSeancesDuSemestre,
  getSeancesGroupees,
} from '@/features/emploi-du-temps/api';
import { creneauxFiables } from './creneauxFiables';
import { dureeCreneau } from './rapportGlobalApi';

export interface CreneauProgramme {
  jour: string;
  creneau: string;
  cours: string; // « UE · UE » si plusieurs séances sur le même créneau
  enseignants: string;
}

export const cleCase = (etudiantId: string, jour: string, creneau: string) =>
  `${etudiantId}|${jour}|${creneau}`;

export async function getCreneauxProgrammes(
  specialiteId: string,
  semestre: string,
  semaine: string
): Promise<CreneauProgramme[]> {
  const donnees = await getSeancesGroupees([specialiteId], semaine, { forcerRafraichissement: true });
  const seances = filtrerSeancesDuSemestre(donnees, [specialiteId], semestre).filter(
    (s) =>
      s.specialiteId === specialiteId ||
      (s.troncCommunId && donnees.specialitesParTronc.get(s.troncCommunId)?.has(specialiteId))
  );
  const parCase = new Map<string, CreneauProgramme>();
  for (const s of seances) {
    const k = `${s.jour}|${s.creneau}`;
    const existant = parCase.get(k);
    if (existant) {
      if (!existant.cours.includes(s.ueNom)) existant.cours += ` · ${s.ueNom}`;
      if (s.enseignantNom && !existant.enseignants.includes(s.enseignantNom))
        existant.enseignants += existant.enseignants ? `, ${s.enseignantNom}` : s.enseignantNom;
    } else {
      parCase.set(k, { jour: s.jour, creneau: s.creneau, cours: s.ueNom, enseignants: s.enseignantNom });
    }
  }
  const ordreCreneau = creneauxFiables();
  const ordreJour = JOURS as string[];
  return Array.from(parCase.values()).sort(
    (a, b) =>
      ordreJour.indexOf(a.jour) - ordreJour.indexOf(b.jour) ||
      ordreCreneau.indexOf(a.creneau) - ordreCreneau.indexOf(b.creneau)
  );
}

// ── Saisie hebdomadaire : un cumul d'heures d'absence par étudiant ───────────
// Table absences_hebdo_etudiants (sql/absences_hebdomadaires.sql). Une ligne par étudiant et
// par semaine ; pas de ligne = pas encore saisi (compté 0 dans la page).

/** Heures de cours programmées dans la semaine pour la classe (somme des créneaux). */
export function heuresProgrammees(creneaux: CreneauProgramme[]): number {
  return Math.round(creneaux.reduce((t, c) => t + dureeCreneau(c.creneau), 0) * 100) / 100;
}

export async function lireAbsencesHebdo(specialiteId: string, semestre: string, semaine: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('absences_hebdo_etudiants')
    .select('etudiant_id, heures_absence')
    .eq('specialite_id', specialiteId)
    .eq('semestre', semestre)
    .eq('semaine', semaine)
    .limit(5000);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error('Table absente : exécutez sql/absences_hebdomadaires.sql dans Supabase.');
    }
    throw error;
  }
  return new Map((data ?? []).map((r: any) => [r.etudiant_id as string, Number(r.heures_absence) || 0]));
}

// Enregistre le cumul de TOUS les étudiants de la classe (0 par défaut).
export async function enregistrerAbsencesHebdo(params: {
  specialiteId: string;
  semestre: string;
  semaine: string;
  heuresProgrammees: number;
  absences: { etudiantId: string; heures: number }[];
}): Promise<number> {
  const { specialiteId, semestre, semaine, heuresProgrammees: prog, absences } = params;
  const { data: u } = await supabase.auth.getUser();
  const maintenant = new Date().toISOString();
  const lignes = absences.map((a) => ({
    etudiant_id: a.etudiantId,
    specialite_id: specialiteId,
    semestre,
    semaine,
    heures_absence: Math.max(0, Math.round(a.heures * 100) / 100),
    heures_programmees: prog,
    saisi_par: u.user?.id ?? null,
    updated_at: maintenant,
  }));
  for (let i = 0; i < lignes.length; i += 500) {
    const lot = lignes.slice(i, i + 500);
    const { data, error } = await supabase
      .from('absences_hebdo_etudiants')
      .upsert(lot, { onConflict: 'etudiant_id,semaine' })
      .select('etudiant_id');
    if (error) {
      if (/row-level security|permission denied/i.test(error.message)) {
        throw new Error("Enregistrement refusé : ce compte n'a pas les droits. Exécutez sql/absences_hebdomadaires.sql dans Supabase.");
      }
      throw error;
    }
    if ((data?.length ?? 0) < lot.length) {
      throw new Error(`Enregistrement incomplet : ${data?.length ?? 0} ligne(s) confirmée(s) sur ${lot.length}.`);
    }
  }
  return lignes.length;
}