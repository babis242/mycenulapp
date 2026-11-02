// src/features/etat-matieres/api.ts
//
// État des matières : pour un semestre et un ensemble de spécialités (ou tout
// un cycle), le pourcentage d'avancement de chaque matière = heures
// RÉELLEMENT effectuées (séances ouvertes) / volume horaire de l'UE.
import { supabase } from '@/lib/supabase';
import { listUEsPourCampagne } from '@/features/disponibilites/api';

export interface LigneEtatMatiere {
  offreId: string;
  specialiteNom: string;
  ueNom: string;
  troncCommunNom: string | null;
  enseignantNom: string | null;
  enseignantWhatsapp: string | null;
  volumeHoraire: number;
  heuresEffectuees: number;
  pourcentage: number; // 0..100+ (arrondi à 0,1)
}

export interface EtatMatieres {
  lignes: LigneEtatMatiere[];
  /** Matières dont le volume horaire n'est pas renseigné (calcul impossible). */
  sansVolume: number;
}

export async function calculerEtatMatieres(
  specialites: { id: string; nom: string }[],
  semestre: string
): Promise<EtatMatieres> {
  if (specialites.length === 0) return { lignes: [], sansVolume: 0 };
  const brut = await listUEsPourCampagne(
    specialites.map((s) => ({ specialiteId: s.id, semestre }))
  );
  // La liste inclut aussi les UEs « sœurs » de tronc commun d'autres
  // spécialités : on ne garde que celles de la sélection.
  const noms = new Set(specialites.map((s) => s.nom));
  const retenues = brut.filter((u) => noms.has(u.specialiteNom) && u.semestre === semestre);

  // Numéros WhatsApp des enseignants concernés (une requête groupée).
  const ids = Array.from(new Set(retenues.map((u) => u.enseignantId).filter((x): x is string => !!x)));
  const whatsapp = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('enseignants')
      .select('id, numero_whatsapp')
      .in('id', ids.slice(i, i + 100));
    if (error) throw error;
    for (const e of (data ?? []) as any[]) if (e.numero_whatsapp) whatsapp.set(e.id, e.numero_whatsapp);
  }

  const lignes: LigneEtatMatiere[] = [];
  let sansVolume = 0;
  for (const u of retenues) {
    if (!u.volumeHoraire || u.volumeHoraire <= 0) {
      sansVolume++;
      continue;
    }
    lignes.push({
      offreId: u.offreId,
      specialiteNom: u.specialiteNom,
      ueNom: u.ueNom,
      troncCommunNom: u.troncCommunNom,
      enseignantNom: u.enseignantNom,
      enseignantWhatsapp: u.enseignantId ? whatsapp.get(u.enseignantId) ?? null : null,
      volumeHoraire: u.volumeHoraire,
      heuresEffectuees: u.heuresEffectuees,
      pourcentage: Math.round((u.heuresEffectuees / u.volumeHoraire) * 1000) / 10,
    });
  }
  return { lignes, sansVolume };
}

export type ModeSeuil = 'au_moins' | 'moins_de';

export function filtrerParSeuil(lignes: LigneEtatMatiere[], seuil: number, mode: ModeSeuil) {
  return lignes
    .filter((l) => (mode === 'au_moins' ? l.pourcentage >= seuil : l.pourcentage < seuil))
    .sort(
      (a, b) =>
        a.specialiteNom.localeCompare(b.specialiteNom) || b.pourcentage - a.pourcentage || a.ueNom.localeCompare(b.ueNom)
    );
}

export const formaterHeures = (h: number) => `${Math.round(h * 10) / 10}`.replace('.', ',');