// src/features/fiches-presence/pages/ConsulterPresencesPage.tsx
//
// Présences lues depuis les fiches : grille de la semaine par étudiant,
// total de la semaine et taux cumulé sur le semestre.
import { creneauxFiables } from '../creneauxFiables';
import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { JOURS, niveauDeSemestre } from '@/constants/enums';
import { listEtudiants, type Etudiant } from '@/features/referentiel/etudiants/api';
import SelecteurGroupe, { lundiCourant, type ChoixGroupe } from '../components/SelecteurGroupe';
import RapportPresencePdf from '../components/RapportPresencePdf';
import { libelleSemaine } from '../components/FichesPresencePdf';
import { listPresences, type PresenceEnregistree } from '../lectureApi';

export default function ConsulterPresencesPage() {
  const jours = JOURS as string[];
  const creneaux = creneauxFiables();
  const [choix, setChoix] = useState<ChoixGroupe>({
    cycleKey: '',
    semestre: '',
    specialiteId: '',
    semaine: lundiCourant(),
  });
  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [presences, setPresences] = useState<PresenceEnregistree[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setErreur(null);
    if (!choix.specialiteId || !choix.semestre) {
      setEtudiants([]);
      setPresences([]);
      return;
    }
    setChargement(true);
    Promise.all([
      listEtudiants(choix.specialiteId, choix.semestre),
      listPresences(choix.specialiteId, choix.semestre),
    ])
      .then(([e, p]) => {
        setEtudiants(e);
        setPresences(p);
      })
      .catch((e) => setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => setChargement(false));
  }, [choix.specialiteId, choix.semestre]);

  const { semaineMap, cumul, semainesLues } = useMemo(() => {
    const semaineMap = new Map<string, boolean>(); // etu|jour|creneau
    const cumul = new Map<string, { p: number; t: number }>();
    const semaines = new Set<string>();
    for (const p of presences) {
      semaines.add(p.semaine);
      const c = cumul.get(p.etudiant_id) ?? { p: 0, t: 0 };
      c.t += 1;
      if (p.present) c.p += 1;
      cumul.set(p.etudiant_id, c);
      if (p.semaine === choix.semaine) semaineMap.set(`${p.etudiant_id}|${p.jour}|${p.creneau}`, p.present);
    }
    return { semaineMap, cumul, semainesLues: semaines };
  }, [presences, choix.semaine]);

  const semaineEnregistree = semainesLues.has(choix.semaine);

  const niveauNumero = (niveauDeSemestre('standard', choix.semestre) ?? '').replace(/[^0-9]/g, '');
  const cycleNom = choix.cycleKey.split('::')[0];
  const niveauLabel = cycleNom && niveauNumero ? `${cycleNom.toUpperCase()} ${niveauNumero}` : null;

  function telechargerPdf() {
    const titreAvant = document.title;
    document.title = `Presence ${niveauLabel ?? ''} ${choix.specialiteNom ?? ''} - Semaine ${choix.semaine}`.replace(/\s+/g, ' ').trim();
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const valeursSemaine = useMemo(() => {
    const m = new Map<string, boolean>();
    semaineMap.forEach((v, k) => m.set(k, v));
    return m;
  }, [semaineMap]);

  return (
    <>
    <style>{`
      @media print {
        @page { size: A4 landscape; margin: 0; }
        html, body { background: #fff !important; }
        .rapport-presence-doc, .rapport-presence-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rapport-presence-doc { display: block; }
      }
      .rapport-presence-doc { display: flex; flex-direction: column; gap: 8mm; }
    `}</style>
    <div className="max-w-6xl mx-auto print:hidden">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Présences des étudiants</p>
      <p className="text-sm text-gray-400 mb-6">
        Présences lues depuis les fiches de présence, par semaine et par étudiant.
      </p>

      <div className="bg-white rounded-[20px] p-5 mb-4">
        <SelecteurGroupe valeur={choix} onChange={setChoix} />
        {semaineEnregistree && etudiants.length > 0 && (
          <button
            type="button"
            onClick={telechargerPdf}
            className="mt-4 inline-flex items-center gap-2 bg-red-600 text-white font-bold text-sm px-5 py-2.5 rounded-full"
          >
            <Download size={16} />
            Télécharger le PDF — semaine du {libelleSemaine(choix.semaine)}
          </button>
        )}
      </div>

      {erreur && <p className="bg-red-50 text-red-700 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{erreur}</p>}
      {chargement && <Loader2 className="animate-spin text-red-600 mx-auto" />}

      {!chargement && choix.specialiteId && choix.semestre && (
        <div className="bg-white rounded-[20px] p-5">
          {!semaineEnregistree && (
            <p className="bg-amber-50 text-amber-800 text-sm font-semibold rounded-xl px-4 py-3 mb-4">
              Aucune fiche enregistrée pour cette semaine.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-500">
                  <th rowSpan={2} className="text-left p-1.5">Matricule</th>
                  <th rowSpan={2} className="text-left p-1.5 min-w-[180px]">Nom</th>
                  {jours.map((j) => (
                    <th key={j} colSpan={creneaux.length} className="text-center p-1 border-l border-gray-100">{j.slice(0, 3)}</th>
                  ))}
                  <th rowSpan={2} className="p-1.5 border-l border-gray-100">Semaine</th>
                  <th rowSpan={2} className="p-1.5">Cumul</th>
                </tr>
                <tr className="text-gray-400">
                  {jours.flatMap((j) =>
                    creneaux.map((c, ci) => (
                      <th key={`${j}-${c}`} className={`p-0.5 font-medium text-[10px] ${ci === 0 ? 'border-l border-gray-100' : ''}`}>
                        {c.slice(0, 2)}h
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {etudiants.map((e) => {
                  let p = 0;
                  let t = 0;
                  const cellules = jours.flatMap((j) =>
                    creneaux.map((c, ci) => {
                      const v = semaineMap.get(`${e.id}|${j}|${c}`);
                      if (v !== undefined) {
                        t++;
                        if (v) p++;
                      }
                      return (
                        <td key={`${j}-${c}`} className={`p-0.5 text-center ${ci === 0 ? 'border-l border-gray-100' : ''}`}>
                          <span
                            className={`inline-block w-6 h-6 leading-6 rounded-md font-extrabold text-[11px] ${
                              v === undefined
                                ? 'text-gray-200'
                                : v
                                  ? 'bg-green-600 text-white'
                                  : 'bg-red-100 text-red-500'
                            }`}
                          >
                            {v === undefined ? '·' : v ? 'P' : 'A'}
                          </span>
                        </td>
                      );
                    })
                  );
                  const c = cumul.get(e.id);
                  return (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="p-1.5 font-semibold text-gray-500">{e.matricule}</td>
                      <td className="p-1.5 font-semibold text-gray-900">{e.nom_complet}</td>
                      {cellules}
                      <td className="p-1.5 text-center font-bold border-l border-gray-100">{t ? `${p}/${t}` : '—'}</td>
                      <td className="p-1.5 text-center font-bold">
                        {c && c.t ? `${Math.round((c.p / c.t) * 100)} %` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">P = présent · A = absent · · = pas de donnée. Le cumul porte sur toutes les semaines enregistrées du semestre.</p>
        </div>
      )}
    </div>

    {semaineEnregistree && etudiants.length > 0 && (
      <div className="hidden print:block">
        <RapportPresencePdf
          specialiteNom={choix.specialiteNom ?? ''}
          niveauLabel={niveauLabel}
          semestre={choix.semestre}
          semaine={choix.semaine}
          jours={jours}
          creneaux={creneaux}
          etudiants={etudiants.map((e) => ({ id: e.id, matricule: e.matricule, nom: e.nom_complet }))}
          valeurs={valeursSemaine}
        />
      </div>
    )}
    </>
  );
}