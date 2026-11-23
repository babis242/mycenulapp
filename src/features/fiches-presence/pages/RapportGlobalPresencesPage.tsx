// src/features/fiches-presence/pages/RapportGlobalPresencesPage.tsx
//
// Rapport de présence global (toutes filières) : choix de la semaine
// détaillée, du nombre de semaines comparées et du seuil d'absences,
// aperçu et téléchargement PDF.
import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { lundiCourant } from '../components/SelecteurGroupe';
import RapportGlobalPdf from '../components/RapportGlobalPdf';
import { libelleSemaine } from '../components/FichesPresencePdf';
import {
  calculerRapport,
  chargerDonnees,
  listerClasses,
  decalerSemaine,
  lundiDe,
  semainesJusqua,
  type DonneesBrutes,
} from '../rapportGlobalApi';

export default function RapportGlobalPresencesPage() {
  const [semaine, setSemaine] = useState(lundiCourant());
  const [nbSemaines, setNbSemaines] = useState(4);
  const [seuil, setSeuil] = useState(3);
  const [semestreFiltre, setSemestreFiltre] = useState('');
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [donnees, setDonnees] = useState<DonneesBrutes | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const semaines = useMemo(() => semainesJusqua(semaine, nbSemaines), [semaine, nbSemaines]);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    chargerDonnees(semaines)
      .then((d) => !annule && setDonnees(d))
      .catch((e) => !annule && setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [semaines]);

  const classes = useMemo(() => (donnees ? listerClasses(donnees) : []), [donnees]);
  const semestresDispo = useMemo(
    () =>
      Array.from(new Set(classes.map((c) => c.semestre))).sort(
        (a, b) => (Number(a.replace(/[^0-9]/g, '')) || 0) - (Number(b.replace(/[^0-9]/g, '')) || 0)
      ),
    [classes]
  );
  const visibles = useMemo(
    () => classes.filter((c) => !semestreFiltre || c.semestre === semestreFiltre),
    [classes, semestreFiltre]
  );
  const retenues = useMemo(() => new Set(visibles.filter((c) => !exclus.has(c.cle)).map((c) => c.cle)), [visibles, exclus]);

  const rapport = useMemo(
    () => (donnees && retenues.size > 0 ? calculerRapport(donnees, semaines, Math.max(1, seuil), retenues) : null),
    [donnees, semaines, seuil, retenues]
  );
  const perimetre =
    retenues.size === classes.length
      ? 'toutes les spécialités et tous les semestres'
      : `${retenues.size} classe${retenues.size > 1 ? 's' : ''} sur ${classes.length}` +
        (semestreFiltre ? ` (semestre ${semestreFiltre})` : '');

  function basculer(cle: string) {
    setExclus((prev) => {
      const n = new Set(prev);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });
  }
  function toutCocher(cocher: boolean) {
    setExclus((prev) => {
      const n = new Set(prev);
      for (const c of visibles) {
        if (cocher) n.delete(c.cle);
        else n.add(c.cle);
      }
      return n;
    });
  }
  const vide = !!rapport && rapport.parSemaine.every((s) => s.t === 0);

  function telechargerPdf() {
    const titreAvant = document.title;
    document.title = `Rapport de presence - Semaine ${semaine}`;
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { background: #fff !important; }
          .rg-doc, .rg-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="max-w-5xl mx-auto">
        <div className="print:hidden">
          <p className="font-extrabold text-2xl text-gray-900 mb-1">Rapport de présence</p>
          <p className="text-sm text-gray-400 mb-6">
            Présences et absences de toute l’école : par semaine, par filière, par spécialité, avec les absents de la semaine.
          </p>

          <div className="bg-white rounded-[20px] p-5 mb-4 flex flex-wrap items-end gap-4">
            <label className="text-xs font-bold text-gray-500">
              Semaine détaillée (lundi)
              <input
                type="date"
                value={semaine}
                onChange={(e) => e.target.value && setSemaine(lundiDe(e.target.value))}
                className="block mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900"
              />
              <span className="font-medium text-gray-400">Du {libelleSemaine(semaine)}</span>
            </label>
            <label className="text-xs font-bold text-gray-500">
              Semaines comparées
              <select
                value={nbSemaines}
                onChange={(e) => setNbSemaines(Number(e.target.value))}
                className="block mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900"
              >
                {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} semaine{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-gray-500">
              Seuil d’absences
              <input
                type="number"
                min={1}
                max={30}
                value={seuil}
                onChange={(e) => setSeuil(Number(e.target.value) || 1)}
                className="block mt-1 w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSemaine(decalerSemaine(semaine, -1))}
                className="border border-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-full"
              >
                ← Semaine précédente
              </button>
              <button
                type="button"
                onClick={() => setSemaine(decalerSemaine(semaine, 1))}
                className="border border-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-full"
              >
                Semaine suivante →
              </button>
            </div>
            {rapport && !vide && (
              <button
                type="button"
                onClick={telechargerPdf}
                className="inline-flex items-center gap-2 bg-red-600 text-white font-bold text-sm px-5 py-2.5 rounded-full"
              >
                <Download size={16} />
                Télécharger le PDF
              </button>
            )}
          </div>

          {classes.length > 0 && (
            <div className="bg-white rounded-[20px] p-5 mb-4">
              <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                  <p className="font-extrabold text-sm text-gray-900">Spécialités et semestres à inclure</p>
                  <p className="text-xs text-gray-400">
                    Seules les classes qui ont des étudiants sont proposées. Décochez celles à exclure du rapport.
                  </p>
                </div>
                <label className="text-xs font-bold text-gray-500">
                  Semestre
                  <select
                    value={semestreFiltre}
                    onChange={(e) => setSemestreFiltre(e.target.value)}
                    className="block mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900"
                  >
                    <option value="">Tous les semestres</option>
                    {semestresDispo.map((sem) => (
                      <option key={sem} value={sem}>
                        {sem}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => toutCocher(true)} className="text-xs font-bold text-red-600 underline">
                  Tout cocher
                </button>
                <button type="button" onClick={() => toutCocher(false)} className="text-xs font-bold text-gray-500 underline">
                  Tout décocher
                </button>
              </div>
              {Array.from(new Set(visibles.map((c) => c.cycle))).map((cycle) => (
                <div key={cycle} className="mb-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">Cycle {cycle}</p>
                  <div className="flex flex-wrap gap-2">
                    {visibles
                      .filter((c) => c.cycle === cycle)
                      .map((c) => {
                        const coche = !exclus.has(c.cle);
                        return (
                          <label
                            key={c.cle}
                            className={`inline-flex items-center gap-2 text-xs font-semibold rounded-full px-3 py-1.5 border cursor-pointer ${
                              coche ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-400'
                            }`}
                          >
                            <input type="checkbox" checked={coche} onChange={() => basculer(c.cle)} className="accent-red-600" />
                            {c.specialite} · {c.semestre} <span className="font-medium opacity-70">({c.inscrits})</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              ))}
              {retenues.size === 0 && (
                <p className="text-xs font-semibold text-amber-700 mt-2">Aucune classe cochée : cochez au moins une spécialité.</p>
              )}
            </div>
          )}

          {erreur && <p className="bg-red-50 text-red-700 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{erreur}</p>}
          {chargement && <Loader2 className="animate-spin text-red-600 mx-auto my-6" />}
          {!chargement && vide && (
            <p className="bg-amber-50 text-amber-800 text-sm font-semibold rounded-xl px-4 py-3 mb-4">
              Aucune présence enregistrée sur cette période.
            </p>
          )}
        </div>

        {rapport && !vide && !chargement && (
          <div className="bg-white rounded-[20px] p-6 overflow-x-auto print:p-0 print:rounded-none">
            <RapportGlobalPdf rapport={rapport} perimetre={perimetre} />
          </div>
        )}
      </div>
    </>
  );
}