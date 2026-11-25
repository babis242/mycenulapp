// src/features/referentiel/etudiants/components/RechercheGeneraleEtudiants.tsx
//
// Barre de recherche générale : trouve un étudiant par nom ou matricule dans toute l'école
// et affiche sa classe et son statut d'inscription (modifiable d'un clic).
import { useEffect, useState } from 'react';
import { Loader2, Pencil, Search, X } from 'lucide-react';
import {
  definirInscription,
  estMatriculeProvisoire,
  rechercherEtudiants,
  type EtudiantTrouve,
} from '../api';
import ModifierEtudiantModal from './ModifierEtudiantModal';

export default function RechercheGeneraleEtudiants() {
  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState<EtudiantTrouve[]>([]);
  const [tronque, setTronque] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aModifier, setAModifier] = useState<EtudiantTrouve | null>(null);
  const [version, setVersion] = useState(0); // relance la recherche après une modification

  useEffect(() => {
    const t = terme.trim();
    setErreur(null);
    if (t.length < 2) {
      setResultats([]);
      setTronque(false);
      return;
    }
    let actif = true;
    setChargement(true);
    const minuteur = setTimeout(() => {
      rechercherEtudiants(t)
        .then((r) => {
          if (!actif) return;
          setResultats(r.resultats);
          setTronque(r.tronque);
        })
        .catch((e) => actif && setErreur(e?.message ?? 'Recherche impossible.'))
        .finally(() => actif && setChargement(false));
    }, 300);
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [terme, version]);

  async function basculer(e: EtudiantTrouve) {
    const nouveau = e.inscrit === false;
    setResultats((p) => p.map((x) => (x.id === e.id ? { ...x, inscrit: nouveau } : x)));
    try {
      await definirInscription(e.id, nouveau);
    } catch (err) {
      setResultats((p) => p.map((x) => (x.id === e.id ? { ...x, inscrit: e.inscrit } : x)));
      setErreur(err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  const actif = terme.trim().length >= 2;

  return (
    <div className="bg-white rounded-[20px] p-5 mb-4">
      <p className="text-xs font-bold text-gray-500 mb-1.5">Recherche générale d’un étudiant</p>
      <div className="flex items-center gap-2 border border-gray-200 rounded-full px-4 py-2.5 focus-within:border-red-300">
        <Search size={15} className="text-gray-300 shrink-0" />
        <input
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          placeholder="Nom ou matricule, dans toutes les spécialités…"
          className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
        />
        {chargement && <Loader2 size={15} className="animate-spin text-gray-300 shrink-0" />}
        {terme && !chargement && (
          <button type="button" onClick={() => setTerme('')} className="text-gray-300 hover:text-gray-600 shrink-0">
            <X size={15} />
          </button>
        )}
      </div>

      {erreur && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">{erreur}</p>}
      {terme.trim().length === 1 && <p className="mt-3 text-xs font-semibold text-gray-400">Saisissez au moins 2 caractères.</p>}

      {actif && !chargement && !erreur && resultats.length === 0 && (
        <p className="mt-3 text-sm font-semibold text-gray-400">Aucun étudiant trouvé pour « {terme.trim()} ».</p>
      )}

      {resultats.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                <th className="py-2 pr-3">Étudiant</th>
                <th className="py-2 pr-3">Matricule</th>
                <th className="py-2 pr-3">Spécialité</th>
                <th className="py-2 pr-3">Semestre</th>
                <th className="py-2 pr-3">Inscription</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {resultats.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-3 font-bold text-gray-900">{e.nom_complet}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs font-bold text-gray-500 whitespace-nowrap">
                    {e.matricule}
                    {estMatriculeProvisoire(e.matricule) && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">provisoire</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-600">
                    {e.specialite_nom}
                    {e.specialite_cycle && <span className="text-gray-400"> ({e.specialite_cycle})</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">
                    {e.semestre}
                    {e.niveau && <span className="text-gray-400"> · {e.niveau}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => basculer(e)}
                      title="Cliquer pour changer"
                      className={`rounded-full px-3 py-1 text-xs font-extrabold whitespace-nowrap ${
                        e.inscrit === false ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {e.inscrit === false ? 'Pas inscrit' : 'Inscrit'}
                    </button>
                  </td>
                  <td className="py-2.5 text-right">
                    <button type="button" onClick={() => setAModifier(e)} title="Modifier" className="text-gray-300 hover:text-gray-700">
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs font-semibold text-gray-400">
            {resultats.length} résultat{resultats.length > 1 ? 's' : ''}
            {tronque ? ' affichés (il y en a davantage : précisez votre recherche)' : ''}
          </p>
        </div>
      )}

      {aModifier && (
        <ModifierEtudiantModal
          etudiant={aModifier}
          onFermer={() => setAModifier(null)}
          onEnregistre={() => {
            setAModifier(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}