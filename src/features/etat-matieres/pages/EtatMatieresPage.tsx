// État des matières : % d'heures réellement effectuées par matière, filtrable
// par seuil, pour plusieurs spécialités ou tout un cycle, avec export PDF.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCyclesDisponibles,
  listSpecialitesDuCycleSemestre,
  type CycleOption,
  type SpecialiteGroupe,
} from '@/features/emploi-du-temps/api';
import { calculerEtatMatieres, filtrerParSeuil, formaterHeures, type EtatMatieres, type ModeSeuil } from '../api';
import EtatMatieresPdf from '../components/EtatMatieresPdf';

const champ = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300';
const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 18, marginBottom: 14 };
const SEMESTRES = Array.from(new Set(Object.values(SEMESTRES_PAR_TYPE_CURSUS).flatMap((l) => l)));

export default function EtatMatieresPage() {
  const user = useAuthStore((s) => s.user);
  const perimetre = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [semestre, setSemestre] = useState('');
  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [seuil, setSeuil] = useState(50);
  const [mode, setMode] = useState<ModeSeuil>('au_moins');
  const [etat, setEtat] = useState<EtatMatieres | null>(null);
  const [parametres, setParametres] = useState<{ libelleCycle: string; semestre: string } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    listCyclesDisponibles(perimetre).then(setCycles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setEtat(null);
    setChoisies(new Set());
    if (!cycleKey || !semestre) { setSpecialites([]); return; }
    const [cycle, sous] = cycleKey.split('::');
    let actif = true;
    listSpecialitesDuCycleSemestre(cycle, sous || null, semestre, perimetre)
      .then((l) => { if (actif) { setSpecialites(l); setChoisies(new Set(l.map((x) => x.id))); } })
      .catch((e) => actif && setErreur(e?.message ?? 'Chargement impossible.'));
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre]);

  async function calculer() {
    setErreur(null);
    setChargement(true);
    try {
      const sel = specialites.filter((s) => choisies.has(s.id));
      setEtat(await calculerEtatMatieres(sel, semestre));
      setParametres({ libelleCycle: cycles.find((c) => c.key === cycleKey)?.label ?? cycleKey, semestre });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Calcul impossible.');
    } finally {
      setChargement(false);
    }
  }

  const lignes = useMemo(() => (etat ? filtrerParSeuil(etat.lignes, seuil, mode) : []), [etat, seuil, mode]);
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? specialites.filter((s) => s.nom.toLowerCase().includes(q)) : specialites;
  }, [specialites, recherche]);

  function basculer(id: string) {
    setChoisies((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setEtat(null);
  }

  function telecharger() {
    const avant = document.title;
    document.title = `Etat des matieres ${parametres?.libelleCycle ?? ''} ${parametres?.semestre ?? ''}`.trim();
    const restaurer = () => { document.title = avant; window.removeEventListener('afterprint', restaurer); };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const parSpec = useMemo(() => {
    const m = new Map<string, typeof lignes>();
    for (const l of lignes) m.set(l.specialiteNom, [...(m.get(l.specialiteNom) ?? []), l]);
    return Array.from(m.entries());
  }, [lignes]);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 0; }
          html, body { background: #fff !important; }
          .rapport-pdf, .rapport-pdf * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .rapport-pdf thead { display: table-header-group; }
        .rapport-pdf tfoot { display: table-footer-group; }
        .pdf-cache { position: absolute; left: -99999px; top: 0; }
        @media print { .pdf-cache { position: static; } }
      `}</style>

      <div className="print:hidden" style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 className="text-xl font-extrabold text-gray-900 mb-1">État des matières</h1>
        <p className="text-sm text-gray-500 mb-4">
          Pourcentage d'avancement de chaque matière : heures réellement effectuées (séances ouvertes) sur le volume horaire de l'UE.
        </p>

        <div style={carte}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Cycle</label>
              <select className={champ} value={cycleKey} onChange={(e) => { setCycleKey(e.target.value); setSemestre(''); }}>
                <option value="">Cycle...</option>
                {cycles.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Semestre</label>
              <select className={champ} value={semestre} disabled={!cycleKey} onChange={(e) => setSemestre(e.target.value)}>
                <option value="">Semestre...</option>
                {SEMESTRES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {specialites.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <p className="text-xs font-bold text-gray-500">
                  Spécialités ({choisies.size}/{specialites.length}) — {choisies.size === specialites.length ? 'tout le cycle' : 'sélection'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="text-xs font-bold text-red-600" onClick={() => { setChoisies(new Set(specialites.map((s) => s.id))); setEtat(null); }}>Tout le cycle</button>
                  <button type="button" className="text-xs font-bold text-gray-400" onClick={() => { setChoisies(new Set()); setEtat(null); }}>Aucune</button>
                </div>
              </div>
              {specialites.length > 8 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 999, padding: '8px 14px', marginBottom: 8 }}>
                  <Search size={14} color="#9ca3af" />
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Filtrer les spécialités…" style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, width: '100%' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {visibles.map((s) => {
                  const actif = choisies.has(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => basculer(s.id)}
                      style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, background: actif ? '#dc2626' : '#f3f4f6', color: actif ? '#fff' : '#374151' }}>
                      {s.nom}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Matières ayant</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['au_moins', 'au moins'], ['moins_de', 'moins de']] as const).map(([m, l]) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 800, background: mode === m ? '#dc2626' : '#f3f4f6', color: mode === m ? '#fff' : '#374151' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">% des heures effectuées</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" min={0} max={200} value={seuil} onChange={(e) => setSeuil(Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: 90, border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 14, fontWeight: 700 }} />
                <span style={{ fontWeight: 800, color: '#6b7280' }}>%</span>
              </div>
            </div>
            <button type="button" onClick={calculer} disabled={chargement || choisies.size === 0 || !semestre}
              style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '11px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', gap: 8, alignItems: 'center', opacity: chargement || choisies.size === 0 || !semestre ? 0.5 : 1 }}>
              {chargement && <Loader2 size={15} className="animate-spin" />} Afficher
            </button>
          </div>
        </div>

        {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}

        {etat && (
          <div style={carte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <p className="text-sm font-extrabold text-gray-900">
                {lignes.length} matière(s) {mode === 'au_moins' ? 'à' : 'sous'} {seuil} %{mode === 'au_moins' ? ' ou plus' : ''} · {parSpec.length} spécialité(s)
              </p>
              <button type="button" onClick={telecharger} disabled={lignes.length === 0}
                style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #dc2626', borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center', opacity: lignes.length === 0 ? 0.4 : 1 }}>
                <Download size={14} /> Télécharger le PDF
              </button>
            </div>
            {etat.sansVolume > 0 && (
              <p style={{ fontSize: 12, color: '#d97706', fontWeight: 700, marginBottom: 10 }}>
                {etat.sansVolume} matière(s) ignorée(s) : volume horaire non renseigné.
              </p>
            )}
            {lignes.length === 0 && <p className="text-sm text-gray-400">Aucune matière ne correspond à ce critère.</p>}
            {parSpec.map(([nom, ls]) => (
              <div key={nom} style={{ marginBottom: 14 }}>
                <p style={{ fontWeight: 800, fontSize: 13, color: '#111827', margin: '6px 0' }}>{nom}</p>
                {ls.map((l) => (
                  <div key={l.offreId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{l.ueNom}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af' }}>{l.enseignantNom ?? 'Enseignant non attribué'}{l.enseignantWhatsapp ? ` · ${l.enseignantWhatsapp}` : ''}{l.troncCommunNom ? ' · tronc commun' : ''}</p>
                    </div>
                    <div style={{ width: 110, height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: `${Math.min(100, l.pourcentage)}%`, height: '100%', background: l.pourcentage >= 100 ? '#16a34a' : '#dc2626' }} />
                    </div>
                    <p style={{ width: 120, textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#374151', flexShrink: 0 }}>
                      {formaterHeures(l.heuresEffectuees)}/{formaterHeures(l.volumeHoraire)} h · {String(l.pourcentage).replace('.', ',')} %
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {etat && parametres && (
        <div className="pdf-cache">
          <EtatMatieresPdf lignes={lignes} libelleCycle={parametres.libelleCycle} semestre={parametres.semestre} seuil={seuil} mode={mode}
            genereLe={new Date().toISOString()} />
        </div>
      )}
    </>
  );
}