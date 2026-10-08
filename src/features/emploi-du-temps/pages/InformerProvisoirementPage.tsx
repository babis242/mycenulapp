// src/features/emploi-du-temps/pages/InformerProvisoirementPage.tsx
//
// Emploi du temps PROVISOIRE : depuis la page Validation, l'admin/
// responsable ouvre cette page qui liste, pour le même cycle/semestre/
// semaine, chaque enseignant programmé avec un bouton WhatsApp. Le
// message lui dit qu'on souhaite le programmer la semaine prochaine
// sur tel(s) cours/créneau(x) et lui demande de bien vouloir valider
// (confirmer). Anglais pour le cycle HND, français sinon.
//
// Ne touche en rien à la pipeline de l'emploi du temps : lecture seule,
// mêmes données que la page « Informer les enseignants via WhatsApp ».
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

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JOURS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function nomJour(jour: string, anglais: boolean): string {
  const i = JOURS.indexOf(jour);
  return anglais && i >= 0 ? JOURS_EN[i] : jour;
}

function debutCreneau(creneau: string): number {
  const m = creneau.match(/(\d{1,2})h(\d{0,2})/);
  return m ? Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0) : 0;
}

// "2026-10-12" (lundi) + n jours → "12/10/2026"
function dateAvecDecalage(semaine: string, jours: number): string {
  const [y, m, d] = semaine.split('-').map(Number);
  const date = new Date(y, m - 1, d + jours);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formaterNumeroWhatsapp(numero: string): string {
  const chiffres = numero.replace(/\D/g, '');
  if (chiffres.startsWith('237')) return chiffres;
  if (chiffres.length === 9) return `237${chiffres}`;
  return chiffres;
}

function construireMessage(
  e: EnseignantWhatsApp,
  semaine: string,
  estHND: boolean
): string {
  const cours = [...e.cours].sort(
    (a, b) =>
      JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) ||
      debutCreneau(a.creneau) - debutCreneau(b.creneau)
  );
  const debut = dateAvecDecalage(semaine, 0);
  const fin = dateAvecDecalage(semaine, 5);

  if (estHND) {
    return [
      `Good day Sir/Madam ${e.nom},`,
      '',
      `We would like to schedule you next week (from Monday ${debut} to Saturday ${fin}) for the following class(es):`,
      '',
      ...cours.map(
        (c) =>
          `- ${c.ueNom}: ${nomJour(c.jour, true)}, ${c.creneau} (${
            c.specialites.filter(Boolean).join(', ') || 'N/A'
          })`
      ),
      '',
      'This is a provisional timetable. Kindly confirm (validate) that this schedule suits you, please.',
      '',
      'Thank you.',
    ].join('\n');
  }

  return [
    `Bonjour Monsieur/Madame ${e.nom},`,
    '',
    `Nous souhaiterions vous programmer la semaine prochaine (du lundi ${debut} au samedi ${fin}) pour le(s) cours suivant(s) :`,
    '',
    ...cours.map(
      (c) =>
        `- ${c.ueNom} : ${c.jour}, ${c.creneau} (${
          c.specialites.filter(Boolean).join(', ') || 'N/A'
        })`
    ),
    '',
    "Il s'agit d'un emploi du temps provisoire. Bien vouloir nous confirmer (valider) que ce programme vous convient, svp.",
    '',
    'Merci.',
  ].join('\n');
}

export default function InformerProvisoirementPage() {
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
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());

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
        setEnseignants(
          await getInfosNotificationWhatsApp(
            specialites.map((s) => s.id),
            semaine
          )
        );
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
    const message = construireMessage(e, semaine, estHND);
    const lien = numero
      ? `https://wa.me/${formaterNumeroWhatsapp(numero)}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(lien, '_blank');
    setEnvoyes((prev) => new Set(prev).add(e.enseignantId));
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        to={`/emploi-du-temps/validation?cycle=${encodeURIComponent(
          cycleKey
        )}&semestre=${encodeURIComponent(semestre)}&semaine=${semaine}`}
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft size={16} /> Retour à la validation
      </Link>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Informer provisoirement
      </p>
      <p className="text-sm text-gray-400 mb-1">
        {cycleNom} — Semestre {semestre} — Semaine du {semaine}
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Chaque enseignant reçoit sur WhatsApp les cours et créneaux prévus la
        semaine prochaine, avec la demande de bien vouloir valider.
        {estHND && ' (Message en anglais — cycle HND.)'}
      </p>

      {!enLigne ? (
        <p className="text-sm text-gray-500">Fonction disponible uniquement en ligne.</p>
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
        <div className="bg-white rounded-[20px] overflow-hidden">
          {enseignants.map((e) => {
            const numero = e.numeroWhatsapp || e.numeroCellulaire;
            const dejaEnvoye = envoyes.has(e.enseignantId);
            return (
              <div
                key={e.enseignantId}
                className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{e.nom}</p>
                  <p className="text-xs text-gray-400">
                    {numero ?? 'Aucun numéro WhatsApp/cellulaire enregistré'} ·{' '}
                    {e.cours.length} cours
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[...e.cours]
                      .sort(
                        (a, b) =>
                          JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) ||
                          debutCreneau(a.creneau) - debutCreneau(b.creneau)
                      )
                      .map((c) => `${c.ueNom} (${c.jour} ${c.creneau})`)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => ouvrirWhatsApp(e)}
                  className={`shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white ${
                    dejaEnvoye
                      ? 'bg-gray-400 hover:bg-gray-500'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  <MessageCircle size={16} />
                  {dejaEnvoye ? 'Renvoyer' : 'WhatsApp'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}