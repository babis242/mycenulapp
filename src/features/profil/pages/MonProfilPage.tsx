// src/features/profil/pages/MonProfilPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, User, KeyRound, Check, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { getEnseignantParMatricule } from '@/features/referentiel/enseignants/api';
import type { Enseignant } from '@/types';

// Écran "Mon profil" (enseignant) — consultation de ses informations
// personnelles (nom, matricule, email, téléphone, WhatsApp) et
// changement de son propre mot de passe. Les informations personnelles
// elles-mêmes (nom, téléphone...) ne sont modifiables que par un
// administrateur, depuis Référentiel → Enseignants — ici, l'enseignant
// peut seulement les consulter et changer son mot de passe.
export default function MonProfilPage() {
  const user = useAuthStore((s) => s.user);

  const [enseignant, setEnseignant] = useState<Enseignant | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(
    null
  );

  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmationMdp, setConfirmationMdp] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);
  const [envoiMdp, setEnvoiMdp] = useState(false);
  const [erreurMdp, setErreurMdp] = useState<string | null>(null);
  const [succesMdp, setSuccesMdp] = useState(false);

  useEffect(() => {
    if (!user?.matricule) return;
    let annule = false;
    getEnseignantParMatricule(user.matricule)
      .then((data) => {
        if (!annule) setEnseignant(data);
      })
      .catch((err) =>
        setErreurChargement(
          err instanceof Error ? err.message : 'Erreur de chargement.'
        )
      )
      .finally(() => setLoading(false));
    return () => {
      annule = true;
    };
  }, [user?.matricule]);

  async function handleChangerMotDePasse() {
    setErreurMdp(null);
    setSuccesMdp(false);
    if (nouveauMdp.length < 6) {
      setErreurMdp('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (nouveauMdp !== confirmationMdp) {
      setErreurMdp('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setEnvoiMdp(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: nouveauMdp,
      });
      if (error) throw error;
      setSuccesMdp(true);
      setNouveauMdp('');
      setConfirmationMdp('');
    } catch (err) {
      setErreurMdp(
        err instanceof Error ? err.message : 'Erreur lors du changement.'
      );
    } finally {
      setEnvoiMdp(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Mon profil</p>
      <p className="text-sm text-gray-400 mb-6">
        Tes informations personnelles et ton mot de passe.
      </p>

      <div className="bg-white rounded-[20px] p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-gray-400" />
          <p className="font-extrabold text-gray-900">Informations</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-300">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : erreurChargement ? (
          <p className="text-xs font-semibold text-red-600">
            {erreurChargement}
          </p>
        ) : !enseignant ? (
          <p className="text-sm text-gray-400">Profil introuvable.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-0.5">Nom</p>
              <p className="text-sm font-bold text-gray-900">
                {enseignant.nom}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-0.5">
                Matricule
              </p>
              <p className="text-sm font-mono text-gray-700">
                {enseignant.matricule}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-0.5">Email</p>
              <p className="text-sm text-gray-700">{enseignant.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-bold text-gray-500 mb-0.5">
                  Cellulaire
                </p>
                <p className="text-sm text-gray-700">
                  {enseignant.numero_cellulaire || (
                    <span className="text-gray-300">Non renseigné</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 mb-0.5">
                  WhatsApp
                </p>
                <p className="text-sm text-gray-700">
                  {enseignant.numero_whatsapp || (
                    <span className="text-gray-300">Non renseigné</span>
                  )}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 pt-1">
              Pour corriger une information ci-dessus (téléphone, email...),
              contacte l'administration.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[20px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={16} className="text-gray-400" />
          <p className="font-extrabold text-gray-900">
            Changer mon mot de passe
          </p>
        </div>

        <label className="text-xs font-bold text-gray-500 mb-1.5 block">
          Nouveau mot de passe
        </label>
        <div className="relative mb-3">
          <input
            type={voirMdp ? 'text' : 'password'}
            value={nouveauMdp}
            onChange={(e) => setNouveauMdp(e.target.value)}
            placeholder="Au moins 6 caractères"
            className="w-full border border-gray-200 rounded-xl pl-3.5 pr-11 py-2.5 text-sm font-semibold outline-none focus:border-red-600 placeholder:text-gray-300 placeholder:font-normal"
          />
          <button
            type="button"
            onClick={() => setVoirMdp((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            aria-label={voirMdp ? 'Masquer les mots de passe' : 'Voir les mots de passe'}
          >
            {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <label className="text-xs font-bold text-gray-500 mb-1.5 block">
          Confirme le nouveau mot de passe
        </label>
        <div className="relative mb-4">
          <input
            type={voirMdp ? 'text' : 'password'}
            value={confirmationMdp}
            onChange={(e) => setConfirmationMdp(e.target.value)}
            placeholder="Retape le même mot de passe"
            className="w-full border border-gray-200 rounded-xl pl-3.5 pr-11 py-2.5 text-sm font-semibold outline-none focus:border-red-600 placeholder:text-gray-300 placeholder:font-normal"
          />
          <button
            type="button"
            onClick={() => setVoirMdp((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            aria-label={voirMdp ? 'Masquer les mots de passe' : 'Voir les mots de passe'}
          >
            {voirMdp ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {erreurMdp && (
          <p className="text-xs font-semibold text-red-600 mb-3">
            {erreurMdp}
          </p>
        )}
        {succesMdp && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-green-600 mb-3">
            <Check size={13} /> Mot de passe mis à jour.
          </p>
        )}

        <button
          onClick={handleChangerMotDePasse}
          disabled={envoiMdp || !nouveauMdp || !confirmationMdp}
          className="w-full flex items-center justify-center gap-2 bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {envoiMdp && <Loader2 size={15} className="animate-spin" />}
          Mettre à jour le mot de passe
        </button>
      </div>
    </div>
  );
}