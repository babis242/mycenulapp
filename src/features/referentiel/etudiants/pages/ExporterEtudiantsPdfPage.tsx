// src/features/referentiel/etudiants/pages/ExporterEtudiantsPdfPage.tsx
//
// Export PDF des listes d'étudiants : on coche les spécialités (et semestres) voulus ; chaque
// classe devient une section du PDF.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { niveauDeSemestre } from '@/constants/enums';
import { ListeEtudiantsPdf, type ClassePdf } from '../components/ListeEtudiantsPdf';

interface Spec { id: string; nom: string; cycle: string }
interface Etu { specialite_id: string; semestre: string; matricule: string; nom_complet: string; inscrit?: boolean }

const ORDRE_CYCLES = ['BTS', 'HND', 'Licence', 'Bachelor', 'Master', 'Formation courte'];
const rangCycle = (c: string) => {
  const i = ORDRE_CYCLES.findIndex((x) => x.toLowerCase() === c.trim().toLowerCase());
  return i === -1 ? ORDRE_CYCLES.length : i;
};
const numSem = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;

async function lireTout<T>(requete: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await requete(d, d + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

function anneeCourante(): string {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, marginBottom: 16 };

export default function ExporterEtudiantsPdfPage() {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [etudiants, setEtudiants] = useState<Etu[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set()); // clés « specialiteId|semestre »
  const [recherche, setRecherche] = useState('');
  const [avecMatricule, setAvecMatricule] = useState(true);
  const [uneParPage, setUneParPage] = useState(true);
  const [annee, setAnnee] = useState(anneeCourante());
  const [impression, setImpression] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sp = await lireTout<Spec>((a, b) => supabase.from('specialites').select('id, nom, cycle').order('nom').range(a, b));
        const lire = (cols: string) =>
          lireTout<Etu>((a, b) => supabase.from('etudiants').select(cols).order('id').range(a, b));
        const base = 'specialite_id, semestre, matricule, nom_complet';
        let et: Etu[];
        try { et = await lire(`${base}, inscrit`); }
        catch (e: any) {
          // Colonne « inscrit » pas encore créée (sql/etudiants_inscription.sql).
          if (!/inscrit/i.test(e?.message ?? '')) throw e;
          et = await lire(base);
        }
        setSpecs(sp); setEtudiants(et);
      } catch (e: any) { setErreur(e?.message ?? 'Chargement impossible.'); }
      finally { setChargement(false); }
    })();
  }, []);

  // Classes (spécialité + semestre) qui ont au moins un étudiant, regroupées par cycle.
  const classes = useMemo(() => {
    const specParId = new Map(specs.map((s) => [s.id, s]));
    const m = new Map<string, { cle: string; spec: Spec; semestre: string; n: number }>();
    for (const e of etudiants) {
      const spec = specParId.get(e.specialite_id);
      if (!spec || !e.semestre) continue;
      const cle = `${e.specialite_id}|${e.semestre}`;
      const c = m.get(cle) ?? { cle, spec, semestre: e.semestre, n: 0 };
      c.n++; m.set(cle, c);
    }
    return Array.from(m.values()).sort((a, b) =>
      rangCycle(a.spec.cycle ?? '') - rangCycle(b.spec.cycle ?? '') ||
      (a.spec.cycle ?? '').localeCompare(b.spec.cycle ?? '', 'fr') ||
      a.spec.nom.localeCompare(b.spec.nom, 'fr') ||
      numSem(a.semestre) - numSem(b.semestre));
  }, [specs, etudiants]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? classes.filter((c) => `${c.spec.nom} ${c.spec.cycle} ${c.semestre}`.toLowerCase().includes(q)) : classes;
  }, [classes, recherche]);

  const parCycle = useMemo(() => {
    const g = new Map<string, typeof visibles>();
    for (const c of visibles) {
      const k = (c.spec.cycle ?? '').trim() || 'Autre';
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return Array.from(g.entries());
  }, [visibles]);


  const pdfClasses: ClassePdf[] = useMemo(() => {
    return classes
      .filter((c) => selection.has(c.cle))
      .map((c) => ({
        cle: c.cle,
        specialite: c.spec.nom,
        cycle: (c.spec.cycle ?? '').trim(),
        semestre: c.semestre,
        niveau: niveauDeSemestre('standard', c.semestre) ?? '',
        etudiants: etudiants
          .filter((e) => `${e.specialite_id}|${e.semestre}` === c.cle)
          .sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'))
          .map((e) => ({ matricule: e.matricule, nom_complet: e.nom_complet, inscrit: e.inscrit })),
      }))
      .filter((c) => c.etudiants.length > 0);
  }, [classes, selection, etudiants]);

  function basculer(cle: string) {
    setSelection((p) => { const n = new Set(p); n.has(cle) ? n.delete(cle) : n.add(cle); return n; });
  }
  function basculerGroupe(liste: typeof visibles, tout: boolean) {
    setSelection((p) => { const n = new Set(p); liste.forEach((c) => (tout ? n.add(c.cle) : n.delete(c.cle))); return n; });
  }

  useEffect(() => {
    if (!impression) return;
    const avant = document.title;
    document.title = 'Liste des etudiants';
    const fin = () => { document.title = avant; setImpression(false); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [impression]);

  const nbEtudiants = pdfClasses.reduce((t, c) => t + c.etudiants.length, 0);

  return (
    <>
      <style>{`
        @media print { @page { size: A4 portrait; margin: 15mm; } html, body { background: #fff !important; } .cv-ui { display: none !important; } .cv-pdf { position: static !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .cv-pdf { position: absolute; left: -99999px; top: 0; }
      `}</style>
      <div className="cv-ui" style={{ maxWidth: 860, margin: '0 auto', padding: '8px 0' }}>
        <Link to="/referentiel/etudiants" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-700 mb-3">
          <ArrowLeft size={15} /> Retour aux étudiants
        </Link>
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Exporter les listes d’étudiants en PDF</p>
        <p className="text-sm text-gray-400 mb-5">Cochez les spécialités (par semestre) à inclure : chacune forme une section du PDF.</p>

        {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}
        {chargement && <Loader2 className="animate-spin text-red-600 mx-auto" />}

        {!chargement && (
          <>
            <div style={carte}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 999, padding: '9px 14px', flex: '1 1 220px' }}>
                  <Search size={15} color="#9ca3af" />
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Filtrer les spécialités…"
                    style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, width: '100%' }} />
                </div>
                <button type="button" onClick={() => basculerGroupe(visibles, true)} className="text-xs font-bold text-gray-600 bg-gray-100 rounded-full px-4 py-2">Tout cocher</button>
                <button type="button" onClick={() => setSelection(new Set())} className="text-xs font-bold text-gray-600 bg-gray-100 rounded-full px-4 py-2">Tout décocher</button>
              </div>

              {parCycle.length === 0 && <p className="text-sm text-gray-400 font-semibold">Aucune classe avec des étudiants.</p>}
              {parCycle.map(([cycle, liste]) => (
                <div key={cycle} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cycle}</p>
                    <button type="button" onClick={() => basculerGroupe(liste, !liste.every((c) => selection.has(c.cle)))} className="text-xs font-bold text-gray-400 hover:text-gray-700">
                      {liste.every((c) => selection.has(c.cle)) ? 'décocher le cycle' : 'cocher le cycle'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
                    {liste.map((c) => (
                      <label key={c.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${selection.has(c.cle) ? '#fca5a5' : '#e5e7eb'}`, background: selection.has(c.cle) ? '#fef2f2' : '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        <input type="checkbox" checked={selection.has(c.cle)} onChange={() => basculer(c.cle)} className="accent-red-600" />
                        <span style={{ flex: 1, minWidth: 0 }}>{c.spec.nom} <span style={{ color: '#9ca3af' }}>· {c.semestre}</span></span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{c.n}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={carte}>
              <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Options</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, fontWeight: 700 }}>
                <label><input type="checkbox" checked={uneParPage} onChange={(e) => setUneParPage(e.target.checked)} className="accent-red-600" /> Une spécialité par page (avec en-tête)</label>
                <label><input type="checkbox" checked={avecMatricule} onChange={(e) => setAvecMatricule(e.target.checked)} className="accent-red-600" /> Afficher les matricules</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Année académique
                  <input value={annee} onChange={(e) => setAnnee(e.target.value)} style={{ width: 110, border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 10px', fontSize: 14, fontWeight: 700 }} />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button type="button" disabled={pdfClasses.length === 0} onClick={() => setImpression(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: pdfClasses.length ? 'pointer' : 'not-allowed', opacity: pdfClasses.length ? 1 : 0.5 }}>
                <FileDown size={16} /> Exporter en PDF
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>
                {pdfClasses.length === 0 ? 'Cochez au moins une spécialité.' : `${pdfClasses.length} section${pdfClasses.length > 1 ? 's' : ''} · ${nbEtudiants} étudiant${nbEtudiants > 1 ? 's' : ''}`}
              </span>
            </div>
          </>
        )}
      </div>

      {impression && (
        <div className="cv-pdf">
          <ListeEtudiantsPdf classes={pdfClasses} avecMatricule={avecMatricule} uneParPage={uneParPage} anneeAcademique={annee} />
        </div>
      )}
    </>
  );
}