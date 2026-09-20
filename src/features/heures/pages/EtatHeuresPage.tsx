// src/features/heures/pages/EtatHeuresPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Loader2, FileSpreadsheet, WifiOff, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { filtrerParPerimetreParChamp } from '@/lib/perimetre';
import { formatHeureCameroun } from '@/lib/formatHeureCameroun';
import {
  listHeuresDetailMois,
  lireHeuresDepuisCache,
  totauxDepuisDetail,
  moisEnCours,
  type LigneHeureSeance,
  type LigneHeureTotal,
} from '../api';

function labelMois(anneeMois: string): string {
  const [y, m] = anneeMois.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const formatHeure = formatHeureCameroun;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

// Écran 7.1 (ecrans_ui.md) — Scénario 9, vue globale : Admin et Responsable
// consultent les heures effectuées par tous les enseignants pour un mois
// donné. Le tableau affiché reste un total par enseignant, mais l'export
// "détail" liste chaque séance individuellement (jour, créneau, heure
// d'ouverture/fermeture) — pas un agrégat par UE.
export default function EtatHeuresPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [mois, setMois] = useState(moisEnCours());
  const [detail, setDetail] = useState<LigneHeureSeance[]>([]);
  const [totaux, setTotaux] = useState<LigneHeureTotal[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depuisCache, setDepuisCache] = useState(false);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    let cancelled = false;
    setChargement(true);
    setErreur(null);

    function appliquer(data: LigneHeureSeance[]) {
      const visibles = filtrerParPerimetreParChamp(
        data,
        user,
        (d) => d.specialiteId
      );
      setDetail(visibles);
      setTotaux(totauxDepuisDetail(visibles));
    }

    async function charger() {
      let aDesDonneesLocales = false;
      // 1. Cache local d'abord.
      try {
        const local = await lireHeuresDepuisCache(mois);
        if (!cancelled && local.length > 0) {
          appliquer(local);
          setDepuisCache(true);
          setChargement(false);
          aDesDonneesLocales = true;
        }
      } catch {
        // pas grave, on retombe sur le réseau
      }

      // 2. Réseau ensuite.
      if (!navigator.onLine) {
        if (!cancelled) setChargement(false);
        return;
      }
      try {
        const frais = await listHeuresDetailMois(mois);
        if (!cancelled) {
          appliquer(frais);
          setDepuisCache(false);
          setErreur(null);
        }
      } catch (err) {
        if (!cancelled && !aDesDonneesLocales) {
          setErreur(
            err instanceof Error ? err.message : 'Erreur de chargement'
          );
        }
      } finally {
        if (!cancelled) setChargement(false);
      }
    }

    charger();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois]);

  function exporterDetail() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Enseignant', 'Date', 'Jour', 'Créneau', 'UE', "Heure d'ouverture", 'Heure de fermeture', 'Heures', 'Retard'],
      ...detail.map((d) => [
        d.enseignantNom,
        formatDate(d.heureOuverture),
        d.jour,
        d.creneau,
        d.ueNom,
        formatHeure(d.heureOuverture),
        formatHeure(d.heureFermeture),
        d.heures,
        d.enRetard ? 'Oui' : 'Non',
      ]),
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Détail');
    XLSX.writeFile(classeur, `heures_detail_${mois}.xlsx`);
  }

  function exporterTotaux() {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Enseignant', 'Total heures effectuées'],
      ...totaux.map((t) => [t.enseignantNom, t.totalHeures]),
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Totaux');
    XLSX.writeFile(classeur, `heures_totaux_${mois}.xlsx`);
  }

  const totauxFiltres = totaux.filter((t) =>
    recherche.trim()
      ? t.enseignantNom.toLowerCase().includes(recherche.trim().toLowerCase())
      : true
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="font-extrabold text-2xl text-gray-900">
            Voir les états
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Heures effectuées par enseignant, mois par mois.
          </p>
          {depuisCache && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-1.5">
              <WifiOff size={12} /> Données locales — en attente de
              rafraîchissement
            </p>
          )}
        </div>
        <input
          type="month"
          value={mois}
          onChange={(e) => setMois(e.target.value)}
          className="bg-white rounded-full px-4 py-2.5 text-sm font-bold text-gray-700 outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={exporterDetail}
          disabled={detail.length === 0}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet size={16} /> Exporter le détail (Excel)
        </button>
        <button
          onClick={exporterTotaux}
          disabled={totaux.length === 0}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet size={16} /> Exporter les totaux (Excel)
        </button>
      </div>

      <div className="flex mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un enseignant..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-400 uppercase">
            {labelMois(mois)}
          </p>
        </div>
        {chargement ? (
          <div className="flex items-center justify-center py-16 text-gray-300">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : erreur ? (
          <div className="p-6 text-sm font-semibold text-red-600">
            Impossible de charger les heures : {erreur}
          </div>
        ) : totauxFiltres.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-300">
            {recherche
              ? 'Aucun enseignant ne correspond à cette recherche.'
              : "Aucune heure effectuée sur ce mois pour l'instant."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase font-bold">
                <th className="px-5 py-3">Enseignant</th>
                <th className="px-5 py-3">Total heures effectuées</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {totauxFiltres.map((t) => (
                <tr
                  key={t.enseignantId}
                  onClick={() => navigate(`/heures/${t.enseignantId}`)}
                  className="cursor-pointer hover:bg-gray-50/60"
                >
                  <td className="px-5 py-3 font-bold">{t.enseignantNom}</td>
                  <td className="px-5 py-3 font-mono font-bold text-red-600">
                    {t.totalHeures}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}