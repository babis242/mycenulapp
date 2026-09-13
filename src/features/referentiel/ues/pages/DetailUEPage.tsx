// src/features/referentiel/ues/pages/DetailUEPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Loader2,
  Trash2,
  ArrowLeft,
  FileText,
  UploadCloud,
  Download,
  Pencil,
  Plus,
  X,
  ListChecks,
  Users2,
} from 'lucide-react';
import { televerserFichier, urlPubliqueR2 } from '@/lib/r2';
import { extraireTextePdf } from '@/lib/pdfExtraction';
import { getTroncCommunDeUE } from '@/features/referentiel/troncs-communs/api';
import {
  getUE,
  updateUE,
  deleteUE,
  ueEstUtilisee,
  extraireSyllabusPdf,
  enregistrerPointsCles,
  listPointsCles,
  type UEAvecOffre,
  type PointCle,
} from '../api';

// Écran 1.5 — Détail / Modification d'une UE (ecrans_ui.md)
// Une UE = une spécialité. Pour la regrouper avec d'autres UEs (tronc
// commun), voir Référentiel → Jumelages.
//
// Scénario 12 (extension IA) — dès qu'un syllabus est envoyé (création ou
// remplacement), les points clés du contenu sont automatiquement extraits
// et deviennent obligatoires : si l'IA échoue, l'admin doit les saisir à
// la main avant que le syllabus soit considéré complet.
export default function DetailUEPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ue, setUe] = useState<UEAvecOffre | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [volumeHoraire, setVolumeHoraire] = useState('');
  const [coefficient, setCoefficient] = useState('');

  const [envoiSyllabus, setEnvoiSyllabus] = useState(false);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [erreurSyllabus, setErreurSyllabus] = useState<string | null>(null);

  const [pointsCles, setPointsCles] = useState<PointCle[]>([]);
  const [editionPoints, setEditionPoints] = useState<string[] | null>(null);
  const [savingPoints, setSavingPoints] = useState(false);

  // Si cette UE appartient à un tronc commun, son syllabus/points clés ne
  // se gèrent plus ici mais au niveau du groupe (une seule source, pas de
  // copies qui divergent).
  const [troncCommun, setTroncCommun] = useState<{
    id: string;
    nom: string;
  } | null>(null);

  function chargerPointsCles(ueId: string) {
    listPointsCles(ueId).then(setPointsCles);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getUE(id)
      .then(async (data) => {
        if (cancelled || !data) return;
        setUe(data);
        setNom(data.nom);
        setCode(data.code ?? '');
        setVolumeHoraire(data.volume_horaire?.toString() ?? '');
        setCoefficient(data.coefficient?.toString() ?? '');

        const tronc = await getTroncCommunDeUE(id);
        if (cancelled) return;
        if (tronc) {
          setTroncCommun({ id: tronc.id, nom: tronc.nom });
        } else if (data.syllabus_key) {
          chargerPointsCles(id);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Erreur de chargement')
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    if (!id) return;
    if (!nom.trim()) {
      setError("Le nom de l'UE est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUE(id, {
        nom: nom.trim(),
        code: code.trim() || undefined,
        volume_horaire: volumeHoraire ? Number(volumeHoraire) : undefined,
        coefficient: coefficient ? Number(coefficient) : undefined,
      });
      setUe((prev) => (prev ? { ...prev, nom: nom.trim(), code } : prev));
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
    const utilisee = await ueEstUtilisee(id);
    const message = utilisee
      ? "Cette UE fait partie d'un jumelage. La supprimer quand même ?"
      : 'Supprimer définitivement cette UE ?';
    if (!window.confirm(message)) return;

    try {
      await deleteUE(id);
      navigate('/referentiel/ues');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la suppression.'
      );
    }
  }

  async function handleUploadSyllabus(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier || !id) return;
    setEnvoiSyllabus(true);
    setErreurSyllabus(null);
    try {
      const { nom: nomFichier } = await televerserFichier(
        'syllabus',
        id,
        fichier
      );
      setUe((prev) =>
        prev
          ? {
              ...prev,
              syllabus_key: `syllabus/${id}/${nomFichier}`,
              syllabus_nom: nomFichier,
              syllabus_uploaded_at: new Date().toISOString(),
            }
          : prev
      );
      setEnvoiSyllabus(false);

      // Les points clés sont désormais obligatoires dès qu'un syllabus
      // est envoyé — extraction automatique juste après l'upload.
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
          await enregistrerPointsCles(id, extraction.points_cles);
          chargerPointsCles(id);
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
      await enregistrerPointsCles(id, nettoyes);
      chargerPointsCles(id);
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

  if (!ue) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="font-bold text-gray-900">UE introuvable.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/referentiel/ues')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <div className="flex items-center justify-between mb-6">
        <p className="font-extrabold text-2xl text-gray-900">
          {editing ? "Modifier l'UE" : ue.nom}
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
            Nom / Intitulé
          </label>
          {editing ? (
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">{ue.nom}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Code
            </label>
            {editing ? (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.code ?? '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Volume horaire
            </label>
            {editing ? (
              <input
                type="number"
                value={volumeHoraire}
                onChange={(e) => setVolumeHoraire(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.volume_horaire ?? '—'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Coefficient
            </label>
            {editing ? (
              <input
                type="number"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900">
                {ue.coefficient ?? '—'}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-bold text-red-600">{error}</p>
        </div>
      )}

      {editing ? (
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
      ) : (
        <>
          <div className="mb-6">
            <p className="font-extrabold text-sm text-gray-900 mb-2.5">
              Rattachement
            </p>
            <div className="bg-white rounded-[20px] p-5">
              {ue.offre ? (
                <>
                  <p className="text-sm font-bold text-gray-900">
                    {ue.offre.specialite.nom} — {ue.offre.semestre}
                  </p>
                  <p className="text-xs text-gray-400">
                    {ue.offre.specialite.filiere.ecole.nom} ·{' '}
                    {ue.offre.specialite.filiere.nom}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">
                  Aucune spécialité rattachée.
                </p>
              )}
            </div>
          </div>

          {troncCommun ? (
            <div className="mb-6">
              <p className="font-extrabold text-sm text-gray-900 mb-2.5">
                Syllabus & points clés
              </p>
              <div className="bg-white rounded-[20px] p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Users2 size={18} className="text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-700">
                      Cette UE fait partie du tronc commun{' '}
                      <span className="font-bold">"{troncCommun.nom}"</span>{' '}
                      — le syllabus et les points clés sont partagés par
                      tout le groupe.
                    </p>
                    <Link
                      to={`/referentiel/troncs-communs/${troncCommun.id}`}
                      className="inline-block mt-2 text-xs font-bold text-red-600"
                    >
                      Gérer le syllabus du tronc commun →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="font-extrabold text-sm text-gray-900 mb-2.5">
                  Syllabus
                </p>
                <div className="bg-white rounded-[20px] p-5">
                  {ue.syllabus_key ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                          <FileText size={18} className="text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {ue.syllabus_nom}
                          </p>
                          <p className="text-xs text-gray-400">
                            Envoyé le{' '}
                            {ue.syllabus_uploaded_at
                              ? new Date(
                                  ue.syllabus_uploaded_at
                                ).toLocaleDateString('fr-FR')
                              : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={urlPubliqueR2(ue.syllabus_key)}
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
                        Aucun syllabus — impossible d'attribuer cette UE à un
                        enseignant tant qu'il manque.
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
                      <Loader2 size={12} className="animate-spin" />{' '}
                      Extraction des points clés en cours...
                    </p>
                  )}
                  {erreurSyllabus && (
                    <p className="text-xs font-semibold text-red-600 mt-3">
                      {erreurSyllabus}
                    </p>
                  )}
                </div>
              </div>

              {ue.syllabus_key && (
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
        </>
      )}
    </div>
  );
}