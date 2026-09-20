// src/features/repartition/pages/EtatCouverturePage.tsx
import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, ListChecks } from 'lucide-react';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  getEtatCouvertureSpecialite,
  type EtatCouvertureSpecialite,
} from '../api';

function couleurTaux(taux: number | null): string {
  if (taux === null) return 'bg-gray-100 text-gray-400';
  if (taux >= 75) return 'bg-green-50 text-green-600';
  if (taux >= 40) return 'bg-amber-50 text-amber-600';
  return 'bg-red-50 text-red-600';
}

// Écran admin — état de couverture du programme, basé sur le contenu du
// syllabus (points clés définis pour chaque UE/tronc commun) et sur les
// rapports que les enseignants remplissent (heures effectuées, chapitres
// couverts) — PAS sur le support de cours envoyé (ça reste sur l'écran
// "Supports de cours", une notion différente). Une spécialité choisie, un
// semestre choisi -> l'état de chaque cours de la spécialité pour ce
// semestre, plus un taux global pondéré pour l'ensemble.
export default function EtatCouverturePage() {
  const [specialite, setSpecialite] = useState<SpecialiteRecherche | null>(
    null
  );
  const [semestre, setSemestre] = useState('');
  const [etat, setEtat] = useState<EtatCouvertureSpecialite | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const semestresDisponibles = specialite
    ? (SEMESTRES_PAR_TYPE_CURSUS[specialite.typeCursus] ?? [])
    : [];

  function handleSelectionSpecialite(s: SpecialiteRecherche) {
    setSpecialite(s);
    setSemestre('');
    setEtat(null);
  }

  useEffect(() => {
    if (!specialite || !semestre) {
      setEtat(null);
      return;
    }
    let annule = false;
    setChargement(true);
    setErreur(null);
    getEtatCouvertureSpecialite(specialite.id, semestre)
      .then((data) => {
        if (!annule) setEtat(data);
      })
      .catch((err) => {
        if (!annule)
          setErreur(err instanceof Error ? err.message : 'Erreur de chargement.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [specialite, semestre]);

  return (
    <div className="max-w-3xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        État de couverture du programme
      </p>
      <p className="text-sm text-gray-400 mb-6">
        D'après le syllabus (points clés) et les rapports de séance des
        enseignants — pas les supports de cours envoyés.
      </p>

      <div className="mb-4">
        <RechercheSpecialite onSelect={handleSelectionSpecialite} />
      </div>

      {specialite && (
        <div className="bg-white rounded-[20px] p-5 mb-6 flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-gray-400 mb-0.5">
              Spécialité
            </p>
            <p className="text-sm font-bold text-gray-900">
              {specialite.nom} —{' '}
              <span className="text-gray-400 font-semibold">
                {specialite.ecoleNom}
              </span>
            </p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-0.5 block">
              Semestre
            </label>
            <select
              value={semestre}
              onChange={(e) => setSemestre(e.target.value)}
              className="border border-gray-200 rounded-xl px-3.5 py-2 text-sm font-bold text-gray-900 outline-none focus:border-red-600 bg-white"
            >
              <option value="">Sélectionner...</option>
              {semestresDisponibles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!specialite ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Choisis une spécialité pour commencer.
        </div>
      ) : !semestre ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Choisis un semestre.
        </div>
      ) : chargement ? (
        <div className="flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : erreur ? (
        <div className="bg-white rounded-[20px] p-6 text-sm font-semibold text-red-600">
          {erreur}
        </div>
      ) : !etat || etat.lignes.length === 0 ? (
        <div className="bg-white rounded-[20px] p-10 text-center text-sm font-semibold text-gray-300">
          Aucun cours programmé pour cette spécialité sur ce semestre.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 mb-1">
                <TrendingUp size={13} /> Taux global quantitatif
              </p>
              <p className="font-extrabold text-3xl text-gray-900">
                {etat.globalQuantitatif ?? '—'}
                {etat.globalQuantitatif !== null && '%'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Heures effectuées / volume horaire total du semestre
              </p>
            </div>
            <div className="bg-white rounded-[20px] p-5 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-400 mb-1">
                <ListChecks size={13} /> Taux global qualitatif
              </p>
              <p className="font-extrabold text-3xl text-gray-900">
                {etat.globalQualitatif ?? '—'}
                {etat.globalQualitatif !== null && '%'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Chapitres couverts (fini = 100%, partiel = 50%)
              </p>
            </div>
          </div>

          <div className="bg-white rounded-[20px] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                  <th className="px-5 py-3 whitespace-nowrap">Cours</th>
                  <th className="px-5 py-3 whitespace-nowrap">
                    Volume horaire
                  </th>
                  <th className="px-5 py-3 whitespace-nowrap">
                    Couv. quantitative
                  </th>
                  <th className="px-5 py-3 whitespace-nowrap">
                    Couv. qualitative
                  </th>
                </tr>
              </thead>
              <tbody>
                {etat.lignes.map((l) => (
                  <tr
                    key={l.cle}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-5 py-3.5 font-bold text-gray-900">
                      {l.ueNom}
                      {l.troncCommunId && (
                        <span className="ml-2 text-[10px] font-bold text-purple-600 bg-purple-50 rounded-full px-2 py-0.5">
                          Tronc commun
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                      {l.volumeHoraire ?? '—'}
                      {l.volumeHoraire !== null && 'h'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${couleurTaux(l.quantitatif)}`}
                      >
                        {l.quantitatif ?? '—'}
                        {l.quantitatif !== null && '%'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${couleurTaux(l.qualitatif)}`}
                      >
                        {l.qualitatif ?? '—'}
                        {l.qualitatif !== null && '%'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}