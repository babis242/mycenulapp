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
    const { error } = await supabase
      .from('presences_etudiants')
      .upsert(lignes.slice(i, i + 500), { onConflict: 'etudiant_id,semaine,jour,creneau' });
    if (error) throw error;
  }
  return lignes.length;
}