// src/features/fiches-presence/pages/ConseilDisciplinePage.tsx
//
// Conseil de discipline : pour une semaine donnée, liste des étudiants dont
// les heures d'absence dépassent un seuil (par spécialités et niveaux
// choisis), puis impression de la liste et des convocations individuelles.
import { useEffect, useMemo, useState } from 'react';
import { FileText, Gavel, Loader2, Printer } from 'lucide-react';
import { lundiCourant } from '../components/SelecteurGroupe';
import { libelleSemaine } from '../components/FichesPresencePdf';
import { ConvocationsPdf, ListeConvoquesPdf } from '../components/ConvocationsPdf';
import { chargerDonnees, decalerSemaine, listerClasses, lundiDe, type DonneesBrutes } from '../rapportGlobalApi';
import { calculerConvocations, formatHeures, niveauDe, type InfosConseil } from '../convocationApi';

const champ = 'block mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 bg-white';

export default function ConseilDisciplinePage() {
  const [semaine, setSemaine] = useState(lundiCourant());
  const [seuil, setSeuil] = useState(10);
  const [donnees, setDonnees] = useState<DonneesBrutes | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [specsExclues, setSpecsExclues] = useState<Set<string>>(new Set());
  const [niveauxExclus, setNiveauxExclus] = useState<Set<string>>(new Set());
  const [etuExclus, setEtuExclus] = useState<Set<string>>(new Set());
  const [impression, setImpression] = useState<null | 'liste' | 'convocations'>(null);
  const [infos, setInfos] = useState<InfosConseil>({
    dateConseil: '',
    heure: '09:00',
    lieu: '',
    motif: 'Absences répétées',
    reference: '',
    note: '',
    signataireFonction: 'La Direction',
    signataireNom: '',
  });
  const maj = (k: keyof InfosConseil, v: string) => setInfos((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    chargerDonnees([semaine])
      .then((d) => !annule && setDonnees(d))
      .catch((e) => !annule && setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [semaine]);

  const classes = useMemo(() => (donnees ? listerClasses(donnees) : []), [donnees]);
  const niveaux = useMemo(() => Array.from(new Set(classes.map((c) => niveauDe(c.semestre)))).sort(), [classes]);
  const specialites = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; cycle: string }>();
    for (const c of classes) {
      const id = c.cle.split('|')[0];
      if (!m.has(id)) m.set(id, { id, nom: c.specialite, cycle: c.cycle });
    }
    return Array.from(m.values());
  }, [classes]);
  const cycles = useMemo(() => Array.from(new Set(specialites.map((s) => s.cycle))), [specialites]);

  const retenues = useMemo(
    () =>
      new Set(
        classes
          .filter((c) => !specsExclues.has(c.cle.split('|')[0]) && !niveauxExclus.has(niveauDe(c.semestre)))
          .map((c) => c.cle)
      ),
    [classes, specsExclues, niveauxExclus]
  );
  const candidats = useMemo(
    () => (donnees ? calculerConvocations(donnees, semaine, Math.max(0, seuil), retenues) : []),
    [donnees, semaine, seuil, retenues]
  );
  const convoques = useMemo(() => candidats.filter((e) => !etuExclus.has(e.id)), [candidats, etuExclus]);

  const basculer = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  function lancer(mode: 'liste' | 'convocations') {
    setImpression(mode);
  }
  useEffect(() => {
    if (!impression) return;
    const avant = document.title;
    document.title = `${impression === 'liste' ? 'Liste convoques' : 'Convocations'} conseil de discipline - ${semaine}`;
    const fin = () => {
      document.title = avant;
      setImpression(null);
      window.removeEventListener('afterprint', fin);
    };
    window.addEventListener('afterprint', fin);
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [impression, semaine]);

  const pret = convoques.length > 0 && !!infos.dateConseil && !!infos.lieu.trim();

  return (
    <>
      <style>{`
        @media print { @page { size: A4 portrait; margin: 15mm; } html, body { background: #fff !important; } .cv-ui { display: none !important; } .cv-pdf { position: static !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .cv-pdf { position: absolute; left: -99999px; top: 0; }
      `}</style>
      <div className="cv-ui max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Gavel className="text-red-600" size={26} />
          <p className="font-extrabold text-2xl text-gray-900">Conseil de discipline</p>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Pour une semaine donnée, repérez les étudiants dont les heures d’absence dépassent un seuil, puis imprimez la liste et les convocations.
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <p className="font-extrabold text-sm text-gray-900 mb-3">1. Semaine et seuil</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-bold text-gray-500">
              Semaine (lundi)
              <input type="date" value={semaine} onChange={(e) => e.target.value && setSemaine(lundiDe(e.target.value))} className={champ} />
              <span className="font-medium text-gray-400">Du {libelleSemaine(semaine)}</span>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSemaine(decalerSemaine(semaine, -1))} className="border border-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-full">
                ← Précédente
              </button>
              <button type="button" onClick={() => setSemaine(decalerSemaine(semaine, 1))} className="border border-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-full">
                Suivante →
              </button>
            </div>
            <label className="text-xs font-bold text-gray-500">
              Convoquer au-delà de (heures d’absence)
              <input type="number" min={0} step={0.5} value={seuil} onChange={(e) => setSeuil(Number(e.target.value) || 0)} className={`${champ} w-28`} />
              <span className="font-medium text-gray-400">« plus de {seuil} h » : strictement supérieur</span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <p className="font-extrabold text-sm text-gray-900 mb-1">2. Niveaux et spécialités concernés</p>
          <p className="text-xs text-gray-400 mb-3">Décochez ce qu’il ne faut pas inclure. Seules les spécialités qui ont des étudiants sont proposées.</p>
          {chargement && <Loader2 className="animate-spin text-red-600 my-2" />}
          {donnees && !chargement && (
            <p className="text-xs font-semibold text-gray-500 mb-3">
              Données lues : {donnees.etudiants.length} étudiant{donnees.etudiants.length > 1 ? 's' : ''} en base, {classes.length} classe
              {classes.length > 1 ? 's' : ''}, {donnees.presences.length} case{donnees.presences.length > 1 ? 's' : ''} de présence enregistrée
              {donnees.presences.length > 1 ? 's' : ''} pour la semaine du {libelleSemaine(semaine)}.
            </p>
          )}
          {donnees && !chargement && donnees.presences.length === 0 && (
            <p className="bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl px-3 py-2 mb-3">
              Aucune présence n’est enregistrée pour cette semaine : choisissez une autre semaine avec les boutons « Précédente / Suivante ».
            </p>
          )}
          {niveaux.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">Niveaux</p>
              <div className="flex flex-wrap gap-2">
                {niveaux.map((n) => {
                  const coche = !niveauxExclus.has(n);
                  return (
                    <label key={n} className={`inline-flex items-center gap-2 text-xs font-semibold rounded-full px-3 py-1.5 border cursor-pointer ${coche ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-400'}`}>
                      <input type="checkbox" checked={coche} onChange={() => setNiveauxExclus(basculer(niveauxExclus, n))} className="accent-red-600" />
                      {n}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {cycles.map((cycle) => (
            <div key={cycle} className="mb-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">Cycle {cycle}</p>
              <div className="flex flex-wrap gap-2">
                {specialites
                  .filter((s) => s.cycle === cycle)
                  .map((s) => {
                    const coche = !specsExclues.has(s.id);
                    return (
                      <label key={s.id} className={`inline-flex items-center gap-2 text-xs font-semibold rounded-full px-3 py-1.5 border cursor-pointer ${coche ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-400'}`}>
                        <input type="checkbox" checked={coche} onChange={() => setSpecsExclues(basculer(specsExclues, s.id))} className="accent-red-600" />
                        {s.nom}
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}
          {specialites.length > 0 && (
            <div className="flex gap-4 mt-2">
              <button type="button" onClick={() => setSpecsExclues(new Set())} className="text-xs font-bold text-red-600 underline">
                Tout cocher
              </button>
              <button type="button" onClick={() => setSpecsExclues(new Set(specialites.map((s) => s.id)))} className="text-xs font-bold text-gray-500 underline">
                Tout décocher
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <p className="font-extrabold text-sm text-gray-900 mb-3">3. Informations du conseil</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-bold text-gray-500">
              Jour du conseil
              <input type="date" value={infos.dateConseil} onChange={(e) => maj('dateConseil', e.target.value)} className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Heure
              <input type="time" value={infos.heure} onChange={(e) => maj('heure', e.target.value)} className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Lieu
              <input type="text" value={infos.lieu} onChange={(e) => maj('lieu', e.target.value)} placeholder="ex. Salle de conférence, bloc A" className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Motif
              <input type="text" value={infos.motif} onChange={(e) => maj('motif', e.target.value)} className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Référence (facultatif)
              <input type="text" value={infos.reference} onChange={(e) => maj('reference', e.target.value)} placeholder="ex. N° 012/CD/2026" className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Fonction du signataire
              <input type="text" value={infos.signataireFonction} onChange={(e) => maj('signataireFonction', e.target.value)} className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Nom du signataire (facultatif)
              <input type="text" value={infos.signataireNom} onChange={(e) => maj('signataireNom', e.target.value)} className={`${champ} w-full`} />
            </label>
            <label className="text-xs font-bold text-gray-500">
              Note complémentaire (facultatif)
              <input type="text" value={infos.note} onChange={(e) => maj('note', e.target.value)} className={`${champ} w-full`} />
            </label>
          </div>
        </div>

        {erreur && <p className="bg-red-50 text-red-700 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{erreur}</p>}

        <div className="bg-white rounded-[20px] p-5 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="font-extrabold text-sm text-gray-900">4. Étudiants à convoquer</p>
              <p className="text-xs text-gray-400">
                {convoques.length} convoqué{convoques.length > 1 ? 's' : ''} sur {candidats.length} au-dessus de {seuil} h. Décochez un étudiant pour l’exclure.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!pret} onClick={() => lancer('liste')} className="inline-flex items-center gap-2 border border-gray-300 text-gray-800 font-bold text-sm px-4 py-2.5 rounded-full disabled:opacity-40">
                <FileText size={16} /> Liste (PDF)
              </button>
              <button type="button" disabled={!pret} onClick={() => lancer('convocations')} className="inline-flex items-center gap-2 bg-red-600 text-white font-bold text-sm px-4 py-2.5 rounded-full disabled:opacity-40">
                <Printer size={16} /> Convocations (PDF)
              </button>
            </div>
          </div>
          {!pret && candidats.length > 0 && <p className="text-xs font-semibold text-amber-700 mb-2">Renseignez au moins le jour et le lieu du conseil pour imprimer.</p>}
          {!chargement && donnees && donnees.presences.length > 0 && candidats.length === 0 && (
            <p className="text-sm text-gray-500">Aucun étudiant ne dépasse {seuil} h d’absence cette semaine pour les spécialités et niveaux choisis.</p>
          )}
          {candidats.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <th className="py-2 pr-2 w-8"> </th>
                    <th className="py-2 pr-2">Étudiant</th>
                    <th className="py-2 pr-2">Spécialité</th>
                    <th className="py-2 pr-2">Niveau</th>
                    <th className="py-2 pr-2 text-right">Heures d’absence</th>
                    <th className="py-2 text-right">Créneaux manqués</th>
                  </tr>
                </thead>
                <tbody>
                  {candidats.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={!etuExclus.has(e.id)} onChange={() => setEtuExclus(basculer(etuExclus, e.id))} className="accent-red-600" />
                      </td>
                      <td className="py-2 pr-2 font-bold text-gray-900">
                        {e.nom}
                      </td>
                      <td className="py-2 pr-2 text-gray-700">
                        {e.specialite} <span className="text-xs text-gray-400">({e.cycle})</span>
                      </td>
                      <td className="py-2 pr-2 text-gray-700">{e.niveau}</td>
                      <td className="py-2 pr-2 text-right font-extrabold text-red-600">{formatHeures(e.heures)}</td>
                      <td className="py-2 text-right text-gray-600">
                        {e.absences} sur {e.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {impression && (
        <div className="cv-pdf">
          {impression === 'liste' ? (
            <ListeConvoquesPdf convoques={convoques} semaine={semaine} seuilHeures={seuil} infos={infos} />
          ) : (
            <ConvocationsPdf convoques={convoques} semaine={semaine} seuilHeures={seuil} infos={infos} />
          )}
        </div>
      )}
    </>
  );
}