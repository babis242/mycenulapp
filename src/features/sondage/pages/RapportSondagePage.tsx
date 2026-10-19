// src/features/sondage/pages/RapportSondagePage.tsx
//
// Rapport PDF des résultats du sondage étudiants (aperçu A4 + impression PDF).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getSondagesDeLaSemaine, listReponses, listSemainesPubliees, type LigneReponse, type SondageSemaine } from '../api';
import { agreger } from '../resultats';
import { libelleSemaineRetour } from '../retours';
import { RapportSondagePdf, type LangueRapport, type RapportSondage } from '../components/RapportSondagePdf';

export default function RapportSondagePage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;
  const dansPerimetre = (id: string) => !perimetreIds || perimetreIds.includes(id);

  const [params, setParams] = useSearchParams();
  const [semaines, setSemaines] = useState<string[]>([]);
  const [semaine, setSemaine] = useState(params.get('semaine') ?? '');
  const [filtre, setFiltre] = useState(params.get('filtre') ?? '');
  const [langue, setLangue] = useState<LangueRapport>(params.get('langue') === 'en' ? 'en' : 'fr');
  const [sondages, setSondages] = useState<SondageSemaine[]>([]);
  const [reponses, setReponses] = useState<LigneReponse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listSemainesPubliees()
      .then((l) => {
        setSemaines(l);
        setSemaine((s) => (s && l.includes(s) ? s : l[0] ?? ''));
      })
      .catch((e) => setErreur(e?.message || 'Chargement impossible.'));
  }, []);

  useEffect(() => {
    if (!semaine) {
      setSondages([]);
      setReponses([]);
      setChargement(false);
      return;
    }
    setChargement(true);
    setErreur(null);
    Promise.all([getSondagesDeLaSemaine(semaine), listReponses(semaine)])
      .then(([s, r]) => {
        setSondages(s.filter((x) => dansPerimetre(x.specialite_id)));
        setReponses(r.filter((x) => dansPerimetre(x.specialite_id)));
      })
      .catch((e) => setErreur(e?.message || 'Chargement impossible.'))
      .finally(() => setChargement(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaine]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (semaine) p.set('semaine', semaine);
    if (filtre) p.set('filtre', filtre);
    if (langue === 'en') p.set('langue', 'en');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaine, filtre, langue]);

  const rapport: RapportSondage | null = useMemo(() => {
    if (!semaine || reponses.length === 0) return null;
    const cle = (r: { specialite_id: string; niveau: string }) => `${r.specialite_id}|${r.niveau}`;
    const choisies = reponses.filter((r) => !filtre || cle(r) === filtre);
    if (choisies.length === 0) return null;
    const groupes = sondages
      .filter((s) => !filtre || cle(s) === filtre)
      .map((s) => {
        const res = agreger(reponses.filter((r) => cle(r) === cle(s)));
        return {
          libelle: s.specialite_nom,
          niveau: s.niveau,
          reponses: res.reponses,
          note: res.noteMoyenne,
          compris: res.pctCompris,
          nonTenus: res.coursNonTenus,
        };
      })
      .sort((a, b) => b.reponses - a.reponses || a.libelle.localeCompare(b.libelle, 'fr'));
    const choisi = sondages.find((s) => cle(s) === filtre);
    return {
      langue,
      semaineLibelle: `${langue === 'en' ? 'Week of' : 'Semaine du'} ${libelleSemaineRetour(semaine, langue)}`,
      perimetre: filtre && choisi ? `${choisi.specialite_nom} (${choisi.niveau})` : langue === 'en' ? 'All programmes' : 'Toutes les spécialités',
      genereLe: new Date().toISOString(),
      resume: agreger(choisies),
      groupes,
    };
  }, [semaine, filtre, sondages, reponses, langue]);

  function telecharger() {
    const avant = document.title;
    document.title = `${langue === 'en' ? 'Survey report' : 'Rapport sondage'} ${semaine}`;
    const restaurer = () => {
      document.title = avant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const champ = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, outline: 'none', background: '#fff' } as const;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          .rapport-pdf, .rapport-pdf * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .rapport-pdf thead { display: table-header-group; }
        .apercu-rapport { box-shadow: 0 2px 14px rgba(0,0,0,0.15); width: max-content; margin: 0 auto; background: #fff; }
        @media print { .apercu-rapport { box-shadow: none; margin: 0; } }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Link to="/sondage-etudiants" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#6b7280', textDecoration: 'none', marginBottom: 10 }}>
          <ArrowLeft size={15} /> Sondage étudiants
        </Link>
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Rapport PDF du sondage</p>
        <p className="text-sm text-gray-400 mb-5">
          Synthèse chiffrée des réponses des étudiants : chiffres clés, classement des enseignants, détail par
          enseignant, cours à revoir et suggestions.
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          {semaines.length === 0 && !chargement ? (
            <p className="text-sm text-gray-400">Aucun sondage publié pour l'instant.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={semaine} onChange={(e) => { setSemaine(e.target.value); setFiltre(''); }} style={champ}>
                  {semaines.map((s) => <option key={s} value={s}>Semaine du {libelleSemaineRetour(s, 'fr')}</option>)}
                </select>
                <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={champ}>
                  <option value="">Toutes les spécialités</option>
                  {sondages.map((s) => (
                    <option key={s.id} value={`${s.specialite_id}|${s.niveau}`}>{s.specialite_nom} ({s.niveau})</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {(['fr', 'en'] as LangueRapport[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLangue(l)}
                      style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '10px 16px', fontSize: 13, fontWeight: 800, background: langue === l ? '#111827' : '#fff', color: langue === l ? '#fff' : '#4b5563', boxShadow: langue === l ? 'none' : 'inset 0 0 0 1px #e5e7eb' }}
                    >
                      {l === 'fr' ? 'Français' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={telecharger}
                  disabled={!rapport}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '10px 20px', fontSize: 14, fontWeight: 700, border: 0, cursor: rapport ? 'pointer' : 'not-allowed', opacity: rapport ? 1 : 0.5 }}
                >
                  {chargement ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Télécharger en PDF
                </button>
                {!chargement && !rapport && semaine && (
                  <span className="text-xs font-semibold text-gray-500">Aucune réponse pour cette sélection.</span>
                )}
              </div>
              {rapport && (
                <p className="text-xs text-gray-400 mt-3">
                  Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » et activez « Graphiques
                  d'arrière-plan » pour garder les couleurs.
                </p>
              )}
            </>
          )}
          {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
        </div>
      </div>

      {rapport && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="apercu-rapport">
            <RapportSondagePdf rapport={rapport} />
          </div>
        </div>
      )}
    </>
  );
}