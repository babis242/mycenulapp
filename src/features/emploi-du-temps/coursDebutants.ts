// src/features/emploi-du-temps/coursDebutants.ts
//
// Détecte, parmi les cours programmés d'une semaine, ceux qui DÉBUTENT
// (aucune séance — non annulée — de la même UE / du même tronc commun
// sur une semaine antérieure) et retrouve le lien du syllabus. Sert à
// proposer, pour chaque enseignant concerné, un message WhatsApp
// d'accueil avec le syllabus (page « Informer les enseignants »).
//
// Requêtes à plat (pas de jointures imbriquées) et par lots d'identifiants.

import { supabase } from '@/lib/supabase';
import { urlPubliqueR2 } from '@/lib/r2';
import { bornesCreneau } from '@/lib/creneaux';
import { getSeancesGroupees, recupererToutesLesLignes, seanceDuSemestre } from './api';

export interface CoursDebutant {
  ueNom: string;
  jour: string;
  creneau: string;
  syllabusUrl: string | null;
}

const JOUR_ORDRE: Record<string, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
};

function lots<T>(liste: T[], taille = 80): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) res.push(liste.slice(i, i + taille));
  return res;
}

async function idsAvecSeanceAnterieure(
  colonne: 'offre_id' | 'tronc_commun_id',
  ids: string[],
  semaine: string
): Promise<Set<string>> {
  const trouves = new Set<string>();
  for (const lot of lots(ids)) {
    const lignes = await recupererToutesLesLignes<any>((d, f) =>
      supabase
        .from('seances_edt')
        .select(`id, ${colonne}`)
        .in(colonne, lot)
        .lt('semaine', semaine)
        .or('annulee.is.null,annulee.eq.false')
        .order('id')
        .range(d, f)
    );
    for (const l of lignes) if (l[colonne]) trouves.add(l[colonne]);
  }
  return trouves;
}

function urlSyllabus(cle: string | null | undefined): string | null {
  if (!cle) return null;
  try {
    return urlPubliqueR2(cle);
  } catch {
    return null;
  }
}

export async function getCoursDebutantsParEnseignant(
  specialiteIds: string[],
  semaine: string,
  semestre?: string
): Promise<Map<string, CoursDebutant[]>> {
  const resultat = new Map<string, CoursDebutant[]>();
  if (specialiteIds.length === 0) return resultat;

  const donnees = await getSeancesGroupees(specialiteIds, semaine);
  const seances = donnees.seances.filter(
    (s) =>
      s.enseignantId &&
      (s.specialiteId
        ? seanceDuSemestre(s, s.specialiteId, semestre, donnees.troncSpecialiteSemestres)
        : specialiteIds.some(
            (id) =>
              donnees.specialitesParTronc.get(s.troncCommunId ?? '')?.has(id) &&
              seanceDuSemestre(s, id, semestre, donnees.troncSpecialiteSemestres)
          ))
  );
  if (seances.length === 0) return resultat;

  const offreIds = Array.from(
    new Set(seances.map((s) => s.offreId).filter((v): v is string => !!v))
  );
  const troncIds = Array.from(
    new Set(seances.map((s) => s.troncCommunId).filter((v): v is string => !!v))
  );

  // Cours déjà commencés (séance sur une semaine antérieure).
  const [offresDejaVues, troncsDejaVus] = await Promise.all([
    idsAvecSeanceAnterieure('offre_id', offreIds, semaine),
    idsAvecSeanceAnterieure('tronc_commun_id', troncIds, semaine),
  ]);

  // Syllabus : UE (offre → ue) ou tronc commun (si l'UE en fait partie).
  const ueParOffre = new Map<string, string>();
  for (const lot of lots(offreIds)) {
    const { data } = await supabase.from('offres').select('id, ue_id').in('id', lot);
    for (const o of (data ?? []) as any[]) ueParOffre.set(o.id, o.ue_id);
  }
  const ueIds = Array.from(new Set(ueParOffre.values()));
  const cleUe = new Map<string, string | null>();
  for (const lot of lots(ueIds)) {
    const { data } = await supabase.from('ues').select('id, syllabus_key').in('id', lot);
    for (const u of (data ?? []) as any[]) cleUe.set(u.id, u.syllabus_key ?? null);
  }
  const troncParUe = new Map<string, string>();
  for (const lot of lots(ueIds)) {
    const { data } = await supabase
      .from('troncs_communs_ues')
      .select('ue_id, tronc_commun_id')
      .in('ue_id', lot);
    for (const l of (data ?? []) as any[]) troncParUe.set(l.ue_id, l.tronc_commun_id);
  }
  const tousTroncs = Array.from(new Set([...troncIds, ...troncParUe.values()]));
  const cleTronc = new Map<string, string | null>();
  for (const lot of lots(tousTroncs)) {
    const { data } = await supabase
      .from('troncs_communs')
      .select('id, syllabus_key')
      .in('id', lot);
    for (const t of (data ?? []) as any[]) cleTronc.set(t.id, t.syllabus_key ?? null);
  }

  // Séances de cours qui débutent, dans l'ordre chronologique.
  const candidates = seances
    .filter((s) =>
      s.troncCommunId
        ? !troncsDejaVus.has(s.troncCommunId)
        : s.offreId
          ? !offresDejaVues.has(s.offreId)
          : false
    )
    .sort((a, b) => {
      const dj = (JOUR_ORDRE[a.jour] ?? 0) - (JOUR_ORDRE[b.jour] ?? 0);
      if (dj !== 0) return dj;
      return (bornesCreneau(a.creneau)?.debut ?? 0) - (bornesCreneau(b.creneau)?.debut ?? 0);
    });

  const dejaPris = new Set<string>();
  for (const s of candidates) {
    const idEns = s.enseignantId!;
    const cleUnique = `${idEns}|${s.troncCommunId ?? s.offreId}`;
    const cleNom = `${idEns}|${s.ueNom}`;
    if (dejaPris.has(cleUnique) || dejaPris.has(cleNom)) continue;
    dejaPris.add(cleUnique);
    dejaPris.add(cleNom);

    let key: string | null = null;
    if (s.troncCommunId) {
      key = cleTronc.get(s.troncCommunId) ?? null;
    } else if (s.offreId) {
      const ue = ueParOffre.get(s.offreId);
      const tronc = ue ? troncParUe.get(ue) : undefined;
      key = tronc ? (cleTronc.get(tronc) ?? null) : ue ? (cleUe.get(ue) ?? null) : null;
    }

    if (!resultat.has(idEns)) resultat.set(idEns, []);
    resultat.get(idEns)!.push({
      ueNom: s.ueNom,
      jour: s.jour,
      creneau: s.creneau,
      syllabusUrl: urlSyllabus(key),
    });
  }
  return resultat;
}

// ── Message WhatsApp d'accueil (cours qui débute) ──────────────────

const EMAIL_IDENTIFIANTS = 'fredericmbamba@gmail.com';
const URL_PLATEFORME = 'https://platformcenulap.pages.dev';

export function construireMessageDebutCours(c: CoursDebutant, estHND: boolean): string {
  if (estHND) {
    return [
      'Dear Sir/Madam,',
      '',
      `Please find attached the syllabus for the course "${c.ueNom}": ${
        c.syllabusUrl ?? '(syllabus not yet available)'
      }`,
      'We kindly ask you to prepare the course material for the students. You are also expected to provide three assessments: a continuous assessment (CA), a normal session exam and a resit exam. You are of course free to modify these assessments as you see fit.',
      '',
      `In addition, please check that you have received, at the address ${EMAIL_IDENTIFIANTS}, an e-mail containing your login credentials (staff ID and password). These will give you access to your personal space on the platform: ${URL_PLATEFORME}`,
      '',
      'Login procedure:',
      '1. Enter your staff ID and password.',
      '2. Once logged in, you can change your password via Menu > Profile.',
      '',
      'Finally, we ask you to log in to your account on the day of your class in order to open your class session.',
      '',
      'Thank you for your cooperation.',
      '',
      'Kind regards,',
    ].join('\n');
  }
  return [
    'Madame, Monsieur,',
    '',
    `Veuillez trouver ci-joint le syllabus du cours « ${c.ueNom} » : ${
      c.syllabusUrl ?? '(syllabus non encore disponible)'
    }`,
    'Nous vous prions de bien vouloir préparer le support de cours destiné aux étudiants. Il est également attendu de votre part trois épreuves : une épreuve de contrôle continu (CC), une épreuve de session normale et une épreuve de rattrapage. Vous restez bien entendu libre de modifier ces épreuves à votre convenance.',
    '',
    `Par ailleurs, nous vous prions de vérifier que vous avez bien reçu, à l'adresse ${EMAIL_IDENTIFIANTS}, un e-mail contenant vos identifiants de connexion (matricule et mot de passe). Ces informations vous permettront d'accéder à votre espace personnel sur la plateforme : ${URL_PLATEFORME}`,
    '',
    'Procédure de connexion :',
    '1. Saisissez votre matricule et votre mot de passe.',
    '2. Une fois connecté(e), vous pouvez modifier votre mot de passe en vous rendant dans Menu > Profil.',
    '',
    'Enfin, nous vous demandons de vous connecter à votre compte le jour de votre cours afin d’ouvrir votre session de cours.',
    '',
    'Nous vous remercions pour votre collaboration.',
    '',
    'Cordialement,',
  ].join('\n');
}