// src/features/repartition/pages/SuiviSupportsCoursPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, Search, Download, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { urlPubliqueR2 } from '@/lib/r2';
import { listSupportsCours, annulerSupportCours, type SupportCoursLigne } from '../api';

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
    <div>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Supports de cours
      </p>
      <p className="text-sm text-gray-400 mb-4">
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

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Enseignant, UE, spécialité..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-300">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm font-semibold text-red-600">
            Impossible de charger : {error}
          </div>
        ) : filtrees.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-300">
            Aucune attribution active pour l'instant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3 whitespace-nowrap">Enseignant</th>
                <th className="px-5 py-3 whitespace-nowrap">UE</th>
                <th className="px-5 py-3 whitespace-nowrap">Spécialité(s)</th>
                <th className="px-5 py-3 whitespace-nowrap">Statut</th>
                <th className="px-5 py-3 whitespace-nowrap">Couverture</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((l) => (
                <tr
                  key={l.cle}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                    {l.enseignantNom}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                    {l.ueNom}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                    {l.specialiteNoms.join(', ')}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`flex items-center gap-1.5 w-fit text-xs font-bold px-2.5 py-1 rounded-full ${
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
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {l.tauxCouverture != null ? (
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          l.tauxCouverture >= 60
                            ? 'bg-green-50 text-green-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        {l.tauxCouverture}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {l.supportEnvoye && l.supportKey && (
                        <a
                          href={urlPubliqueR2(l.supportKey)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100 w-fit"
                        >
                          <Download size={13} />
                          Télécharger
                        </a>
                      )}
                      {l.supportEnvoye && (
                        <button
                          onClick={() => handleAnnuler(l)}
                          disabled={annulationEnCours === l.cle}
                          className="flex items-center gap-1.5 bg-red-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 w-fit"
                        >
                          {annulationEnCours === l.cle ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <XCircle size={13} />
                          )}
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}