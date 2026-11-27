// src/features/referentiel/responsables/components/SelecteurPerimetre.tsx
import { Loader2, Search } from 'lucide-react';
import type { SpecialitePourPerimetre } from '../api';

// Sélecteur de périmètre : recherche, « Tout sélectionner », sélection par
// cycle (BTS, HND…) et cases individuelles.
export default function SelecteurPerimetre({
  specialites,
  chargement,
  selection,
  onChange,
  recherche,
  onRecherche,
}: {
  specialites: SpecialitePourPerimetre[];
  chargement: boolean;
  selection: Set<string>;
  onChange: (ids: Set<string>) => void;
  recherche: string;
  onRecherche: (v: string) => void;
}) {
  const q = recherche.trim().toLowerCase();
  const filtrees = specialites.filter(
    (s) =>
      !q ||
      s.nom.toLowerCase().includes(q) ||
      s.filiereNom.toLowerCase().includes(q) ||
      s.cycle.toLowerCase().includes(q)
  );

  // Cycles présents, dans l'ordre habituel puis alphabétique.
  const ordre = ['BTS', 'HND', 'Licence', 'Bachelor', 'Master'];
  const cycles = Array.from(
    new Set(specialites.map((s) => s.cycle).filter(Boolean))
  ).sort((a, b) => {
    const ia = ordre.indexOf(a);
    const ib = ordre.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });

  // Applique « tout cocher » ou « tout décocher » à un groupe d'ids.
  function appliquer(ids: string[], cocher: boolean) {
    const next = new Set(selection);
    for (const id of ids) {
      if (cocher) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }

  function toggle(id: string) {
    appliquer([id], !selection.has(id));
  }

  const idsFiltres = filtrees.map((s) => s.id);
  const toutFiltreCoche =
    idsFiltres.length > 0 && idsFiltres.every((id) => selection.has(id));
  const libelleTout = q
    ? `Tout sélectionner (${filtrees.length} résultat${filtrees.length > 1 ? 's' : ''})`
    : `Tout sélectionner (${specialites.length})`;

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-2 mb-3">
        <Search size={14} className="text-gray-300 shrink-0" />
        <input
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          placeholder="Rechercher une spécialité..."
          className="flex-1 text-sm font-semibold outline-none bg-transparent"
        />
      </div>

      {chargement ? (
        <div className="flex items-center justify-center py-8 text-gray-300">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <>
          {cycles.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-bold text-gray-400 mb-1.5">
                Sélection par cycle
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cycles.map((c) => {
                  const ids = specialites
                    .filter((s) => s.cycle === c)
                    .map((s) => s.id);
                  const nb = ids.filter((id) => selection.has(id)).length;
                  const complet = nb === ids.length;
                  const partiel = nb > 0 && !complet;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => appliquer(ids, !complet)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold border transition-colors ${
                        complet
                          ? 'bg-red-600 border-red-600 text-white'
                          : partiel
                            ? 'bg-red-50 border-red-200 text-red-600'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {c} · {nb}/{ids.length}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-y border-gray-100 py-2 mb-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-gray-700">
              <input
                type="checkbox"
                checked={toutFiltreCoche}
                disabled={idsFiltres.length === 0}
                onChange={() => appliquer(idsFiltres, !toutFiltreCoche)}
              />
              {libelleTout}
            </label>
            {selection.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-xs font-bold text-gray-400 hover:text-red-600"
              >
                Tout désélectionner
              </button>
            )}
          </div>

          {filtrees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucune spécialité trouvée.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
              {filtrees.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selection.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {s.nom}
                      {s.cycle && (
                        <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5 align-middle">
                          {s.cycle}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.filiereNom} · {s.ecoleNom}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <p className="text-[11px] font-bold text-gray-400 mt-2">
            {selection.size} spécialité{selection.size > 1 ? 's' : ''}{' '}
            sélectionnée{selection.size > 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  );
}