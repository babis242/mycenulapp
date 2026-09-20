// src/features/referentiel/enseignants/pages/DetailEnseignantPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, Pencil, X, Check, Trash2, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getEnseignant,
  updateEnseignant,
  deleteEnseignant,
  enseignantEstUtilise,
} from '../api';
import type { Enseignant } from '@/types';

export default function DetailEnseignantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [enseignant, setEnseignant] = useState<Enseignant | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [envoiNouvelEmail, setEnvoiNouvelEmail] = useState(false);
  const [messageEmailEnvoye, setMessageEmailEnvoye] = useState<string | null>(
    null
  );

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [cellulaire, setCellulaire] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [statut, setStatut] = useState<'actif' | 'inactif'>('actif');

  function chargerDepuisDonnees(e: Enseignant) {
    setNom(e.nom);
    setEmail(e.email);
    setCellulaire(e.numero_cellulaire ?? '');
    setWhatsapp(e.numero_whatsapp ?? '');
    setStatut(e.statut === 'inactif' ? 'inactif' : 'actif');
  }

  useEffect(() => {
    if (!id) return;
    let annule = false;
    getEnseignant(id)
      .then((data) => {
        if (annule) return;
        if (!data) {
          setErreur('Enseignant introuvable.');
          return;
        }
        setEnseignant(data);
        chargerDepuisDonnees(data);
      })
      .catch((err) =>
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement.')
      )
      .finally(() => setLoading(false));
    return () => {
      annule = true;
    };
  }, [id]);

  function handleAnnuler() {
    if (enseignant) chargerDepuisDonnees(enseignant);
    setEditing(false);
    setErreur(null);
  }

  async function handleEnregistrer() {
    if (!id || !enseignant) return;
    if (!nom.trim()) {
      setErreur('Le nom est obligatoire.');
      return;
    }
    if (!email.trim()) {
      setErreur("L'email est obligatoire.");
      return;
    }
    // L'ancien email, avant enregistrement — comparé après coup pour
    // savoir s'il faut déclencher le renvoi d'identifiants.
    const emailAvant = enseignant.email;
    const nouvelEmail = email.trim();

    setSaving(true);
    setErreur(null);
    setMessageEmailEnvoye(null);
    try {
      await updateEnseignant(id, {
        nom: nom.trim(),
        email: nouvelEmail,
        numero_cellulaire: cellulaire.trim() || null,
        numero_whatsapp: whatsapp.trim() || null,
        statut,
      });
      const frais = await getEnseignant(id);
      if (frais) {
        setEnseignant(frais);
        chargerDepuisDonnees(frais);
      }
      setEditing(false);

      // L'email de connexion (compte Auth) a changé — met à jour le
      // compte, génère un nouveau mot de passe et envoie les nouveaux
      // identifiants au nouvel email, comme à l'inscription ou au mot
      // de passe oublié. Ça ne bloque pas l'enregistrement des autres
      // champs si ça échoue (ex : compte pas encore créé) — juste un
      // message d'avertissement distinct.
      if (nouvelEmail.toLowerCase() !== emailAvant.toLowerCase()) {
        setEnvoiNouvelEmail(true);
        try {
          const { data, error: fnError } = await supabase.functions.invoke(
            'changer-email-enseignant',
            { body: { enseignantId: id, nouvelEmail } }
          );
          if (fnError || data?.error) {
            setMessageEmailEnvoye(
              `⚠ Email mis à jour, mais l'envoi des nouveaux identifiants a échoué : ${
                data?.error ?? 'erreur inconnue'
              }`
            );
          } else {
            setMessageEmailEnvoye(
              `Nouveaux identifiants envoyés à ${nouvelEmail}.`
            );
          }
        } catch (err) {
          setMessageEmailEnvoye(
            `⚠ Email mis à jour, mais l'envoi des nouveaux identifiants a échoué : ${
              err instanceof Error ? err.message : 'erreur inconnue'
            }`
          );
        } finally {
          setEnvoiNouvelEmail(false);
        }
      }
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSupprimer() {
    if (!id || !enseignant) return;
    const utilise = await enseignantEstUtilise(id);
    const message = utilise
      ? `${enseignant.nom} a des cours qui lui sont attribués. Le supprimer quand même ?`
      : `Supprimer définitivement ${enseignant.nom} ?`;
    if (!window.confirm(message)) return;

    setSuppression(true);
    setErreur(null);
    try {
      await deleteEnseignant(id);
      navigate('/referentiel/enseignants');
    } catch (err) {
      setErreur(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la suppression — cet enseignant est probablement encore lié à des séances ou des attributions.'
      );
      setSuppression(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!enseignant) {
    return (
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/referentiel/enseignants')}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-4"
        >
          <ArrowLeft size={15} /> Retour à la liste
        </button>
        <div className="bg-white rounded-[20px] p-8 text-center">
          <p className="font-bold text-gray-900 mb-1">
            {erreur ?? 'Enseignant introuvable.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => navigate('/referentiel/enseignants')}
        className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-4"
      >
        <ArrowLeft size={15} /> Retour à la liste
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            {enseignant.nom}
          </p>
          <p className="text-sm text-gray-400 font-mono mt-0.5">
            {enseignant.matricule}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={15} /> Modifier
            </button>
            <button
              onClick={handleSupprimer}
              disabled={suppression}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {suppression ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Trash2 size={15} />
              )}
              Supprimer
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[20px] p-6 space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Nom
          </label>
          {editing ? (
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm font-bold text-gray-900">{enseignant.nom}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Email
          </label>
          {editing ? (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm text-gray-700">{enseignant.email}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Numéro cellulaire
            </label>
            {editing ? (
              <input
                value={cellulaire}
                onChange={(e) => setCellulaire(e.target.value)}
                placeholder="Non renseigné"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 placeholder:text-gray-300 placeholder:font-normal"
              />
            ) : (
              <p className="text-sm text-gray-700">
                {enseignant.numero_cellulaire || (
                  <span className="text-gray-300">Non renseigné</span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Numéro WhatsApp
            </label>
            {editing ? (
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Non renseigné"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 placeholder:text-gray-300 placeholder:font-normal"
              />
            ) : (
              <p className="text-sm text-gray-700">
                {enseignant.numero_whatsapp || (
                  <span className="text-gray-300">Non renseigné</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">
            Statut
          </label>
          {editing ? (
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value as 'actif' | 'inactif')}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 bg-white"
            >
              <option value="actif">Actif</option>
              <option value="inactif">Inactif</option>
            </select>
          ) : (
            <span
              className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
                enseignant.statut === 'actif'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {enseignant.statut === 'actif' ? 'Actif' : 'Inactif'}
            </span>
          )}
        </div>

        {erreur && (
          <p className="text-xs font-semibold text-red-600">{erreur}</p>
        )}

        {envoiNouvelEmail && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
            <Loader2 size={13} className="animate-spin" /> Envoi des nouveaux
            identifiants...
          </p>
        )}
        {messageEmailEnvoye && !envoiNouvelEmail && (
          <p
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              messageEmailEnvoye.startsWith('⚠')
                ? 'text-amber-600'
                : 'text-green-600'
            }`}
          >
            {!messageEmailEnvoye.startsWith('⚠') && <MailCheck size={13} />}
            {messageEmailEnvoye}
          </p>
        )}

        {editing && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleEnregistrer}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Enregistrer
            </button>
            <button
              onClick={handleAnnuler}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700"
            >
              <X size={15} /> Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}