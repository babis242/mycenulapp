// src/features/referentiel/troncs-communs/pages/DetailTroncCommunPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Plus,
  Search,
  AlertTriangle,
  X,
  FileText,
  UploadCloud,
  Download,
  Pencil,
  ListChecks,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { televerserFichier, urlPubliqueR2 } from '@/lib/r2';
import { extraireTextePdf } from '@/lib/pdfExtraction';
import { extraireSyllabusPdf } from '@/features/referentiel/ues/api';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import {
  getTroncCommun,
  updateTroncCommun,
  deleteTroncCommun,
  retirerUEDuTroncCommun,
  ajouterUEsAuTroncCommun,
  ajouterSpecialitesAuTroncCommun,
  listUEsPourTroncCommun,
  listPointsClesTronc,
  enregistrerPointsClesTronc,
  type TroncCommunDetail,
  type UEOption,
  type PointCleTronc,
} from '../api';

interface EnseignantOption {
  id: string;
  nom: string;
  matricule: string;
}

// Écran de détail d'un Tronc commun : nom + enseignant modifiables, UEs du
// groupe consultables/retirables, ajout d'UEs supplémentaires.
export default function DetailTroncCommunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [troncCommun, setTroncCommun] = useState<TroncCommunDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [enseignantId, setEnseignantId] = useState('');
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);

  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [uesDisponibles, setUesDisponibles] = useState<UEOption[]>([]);
  const [rechercheAjout, setRechercheAjout] = useState('');
  const [ueIdsAAjouter, setUeIdsAAjouter] = useState<Set<string>>(new Set());

  const [ajoutSpecialiteOuvert, setAjoutSpecialiteOuvert] = useState(false);
  const [specialitesAAjouter, setSpecialitesAAjouter] = useState<
    SpecialiteRecherche[]
  >([]);
  const [ajoutSpecialiteEnCours, setAjoutSpecialiteEnCours] = useState(false);
  const [erreurAjoutSpecialite, setErreurAjoutSpecialite] = useState<
    string | null
  >(null);

  const [envoiSyllabus, setEnvoiSyllabus] = useState(false);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [erreurSyllabus, setErreurSyllabus] = useState<string | null>(null);
  const [pointsCles, setPointsCles] = useState<PointCleTronc[]>([]);
  const [editionPoints, setEditionPoints] = useState<string[] | null>(null);
  const [savingPoints, setSavingPoints] = useState(false);

  function recharger() {
    if (!id) return;
    setLoading(true);
    getTroncCommun(id)
      .then((data) => {
        setTroncCommun(data);
        if (data) {
          setNom(data.nom);
          setEnseignantId(data.enseignant_id ?? '');
          if (data.syllabus_key) listPointsClesTronc(id).then(setPointsCles);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    recharger();
    supabase
      .from('enseignants')
      .select('id, nom, matricule')
      .order('nom')
      .then(({ data }) => setEnseignants(data ?? []));
  }, [id]);

  async function handleSave() {
    if (!id) return;
    if (!nom.trim()) {
      setError('Le nom est obligatoire.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTroncCommun(id, {
        nom: nom.trim(),
        enseignant_id: enseignantId || null,
      });
      recharger();
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (
      !window.confirm(
        'Supprimer ce tronc commun ? Les UEs elles-mêmes ne seront pas supprimées.'
      )
    )
      return;
    await deleteTroncCommun(id);
    navigate('/referentiel/troncs-communs');
  }

  async function handleRetirerUE(ueId: string) {
    if (!id || !troncCommun) return;
    if (troncCommun.ues.length <= 2) {
      window.alert(
        'Un tronc commun doit contenir au moins 2 UEs. Supprime le groupe entier si besoin.'
      );
      return;
    }
    if (!window.confirm('Retirer cette UE du groupe ?')) return;
    await retirerUEDuTroncCommun(id, ueId);
    recharger();
  }

  async function ouvrirAjout() {
    setAjoutOuvert(true);
    setUeIdsAAjouter(new Set());
    setRechercheAjout('');
    const toutes = await listUEsPourTroncCommun();
    const idsDejaDansCeGroupe = new Set(
      troncCommun?.ues.map((u) => u.id) ?? []
    );
    setUesDisponibles(toutes.filter((u) => !idsDejaDansCeGroupe.has(u.id)));
  }

  async function handleAjouter() {
    if (!id || ueIdsAAjouter.size === 0) return;
    setSaving(true);
    try {
      await ajouterUEsAuTroncCommun(id, Array.from(ueIdsAAjouter));
      setAjoutOuvert(false);
      recharger();
    } finally {
      setSaving(false);
    }
  }

  const specialiteIdsDejaDansGroupe = new Set(
    (troncCommun?.ues ?? [])
      .map((u) => u.specialite_id)
      .filter((id): id is string => !!id)
  );

  function ajouterSpecialiteAuxCandidates(s: SpecialiteRecherche) {
    if (specialiteIdsDejaDansGroupe.has(s.id)) {
      setErreurAjoutSpecialite('Cette spécialité fait déjà partie du groupe.');
      return;
    }
    setErreurAjoutSpecialite(null);
    setSpecialitesAAjouter((prev) =>
      prev.some((p) => p.id === s.id) ? prev : [...prev, s]
    );
  }

  function retirerSpecialiteDesCandidates(specialiteId: string) {
    setSpecialitesAAjouter((prev) => prev.filter((s) => s.id !== specialiteId));
  }

  async function handleAjouterSpecialites() {
    if (!id || !troncCommun || specialitesAAjouter.length === 0) return;
    const modele = troncCommun.ues[0];
    if (!modele || !modele.semestre) {
      setErreurAjoutSpecialite(
        'Impossible de déterminer le semestre du groupe — ajoute au moins une UE manuellement.'
      );
      return;
    }
    setAjoutSpecialiteEnCours(true);
    setErreurAjoutSpecialite(null);
    try {
      await ajouterSpecialitesAuTroncCommun(
        id,
        specialitesAAjouter.map((s) => s.id),
        {
          nom: troncCommun.nom,
          code: modele.code,
          volumeHoraire: modele.volume_horaire,
          coefficient: modele.coefficient,
          semestre: modele.semestre,
        }
      );
      setAjoutSpecialiteOuvert(false);
      setSpecialitesAAjouter([]);
      recharger();
    } catch (err) {
      setErreurAjoutSpecialite(
        err instanceof Error ? err.message : "Erreur lors de l'ajout."
      );
    } finally {
      setAjoutSpecialiteEnCours(false);
    }
  }

  async function handleUploadSyllabus(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier || !id) return;
    setEnvoiSyllabus(true);
    setErreurSyllabus(null);
    try {
      const { nom: nomFichier } = await televerserFichier(
        'syllabus-tronc-commun',
        id,
        fichier
      );
      setTroncCommun((prev) =>
        prev
          ? {
              ...prev,
              syllabus_key: `syllabus-tronc-commun/${id}/${nomFichier}`,
              syllabus_nom: nomFichier,
              syllabus_uploaded_at: new Date().toISOString(),
            }
          : prev
      );
      setEnvoiSyllabus(false);

      // Points clés obligatoires dès qu'un syllabus est envoyé — extraction
      // automatique juste après l'upload, partagée par tout le groupe.
      setAnalyseEnCours(true);
      try {
        const texte = await extraireTextePdf(fichier);
        const extraction = await extraireSyllabusPdf(texte);
        if (extraction.points_cles.length === 0) {
          setErreurSyllabus(
            "L'IA n'a trouvé aucun point clé — ajoute-les manuellement ci-dessous (obligatoire)."
          );
          setEditionPoints(['']);
        } else {
          await enregistrerPointsClesTronc(id, extraction.points_cles);
          listPointsClesTronc(id).then(setPointsCles);
        }
      } catch (err) {
        setErreurSyllabus(
          (err instanceof Error ? err.message : "Échec de l'extraction IA.") +
            ' — ajoute les points clés manuellement ci-dessous (obligatoire).'
        );
        setEditionPoints(['']);
      } finally {
        setAnalyseEnCours(false);
      }
    } catch (err) {
      setErreurSyllabus(
        err instanceof Error ? err.message : "Erreur lors de l'envoi."
      );
      setEnvoiSyllabus(false);
    } finally {
      e.target.value = '';
    }
  }

  function ouvrirEditionPoints() {
    setEditionPoints(
      pointsCles.length > 0 ? pointsCles.map((p) => p.libelle) : ['']
    );
  }

  async function handleEnregistrerPoints() {
    if (!id || !editionPoints) return;
    const nettoyes = editionPoints.map((p) => p.trim()).filter(Boolean);
    if (nettoyes.length === 0) {
      setErreurSyllabus('Au moins un point clé est obligatoire.');
      return;
    }
    setSavingPoints(true);
    try {
      await enregistrerPointsClesTronc(id, nettoyes);
      listPointsClesTronc(id).then(setPointsCles);
      setEditionPoints(null);
      setErreurSyllabus(null);
    } finally {
      setSavingPoints(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!troncCommun) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="font-bold text-gray-900">Tronc commun introuvable.</p>
      </div>
    );
  }

  const uesFiltrees = uesDisponibles.filter((u) =>
    u.nom.toLowerCase().includes(rechercheAjout.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/troncs-communs')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour aux troncs communs
      </button>

      <div className="flex items-center justify-between mb-6">
        <p className="font-extrabold text-2xl text-gray-900">
          {editing ? 'Modifier le tronc commun' : troncCommun.nom}
        </p>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Modifier
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 bg-red-50 rounded-full px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
            >
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[20px] p-5 flex flex-col gap-4 mb-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Nom
          </label>
          {editing ? (
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">
              {troncCommun.nom}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Enseignant
          </label>
          {editing ? (
            <select
              value={enseignantId}
              onChange={(e) => setEnseignantId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Aucun</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.matricule})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm font-semibold text-gray-900">
              {troncCommun.enseignant_nom ?? 'Aucun enseignant assigné'}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}

      {editing && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      )}

      {!editing && (
        <>
          <div className="mb-6">
            <p className="font-extrabold text-sm text-gray-900 mb-2.5">
              Syllabus (partagé par tout le groupe)
            </p>
            <div className="bg-white rounded-[20px] p-5">
              {troncCommun.syllabus_key ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {troncCommun.syllabus_nom}
                      </p>
                      <p className="text-xs text-gray-400">
                        Envoyé le{' '}
                        {troncCommun.syllabus_uploaded_at
                          ? new Date(
                              troncCommun.syllabus_uploaded_at
                            ).toLocaleDateString('fr-FR')
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={urlPubliqueR2(troncCommun.syllabus_key)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
                    >
                      <Download size={14} /> Télécharger
                    </a>
                    <label className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer">
                      {envoiSyllabus || analyseEnCours ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UploadCloud size={14} />
                      )}
                      Remplacer
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleUploadSyllabus}
                        disabled={envoiSyllabus || analyseEnCours}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-amber-600 mb-3">
                    Aucun syllabus — impossible d'attribuer une UE de ce
                    groupe à un enseignant tant qu'il manque.
                  </p>
                  <label className="inline-flex items-center gap-2 bg-red-600 rounded-full px-4 py-2 text-sm font-bold text-white hover:bg-red-700 cursor-pointer">
                    {envoiSyllabus || analyseEnCours ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <UploadCloud size={15} />
                    )}
                    Envoyer le syllabus (PDF)
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleUploadSyllabus}
                      disabled={envoiSyllabus || analyseEnCours}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
              {analyseEnCours && (
                <p className="text-xs font-semibold text-gray-400 mt-3 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Extraction
                  des points clés en cours...
                </p>
              )}
              {erreurSyllabus && (
                <p className="text-xs font-semibold text-red-600 mt-3">
                  {erreurSyllabus}
                </p>
              )}
            </div>
          </div>

          {troncCommun.syllabus_key && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <p className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
                  <ListChecks size={15} className="text-red-600" />
                  Points clés du contenu
                </p>
                {editionPoints === null && (
                  <button
                    onClick={ouvrirEditionPoints}
                    className="flex items-center gap-1 text-xs font-bold text-red-600"
                  >
                    <Pencil size={12} /> Modifier
                  </button>
                )}
              </div>
              <div className="bg-white rounded-[20px] p-5">
                {editionPoints !== null ? (
                  <>
                    <div className="flex flex-col gap-1.5 mb-3">
                      {editionPoints.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={p}
                            onChange={(e) =>
                              setEditionPoints((prev) =>
                                prev
                                  ? prev.map((v, idx) =>
                                      idx === i ? e.target.value : v
                                    )
                                  : prev
                              )
                            }
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold outline-none focus:border-red-600"
                          />
                          <button
                            onClick={() =>
                              setEditionPoints((prev) =>
                                prev
                                  ? prev.filter((_, idx) => idx !== i)
                                  : prev
                              )
                            }
                            className="text-gray-300 hover:text-red-600 shrink-0"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setEditionPoints((prev) => [...(prev ?? []), ''])
                        }
                        className="flex items-center gap-1 text-xs font-bold text-red-600"
                      >
                        <Plus size={12} /> Ajouter
                      </button>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={handleEnregistrerPoints}
                          disabled={savingPoints}
                          className="flex items-center gap-2 bg-red-600 rounded-full px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {savingPoints && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEditionPoints(null)}
                          className="text-xs font-bold text-gray-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : pointsCles.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Aucun point clé pour l'instant.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {pointsCles.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <span className="text-red-600 font-bold shrink-0">
                          ·
                        </span>
                        {p.libelle}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between mb-2.5">
        <p className="font-extrabold text-sm text-gray-900">
          UEs du groupe ({troncCommun.ues.length})
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setAjoutSpecialiteOuvert(true);
              setSpecialitesAAjouter([]);
              setErreurAjoutSpecialite(null);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-red-600"
          >
            <Plus size={14} /> Ajouter une spécialité
          </button>
          <button
            onClick={ouvrirAjout}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500"
          >
            <Plus size={14} /> Ajouter une UE existante
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[20px] overflow-hidden mb-6">
        {troncCommun.ues.map((ue) => (
          <div
            key={ue.id}
            className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0"
          >
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-900 truncate">
                {ue.nom}
              </p>
              <p className="text-xs text-gray-400">
                {ue.specialite_nom ?? 'Sans spécialité'}
                {ue.semestre && ` · ${ue.semestre}`}
                {ue.ecole_nom && ` · ${ue.ecole_nom}`}
              </p>
            </div>
            <button
              onClick={() => handleRetirerUE(ue.id)}
              className="shrink-0 text-gray-300 hover:text-red-600 p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {ajoutSpecialiteOuvert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <p className="font-extrabold text-base text-gray-900">
                Ajouter une spécialité
              </p>
              <button
                onClick={() => setAjoutSpecialiteOuvert(false)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3 shrink-0">
              Crée automatiquement une UE (mêmes caractéristiques que le
              groupe) pour chaque spécialité cochée, et l'ajoute au tronc
              commun.
            </p>

            <div className="shrink-0 mb-3">
              <RechercheSpecialite onSelect={ajouterSpecialiteAuxCandidates} />
            </div>

            {specialitesAAjouter.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
                {specialitesAAjouter.map((s) => (
                  <span
                    key={s.id}
                    className="flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-full"
                  >
                    {s.nom}
                    <button
                      type="button"
                      onClick={() => retirerSpecialiteDesCandidates(s.id)}
                      className="hover:text-purple-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {erreurAjoutSpecialite && (
              <p className="text-xs font-semibold text-red-600 mb-3 shrink-0">
                {erreurAjoutSpecialite}
              </p>
            )}

            <button
              onClick={handleAjouterSpecialites}
              disabled={specialitesAAjouter.length === 0 || ajoutSpecialiteEnCours}
              className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
            >
              {ajoutSpecialiteEnCours && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Ajouter ({specialitesAAjouter.length})
            </button>
          </div>
        </div>
      )}

      {ajoutOuvert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <p className="font-extrabold text-base text-gray-900">
                Ajouter des UEs
              </p>
              <button
                onClick={() => setAjoutOuvert(false)}
                className="text-gray-300 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3.5 py-2.5 mb-3 shrink-0">
              <Search size={15} className="text-gray-300" />
              <input
                autoFocus
                value={rechercheAjout}
                onChange={(e) => setRechercheAjout(e.target.value)}
                placeholder="Rechercher une UE..."
                className="flex-1 text-sm font-semibold outline-none bg-transparent"
              />
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1 mb-3">
              {uesFiltrees.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Aucune UE disponible.
                </p>
              ) : (
                uesFiltrees.map((u) => (
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
                      checked={ueIdsAAjouter.has(u.id)}
                      disabled={u.deja_dans_un_groupe}
                      onChange={() =>
                        setUeIdsAAjouter((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
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
                ))
              )}
            </div>

            <button
              onClick={handleAjouter}
              disabled={ueIdsAAjouter.size === 0 || saving}
              className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 shrink-0"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Ajouter ({ueIdsAAjouter.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}