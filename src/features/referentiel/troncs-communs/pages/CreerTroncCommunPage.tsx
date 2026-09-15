// src/features/referentiel/troncs-communs/pages/CreerTroncCommunPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Search,
  AlertTriangle,
  WifiOff,
  Sparkles,
  FileText,
  X,
  Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { extraireTextePdf } from '@/lib/pdfExtraction';
import { televerserFichier } from '@/lib/r2';
import { extraireSyllabusPdf } from '@/features/referentiel/ues/api';
import {
  listUEsPourTroncCommun,
  lireUEsPourTroncCommunDepuisCache,
  createTroncCommun,
  enregistrerPointsClesTronc,
  type UEOption,
} from '../api';

interface EnseignantOption {
  id: string;
  nom: string;
  matricule: string;
}

// Créer un tronc commun : choisir un nom, sélectionner au moins 2 UEs
// existantes (chacune reste rattachée à sa propre spécialité, elle n'est ni
// supprimée ni modifiée), et optionnellement un enseignant unique.
export default function CreerTroncCommunPage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [nom, setNom] = useState('');
  const [ues, setUes] = useState<UEOption[]>([]);
  const [ueIdsSelectionnes, setUeIdsSelectionnes] = useState<Set<string>>(
    new Set()
  );
  const [recherche, setRecherche] = useState('');

  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [enseignantId, setEnseignantId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fichierSyllabus, setFichierSyllabus] = useState<File | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [pointsCles, setPointsCles] = useState<string[]>([]);

  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([
        listUEsPourTroncCommun(),
        supabase.from('enseignants').select('id, nom, matricule').order('nom'),
      ])
        .then(([ueOptions, { data: enseignantsData }]) => {
          setUes(ueOptions);
          setEnseignants(enseignantsData ?? []);
        })
        .finally(() => setLoading(false));
    } else {
      Promise.all([
        lireUEsPourTroncCommunDepuisCache(),
        db.enseignants.toArray(),
      ])
        .then(([ueOptions, enseignantsData]) => {
          setUes(ueOptions);
          setEnseignants(
            (enseignantsData as any[]).sort((a, b) =>
              a.nom.localeCompare(b.nom)
            )
          );
        })
        .finally(() => setLoading(false));
    }
  }, []);

  function toggleUE(id: string) {
    setUeIdsSelectionnes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImporterSyllabus(fichier: File | undefined) {
    if (!fichier) return;
    setFichierSyllabus(fichier);
    setAnalyseEnCours(true);
    setError(null);
    try {
      const texte = await extraireTextePdf(fichier);
      const extraction = await extraireSyllabusPdf(texte);
      setPointsCles(extraction.points_cles);
      if (!nom.trim() && extraction.nom) setNom(extraction.nom);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'analyse."
      );
      setFichierSyllabus(null);
    } finally {
      setAnalyseEnCours(false);
    }
  }

  function ajouterPointCle() {
    setPointsCles((prev) => [...prev, '']);
  }
  function majPointCle(index: number, valeur: string) {
    setPointsCles((prev) => prev.map((p, i) => (i === index ? valeur : p)));
  }
  function retirerPointCle(index: number) {
    setPointsCles((prev) => prev.filter((_, i) => i !== index));
  }

  const uesFiltrees = ues.filter((u) =>
    u.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim()) {
      setError('Le nom du tronc commun est obligatoire.');
      return;
    }
    if (ueIdsSelectionnes.size < 2) {
      setError('Sélectionne au moins 2 UEs à regrouper.');
      return;
    }
    if (
      fichierSyllabus &&
      pointsCles.filter((p) => p.trim()).length === 0
    ) {
      setError(
        'Un syllabus a été importé : au moins un point clé du contenu est obligatoire.'
      );
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        const troncCommun = await createTroncCommun({
          nom: nom.trim(),
          ue_ids: Array.from(ueIdsSelectionnes),
          enseignant_id: enseignantId || undefined,
        });

        if (fichierSyllabus) {
          await televerserFichier(
            'syllabus-tronc-commun',
            troncCommun.id,
            fichierSyllabus
          );
          await enregistrerPointsClesTronc(
            troncCommun.id,
            pointsCles.map((p) => p.trim()).filter(Boolean)
          );
          // Le syllabus du tronc commun fait référence pour tout le
          // groupe — les syllabus individuels des UEs regroupées
          // n'ont plus lieu d'être, pour éviter toute confusion.
          await supabase
            .from('ues')
            .update({
              syllabus_key: null,
              syllabus_nom: null,
              syllabus_uploaded_at: null,
            })
            .in('id', Array.from(ueIdsSelectionnes));
        }
      } else {
        const id = crypto.randomUUID();
        const ueIds = Array.from(ueIdsSelectionnes);
        await db.troncsCommuns.put({
          id,
          nom: nom.trim(),
          enseignant_id: enseignantId || null,
        } as any);
        await db.troncsCommunsUes.bulkPut(
          ueIds.map((ue_id) => ({
            tronc_commun_id: id,
            ue_id,
          })) as any
        );
        await enqueueSyncAction({
          entity: 'troncsCommuns',
          operation: 'create',
          payload: {
            id,
            nom: nom.trim(),
            enseignant_id: enseignantId || null,
            ue_ids: ueIds,
          },
        });
      }
      navigate('/referentiel/troncs-communs');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/troncs-communs')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour aux troncs communs
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Créer un tronc commun
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Regroupe plusieurs UEs distinctes, chacune restant rattachée à sa
        spécialité.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — le tronc commun sera enregistré localement et
            envoyé dès le retour du réseau.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="bg-white rounded-[20px] p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Nom du tronc commun *
            </label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : Algorithmique (tronc commun GI)"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Enseignant{' '}
              <span className="text-gray-300 font-normal">
                (optionnel, un seul pour tout le groupe)
              </span>
            </label>
            <select
              value={enseignantId}
              onChange={(e) => setEnseignantId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Aucun pour l'instant</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.matricule})
                </option>
              ))}
            </select>
          </div>
        </div>

        {enLigne && (
          <div className="bg-white rounded-[20px] p-5">
            <p className="font-extrabold text-sm text-gray-900 mb-1 flex items-center gap-1.5">
              <Sparkles size={15} className="text-red-600" />
              Syllabus du tronc commun
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Partagé par toutes les UEs du groupe — présenté à
              l'enseignant, écrase les syllabus individuels des UEs
              sélectionnées.
            </p>

            {fichierSyllabus ? (
              <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-4 py-3 mb-3">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-700 truncate">
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  {fichierSyllabus.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFichierSyllabus(null);
                    setPointsCles([]);
                  }}
                  className="text-gray-300 hover:text-red-600 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-5 cursor-pointer hover:border-red-300 mb-3">
                {analyseEnCours ? (
                  <Loader2 size={18} className="text-gray-400 animate-spin shrink-0" />
                ) : (
                  <FileText size={18} className="text-gray-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-gray-500">
                  {analyseEnCours ? 'Analyse en cours...' : 'Choisir un PDF de syllabus'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleImporterSyllabus(e.target.files?.[0])}
                  className="hidden"
                  disabled={analyseEnCours}
                />
              </label>
            )}

            {fichierSyllabus && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-500">
                    Points clés du contenu *
                  </label>
                  <button
                    type="button"
                    onClick={ajouterPointCle}
                    className="flex items-center gap-1 text-[11px] font-bold text-red-600"
                  >
                    <Plus size={12} /> Ajouter
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {pointsCles.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        value={p}
                        onChange={(e) => majPointCle(i, e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-red-600"
                      />
                      <button
                        type="button"
                        onClick={() => retirerPointCle(i)}
                        className="text-gray-300 hover:text-red-600 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {pointsCles.length === 0 && (
                    <p className="text-xs font-semibold text-amber-600">
                      Aucun point clé — obligatoire avant enregistrement.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="font-extrabold text-sm text-gray-900 mb-2.5">
            UEs à regrouper *{' '}
            <span className="text-gray-400 font-semibold">
              ({ueIdsSelectionnes.size} sélectionnée(s))
            </span>
          </p>

          <div className="bg-white rounded-[20px] p-4">
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3">
              <Search size={15} className="text-gray-300" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une UE..."
                className="flex-1 text-sm font-semibold outline-none bg-transparent"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : uesFiltrees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Aucune UE trouvée.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
                {uesFiltrees.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 ${
                      u.deja_dans_un_groupe
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ueIdsSelectionnes.has(u.id)}
                      onChange={() => toggleUE(u.id)}
                      disabled={u.deja_dans_un_groupe}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {u.nom}
                      </p>
                      <p className="text-xs text-gray-400">
                        {u.specialite_nom ?? 'Sans spécialité'}
                      </p>
                    </div>
                    {u.deja_dans_un_groupe && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full shrink-0">
                        <AlertTriangle size={10} /> déjà dans un groupe
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Créer le tronc commun
          </button>
          <button
            type="button"
            onClick={() => navigate('/referentiel/troncs-communs')}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}