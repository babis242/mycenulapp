// src/features/referentiel/enseignants/components/BoutonWhatsAppIdentifiants.tsx
//
// Bouton « Envoyer par WhatsApp » : génère un nouveau mot de passe (fonction
// edge identifiants-enseignant), compose le message de connexion et ouvre
// WhatsApp (wa.me) avec ce message. L'administration n'a plus qu'à envoyer.
// L'email reste disponible à côté ; le nouveau mot de passe remplace le
// précédent.

import { useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { lienWhatsApp, normaliserNumero } from '@/features/sondage/retours';

interface Props {
  enseignantId: string;
  nom: string;
  numeroWhatsapp?: string | null;
  numeroCellulaire?: string | null;
  className?: string;
}

export function messageIdentifiants(p: {
  nom: string;
  matricule: string;
  motDePasse: string;
  lien: string;
}): string {
  return [
    `Bonjour ${p.nom},`,
    '',
    "Voici vos identifiants de connexion à l'application du CENULAPE :",
    '',
    `Matricule : ${p.matricule}`,
    `Mot de passe : ${p.motDePasse}`,
    '',
    `Connexion : ${p.lien}`,
    '',
    'Pensez à modifier votre mot de passe dans « Mon profil » après votre première connexion.',
  ].join('\n');
}

export default function BoutonWhatsAppIdentifiants({
  enseignantId,
  nom,
  numeroWhatsapp,
  numeroCellulaire,
  className,
}: Props) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lienManuel, setLienManuel] = useState<string | null>(null);

  const numero = normaliserNumero(numeroWhatsapp) ? numeroWhatsapp : numeroCellulaire;
  const numeroValide = !!normaliserNumero(numero);

  async function envoyer() {
    setErreur(null);
    setLienManuel(null);
    // Fenêtre ouverte tout de suite (geste de l'utilisateur) pour ne pas être
    // bloquée par le navigateur après l'appel réseau.
    const fenetre = window.open('', '_blank');
    setEnvoi(true);
    try {
      const { data, error } = await supabase.functions.invoke('identifiants-enseignant', {
        body: { enseignantId },
      });
      if (error || data?.error) {
        // Sur une réponse non 2xx, le message précis est dans le corps de la réponse.
        let detail: string | undefined = data?.error;
        const reponse = (error as { context?: Response } | null)?.context;
        if (!detail && reponse && typeof reponse.json === 'function') {
          detail = (await reponse.json().catch(() => null))?.error;
        }
        throw new Error(detail ?? error?.message ?? 'Génération impossible.');
      }
      const texte = messageIdentifiants({
        nom: data.nom ?? nom,
        matricule: data.matricule,
        motDePasse: data.motDePasse,
        lien: window.location.origin,
      });
      const lien =
        lienWhatsApp(numero, texte) ?? `https://wa.me/?text=${encodeURIComponent(texte)}`;
      if (fenetre) fenetre.location.href = lien;
      else setLienManuel(lien);
    } catch (e) {
      fenetre?.close();
      setErreur(e instanceof Error ? e.message : 'Erreur lors de la génération.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={envoyer}
        disabled={envoi}
        className="inline-flex items-center justify-center gap-2 bg-green-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {envoi ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
        Envoyer les identifiants par WhatsApp
      </button>
      {!numeroValide && (
        <p className="text-[11px] font-semibold text-amber-600 mt-1.5">
          Aucun numéro WhatsApp valide : WhatsApp s'ouvrira sans destinataire, choisissez-le à la main.
        </p>
      )}
      <p className="text-[11px] font-semibold text-gray-400 mt-1.5">
        Un nouveau mot de passe est généré ; il remplace celui reçu par email.
      </p>
      {lienManuel && (
        <a
          href={lienManuel}
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-bold text-green-700 underline mt-1.5"
        >
          Le navigateur a bloqué l'ouverture : cliquez ici pour ouvrir WhatsApp.
        </a>
      )}
      {erreur && <p className="text-xs font-semibold text-red-600 mt-1.5">{erreur}</p>}
    </div>
  );
}