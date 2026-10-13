// src/features/fiches-presence/pages/FichesControlePage.tsx
//
// Génération des fiches de contrôle des enseignants : une fiche par
// créneau (jour + horaire) de la semaine, avec les enseignants programmés
// dans l'emploi du temps. Impression du navigateur (A4 portrait).
import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { JOURS } from '@/constants/enums';
import { listCyclesDisponibles, type CycleOption } from '@/features/emploi-du-temps/api';
import { creneauxFiables } from '../creneauxFiables';
import { getEnseignantsParCreneau, listIdsSpecialitesPourControle } from '../controleApi';
import { libelleSemaine } from '../components/FichesPresencePdf';
import FichesControlePdf, { type FicheControle } from '../components/FichesControlePdf';
import { lundiCourant } from '../components/SelecteurGroupe';

function versLundi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jour = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (jour === 0 ? -6 : 1 - jour));
  return dt.toISOString().slice(0, 10);
}

function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export default function FichesControlePage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [semaine, setSemaine] = useState(lundiCourant());
  const [lignesLibres, setLignesLibres] = useState(3);
  const [creneauxVides, setCreneauxVides] = useState(false);

  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fiches, setFiches] = useState<FicheControle[] | null>(null);
  const [infos, setInfos] = useState<{ semaine: string; lignes: number } | null>(null);

  useEffect(() => {
    listCyclesDisponibles(perimetreIds).then(setCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generer() {
    setErreur(null);
    if (!navigator.onLine) {
      setErreur('Une connexion Internet est nécessaire pour générer les fiches.');
      return;
    }
    setGeneration(true);
    setFiches(null);
    try {
      const ids = await listIdsSpecialitesPourControle(cycleKey, perimetreIds);
      const parCreneau = await getEnseignantsParCreneau(ids, semaine);
      const creneaux = creneauxFiables();
      const liste: FicheControle[] = [];
      (JOURS as string[]).forEach((jour, ji) => {
        for (const creneau of creneaux) {
          const enseignants = parCreneau.get(`${jour}|${creneau}`) ?? [];
          if (enseignants.length === 0 && !creneauxVides) continue;
          liste.push({ jour, creneau, date: ajouterJours(semaine, ji), enseignants });
        }
      });
      setFiches(liste);
      setInfos({ semaine, lignes: lignesLibres });
    } catch (e: any) {
      setErreur(e?.message || 'Échec de la génération.');
    } finally {
      setGeneration(false);
    }
  }

  function telecharger() {
    const titreAvant = document.title;
    const cycleLabel = cycles.find((c) => c.key === cycleKey)?.label ?? 'Tous cycles';
    document.title = `Fiches de controle ${cycleLabel} - Semaine ${semaine}`.trim();
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const totalEnseignants = (fiches ?? []).reduce((n, f) => n + f.enseignants.length, 0);
  const champ =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          .fiche-controle-doc, .fiche-controle-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .controle-apercu { width: max-content; margin: 0 auto; }
        .controle-apercu .fiche-controle-page { box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
        .fiche-controle-doc { display: flex; flex-direction: column; gap: 8mm; }
        @media print {
          .controle-apercu { width: auto; margin: 0; }
          .controle-apercu .fiche-controle-page { box-shadow: none; }
          .fiche-controle-doc { display: block; }
        }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Fiches de contrôle</p>
        <p className="text-sm text-gray-400 mb-6">
          Une fiche par créneau de la semaine, avec les enseignants programmés dans l'emploi du temps : présent,
          absent et observation.
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Cycle</label>
              <select
                value={cycleKey}
                onChange={(e) => {
                  setCycleKey(e.target.value);
                  setFiches(null);
                }}
                className={champ}
              >
                <option value="">Tous les cycles</option>
                {cycles.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
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
          <p className="text-xs font-semibold text-gray-500 mb-4">Semaine du {libelleSemaine(semaine)}</p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-gray-500">Lignes libres en plus des enseignants</label>
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
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={creneauxVides}
                onChange={(e) => {
                  setCreneauxVides(e.target.checked);
                  setFiches(null);
                }}
                className="accent-red-600"
              />
              Inclure les créneaux sans cours
            </label>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generer}
              disabled={generation || !semaine}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {generation ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Générer les fiches
            </button>
            {fiches && fiches.length > 0 && (
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
              {fiches.length === 0 ? (
                <p className="text-xs font-semibold text-amber-600">
                  Aucun cours programmé cette semaine pour ce cycle. Coche « Inclure les créneaux sans cours » pour
                  obtenir des fiches vierges.
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                  <Users size={13} /> {fiches.length} fiche(s) (créneaux) — {totalEnseignants} passage(s) d'enseignants
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Dans la fenêtre d'impression, choisis « Enregistrer au format PDF » (A4, portrait, marges : aucune) et
                active « Graphiques d'arrière-plan ».
              </p>
            </div>
          )}
        </div>
      </div>

      {fiches && infos && fiches.length > 0 && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="controle-apercu">
            <FichesControlePdf fiches={fiches} semaine={infos.semaine} lignesSupplementaires={infos.lignes} />
          </div>
        </div>
      )}
    </>
  );
}