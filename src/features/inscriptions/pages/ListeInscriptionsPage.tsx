// src/features/inscriptions/pages/ListeInscriptionsPage.tsx
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Loader2,
  Download,
  Trash2,
  Link2,
  CheckCircle2,
  Copy,
  Search,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createEnseignant } from '@/features/referentiel/enseignants/api';
import {
  listInscriptions,
  marquerCommeTraitees,
  supprimerInscription,
  type Inscription,
} from '../api';

const LIEN_INSCRIPTION = `${window.location.origin}/inscription-enseignant`;

// Écran admin — les inscriptions arrivées via le lien public
// (/inscription-enseignant). Deux façons de les traiter :
//   1. "Inscrire" sur une ligne : crée directement le compte enseignant
//      (le raccourci le plus rapide, un clic).
//   2. Export Excel : pour repasser par l'import en masse existant si
//      besoin de vérifier/corriger plusieurs lignes à la fois.
export default function ListeInscriptionsPage() {
  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lienCopie, setLienCopie] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [inscriptionEnCours, setInscriptionEnCours] = useState<string | null>(
    null
  );
  const [erreurLigne, setErreurLigne] = useState<Record<string, string>>({});

  function charger() {
    setLoading(true);
    listInscriptions()
      .then(setInscriptions)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => setLoading(false));
  }

  useEffect(charger, []);

  const enAttente = inscriptions.filter((i) => i.statut === 'en_attente');
  const filtrees = enAttente.filter((i) => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return (
      i.nom.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)
    );
  });

  function toggleSelection(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exporterExcel() {
    const aExporter =
      selection.size > 0
        ? inscriptions.filter((i) => selection.has(i.id))
        : filtrees;
    if (aExporter.length === 0) return;

    // Mêmes en-têtes exactement que celles attendues par
    // ImporterEnseignantsPage : Nom, Email, WhatsApp, Cellulaire.
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Nom', 'Email', 'WhatsApp', 'Cellulaire'],
      ...aExporter.map((i) => [
        i.nom,
        i.email,
        i.whatsapp ?? '',
        i.cellulaire ?? '',
      ]),
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Enseignants');
    XLSX.writeFile(
      classeur,
      `inscriptions_enseignants_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  async function handleMarquerTraitees() {
    const ids =
      selection.size > 0 ? Array.from(selection) : filtrees.map((i) => i.id);
    if (ids.length === 0) return;
    await marquerCommeTraitees(ids);
    setSelection(new Set());
    charger();
  }

  async function handleSupprimer(id: string) {
    if (!window.confirm('Supprimer cette inscription ?')) return;
    await supprimerInscription(id);
    charger();
  }

  // Un clic : crée la fiche enseignant + déclenche la création du compte
  // de connexion (même Edge Function que la création manuelle), puis
  // marque l'inscription comme traitée.
  async function handleInscrire(inscription: Inscription) {
    setInscriptionEnCours(inscription.id);
    setErreurLigne((prev) => {
      const next = { ...prev };
      delete next[inscription.id];
      return next;
    });
    try {
      const enseignant = await createEnseignant({
        nom: inscription.nom,
        email: inscription.email,
        numero_whatsapp: inscription.whatsapp || undefined,
        numero_cellulaire: inscription.cellulaire || undefined,
      });

      const { error: fnError } = await supabase.functions.invoke(
        'create-enseignant-account',
        { body: { enseignantId: enseignant.id } }
      );

      await marquerCommeTraitees([inscription.id]);
      if (fnError) {
        setErreurLigne((prev) => ({
          ...prev,
          [inscription.id]: 'Compte créé, mais email non envoyé',
        }));
      }
      charger();
    } catch (err) {
      setErreurLigne((prev) => ({
        ...prev,
        [inscription.id]:
          err instanceof Error ? err.message : 'Erreur lors de la création.',
      }));
    } finally {
      setInscriptionEnCours(null);
    }
  }

  function copierLien() {
    navigator.clipboard.writeText(LIEN_INSCRIPTION).then(() => {
      setLienCopie(true);
      setTimeout(() => setLienCopie(false), 2000);
    });
  }

  return (
    <div>
      <div className="mb-4">
        <p className="font-extrabold text-xl sm:text-2xl text-gray-900">
          Inscriptions enseignants
        </p>
        <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
          Reçues via le lien public — inscris en un clic, ou exporte en Excel
          pour l'import en masse.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap">
        <Link2 size={16} className="text-gray-400 shrink-0" />
        <p className="text-xs sm:text-sm font-mono text-gray-600 flex-1 truncate min-w-[140px]">
          {LIEN_INSCRIPTION}
        </p>
        <button
          onClick={copierLien}
          className="flex items-center gap-1.5 shrink-0 bg-gray-100 rounded-full px-3 sm:px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200"
        >
          {lienCopie ? (
            <>
              <CheckCircle2 size={13} className="text-green-600" /> Copié
            </>
          ) : (
            <>
              <Copy size={13} /> Copier
            </>
          )}
        </button>
      </div>

      <div className="flex mb-3 sm:mb-4">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full sm:w-72">
          <Search size={15} className="text-gray-300 shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un nom, un email..."
            className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={exporterExcel}
          disabled={filtrees.length === 0}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          Exporter l'Excel
          {selection.size > 0 ? ` (${selection.size})` : ''}
        </button>
        <button
          onClick={handleMarquerTraitees}
          disabled={filtrees.length === 0}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 size={14} />
          Marquer traité(es)
          {selection.size > 0 ? ` (${selection.size})` : ''}
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl flex items-center justify-center py-16 text-gray-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl p-6 text-sm font-semibold text-red-600">
          Impossible de charger les inscriptions : {error}
        </div>
      ) : filtrees.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <p className="font-bold text-gray-900 mb-1">
            {recherche ? 'Aucun résultat' : 'Aucune inscription en attente'}
          </p>
          <p className="text-sm text-gray-400">
            {recherche
              ? 'Essaie un autre nom ou email.'
              : 'Partage le lien ci-dessus aux futurs enseignants.'}
          </p>
        </div>
      ) : (
        // Une seule mise en page pour toutes les tailles d'écran : chaque
        // ligne est un flex qui se replie tout seul (flex-wrap) quand
        // l'espace manque — pas de deuxième bloc caché/affiché en
        // parallèle, donc pas moyen d'avoir les deux visibles en même
        // temps comme précédemment.
        <div className="flex flex-col gap-2.5">
          {filtrees.map((i) => {
            const enCours = inscriptionEnCours === i.id;
            return (
              <div key={i.id} className="bg-white rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="flex items-start gap-3 min-w-[180px]">
                    <input
                      type="checkbox"
                      checked={selection.has(i.id)}
                      onChange={() => toggleSelection(i.id)}
                      className="mt-1.5 shrink-0"
                    />
                    <div>
                      <p className="font-bold text-gray-900 break-words">
                        {i.nom}
                      </p>
                      <p className="text-sm text-gray-500 break-words">
                        {i.email}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400 space-y-0.5 sm:text-right">
                    {i.whatsapp && <p>WhatsApp : {i.whatsapp}</p>}
                    {i.cellulaire && <p>Téléphone : {i.cellulaire}</p>}
                    <p>
                      Reçu le{' '}
                      {new Date(i.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    {erreurLigne[i.id] && (
                      <p className="font-semibold text-amber-600">
                        {erreurLigne[i.id]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-start sm:justify-end mt-3">
                  <button
                    onClick={() => handleInscrire(i)}
                    disabled={enCours}
                    title="Inscrire"
                    aria-label="Inscrire"
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
                  >
                    {enCours ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <UserPlus size={15} />
                    )}
                  </button>
                  <button
                    onClick={() => handleSupprimer(i.id)}
                    title="Supprimer"
                    aria-label="Supprimer"
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}