// src/features/rapports/pages/ListeRapportsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Image, Users, Layers, GraduationCap } from 'lucide-react';
import { urlPubliqueR2 } from '@/lib/r2';
import { listRapports, type RapportLigne } from '../api';

function CarteRapport({ r, onClick }: { r: RapportLigne; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 cursor-pointer transition-colors hover:bg-gray-50/80 border border-transparent hover:border-gray-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-[180px]">
          <p className="font-bold text-gray-900">{r.ueNom}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {r.enseignantNom} · {r.niveau}
            {r.specialiteNoms.length > 0 && ` · ${r.specialiteNoms.join(', ')}`}
          </p>
        </div>
        <div className="text-xs text-gray-400 sm:text-right shrink-0">
          <p className="font-semibold text-gray-500">
            {r.jour} · {r.creneau}
          </p>
          <p>
            Semaine du{' '}
            {r.semaine ? new Date(r.semaine).toLocaleDateString('fr-FR') : '—'}
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
          {r.nbTotal === 0 ? 'Aucun appel' : `${r.nbPresents}/${r.nbTotal} présents`}
        </span>

        {r.cahierTexteKeys.length > 0 ? (
          <a
            href={urlPubliqueR2(r.cahierTexteKeys[0])}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
          >
            <Image size={13} /> Cahier de texte ({r.cahierTexteKeys.length} photo
            {r.cahierTexteKeys.length > 1 ? 's' : ''})
          </a>
        ) : (
          <span className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-1.5 text-xs font-bold text-gray-300">
            <Image size={13} /> Cahier de texte absent
          </span>
        )}
      </div>
    </div>
  );
}

// Écran Scénario 13 — consultation des rapports de séance déjà déposés
// par les enseignants (admin/responsable, périmètre appliqué par RLS).
// Organisé par semestre, puis troncs communs / spécialités — clique sur
// une carte pour voir le détail complet (appel, points abordés, cahier
// de texte, taux de couverture).
export default function ListeRapportsPage() {
  const navigate = useNavigate();
  const [rapports, setRapports] = useState<RapportLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [semestreFiltre, setSemestreFiltre] = useState('');

  useEffect(() => {
    listRapports()
      .then(setRapports)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => setLoading(false));
  }, []);

  const semestresDisponibles = Array.from(
    new Set(rapports.map((r) => r.niveau).filter(Boolean))
  ).sort();

  const filtres = rapports.filter((r) => {
    if (semestreFiltre && r.niveau !== semestreFiltre) return false;
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return (
      r.ueNom.toLowerCase().includes(q) ||
      r.enseignantNom.toLowerCase().includes(q) ||
      r.niveau.toLowerCase().includes(q) ||
      r.specialiteNoms.some((s) => s.toLowerCase().includes(q))
    );
  });

  // Regroupement : semestre -> (troncs communs / spécialités).
  interface GroupeSemestre {
    semestre: string;
    troncs: Map<string, RapportLigne[]>; // clé = ueNom du tronc
    parSpecialite: Map<string, RapportLigne[]>; // clé = nom de spécialité
  }
  const parSemestre = new Map<string, GroupeSemestre>();
  for (const r of filtres) {
    const semestre = r.niveau || '(semestre inconnu)';
    if (!parSemestre.has(semestre)) {
      parSemestre.set(semestre, {
        semestre,
        troncs: new Map(),
        parSpecialite: new Map(),
      });
    }
    const groupe = parSemestre.get(semestre)!;
    if (r.troncCommunId) {
      const liste = groupe.troncs.get(r.ueNom) ?? [];
      liste.push(r);
      groupe.troncs.set(r.ueNom, liste);
    } else {
      const specialite = r.specialiteNoms[0] ?? '(spécialité inconnue)';
      const liste = groupe.parSpecialite.get(specialite) ?? [];
      liste.push(r);
      groupe.parSpecialite.set(specialite, liste);
    }
  }
  const groupesTries = Array.from(parSemestre.values()).sort((a, b) =>
    a.semestre.localeCompare(b.semestre)
  );

  return (
    <div className="max-w-3xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Rapports de séance
      </p>
      <p className="text-sm text-gray-400 mb-5">
        Appel des étudiants et cahier de texte déposés par les enseignants.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72 shadow-sm">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Enseignant, UE, spécialité..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
        <select
          value={semestreFiltre}
          onChange={(e) => setSemestreFiltre(e.target.value)}
          className="bg-white rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 outline-none shadow-sm"
        >
          <option value="">Tous les semestres</option>
          {semestresDisponibles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
        <div className="flex flex-col gap-10">
          {groupesTries.map((groupe) => (
            <div key={groupe.semestre}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-extrabold text-white bg-gray-900 rounded-full px-3 py-1 tracking-wide">
                  {groupe.semestre}
                </span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>

              {groupe.troncs.size > 0 && (
                <div className="mb-6">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold text-purple-600 uppercase tracking-wide mb-3">
                    <Layers size={13} /> Troncs communs
                  </p>
                  <div className="flex flex-col gap-5">
                    {Array.from(groupe.troncs.entries()).map(([ueNom, liste]) => (
                      <div key={ueNom}>
                        <p className="text-xs font-bold text-gray-500 mb-2">
                          {ueNom}
                        </p>
                        <div className="flex flex-col gap-2">
                          {liste.map((r) => (
                            <CarteRapport
                              key={r.id}
                              r={r}
                              onClick={() => navigate(`/rapports/${r.id}`)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {groupe.parSpecialite.size > 0 && (
                <div>
                  {groupe.troncs.size > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-extrabold text-gray-500 uppercase tracking-wide mb-3">
                      <GraduationCap size={13} /> Par spécialité
                    </p>
                  )}
                  <div className="flex flex-col gap-5">
                    {Array.from(groupe.parSpecialite.entries()).map(
                      ([specialite, liste]) => (
                        <div key={specialite}>
                          <p className="text-xs font-bold text-gray-500 mb-2">
                            {specialite}
                          </p>
                          <div className="flex flex-col gap-2">
                            {liste.map((r) => (
                              <CarteRapport
                                key={r.id}
                                r={r}
                                onClick={() => navigate(`/rapports/${r.id}`)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}