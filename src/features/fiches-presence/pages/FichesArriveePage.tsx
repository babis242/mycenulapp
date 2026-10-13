// src/features/fiches-presence/pages/FichesArriveePage.tsx
//
// Fiche d'arrivée et de retard : liste de tous les étudiants de l'école,
// une fiche (A4 portrait) par niveau, avec une colonne par jour de la semaine.
import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getFichesArrivee } from '../arriveeApi';
import { libelleSemaine } from '../components/FichesPresencePdf';
import FichesArriveePdf, { type FicheArrivee } from '../components/FichesArriveePdf';
import { lundiCourant } from '../components/SelecteurGroupe';

function versLundi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jour = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (jour === 0 ? -6 : 1 - jour));
  return dt.toISOString().slice(0, 10);
}

export default function FichesArriveePage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [semaine, setSemaine] = useState(lundiCourant());
  const [lignesLibres, setLignesLibres] = useState(5);
  const [niveau, setNiveau] = useState(''); // '' = tous

  const [toutes, setToutes] = useState<FicheArrivee[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [infos, setInfos] = useState<{ semaine: string; lignes: number } | null>(null);
  const [genere, setGenere] = useState(false);

  async function generer() {
    setErreur(null);
    if (!navigator.onLine) {
      setErreur('Une connexion Internet est nécessaire pour générer les fiches.');
      return;
    }
    setChargement(true);
    setGenere(false);
    try {
      const fiches = await getFichesArrivee(perimetreIds);
      setToutes(fiches);
      setInfos({ semaine, lignes: lignesLibres });
      setGenere(true);
    } catch (e: any) {
      setErreur(e?.message || 'Échec de la génération.');
    } finally {
      setChargement(false);
    }
  }

  // Les niveaux disponibles se déduisent de la dernière génération.
  useEffect(() => {
    if (toutes && niveau && !toutes.some((f) => f.niveau === niveau)) setNiveau('');
  }, [toutes, niveau]);

  const affichees = (toutes ?? []).filter((f) => !niveau || f.niveau === niveau);
  const total = affichees.reduce((n, f) => n + f.etudiants.length, 0);

  function telecharger() {
    const titreAvant = document.title;
    document.title = `Fiche arrivee et retard ${niveau || 'Tous niveaux'} - Semaine ${infos?.semaine ?? semaine}`;
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const champ =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          .fiche-arrivee-doc, .fiche-arrivee-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .arrivee-apercu { width: max-content; margin: 0 auto; }
        .arrivee-apercu .fiche-arrivee-page { box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
        .fiche-arrivee-doc { display: flex; flex-direction: column; gap: 8mm; }
        @media print {
          .arrivee-apercu { width: auto; margin: 0; }
          .arrivee-apercu .fiche-arrivee-page { box-shadow: none; }
          .fiche-arrivee-doc { display: block; }
        }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Fiche d'arrivée et de retard</p>
        <p className="text-sm text-gray-400 mb-6">
          La liste de tous les étudiants de l'école, une fiche par niveau, avec une colonne par jour de la semaine
          (heure d'arrivée et retard).
        </p>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Semaine (lundi)</label>
              <input
                type="date"
                value={semaine}
                onChange={(e) => {
                  if (e.target.value) {
                    setSemaine(versLundi(e.target.value));
                    setGenere(false);
                  }
                }}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Niveau</label>
              <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className={champ}>
                <option value="">Tous les niveaux</option>
                {(toutes ?? []).map((f) => (
                  <option key={f.niveau} value={f.niveau}>
                    {f.niveau} ({f.etudiants.length})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs font-semibold text-gray-500 mb-4">Semaine du {libelleSemaine(semaine)}</p>

          <div className="flex items-center gap-3 mb-4">
            <label className="text-xs font-bold text-gray-500">Lignes libres en fin de niveau</label>
            <input
              type="number"
              min={0}
              max={15}
              value={lignesLibres}
              onChange={(e) => {
                setLignesLibres(Math.max(0, Math.min(15, Number(e.target.value) || 0)));
                setGenere(false);
              }}
              className="w-16 border border-gray-200 rounded-xl px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generer}
              disabled={chargement || !semaine}
              className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {chargement ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Générer les fiches
            </button>
            {genere && total > 0 && (
              <button
                onClick={telecharger}
                className="flex items-center gap-2 bg-gray-900 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-black"
              >
                <Download size={15} /> Télécharger le PDF
              </button>
            )}
          </div>
          {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
          {genere && (
            <div className="mt-4">
              {total === 0 ? (
                <p className="text-xs font-semibold text-amber-600">Aucun étudiant trouvé.</p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                  <Users size={13} /> {total} étudiant(s) — {affichees.length} niveau(x)
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

      {genere && infos && total > 0 && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="arrivee-apercu">
            <FichesArriveePdf fiches={affichees} semaine={infos.semaine} lignesSupplementaires={infos.lignes} />
          </div>
        </div>
      )}
    </>
  );
}