// src/features/fiches-presence/saisieApi.ts
//
// Saisie MANUELLE des présences : créneaux réellement programmés pour une
// classe (spécialité + semestre) sur une semaine, et enregistrement dans la
// même table que la lecture des fiches (presences_etudiants).
import { supabase } from '@/lib/supabase';
import { JOURS } from '@/constants/enums';
import {
  filtrerSeancesDuSemestre,
  getSeancesGroupees,
} from '@/features/emploi-du-temps/api';
import { creneauxFiables } from './creneauxFiables';

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

// Enregistre, pour CHAQUE étudiant et chacun des créneaux donnés, l'état
// courant (présent par défaut). Une ligne par étudiant × créneau : le taux
// de présence cumulé de la page de consultation reste donc exact.
export async function enregistrerSaisieManuelle(params: {
  specialiteId: string;
  semestre: string;
  semaine: string;
  creneaux: { jour: string; creneau: string }[];
  etudiantIds: string[];
  present: (etudiantId: string, jour: string, creneau: string) => boolean;
}): Promise<number> {
  const { specialiteId, semestre, semaine, creneaux, etudiantIds, present } = params;
  const maintenant = new Date().toISOString();
  const lignes: any[] = [];
  for (const etudiantId of etudiantIds) {
    for (const c of creneaux) {
      lignes.push({
        etudiant_id: etudiantId,
        specialite_id: specialiteId,
        semestre,
        semaine,
        jour: c.jour,
        creneau: c.creneau,
        present: present(etudiantId, c.jour, c.creneau),
        updated_at: maintenant,
      });
    }
  }
  for (let i = 0; i < lignes.length; i += 500) {
    const lot = lignes.slice(i, i + 500);
    const { data, error } = await supabase
      .from('presences_etudiants')
      .upsert(lot, { onConflict: 'etudiant_id,semaine,jour,creneau' })
      .select('etudiant_id');
    if (error) {
      if (/row-level security|permission denied/i.test(error.message)) {
        throw new Error(
          "Enregistrement refusé : ce compte n'a pas les droits d'écriture sur les présences. Exécutez sql/acces_secretaire_presences.sql dans Supabase."
        );
      }
      throw error;
    }
    // Une base qui refuse silencieusement (droits de lecture/écriture
    // incomplets) renvoie moins de lignes que celles envoyées.
    if ((data?.length ?? 0) < lot.length) {
      throw new Error(
        `Enregistrement incomplet : ${data?.length ?? 0} ligne(s) confirmée(s) sur ${lot.length}. Le compte n'a probablement pas tous les droits sur les présences — exécutez sql/acces_secretaire_presences.sql dans Supabase.`
      );
    }
  }
  return lignes.length;
}