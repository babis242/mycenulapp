// src/features/referentiel/enseignants/pages/AjouterEnseignantPage.tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { createEnseignant } from '../api';

// Écran 1.2 / 1.7 — Ajouter un enseignant, mode manuel (ecrans_ui.md)
// Le matricule est généré par la base. Une fois la fiche créée, on appelle
// l'Edge Function create-enseignant-account qui crée le compte de connexion
// et envoie les identifiants par email.
export default function AjouterEnseignantPage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cellulaire, setCellulaire] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<{
    matricule: string | null;
    emailEnvoye: boolean;
    horsLigne: boolean;
  } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !email.trim()) {
      setError("Le nom et l'email sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        const enseignant = await createEnseignant({
          nom: nom.trim(),
          email: email.trim(),
          numero_whatsapp: whatsapp.trim() || undefined,
          numero_cellulaire: cellulaire.trim() || undefined,
        });

        // Crée le compte de connexion + envoie l'email des identifiants.
        const { data, error: fnError } = await supabase.functions.invoke(
          'create-enseignant-account',
          {
            body: { enseignantId: enseignant.id },
          }
        );

        if (fnError || data?.error) {
          setSucces({
            matricule: enseignant.matricule,
            emailEnvoye: false,
            horsLigne: false,
          });
        } else {
          setSucces({
            matricule: enseignant.matricule,
            emailEnvoye: true,
            horsLigne: false,
          });
        }
      } else {
        // Hors ligne : le matricule est généré par un trigger côté base —
        // impossible à connaître avant la synchro. On enregistre la fiche
        // localement sans matricule, et le compte de connexion sera créé
        // automatiquement à la synchro (cf. src/lib/sync.ts).
        const id = crypto.randomUUID();
        await db.enseignants.put({
          id,
          matricule: '(en attente de synchronisation)',
          nom: nom.trim(),
          email: email.trim(),
          statut: 'actif',
        } as any);
        await enqueueSyncAction({
          entity: 'enseignants',
          operation: 'create',
          payload: {
            id,
            nom: nom.trim(),
            email: email.trim(),
            numero_whatsapp: whatsapp.trim() || null,
            numero_cellulaire: cellulaire.trim() || null,
          },
        });
        setSucces({ matricule: null, emailEnvoye: false, horsLigne: true });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (succes) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        {succes.horsLigne ? (
          <>
            <WifiOff size={40} className="text-amber-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Enseignant enregistré localement
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Le matricule sera attribué et le compte de connexion créé dès le
              retour du réseau.
            </p>
          </>
        ) : succes.emailEnvoye ? (
          <>
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Enseignant créé
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Matricule :{' '}
              <span className="font-mono font-bold text-gray-700">
                {succes.matricule}
              </span>
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Identifiants envoyés par email.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Enseignant créé
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Matricule :{' '}
              <span className="font-mono font-bold text-gray-700">
                {succes.matricule}
              </span>
            </p>
            <p className="text-sm text-gray-400 mb-6">
              La fiche est enregistrée, mais l'envoi de l'email des identifiants
              a échoué.
            </p>
          </>
        )}
        <button
          onClick={() => navigate('/referentiel/enseignants')}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => navigate('/referentiel/enseignants')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Ajouter un enseignant
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Le matricule et le mot de passe seront générés automatiquement.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — la fiche sera enregistrée localement ; matricule et
            compte de connexion suivront au retour du réseau.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-[20px] p-5 flex flex-col gap-4"
      >
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Nom complet *
          </label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            placeholder="Jean Kamdem"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            placeholder="jean.kamdem@exemple.com"
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              WhatsApp
            </label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              placeholder="+237 6XX XXX XXX"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Cellulaire
            </label>
            <input
              value={cellulaire}
              onChange={(e) => setCellulaire(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              placeholder="+237 6XX XXX XXX"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => navigate('/referentiel/enseignants')}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
