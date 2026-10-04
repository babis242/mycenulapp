// src/features/rapports-pdf/pages/RapportsPdfPage.tsx
//
// Menu admin « Rapports PDF » : on choisit le rapport, on le génère, on
// voit l'aperçu, puis « Télécharger le PDF » ouvre l'impression du
// navigateur (« Enregistrer au format PDF »).

import { useState } from 'react';
import { CalendarDays, CalendarRange, DoorOpen, Download, Loader2 } from 'lucide-react';
import {
  genererFicheSalles,
  genererRapportPeriode,
  lundiDe,
  type FicheSalles,
  type RapportPeriode,
} from '../api';
import RapportPeriodePdf from '../components/RapportPeriodePdf';
import FicheSallesPdf from '../components/FicheSallesPdf';

type Choix = 'semaine' | 'mois' | 'salles';

const TYPES: { id: Choix; titre: string; description: string; icone: typeof CalendarDays }[] = [
  {
    id: 'semaine',
    titre: 'Rapport hebdomadaire',
    description: 'Cours, heures, retards et absences de la semaine',
    icone: CalendarDays,
  },
  {
    id: 'mois',
    titre: 'Rapport mensuel',
    description: 'Même bilan sur un mois, avec courbes par semaine',
    icone: CalendarRange,
  },
  {
    id: 'salles',
    titre: 'Répartition des salles',
    description: 'Salles occupées par créneau, avec filières et cours',
    icone: DoorOpen,
  },
];

function aujourdhuiISO(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // UTC+1 (Cameroun)
  return d.toISOString().slice(0, 10);
}

export default function RapportsPdfPage() {
  const [choix, setChoix] = useState<Choix>('semaine');
  const [date, setDate] = useState(aujourdhuiISO());
  const [mois, setMois] = useState(aujourdhuiISO().slice(0, 7));
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<RapportPeriode | null>(null);
  const [fiche, setFiche] = useState<FicheSalles | null>(null);

  async function generer() {
    setErreur(null);
    if (!navigator.onLine) {
      setErreur('Une connexion Internet est nécessaire pour générer un rapport.');
      return;
    }
    setChargement(true);
    setRapport(null);
    setFiche(null);
    try {
      if (choix === 'salles') {
        setFiche(await genererFicheSalles(lundiDe(date)));
      } else if (choix === 'semaine') {
        setRapport(await genererRapportPeriode('semaine', date));
      } else {
        setRapport(await genererRapportPeriode('mois', mois));
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la génération du rapport.');
    } finally {
      setChargement(false);
    }
  }

  function telecharger() {
    const titreAvant = document.title;
    const suffixe = choix === 'mois' ? mois : lundiDe(date);
    const nom =
      choix === 'semaine'
        ? 'Rapport hebdomadaire'
        : choix === 'mois'
          ? 'Rapport mensuel'
          : 'Repartition des salles';
    document.title = `${nom} ${suffixe}`;
    const restaurer = () => {
      document.title = titreAvant;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const pret = (choix === 'salles' ? fiche : rapport) !== null;
  const champ =
    'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600';

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: ${choix === 'salles' ? '8mm 0 8mm 0' : '0'}; }
          html, body { background: #fff !important; }
          .rapport-pdf, .rapport-pdf * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        .rapport-pdf thead { display: table-header-group; }
        .rapport-pdf tfoot { display: table-footer-group; }
        .apercu-rapport { box-shadow: 0 2px 14px rgba(0,0,0,0.15); width: max-content; margin: 0 auto; background: #fff; }
        @media print { .apercu-rapport { box-shadow: none; margin: 0; } }
      `}</style>

      <div className="print:hidden max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <p className="font-extrabold text-2xl text-gray-900 mb-1">Rapports PDF</p>
        <p className="text-sm text-gray-400 mb-6">
          Rapports officiels du Service de la scolarité. Choisissez un rapport, générez-le, puis
          téléchargez-le en PDF.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {TYPES.map((t) => {
            const Icone = t.icone;
            const actif = choix === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setChoix(t.id);
                  setRapport(null);
                  setFiche(null);
                  setErreur(null);
                }}
                className={`text-left bg-white rounded-[20px] p-5 border-2 transition-colors ${
                  actif ? 'border-red-600' : 'border-transparent hover:border-gray-200'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                    actif ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
                  }`}
                >
                  <Icone size={18} />
                </span>
                <p className="font-extrabold text-gray-900">{t.titre}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-[20px] p-5 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              {choix === 'mois' ? (
                <>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Mois</label>
                  <input
                    type="month"
                    value={mois}
                    onChange={(e) => setMois(e.target.value)}
                    className={champ}
                  />
                </>
              ) : (
                <>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">
                    Une date de la semaine
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={champ}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Semaine du lundi {lundiDe(date).split('-').reverse().join('/')}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={generer}
              disabled={chargement || (choix === 'mois' ? !mois : !date)}
              className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {chargement && <Loader2 size={15} className="animate-spin" />}
              Générer
            </button>
            {pret && (
              <button
                onClick={telecharger}
                className="flex items-center justify-center gap-2 bg-gray-900 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-black"
              >
                <Download size={15} /> Télécharger le PDF
              </button>
            )}
          </div>
          {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
          {pret && (
            <p className="text-xs text-gray-400 mt-3">
              Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » et activez
              « Graphiques d'arrière-plan » pour garder les couleurs.
            </p>
          )}
        </div>
      </div>

      {pret && (
        <div className="overflow-x-auto print:overflow-visible px-4 pb-10 print:p-0">
          <div className="apercu-rapport">
            {choix === 'salles' && fiche && <FicheSallesPdf fiche={fiche} />}
            {choix !== 'salles' && rapport && <RapportPeriodePdf rapport={rapport} />}
          </div>
        </div>
      )}
    </>
  );
}