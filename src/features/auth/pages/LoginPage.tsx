// src/features/auth/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Écran 0.1 — Connexion (ecrans_ui.md)
// Le matricule est résolu en email via la fonction resolve_matricule_to_email
// (migration 009), puis Supabase Auth authentifie avec email + mot de passe.
export default function LoginPage() {
  const [matricule, setMatricule] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const init = useAuthStore((s) => s.init);
  const navigate = useNavigate();

  const canSubmit =
    matricule.trim().length > 0 && password.length > 0 && !loading;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const { data: email, error: rpcError } = await supabase.rpc(
        'resolve_matricule_to_email',
        {
          p_matricule: matricule.trim().toUpperCase(),
        }
      );

      if (rpcError || !email) {
        setError('Matricule ou mot de passe incorrect.');
        setLoading(false);
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Matricule ou mot de passe incorrect.');
        setLoading(false);
        return;
      }

      await init();
      navigate('/');
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

      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-[420px] px-6 sm:px-10 py-10 sm:py-14"
      >
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

        <p className="text-xs font-semibold text-gray-400 mb-1">Bienvenue</p>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight mb-8 sm:mb-11">
          Connexion !
        </h1>

        <div className="mb-7 sm:mb-8">
          <label className="block text-xs font-bold text-red-600 mb-2.5">
            Matricule
          </label>
          <input
            type="text"
            value={matricule}
            onChange={(e) => setMatricule(e.target.value)}
            placeholder="ADM-2026-0001"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-bold text-red-600 mb-2.5">
            Mot de passe
          </label>
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full border-0 border-b-[1.5px] border-gray-200 px-1 py-3.5 pr-9 text-sm font-semibold text-gray-900 bg-transparent outline-none focus:border-red-600 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 text-gray-300 hover:text-gray-500 p-1 flex items-center transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="text-right mb-8 sm:mb-10">
          <Link
            to="/mot-de-passe-oublie"
            className="text-xs font-bold text-red-600 hover:text-red-700"
          >
            Identifiants oubliés ?
          </Link>
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
              <Loader2 size={16} className="animate-spin" /> Connexion...
            </>
          ) : (
            'Se connecter'
          )}
        </button>
      </form>
    </div>
  );
}
