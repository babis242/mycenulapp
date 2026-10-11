// src/features/disponibilites/pages/DisponibilitesPdfPage.tsx
//
// PDF des disponibilités : on choisit un cycle, on coche les spécialités,
// et le document donne, pour chaque enseignant concerné, les créneaux
// qu'il a cochés dans sa campagne de disponibilités. Impression du
// navigateur (« Enregistrer au format PDF »), A4 paysage.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { JOURS, tousLesCreneaux } from '@/constants/enums';
import {
  listCyclesDisponibles,
  type CycleOption,
} from '@/features/emploi-du-temps/api';
import DisponibilitesParSpecialitePdf from '../components/DisponibilitesParSpecialitePdf';
import {
  listSpecialitesDuCycle,
  getDisponibilitesParSpecialites,
  type SpecialiteDuCycle,
  type LigneDisponibilitesEnseignant,
} from '../api';

function formaterDateHeure(d: Date): string {
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  });
}

const cellule: React.CSSProperties = {
  border: '1px solid #000',
  padding: '1.3mm 1.5mm',
  fontSize: '9.5px',
  verticalAlign: 'middle',
};

export default function DisponibilitesPdfPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const perimetreIds =
    user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [specialites, setSpecialites] = useState<SpecialiteDuCycle[]>([]);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [chargementSpecs, setChargementSpecs] = useState(false);

  const [mode, setMode] = useState<'enseignant' | 'specialite'>('specialite');
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneDisponibilitesEnseignant[] | null>(null);
  const [documentInfos, setDocumentInfos] = useState<{
    cycleLabel: string;
    specialites: string[];
    specialitesChoisies: SpecialiteDuCycle[];
    genereLe: Date;
  } | null>(null);

  useEffect(() => {
    listCyclesDisponibles(perimetreIds).then(setCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLignes(null);
    setCochees(new Set());
    if (!cycleKey) {
      setSpecialites([]);
      return;
    }
    const [cycle, sousCycle] = cycleKey.split('::');
    setChargementSpecs(true);
    listSpecialitesDuCycle(cycle, sousCycle || null, perimetreIds)
      .then(setSpecialites)
      .finally(() => setChargementSpecs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey]);

  function basculer(id: string) {
    setLignes(null);
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
      setErreur('Une connexion Internet est nécessaire pour générer le PDF.');
      return;
    }
    setGeneration(true);
    setLignes(null);
    try {
      const donnees = await getDisponibilitesParSpecialites(Array.from(cochees));
      setLignes(donnees);
      setDocumentInfos({
        cycleLabel: cycles.find((c) => c.key === cycleKey)?.label ?? '',
        specialites: specialites.filter((s) => cochees.has(s.id)).map((s) => s.nom),
        specialitesChoisies: specialites.filter((s) => cochees.has(s.id)),
        genereLe: new Date(),
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la génération.');
    } finally {
      setGeneration(false);
    }
  }

  function telecharger() {
    const titreAvant = document.title;
    document.title = `Disponibilites ${mode === 'specialite' ? 'par specialite' : 'par enseignant'} ${documentInfos?.cycleLabel ?? ''}`.trim();
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const creneaux = tousLesCreneaux();
  const nbCases = JOURS.length * creneaux.length;
  const champ =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: ${mode === 'specialite' ? '0' : '8mm 0'}; }
          html, body { background: #fff !important; }
          .dispo-pdf, .dispo-pdf * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .dispo-pdf thead { display: table-header-group; }
        .dispo-pdf tr { break-inside: avoid; page-break-inside: avoid; }
        .dispo-apercu { box-shadow: 0 2px 14px rgba(0,0,0,0.15); background: #fff; width: max-content; margin: 0 auto; }
        @media print { .dispo-apercu { box-shadow: none; margin: 0; width: auto; } }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/disponibilites/etat')}
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} /> Retour à l'état des disponibilités
        </button>
        <p className="font-extrabold text-2xl text-gray-900 mb-1">
          PDF des disponibilités
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Choisis un cycle et coche les spécialités : le PDF donne, pour chaque
          enseignant concerné, les disponibilités qu'il a choisies.
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <select
            value={cycleKey}
            onChange={(e) => setCycleKey(e.target.value)}
            className={champ + ' mb-3'}
          >
            <option value="">Cycle...</option>
            {cycles.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          {cycleKey && (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  Spécialités — coche celles concernées
                </p>
                {specialites.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLignes(null);
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
                <p className="text-sm text-gray-400 px-1">Aucune spécialité pour ce cycle.</p>
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
                        className="shrink-0"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            {([
              ['specialite', 'Par spécialité', 'Une page par spécialité : grille Jour × Créneau, chaque enseignant dans sa couleur'],
              ['enseignant', 'Par enseignant', 'Un tableau : une ligne par enseignant avec ses disponibilités'],
            ] as const).map(([id, titre, desc]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`text-left rounded-2xl p-3.5 border-2 transition-colors ${
                  mode === id ? 'border-red-600 bg-red-50/40' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="font-extrabold text-sm text-gray-900">{titre}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-4">
            <button
              onClick={generer}
              disabled={generation || cochees.size === 0}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {generation ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FileText size={15} />
              )}
              Générer
            </button>
            {lignes && (
              <button
                onClick={telecharger}
                className="flex items-center gap-2 bg-gray-900 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-black"
              >
                <Download size={15} /> Télécharger le PDF
              </button>
            )}
          </div>
          {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
          {lignes && (
            <p className="text-xs text-gray-400 mt-3">
              {lignes.length} enseignant(s). Dans la fenêtre d'impression, choisis
              « Enregistrer au format PDF » (orientation paysage) et active
              « Graphiques d'arrière-plan ».
            </p>
          )}
        </div>
      </div>

      {lignes && documentInfos && mode === 'specialite' && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="dispo-apercu" style={{ background: '#e5e7eb' }}>
            <DisponibilitesParSpecialitePdf
              lignes={lignes}
              specialites={documentInfos.specialitesChoisies}
              cycleLabel={documentInfos.cycleLabel}
              genereLe={documentInfos.genereLe}
            />
          </div>
        </div>
      )}

      {lignes && documentInfos && mode === 'enseignant' && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="dispo-apercu">
            <div
              className="dispo-pdf"
              style={{
                width: '297mm',
                boxSizing: 'border-box',
                padding: '8mm',
                background: '#fff',
                color: '#000',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3mm' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, lineHeight: 1.5 }}>
                  CENTRE UNIVERSITAIRE LA PERLE (CENULAPE)
                  <br />
                  SERVICE DE LA SCOLARITÉ
                </div>
                <img src="/logo-cenulape.png" alt="" style={{ height: '17mm' }} />
                <div style={{ fontSize: '10px', textAlign: 'right', lineHeight: 1.5 }}>
                  THE PEARL UNIVERSITY CENTER
                  <br />
                  Généré le {formaterDateHeure(documentInfos.genereLe)}
                </div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>
                  DISPONIBILITÉS DES ENSEIGNANTS — {documentInfos.cycleLabel}
                </div>
                <div style={{ fontSize: '9.5px', marginTop: '1mm' }}>
                  {documentInfos.specialites.join(' · ')}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...cellule, width: '7mm', background: '#f1f1f1' }} rowSpan={2}>N°</th>
                    <th style={{ ...cellule, width: '58mm', background: '#f1f1f1', textAlign: 'left' }} rowSpan={2}>
                      Enseignant
                    </th>
                    {JOURS.map((j) => (
                      <th key={j} colSpan={creneaux.length} style={{ ...cellule, background: '#f1f1f1' }}>
                        {j}
                      </th>
                    ))}
                    <th style={{ ...cellule, width: '11mm', background: '#f1f1f1' }} rowSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr>
                    {JOURS.flatMap((j) =>
                      creneaux.map((c) => (
                        <th key={`${j}-${c}`} style={{ ...cellule, background: '#f1f1f1', fontSize: '8px', padding: '0.8mm' }}>
                          {c}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={3 + nbCases} style={{ ...cellule, textAlign: 'center', padding: '8mm' }}>
                        Aucun enseignant attribué aux spécialités sélectionnées.
                      </td>
                    </tr>
                  )}
                  {lignes.map((l, i) => (
                    <tr key={l.enseignantId}>
                      <td style={{ ...cellule, textAlign: 'center' }}>{i + 1}</td>
                      <td style={cellule}>
                        <b>{l.nom}</b>
                        <div style={{ fontSize: '7.5px', color: '#444' }}>
                          {l.matricule} · {l.specialites.join(', ')}
                        </div>
                      </td>
                      {l.aRepondu ? (
                        JOURS.flatMap((j) =>
                          creneaux.map((c) => {
                            const ok = l.cases.has(`${j}|${c}`);
                            return (
                              <td
                                key={`${j}-${c}`}
                                style={{
                                  ...cellule,
                                  textAlign: 'center',
                                  background: ok ? '#bbf7d0' : '#fff',
                                  fontWeight: 800,
                                  padding: '0.8mm',
                                }}
                              >
                                {ok ? '✓' : ''}
                              </td>
                            );
                          })
                        )
                      ) : (
                        <td
                          colSpan={nbCases}
                          style={{ ...cellule, textAlign: 'center', background: '#fee2e2', fontStyle: 'italic' }}
                        >
                          N'a pas renseigné ses disponibilités
                        </td>
                      )}
                      <td style={{ ...cellule, textAlign: 'center', fontWeight: 700 }}>
                        {l.aRepondu ? l.cases.size : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}