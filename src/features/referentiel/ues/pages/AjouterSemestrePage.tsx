// src/features/referentiel/ues/pages/AjouterSemestrePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  Sparkles,
  FileText,
  X,
  Plus,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import { extraireTextePdfParPage, decouperPdfParPage } from '@/lib/pdfExtraction';
import { televerserFichier } from '@/lib/r2';
import {
  extraireSyllabusPdf,
  creerUEsDuSemestre,
  enregistrerPointsCles,
} from '../api';

interface MatiereEditable {
  nom: string;
  code: string;
  volumeHoraire: string;
  coefficient: string;
  pointsCles: string[];
  // Fichier PDF de la page d'origine — devient le syllabus de l'UE une
  // fois enregistrée, exactement comme un import individuel.
  pageFichier: File;
}

// Import en masse : un seul PDF couvrant tout un semestre (plusieurs
// UEs à la suite) → l'IA extrait chaque UE une par une (nom, code,
// volume horaire, points clés — coefficient à 1 par défaut, pas extrait)
// → révision UE par UE avant l'enregistrement groupé.
export default function AjouterSemestrePage() {
  const navigate = useNavigate();

  const [specialite, setSpecialite] = useState<SpecialiteRecherche | null>(
    null
  );
  const [semestre, setSemestre] = useState('');

  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [erreurAnalyse, setErreurAnalyse] = useState<string | null>(null);

  const [matieres, setMatieres] = useState<MatiereEditable[]>([]);
  const [indexAffiche, setIndexAffiche] = useState(0);

  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<
    string | null
  >(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [progression, setProgression] = useState<{
    page: number;
    total: number;
  } | null>(null);

  async function handleImporterPdf(fichier: File | undefined) {
    if (!fichier) return;
    setNomFichier(fichier.name);
    setAnalyseEnCours(true);
    setErreurAnalyse(null);
    setMatieres([]);
    try {
      const [pages, pageFichiers] = await Promise.all([
        extraireTextePdfParPage(fichier),
        decouperPdfParPage(fichier),
      ]);
      const trouvees: MatiereEditable[] = [];
      for (let i = 0; i < pages.length; i++) {
        setProgression({ page: i + 1, total: pages.length });
        const texte = pages[i];
        // Une page sans texte substantiel (page de garde, séparateur...)
        // ne peut pas être une UE — on l'ignore sans même appeler l'IA.
        if (texte.trim().length < 100) continue;
        try {
          const extraction = await extraireSyllabusPdf(texte);
          // Une page qui n'est pas le début d'une UE (ex : tableau
          // récapitulatif du semestre) donne une extraction sans nom ou
          // sans points clés exploitables — on l'ignore silencieusement,
          // ce n'est pas une erreur.
          if (extraction.nom && extraction.points_cles.length > 0) {
            trouvees.push({
              nom: extraction.nom,
              code: extraction.code ?? '',
              volumeHoraire:
                extraction.volume_horaire != null
                  ? String(extraction.volume_horaire)
                  : '',
              coefficient: '1',
              pointsCles: extraction.points_cles,
              pageFichier: pageFichiers[i],
            });
          }
        } catch {
          // Une page individuelle qui échoue ne doit pas bloquer les
          // autres — elle sera simplement absente, ajoutable à la main.
        }
      }
      if (trouvees.length === 0) {
        setErreurAnalyse(
          "Aucune UE reconnue dans ce document — vérifie qu'il s'agit bien d'un syllabus avec une UE par page, ou remplis à la main."
        );
        setNomFichier(null);
      } else {
        setMatieres(trouvees);
        setIndexAffiche(0);
      }
    } catch (err) {
      setErreurAnalyse(
        err instanceof Error ? err.message : "Erreur lors de l'analyse."
      );
      setNomFichier(null);
    } finally {
      setAnalyseEnCours(false);
      setProgression(null);
    }
  }

  function majMatiere(index: number, champs: Partial<MatiereEditable>) {
    setMatieres((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...champs } : m))
    );
  }

  function ajouterPointCle(index: number) {
    majMatiere(index, {
      pointsCles: [...matieres[index].pointsCles, ''],
    });
  }
  function majPointCle(index: number, pIndex: number, valeur: string) {
    const points = [...matieres[index].pointsCles];
    points[pIndex] = valeur;
    majMatiere(index, { pointsCles: points });
  }
  function retirerPointCle(index: number, pIndex: number) {
    majMatiere(index, {
      pointsCles: matieres[index].pointsCles.filter((_, i) => i !== pIndex),
    });
  }
  function retirerMatiere(index: number) {
    setMatieres((prev) => prev.filter((_, i) => i !== index));
    setIndexAffiche((prev) => Math.max(0, Math.min(prev, matieres.length - 2)));
  }

  async function handleEnregistrerTout() {
    if (!specialite || !semestre || matieres.length === 0) return;
    const sansPointsCles = matieres.filter(
      (m) => m.pointsCles.filter((p) => p.trim()).length === 0
    );
    if (sansPointsCles.length > 0) {
      setErreurEnregistrement(
        `${sansPointsCles.length} UE sans point clé — vérifie chaque matière avant d'enregistrer (au moins un point clé obligatoire).`
      );
      return;
    }

    setEnregistrement(true);
    setErreurEnregistrement(null);
    try {
      const creees = await creerUEsDuSemestre(
        matieres.map((m) => ({
          nom: m.nom.trim(),
          code: m.code.trim() || null,
          volumeHoraire: m.volumeHoraire ? Number(m.volumeHoraire) : null,
          coefficient: m.coefficient ? Number(m.coefficient) : 1,
        })),
        specialite.id,
        semestre
      );
      await Promise.all(
        creees.map(async (ue, i) => {
          await enregistrerPointsCles(
            ue.id,
            matieres[i].pointsCles.map((p) => p.trim()).filter(Boolean)
          );
          // La page d'origine devient le syllabus de l'UE — même flux
          // que pour un import individuel.
          await televerserFichier('syllabus', ue.id, matieres[i].pageFichier);
        })
      );
      setSucces(`${creees.length} UEs créées avec succès.`);
      setMatieres([]);
      setNomFichier(null);
    } catch (err) {
      setErreurEnregistrement(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement."
      );
    } finally {
      setEnregistrement(false);
    }
  }

  const semestresDisponibles = specialite
    ? SEMESTRES_PAR_TYPE_CURSUS[specialite.typeCursus]
    : [];

  const matiereCourante = matieres[indexAffiche];

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Ajouter un semestre complet
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Importe un seul PDF couvrant plusieurs UEs — l'IA les extrait une
        par une, à vérifier avant d'enregistrer.
      </p>

      {succes ? (
        <div className="bg-white rounded-[20px] p-8 text-center">
          <CheckCircle2 size={28} className="text-green-600 mx-auto mb-3" />
          <p className="font-bold text-gray-900 mb-1">{succes}</p>
          <button
            onClick={() => navigate('/referentiel/ues')}
            className="mt-3 text-sm font-bold text-red-600 hover:underline"
          >
            Retour à la liste des UEs →
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-[20px] p-5 mb-4">
            <p className="font-extrabold text-sm text-gray-900 mb-3">
              Rattachement
            </p>
            <div className="mb-3">
              <RechercheSpecialite
                onSelect={(s) => {
                  setSpecialite(s);
                  setSemestre('');
                }}
              />
            </div>
            {specialite && (
              <p className="text-xs font-semibold text-gray-500 mb-3">
                {specialite.nom} — {specialite.ecoleNom}
              </p>
            )}
            <label className="block text-xs font-bold text-gray-500 mb-1.5">
              Semestre
            </label>
            <select
              value={semestre}
              onChange={(e) => setSemestre(e.target.value)}
              disabled={!specialite}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300"
            >
              <option value="">Sélectionner...</option>
              {semestresDisponibles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-[20px] p-5 mb-5">
            <p className="font-extrabold text-sm text-gray-900 mb-1 flex items-center gap-1.5">
              <Sparkles size={15} className="text-red-600" />
              Importer le PDF du semestre
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Un seul fichier contenant toutes les UEs du semestre.
            </p>
            {!specialite || !semestre ? (
              <p className="text-xs font-semibold text-amber-600">
                Choisis d'abord la spécialité et le semestre ci-dessus.
              </p>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-red-300">
                {analyseEnCours ? (
                  <Loader2 size={18} className="text-gray-400 animate-spin shrink-0" />
                ) : (
                  <FileText size={18} className="text-gray-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-gray-500 truncate">
                  {analyseEnCours
                    ? progression
                      ? `Analyse page ${progression.page}/${progression.total}...`
                      : 'Analyse en cours...'
                    : nomFichier ?? 'Choisir un PDF de semestre'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleImporterPdf(e.target.files?.[0])}
                  className="hidden"
                  disabled={analyseEnCours}
                />
              </label>
            )}
            {erreurAnalyse && (
              <p className="text-xs font-semibold text-red-600 mt-2">
                {erreurAnalyse}
              </p>
            )}
          </div>

          {matieres.length > 0 && (
            <>
              <div className="bg-white rounded-[20px] p-5 mb-5">
                <p className="font-extrabold text-sm text-gray-900 mb-3">
                  {matieres.length} UEs trouvées — vérifie chacune
                </p>
                <select
                  value={indexAffiche}
                  onChange={(e) => setIndexAffiche(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:border-red-600 mb-4"
                >
                  {matieres.map((m, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {m.nom || '(sans nom)'}
                    </option>
                  ))}
                </select>

                {matiereCourante && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">
                        Nom / Intitulé
                      </label>
                      <input
                        value={matiereCourante.nom}
                        onChange={(e) =>
                          majMatiere(indexAffiche, { nom: e.target.value })
                        }
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">
                          Code
                        </label>
                        <input
                          value={matiereCourante.code}
                          onChange={(e) =>
                            majMatiere(indexAffiche, { code: e.target.value })
                          }
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">
                          Volume horaire
                        </label>
                        <input
                          type="number"
                          value={matiereCourante.volumeHoraire}
                          onChange={(e) =>
                            majMatiere(indexAffiche, {
                              volumeHoraire: e.target.value,
                            })
                          }
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">
                          Coefficient
                        </label>
                        <input
                          type="number"
                          value={matiereCourante.coefficient}
                          onChange={(e) =>
                            majMatiere(indexAffiche, {
                              coefficient: e.target.value,
                            })
                          }
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-gray-500">
                          Points clés du contenu *
                        </label>
                        <button
                          type="button"
                          onClick={() => ajouterPointCle(indexAffiche)}
                          className="flex items-center gap-1 text-[11px] font-bold text-red-600"
                        >
                          <Plus size={12} /> Ajouter
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {matiereCourante.pointsCles.map((p, pIndex) => (
                          <div key={pIndex} className="flex items-center gap-1.5">
                            <input
                              value={p}
                              onChange={(e) =>
                                majPointCle(indexAffiche, pIndex, e.target.value)
                              }
                              className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-red-600"
                            />
                            <button
                              type="button"
                              onClick={() => retirerPointCle(indexAffiche, pIndex)}
                              className="text-gray-300 hover:text-red-600 shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {matiereCourante.pointsCles.length === 0 && (
                          <p className="text-xs font-semibold text-amber-600">
                            Aucun point clé — obligatoire avant enregistrement.
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => retirerMatiere(indexAffiche)}
                      className="flex items-center gap-1.5 text-xs font-bold text-red-600 self-start"
                    >
                      <Trash2 size={13} /> Retirer cette UE de l'import
                    </button>
                  </div>
                )}
              </div>

              {erreurEnregistrement && (
                <p className="text-xs font-semibold text-red-600 mb-3">
                  {erreurEnregistrement}
                </p>
              )}

              <button
                onClick={handleEnregistrerTout}
                disabled={enregistrement}
                className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {enregistrement && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Enregistrer les {matieres.length} UEs
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}