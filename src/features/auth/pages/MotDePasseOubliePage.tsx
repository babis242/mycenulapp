// src/features/auth/pages/MotDePasseOubliePage.tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Écran "Identifiants oubliés" : l'utilisateur saisit son email — s'il
// correspond à un compte existant (comptes_utilisateurs), le système
// génère un nouveau mot de passe et le lui envoie par email.
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [envoye, setEnvoye] = useState(false);

  const canSubmit = email.trim().length > 0 && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'reset-password',
        { body: { email: email.trim() } }
      );

      if (fnError || data?.error) {
        setError(
          data?.error ??
            "Aucun compte n'est associé à cet email, ou une erreur est survenue."
        );
        setLoading(false);
        return;
      }

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
        <style>{`
          input:-webkit-autofill,
          input:-webkit-autofill:hover,
          input:-webkit-autofill:focus {
            -webkit-box-shadow: 0 0 0px 1000px #ffffff inset;
            -webkit-text-fill-color: #111827;
            transition: background-color 9999s ease-in-out 0s;
          }
        `}</style>

        <div className="flex items-center gap-2.5 mb-8 sm:mb-10">
          <div className="w-9 h-9 rounded-[10px] bg-red-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-sm">C</span>
          </div>
          <span className="font-extrabold text-gray-900">Cenulap</span>
        </div>

        {envoye ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
              <MailCheck size={24} className="text-green-600" />
            </div>
            <h1 className="text-xl font-black text-gray-900 mb-2">
              Email envoyé
            </h1>
            <p className="text-sm text-gray-500 mb-8">
              Un nouveau mot de passe a été généré et envoyé à{' '}
              <span className="font-bold text-gray-700">{email.trim()}</span>.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-xs font-semibold text-gray-400 mb-1">
              Identifiants oubliés
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-2">
              Réinitialiser
            </h1>
            <p className="text-sm text-gray-400 mb-8 sm:mb-10">
              Indique ton email de connexion, un nouveau mot de passe te sera
              envoyé.
            </p>

            <div className="mb-8">
              <label className="block text-xs font-bold text-red-600 mb-2.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                autoComplete="email"
                autoFocus
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
              className={`w-full rounded-full py-3 sm:py-3.5 font-extrabold text-sm text-white flex items-center justify-center gap-2 transition-colors mb-5 ${
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
                'Envoyer un nouveau mot de passe'
              )}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700"
            >
              <ArrowLeft size={14} /> Retour à la connexion
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
