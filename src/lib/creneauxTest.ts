// src/lib/creneauxTest.ts
//
// Créneaux de TEST — pour faciliter les tests manuels sans attendre
// d'être réellement dans la fenêtre 08h-12h ou 14h-17h. Purement local
// au navigateur (localStorage), jamais envoyé au serveur, jamais
// synchronisé entre appareils : chacun peut ajouter/retirer ses propres
// créneaux de test sans risque d'en faire apparaître chez quelqu'un
// d'autre, ni en production pour de vrai.
//
// Un créneau de test porte ses propres bornes horaires (en minutes
// depuis minuit, heure Cameroun) — nécessaire pour que "Ma séance" sache
// reconnaître qu'on est dedans "maintenant", exactement comme pour les
// deux créneaux officiels.

export interface CreneauTest {
    code: string; // ex: "15h-16h" — doit être unique parmi les créneaux (test + officiels)
    debut: number; // minutes depuis minuit, heure Cameroun (ex: 15*60)
    fin: number; // minutes depuis minuit, heure Cameroun (ex: 16*60)
  }
  
  const CLE = 'edt-creneaux-test';
  
  export function listerCreneauxTest(): CreneauTest[] {
    try {
      const brut = localStorage.getItem(CLE);
      if (!brut) return [];
      const liste = JSON.parse(brut);
      return Array.isArray(liste) ? liste : [];
    } catch {
      return [];
    }
  }
  
  export function ajouterCreneauTest(creneau: CreneauTest): void {
    const liste = listerCreneauxTest().filter((c) => c.code !== creneau.code);
    liste.push(creneau);
    try {
      localStorage.setItem(CLE, JSON.stringify(liste));
    } catch {
      // Stockage indisponible (navigation privée très restrictive, quota
      // plein...) — pas grave, c'est un outil de confort pour les tests,
      // pas une donnée à protéger.
    }
  }
  
  export function supprimerCreneauTest(code: string): void {
    const liste = listerCreneauxTest().filter((c) => c.code !== code);
    try {
      localStorage.setItem(CLE, JSON.stringify(liste));
    } catch {
      // Pas grave, cf. ci-dessus.
    }
  }
  
  // Construit "HH:MM" -> minutes depuis minuit, pour l'écran de saisie.
  export function heureVersMinutes(heureHHMM: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(heureHHMM.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }
  
  export function minutesVersHeure(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }