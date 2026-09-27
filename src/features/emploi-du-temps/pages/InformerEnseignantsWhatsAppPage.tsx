// src/features/emploi-du-temps/pages/InformerEnseignantsWhatsAppPage.tsx
//
// Depuis la page Validation, l'admin/responsable clique sur "Informer
// les enseignants via WhatsApp" : cette page liste, pour le même
// cycle/semestre/semaine, chaque enseignant programmé avec un bouton
// qui ouvre WhatsApp (wa.me) avec un message déjà rédigé — jour(s),
// créneau(x), salle(s) et spécialité(s) concernée(s) pour CET
// enseignant uniquement. Message en anglais pour le cycle HND, en
// français sinon (même règle que le PDF de la page Validation).
//
// Se re-dérive elle-même le périmètre (spécialités envoyées en
// validation) depuis la base à partir de cycle/semestre/semaine dans
// l'URL — même principe que ValidationEDTPage : aucune transmission
// fragile de state entre pages.
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, MessageCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  listSpecialitesEnvoyeesEnValidation,
  getInfosNotificationWhatsApp,
  type EnseignantWhatsApp,
} from '../api';

const JOURS_EN: Record<string, string> = {
  Lundi: 'Monday',
  Mardi: 'Tuesday',
  Mercredi: 'Wednesday',
  Jeudi: 'Thursday',
  Vendredi: 'Friday',
  Samedi: 'Saturday',
  Dimanche: 'Sunday',
};

function traduireJour(jour: string, anglais: boolean): string {
  return anglais ? (JOURS_EN[jour] ?? jour) : jour;
}

// wa.me attend uniquement des chiffres, indicatif pays inclus. Un
// numéro local camerounais (9 chiffres, ex : 6XX XXX XXX, sans le 0
// initial) est supposé être en indicatif +237 si aucun indicatif n'est
// déjà présent — les numéros enregistrés dans Référentiel → Enseignants
// suivent ce format.
function formaterNumeroWhatsapp(numero: string): string {
  const chiffres = numero.replace(/\D/g, '');
  if (chiffres.startsWith('237')) return chiffres;
  if (chiffres.length === 9) return `237${chiffres}`;
  return chiffres;
}

function construireMessage(e: EnseignantWhatsApp, estHND: boolean): string {
  if (estHND) {
    const lignes = e.cours.map(
      (c) =>
        `- ${c.ueNom}: ${traduireJour(c.jour, true)}, ${c.creneau}, room ${
          c.salleCode ?? 'to be confirmed'
        } (${c.specialites.filter(Boolean).join(', ') || 'N/A'})`
    );
    return [
      `Good day Sir/Madam ${e.nom},`,
      '',
      'We wish to inform you that you have been scheduled for the following class(es):',
      '',
      ...lignes,
      '',
      'The timetable will be available at the forums, and you may also consult it from your personal account.',
      '',
      'Thank you.',
    ].join('\n');
  }
  const lignes = e.cours.map(
    (c) =>
      `- ${c.ueNom} : ${c.jour}, ${c.creneau}, salle ${
        c.salleCode ?? 'à confirmer'
      } (${c.specialites.filter(Boolean).join(', ') || 'N/A'})`
  );
  return [
    `Bonjour Monsieur/Madame ${e.nom},`,
    '',
    'Nous vous informons que vous êtes programmé(e) pour le(s) cours suivant(s) :',
    '',
    ...lignes,
    '',
    "L'emploi du temps sera disponible au niveau des forums, et vous pourrez également le consulter dans votre compte personnel.",
    '',
    'Merci.',
  ].join('\n');
}

export default function InformerEnseignantsWhatsAppPage() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const enLigne = useOnlineStatus();
  const perimetreIds =
    user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const cycleKey = searchParams.get('cycle') || '';
  const semestre = searchParams.get('semestre') || '';
  const semaine = searchParams.get('semaine') || '';
  const [cycleNom] = cycleKey.split('::');
  const estHND = cycleNom.toUpperCase() === 'HND';

  const [enseignants, setEnseignants] = useState<EnseignantWhatsApp[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!cycleKey || !semestre || !semaine || !enLigne) return;
    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        const specialites = await listSpecialitesEnvoyeesEnValidation(
          cycleKey,
          semestre,
          semaine,
          perimetreIds
        );
        const donnees = await getInfosNotificationWhatsApp(
          specialites.map((s) => s.id),
          semaine
        );
        setEnseignants(donnees);
      } catch (err) {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement.');
      } finally {
        setChargement(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre, semaine, enLigne]);

  function ouvrirWhatsApp(e: EnseignantWhatsApp) {
    const numero = e.numeroWhatsapp || e.numeroCellulaire;
    const message = construireMessage(e, estHND);
    const lien = numero
      ? `https://wa.me/${formaterNumeroWhatsapp(numero)}?text=${encodeURIComponent(
          message
        )}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(lien, '_blank');
  }

  return (
    <div className="p-4 md:p-6">
      <Link
        to={`/emploi-du-temps/validation?cycle=${encodeURIComponent(
          cycleKey
        )}&semestre=${encodeURIComponent(semestre)}&semaine=${semaine}`}
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={16} /> Retour à la validation
      </Link>

      <h1 className="text-xl font-extrabold text-gray-900 mb-1">
        Informer les enseignants via WhatsApp
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {cycleNom} — Semestre {semestre} — Semaine du {semaine}
      </p>

      {!enLigne ? (
        <p className="text-sm text-gray-500">
          Fonction disponible uniquement en ligne.
        </p>
      ) : chargement ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : erreur ? (
        <p className="text-sm text-red-600">{erreur}</p>
      ) : enseignants.length === 0 ? (
        <p className="text-sm text-gray-500">
          Aucun enseignant programmé pour cette sélection.
        </p>
      ) : (
        <div className="space-y-3">
          {enseignants.map((e) => {
            const numero = e.numeroWhatsapp || e.numeroCellulaire;
            return (
              <div
                key={e.enseignantId}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div>
                  <p className="font-bold text-gray-900">{e.nom}</p>
                  <p className="text-xs text-gray-500">
                    {numero
                      ? numero
                      : 'Aucun numéro WhatsApp/cellulaire enregistré'}
                    {' · '}
                    {e.cours.length} cours programmé
                    {e.cours.length > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => ouvrirWhatsApp(e)}
                  className="flex items-center gap-2 bg-green-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                >
                  <MessageCircle size={16} /> Ouvrir WhatsApp
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}