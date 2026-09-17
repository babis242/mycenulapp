// src/features/disponibilites/pages/EtatDisponibilitesPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Loader2,
  StopCircle,
  Plus,
  Printer,
  CheckCircle2,
  X,
  Search,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/stores/authStore';
import { JOURS, tousLesCreneaux } from '@/constants/enums';
import {
  getDerniereCampagne,
  listSuiviCampagne,
  arreterCampagne,
  enregistrerDisponibiliteManuelle,
  getDisponibilitesEnseignant,
  type CampagneResume,
  type EnseignantSuivi,
} from '../api';

function lienWhatsApp(
  numero: string | null,
  nomEnseignant: string
): string | null {
  if (!numero) return null;
  const chiffres = numero.replace(/[^\d]/g, '');
  if (!chiffres) return null;
  const message = encodeURIComponent(
    `Bonjour ${nomEnseignant}, merci de renseigner tes disponibilités pour la semaine à venir sur la plateforme.`
  );
  return `https://wa.me/${chiffres}?text=${message}`;
}

// Écran Étape 4 — État des disponibilités (journal.md Scénario 3).
// Onglets Répondu / Non envoyé, bouton WhatsApp, ajout manuel, arrêt de la
// campagne. Export PDF via l'impression navigateur (solution simple pour
// l'instant, à remplacer par une vraie génération PDF si besoin).
export default function EtatDisponibilitesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [campagne, setCampagne] = useState<CampagneResume | null>(null);
  const [suivi, setSuivi] = useState<EnseignantSuivi[]>([]);
  const [onglet, setOnglet] = useState<'repondu' | 'non_envoye'>('non_envoye');
  const [recherche, setRecherche] = useState('');
  const [loading, setLoading] = useState(true);
  const [arret, setArret] = useState(false);

  const [modalAjout, setModalAjout] = useState<EnseignantSuivi | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [savingAjout, setSavingAjout] = useState(false);

  async function charger() {
    setLoading(true);
    const derniereCampagne = await getDerniereCampagne();
    setCampagne(derniereCampagne);
    if (derniereCampagne) {
      const perimetre =
        user?.role === 'responsable'
          ? user.perimetre_specialite_ids ?? []
          : undefined;
      const data = await listSuiviCampagne(derniereCampagne.id, perimetre);
      setSuivi(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleArreter() {
    if (!campagne) return;
    if (
      !window.confirm('Arrêter cette campagne de collecte de disponibilités ?')
    )
      return;
    setArret(true);
    try {
      await arreterCampagne(campagne.id);
      await charger();
    } finally {
      setArret(false);
    }
  }

  async function ouvrirAjoutManuel(e: EnseignantSuivi) {
    setModalAjout(e);
    if (campagne) {
      const existantes = await getDisponibilitesEnseignant(campagne.id, e.id);
      setSelection(
        new Set(
          existantes
            .filter((d) => d.disponible)
            .map((d) => `${d.jour}|${d.creneau}`)
        )
      );
    } else {
      setSelection(new Set());
    }
  }

  function toggleCase(jour: string, creneau: string) {
    const cle = `${jour}|${creneau}`;
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  }

  async function handleEnregistrerAjout() {
    if (!campagne || !modalAjout) return;
    setSavingAjout(true);
    try {
      const cases = Array.from(selection).map((cle) => {
        const [jour, creneau] = cle.split('|');
        return { jour, creneau };
      });
      await enregistrerDisponibiliteManuelle(campagne.id, modalAjout.id, cases);
      setModalAjout(null);
      await charger();
    } finally {
      setSavingAjout(false);
    }
  }

  const repondants = suivi.filter((s) => s.aRepondu);
  const nonEnvoyes = suivi.filter((s) => !s.aRepondu);
  const baseListe = onglet === 'repondu' ? repondants : nonEnvoyes;
  const listeAffichee = baseListe.filter(
    (e) =>
      e.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      e.matricule.toLowerCase().includes(recherche.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!campagne) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="font-extrabold text-lg text-gray-900 mb-1">
          Aucune campagne
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Lance d'abord une demande de disponibilités.
        </p>
        <button
          onClick={() => navigate('/disponibilites')}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Demander les disponibilités
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            État des disponibilités
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Campagne du{' '}
            {new Date(campagne.date_lancement).toLocaleDateString('fr-FR')} —{' '}
            <span
              className={
                campagne.statut === 'active'
                  ? 'text-green-600 font-bold'
                  : 'text-gray-400 font-bold'
              }
            >
              {campagne.statut === 'active' ? 'Active' : 'Arrêtée'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <Printer size={16} /> Export PDF
          </button>
          {campagne.statut === 'active' && (
            <button
              onClick={handleArreter}
              disabled={arret}
              className="flex items-center gap-2 bg-red-50 rounded-full px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {arret ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <StopCircle size={16} />
              )}
              Arrêter
            </button>
          )}
        </div>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un enseignant..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="flex gap-1.5 mb-5 bg-white rounded-full p-1 w-fit">
        <button
          onClick={() => setOnglet('non_envoye')}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
            onglet === 'non_envoye'
              ? 'bg-red-600 text-white'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Non envoyé ({nonEnvoyes.length})
        </button>
        <button
          onClick={() => setOnglet('repondu')}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
            onglet === 'repondu'
              ? 'bg-red-600 text-white'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Répondu ({repondants.length})
        </button>
      </div>

      {listeAffichee.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center">
          <p className="text-sm text-gray-400">
            {onglet === 'repondu'
              ? "Personne n'a encore répondu."
              : 'Tout le monde a répondu 🎉'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[20px] overflow-hidden">
          {listeAffichee.map((e) => {
            const whatsapp = lienWhatsApp(e.numeroWhatsapp, e.nom);
            return (
              <div
                key={e.id}
                onClick={() => ouvrirAjoutManuel(e)}
                className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 flex-wrap cursor-pointer hover:bg-gray-50/60"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">
                    {e.nom}
                  </p>
                  <p className="text-xs text-gray-400">
                    {e.matricule} · {e.numeroCellulaire ?? e.email}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {onglet === 'non_envoye' && whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="flex items-center gap-1.5 bg-green-50 text-green-700 rounded-full px-3.5 py-1.5 text-xs font-bold hover:bg-green-100"
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      ouvrirAjoutManuel(e);
                    }}
                    className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    <Plus size={13} />{' '}
                    {e.aRepondu ? 'Voir / modifier' : 'Saisir manuellement'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalAjout &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[20px] p-5 w-full max-w-md max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="font-extrabold text-base text-gray-900">
                  Disponibilités — {modalAjout.nom}
                </p>
                <button
                  onClick={() => setModalAjout(null)}
                  className="text-gray-300 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase pb-2">
                        Jour
                      </th>
                      {tousLesCreneaux().map((c) => (
                        <th
                          key={c}
                          className="text-center text-xs font-bold text-gray-400 uppercase pb-2"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {JOURS.map((jour) => (
                      <tr key={jour}>
                        <td className="py-2 font-bold text-gray-900">{jour}</td>
                        {tousLesCreneaux().map((creneau) => {
                          const coche = selection.has(`${jour}|${creneau}`);
                          return (
                            <td key={creneau} className="py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleCase(jour, creneau)}
                                className={`relative w-9 h-9 rounded-lg border-2 transition-colors ${
                                  coche
                                    ? 'bg-red-50 border-red-600'
                                    : 'bg-white border-gray-200 hover:border-red-300'
                                }`}
                              >
                                {coche && (
                                  <CheckCircle2
                                    size={14}
                                    className="absolute -top-1 -right-1 text-red-600 bg-white rounded-full"
                                  />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleEnregistrerAjout}
                disabled={savingAjout}
                className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
              >
                {savingAjout && <Loader2 size={15} className="animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}