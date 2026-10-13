// src/features/fiches-presence/pages/FichesPresencePage.tsx
//
// Génération des fiches de présence : on choisit un cycle, un semestre
// et une semaine, on coche les spécialités, et on obtient une fiche par
// spécialité à partir de la liste des étudiants. Impression du
// navigateur (« Enregistrer au format PDF »), A4 paysage.
import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCyclesDisponibles,
  type CycleOption,
  type SpecialiteGroupe,
} from '@/features/emploi-du-temps/api';
import { getEtudiantsParSpecialites, listSpecialitesPourFiches } from '../api';
import FichesPresencePdf, {
  libelleSemaine,
  type FicheSpecialite,
} from '../components/FichesPresencePdf';

// Lundi de la semaine en cours (heure du Cameroun, UTC+1).
function lundiCourant(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const jour = d.getUTCDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + decalage));
  return lundi.toISOString().slice(0, 10);
}

// Ramène n'importe quelle date choisie au lundi de sa semaine.
function versLundi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jour = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (jour === 0 ? -6 : 1 - jour));
  return dt.toISOString().slice(0, 10);
}

export default function FichesPresencePage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds =
    user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [semestre, setSemestre] = useState('');
  const [semaine, setSemaine] = useState(lundiCourant());
  const [lignesLibres, setLignesLibres] = useState(5);

  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [chargementSpecs, setChargementSpecs] = useState(false);

  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fiches, setFiches] = useState<FicheSpecialite[] | null>(null);
  const [infos, setInfos] = useState<{ semestre: string; semaine: string; lignes: number; cycle: string } | null>(null);

  const semestresDisponibles = Array.from(
    new Set(Object.values(SEMESTRES_PAR_TYPE_CURSUS).flatMap((l) => l))
  );

  useEffect(() => {
    listCyclesDisponibles(perimetreIds).then(setCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFiches(null);
    setCochees(new Set());
    if (!cycleKey || !semestre) {
      setSpecialites([]);
      return;
    }
    const [cycle, sousCycle] = cycleKey.split('::');
    setChargementSpecs(true);
    listSpecialitesPourFiches(cycle, sousCycle || null, semestre, perimetreIds)
      .then((liste) => {
        setSpecialites(liste);
        setCochees(new Set(liste.map((s) => s.id)));
      })
      .finally(() => setChargementSpecs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre]);

  function basculer(id: string) {
    setFiches(null);
    setCochees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generer() {
    setErreur(null);
    if (!navigator.onLine) {
      setErreur('Une connexion Internet est nécessaire pour générer les fiches.');
      return;
    }
    setGeneration(true);
    setFiches(null);
    try {
      const choisies = specialites.filter((s) => cochees.has(s.id));
      const parSpecialite = await getEtudiantsParSpecialites(
        choisies.map((s) => s.id),
        semestre
      );
      setFiches(
        choisies.map((s) => ({
          specialiteId: s.id,
          nom: s.nom,
          etudiants: (parSpecialite.get(s.id) ?? []).map((e) => ({ matricule: e.matricule, nom: e.nom_complet })),
        }))
      );
      setInfos({ semestre, semaine, lignes: lignesLibres, cycle: cycleKey.split('::')[0] });
    } catch (e: any) {
      setErreur(e?.message || 'Échec de la génération.');
    } finally {
      setGeneration(false);
    }
  }

  function telecharger() {
    const titreAvant = document.title;
    const cycleLabel = cycles.find((c) => c.key === cycleKey)?.label ?? '';
    document.title = `Fiches de presence ${cycleLabel} ${semestre} - Semaine ${semaine}`.trim();
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const totalEtudiants = (fiches ?? []).reduce((n, f) => n + f.etudiants.length, 0);
  const champ =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body { background: #fff !important; }
          .fiche-presence-doc, .fiche-presence-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .fiche-apercu { width: max-content; margin: 0 auto; display: flex; flex-direction: column; gap: 8mm; }
        .fiche-apercu .fiche-presence-page { box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
        @media print {
          .fiche-apercu { display: block; gap: 0; margin: 0; width: auto; }
          .fiche-apercu .fiche-presence-page { box-shadow: none; }
        }
        .fiche-presence-doc { display: flex; flex-direction: column; gap: 8mm; }
        @media print { .fiche-presence-doc { display: block; } }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Fiches de présence</p>
        <p className="text-sm text-gray-400 mb-6">
          Choisis un cycle, un semestre et une semaine : une fiche est générée
          pour chaque spécialité cochée, à partir de la liste des étudiants.
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Cycle</label>
              <select
                value={cycleKey}
                onChange={(e) => {
                  setCycleKey(e.target.value);
                  setSemestre('');
                }}
                className={champ}
              >
                <option value="">Cycle...</option>
                {cycles.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Semestre</label>
              <select
                value={semestre}
                onChange={(e) => setSemestre(e.target.value)}
                disabled={!cycleKey}
                className={champ + ' disabled:bg-gray-50 disabled:text-gray-300'}
              >
                <option value="">Semestre...</option>
                {semestresDisponibles.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Semaine (lundi)</label>
              <input
                type="date"
                value={semaine}
                onChange={(e) => {
                  if (e.target.value) {
                    setSemaine(versLundi(e.target.value));
                    setFiches(null);
                  }
                }}
                className={champ}
              />
            </div>
          </div>
          <p className="text-xs font-semibold text-gray-500 mb-4">
            Semaine du {libelleSemaine(semaine)}
          </p>

          {cycleKey && semestre && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  Spécialités — coche celles concernées
                </p>
                {specialites.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiches(null);
                      setCochees((prev) =>
                        prev.size === specialites.length
                          ? new Set()
                          : new Set(specialites.map((s) => s.id))
                      );
                    }}
                    className="text-xs font-bold text-red-600 hover:underline"
                  >
                    {cochees.size === specialites.length ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                )}
              </div>
              {chargementSpecs ? (
                <div className="flex justify-center py-6 text-gray-300">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : specialites.length === 0 ? (
                <p className="text-sm text-gray-400 px-1">
                  Aucune spécialité pour ce cycle et ce semestre.
                </p>
              ) : (
                <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto divide-y divide-gray-50">
                  {specialites.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-gray-800 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={cochees.has(s.id)}
                        onChange={() => basculer(s.id)}
                        className="shrink-0 accent-red-600"
                      />
                      <span className="min-w-0">
                        {s.nom}
                        <span className="block text-xs font-normal text-gray-400 truncate">
                          {s.ecoleNom} · {s.filiereNom}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2 mt-4">
            <label className="text-xs font-bold text-gray-500">
              Lignes libres en plus des étudiants
            </label>
            <input
              type="number"
              min={0}
              max={15}
              value={lignesLibres}
              onChange={(e) => {
                setLignesLibres(Math.max(0, Math.min(15, Number(e.target.value) || 0)));
                setFiches(null);
              }}
              className="w-16 border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-4">
            <button
              onClick={generer}
              disabled={generation || cochees.size === 0 || !semaine}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {generation ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Générer les fiches
            </button>
            {fiches && (
              <button
                onClick={telecharger}
                className="flex items-center gap-2 bg-gray-900 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-black"
              >
                <Download size={15} /> Télécharger le PDF
              </button>
            )}
          </div>
          {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
          {fiches && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <Users size={13} /> {fiches.length} fiche(s) — {totalEtudiants} étudiant(s)
              </p>
              {fiches.some((f) => f.etudiants.length === 0) && (
                <p className="text-xs font-semibold text-amber-600 mt-1">
                  Aucun étudiant enregistré pour :{' '}
                  {fiches.filter((f) => f.etudiants.length === 0).map((f) => f.nom).join(', ')}
                  . La fiche reste imprimable avec des lignes vides.
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Dans la fenêtre d'impression, choisis « Enregistrer au format PDF »
                (A4, paysage, marges : aucune) et active « Graphiques d'arrière-plan ».
              </p>
            </div>
          )}
        </div>
      </div>

      {fiches && infos && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="fiche-apercu">
            <FichesPresencePdf
              fiches={fiches}
              semestre={infos.semestre}
              cycle={infos.cycle}
              semaine={infos.semaine}
              lignesSupplementaires={infos.lignes}
            />
          </div>
        </div>
      )}
    </>
  );
}