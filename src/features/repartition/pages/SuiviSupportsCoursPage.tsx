// src/features/repartition/pages/SuiviSupportsCoursPage.tsx
import { useEffect, useState } from 'react';
import {
  Loader2,
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from 'lucide-react';
import { urlPubliqueR2 } from '@/lib/r2';
import { listSupportsCours, annulerSupportCours, type SupportCoursLigne } from '../api';

function CarteSupport({
  l,
  annulationEnCours,
  onAnnuler,
}: {
  l: SupportCoursLigne;
  annulationEnCours: string | null;
  onAnnuler: (l: SupportCoursLigne) => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-[200px]">
          <p className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            {l.ueNom}
            {l.troncCommunId && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 rounded-full px-2 py-0.5">
                <Layers size={10} /> Tronc commun
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {l.enseignantNom}
            {l.specialiteNoms.length > 0 &&
              ` · ${l.specialiteNoms.join(', ')}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
              l.supportEnvoye
                ? 'bg-green-50 text-green-600'
                : 'bg-amber-50 text-amber-600'
            }`}
          >
            {l.supportEnvoye ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}
            {l.supportEnvoye ? 'Envoyé' : 'En attente'}
          </span>
          {l.tauxCouverture != null && (
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                l.tauxCouverture >= 60
                  ? 'bg-green-50 text-green-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {l.tauxCouverture}%
            </span>
          )}
        </div>
      </div>

      {l.supportEnvoye && (
        <div className="flex items-center gap-2 mt-3">
          {l.supportKey && (
            <a
              href={urlPubliqueR2(l.supportKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
            >
              <Download size={13} /> Télécharger
            </a>
          )}
          <button
            onClick={() => onAnnuler(l)}
            disabled={annulationEnCours === l.cle}
            className="flex items-center gap-1.5 bg-red-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {annulationEnCours === l.cle ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <XCircle size={13} />
            )}
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

// Écran Scénario 12 — statut des supports de cours, une ligne par cours
// réellement enseigné (une UE simple, ou un tronc commun entier avec
// toutes ses spécialités). Admin voit tout, Responsable est limité à son
// périmètre (RLS sur attributions/offres).
export default function SuiviSupportsCoursPage() {
  const [lignes, setLignes] = useState<SupportCoursLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [annulationEnCours, setAnnulationEnCours] = useState<string | null>(
    null
  );

  function charger() {
    listSupportsCours()
      .then(setLignes)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => setLoading(false));
  }

  useEffect(charger, []);

  async function handleAnnuler(ligne: SupportCoursLigne) {
    if (
      !window.confirm(
        "Annuler ce support de cours ? L'enseignant devra en renvoyer un."
      )
    )
      return;
    setAnnulationEnCours(ligne.cle);
    try {
      await annulerSupportCours(
        ligne.troncCommunId
          ? { troncCommunId: ligne.troncCommunId }
          : { attributionId: ligne.attributionIds[0] }
      );
      charger();
    } finally {
      setAnnulationEnCours(null);
    }
  }

  const filtrees = lignes.filter((l) => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return (
      l.enseignantNom.toLowerCase().includes(q) ||
      l.ueNom.toLowerCase().includes(q) ||
      l.specialiteNoms.some((s) => s.toLowerCase().includes(q))
    );
  });

  const nbManquants = lignes.filter((l) => !l.supportEnvoye).length;

  return (
    <div className="max-w-3xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Supports de cours
      </p>
      <p className="text-sm text-gray-400 mb-5">
        Statut d'envoi par enseignant, pour chaque cours attribué.
      </p>

      {nbManquants > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            {nbManquants} support{nbManquants > 1 ? 's' : ''} de cours pas
            encore envoyé{nbManquants > 1 ? 's' : ''}.
          </p>
        </div>
      )}

      <div className="flex mb-5">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72 shadow-sm">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Enseignant, UE, spécialité..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[20px] flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-[20px] p-6 text-sm font-semibold text-red-600">
          Impossible de charger : {error}
        </div>
      ) : filtrees.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Aucune attribution active pour l'instant.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtrees.map((l) => (
            <CarteSupport
              key={l.cle}
              l={l}
              annulationEnCours={annulationEnCours}
              onAnnuler={handleAnnuler}
            />
          ))}
        </div>
      )}
    </div>
  );
}