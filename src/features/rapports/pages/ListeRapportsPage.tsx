// src/features/rapports/pages/ListeRapportsPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, Search, Image, Users } from 'lucide-react';
import { urlPubliqueR2 } from '@/lib/r2';
import { listRapports, type RapportLigne } from '../api';

// Écran Scénario 13 — consultation des rapports de séance déjà déposés
// par les enseignants (admin/responsable, périmètre appliqué par RLS).
export default function ListeRapportsPage() {
  const [rapports, setRapports] = useState<RapportLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    listRapports()
      .then(setRapports)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => setLoading(false));
  }, []);

  const filtres = rapports.filter((r) => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return (
      r.ueNom.toLowerCase().includes(q) ||
      r.enseignantNom.toLowerCase().includes(q) ||
      r.niveau.toLowerCase().includes(q) ||
      r.specialiteNoms.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Rapports de séance
      </p>
      <p className="text-sm text-gray-400 mb-4">
        Appel des étudiants et cahier de texte déposés par les enseignants.
      </p>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Enseignant, UE, semestre..."
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
      ) : filtres.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Aucun rapport pour l'instant.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtres.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div className="min-w-[180px]">
                  <p className="font-bold text-gray-900">{r.ueNom}</p>
                  <p className="text-xs text-gray-400">
                    {r.enseignantNom} · {r.niveau}
                    {r.specialiteNoms.length > 0 &&
                      ` · ${r.specialiteNoms.join(', ')}`}
                  </p>
                </div>
                <div className="text-xs text-gray-400 sm:text-right">
                  <p>
                    {r.jour} · {r.creneau}
                  </p>
                  <p>
                    Semaine du{' '}
                    {r.semaine
                      ? new Date(r.semaine).toLocaleDateString('fr-FR')
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
                    r.nbTotal === 0
                      ? 'bg-gray-50 text-gray-400'
                      : r.nbPresents === r.nbTotal
                        ? 'bg-green-50 text-green-600'
                        : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <Users size={12} />
                  {r.nbTotal === 0
                    ? 'Aucun appel'
                    : `${r.nbPresents}/${r.nbTotal} présents`}
                </span>

                {r.cahierTexteKeys.length > 0 ? (
                  <a
                    href={urlPubliqueR2(r.cahierTexteKeys[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    <Image size={13} /> Cahier de texte (
                    {r.cahierTexteKeys.length} photo
                    {r.cahierTexteKeys.length > 1 ? 's' : ''})
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-300">
                    <Image size={13} /> Cahier de texte absent
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}