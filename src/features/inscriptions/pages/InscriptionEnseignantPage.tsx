// src/features/inscriptions/pages/InscriptionEnseignantPage.tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, UserPlus, Loader2 } from 'lucide-react';
import { creerInscription } from '../api';

// Écran public — partagé par lien externe (WhatsApp, email...) auprès des
// futurs enseignants, sans qu'ils aient besoin d'un compte. Leurs infos
// atterrissent dans "Inscriptions enseignants" côté admin, qui peut
// ensuite télécharger un Excel prêt pour l'import en masse existant.
export default function InscriptionEnseignantPage() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cellulaire, setCellulaire] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [envoye, setEnvoye] = useState(false);

  const canSubmit = nom.trim().length > 0 && email.trim().length > 0 && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await creerInscription({
        nom: nom.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim() || undefined,
        cellulaire: cellulaire.trim() || undefined,
      });
      setEnvoye(true);
    } catch {
      setError('Une erreur est survenue. Réessaie.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans relative overflow-hidden flex items-center justify-center">
      <div className="fixed -top-10 -right-10 w-24 sm:w-32 md:w-36 aspect-square rounded-full bg-red-600 z-0" />
      <div className="fixed -bottom-8 -left-8 w-14 sm:w-20 md:w-[90px] aspect-square rounded-full bg-red-600/15 z-0" />

      <div className="relative z-10 w-full max-w-[420px] px-6 sm:px-10 py-10 sm:py-14">
        <div className="flex items-center gap-2.5 mb-8 sm:mb-10">
          <div className="w-9 h-9 rounded-[10px] bg-red-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-sm">C</span>
          </div>
          <span className="font-extrabold text-gray-900">Cenulape</span>
        </div>

        {envoye ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={24} className="text-green-600" />
            </div>
            <h1 className="text-xl font-black text-gray-900 mb-2">
              Inscription envoyée
            </h1>
            <p className="text-sm text-gray-500">
              Merci ! L'administration va créer ton compte prochainement. Tu
              recevras tes identifiants par email.
            </p>
            <Link
              to="/login"
              className="inline-block mt-6 text-xs font-bold text-red-600 hover:text-red-700"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <UserPlus size={19} className="text-red-600" />
            </div>
            <p className="text-xs font-semibold text-gray-400 mb-1">
              Cenulape — recrutement
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-2">
              Inscription enseignant
            </h1>
            <p className="text-sm text-gray-400 mb-8 sm:mb-10">
              Renseigne tes informations, l'administration créera ton compte
              et t'enverra tes identifiants.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-red-600 mb-2.5">
                Nom complet *
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Jean Kamdem"
                autoFocus
                className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-red-600 mb-2.5">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jean.kamdem@exemple.com"
                className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-red-600 mb-2.5">
                WhatsApp
              </label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+237 6XX XXX XXX"
                className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
              />
            </div>

            <div className="mb-8">
              <label className="block text-xs font-bold text-red-600 mb-2.5">
                Téléphone (cellulaire)
              </label>
              <input
                type="tel"
                value={cellulaire}
                onChange={(e) => setCellulaire(e.target.value)}
                placeholder="+237 6XX XXX XXX"
                className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 mb-4">
                <p className="text-sm font-bold text-red-600 text-center">
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full rounded-full py-3 sm:py-3.5 font-extrabold text-sm text-white flex items-center justify-center gap-2 transition-colors ${
                canSubmit
                  ? 'bg-red-600 cursor-pointer hover:bg-red-700'
                  : 'bg-red-300 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Envoi...
                </>
              ) : (
                "Envoyer mon inscription"
              )}
            </button>

            <p className="text-center text-xs text-gray-400 mt-5">
              Déjà un compte ?{' '}
              <Link
                to="/login"
                className="font-bold text-red-600 hover:text-red-700"
              >
                Se connecter
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}