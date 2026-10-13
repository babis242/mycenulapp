// src/features/fiches-presence/pages/LecturePresencesPage.tsx
//
// Lecture automatique des PDF de présence : on choisit spécialité /
// semestre / semaine, on joint le(s) PDF, les P et A sont lus, on vérifie
// (cases, noms), puis on enregistre. Les noms absents de la liste sont
// signalés et peuvent y être ajoutés.
import { creneauxFiables } from '../creneauxFiables';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, Check, CheckCircle2, FileText, Loader2, ScanLine, Search, UploadCloud, UserPlus, X } from 'lucide-react';
import { JOURS } from '@/constants/enums';
import { ajouterEtudiants, listEtudiants, type Etudiant } from '@/features/referentiel/etudiants/api';
import SelecteurGroupe, { lundiCourant, type ChoixGroupe } from '../components/SelecteurGroupe';
import { enregistrerPresences, rapprocher, type LigneLue } from '../lectureApi';
import { lirePdfPresence } from '../lecturePdf';
import { libelleSemaine } from '../components/FichesPresencePdf';

interface LigneRevue {
  cle: string;
  photo: number;
  nom: string;
  matricule: string;
  cases: (boolean | null)[];
  etudiantId: string | null;
  statut: 'ok' | 'incertain' | 'nouveau';
  ignoree: boolean;
  nouveauMatricule: string; // saisi pour ajouter à la liste
  manuel: boolean; // rattachement choisi à la main : on n'y touche plus
}

const messageErreur = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String((e as any).message)
      : 'Erreur inconnue.';

export default function LecturePresencesPage() {
  const jours = JOURS as string[];
  const creneaux = creneauxFiables();

  const [choix, setChoix] = useState<ChoixGroupe>({
    cycleKey: '',
    semestre: '',
    specialiteId: '',
    semaine: lundiCourant(),
  });
  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [fichiers, setFichiers] = useState<{ nom: string; lignes: LigneLue[]; semaineDetectee: string | null }[]>([]);
  const [lignes, setLignes] = useState<LigneRevue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [chargementListe, setChargementListe] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<'tous' | 'traiter' | 'ok'>('tous');

  const groupePret = !!(choix.specialiteId && choix.semestre);

  useEffect(() => {
    setLignes(null);
    setSucces(null);
    if (!groupePret) {
      setEtudiants([]);
      return;
    }
    let annule = false;
    setChargementListe(true);
    listEtudiants(choix.specialiteId, choix.semestre)
      .then((l) => !annule && setEtudiants(l))
      .catch((e) => !annule && setErreur(messageErreur(e)))
      .finally(() => !annule && setChargementListe(false));
    return () => {
      annule = true;
    };
  }, [choix.specialiteId, choix.semestre, groupePret]);

  // Reconnaissance automatique : si la liste des étudiants change (chargement
  // tardif, ajout d'un nom), on ré-évalue les lignes non rattachées à la main.
  useEffect(() => {
    setLignes((ls) => {
      if (!ls || ls.length === 0) return ls;
      const pris = new Set(ls.filter((l) => l.manuel && l.etudiantId).map((l) => l.etudiantId));
      const libres = etudiants.filter((e) => !pris.has(e.id));
      const auto = ls.filter((l) => !l.manuel);
      const corr = rapprocher(
        auto.map((l) => ({ matricule: l.matricule, nom: l.nom })),
        libres
      );
      let i = 0;
      return ls.map((l) => {
        if (l.manuel) return l;
        const c = corr[i++];
        return { ...l, etudiantId: c.etudiantId, statut: c.statut };
      });
    });
  }, [etudiants]);

  async function ajouterFichiers(liste: FileList | null) {
    if (!liste?.length) return;
    setErreur(null);
    setLignes(null);
    const nouveaux: { nom: string; lignes: LigneLue[]; semaineDetectee: string | null }[] = [];
    for (const f of Array.from(liste).filter((x) => /\.pdf$/i.test(x.name) || x.type === 'application/pdf')) {
      try {
        const r = await lirePdfPresence(f, jours, creneaux.length);
        nouveaux.push({ nom: f.name, lignes: r.lignes, semaineDetectee: r.semaineDetectee });
      } catch (e) {
        setErreur(`${f.name} : ${messageErreur(e)}`);
      }
    }
    setFichiers((p) => [...p, ...nouveaux]);
    if (fichierRef.current) fichierRef.current.value = '';
  }

  function analyser() {
    setErreur(null);
    setSucces(null);
    const brutes: { fichier: number; l: LigneLue }[] = [];
    fichiers.forEach((f, i) => f.lignes.forEach((l) => brutes.push({ fichier: i, l })));
    const corr = rapprocher(
      brutes.map((b) => b.l),
      etudiants
    );
    setLignes(
      brutes.map((b, i) => ({
        cle: `${b.fichier}-${i}`,
        photo: b.fichier,
        nom: b.l.nom,
        matricule: b.l.matricule,
        cases: b.l.cases,
        etudiantId: corr[i].etudiantId,
        statut: corr[i].statut,
        ignoree: false,
        nouveauMatricule: b.l.matricule,
        manuel: false,
      }))
    );
  }

  const modifier = (cle: string, patch: Partial<LigneRevue>) =>
    setLignes((ls) => ls && ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));

  function basculerCase(cle: string, k: number) {
    setLignes((ls) =>
      ls &&
      ls.map((l) =>
        l.cle === cle
          ? {
              ...l,
              // vide → P → A → vide
              cases: l.cases.map((c, i) => (i === k ? (c === null ? true : c ? false : null) : c)),
            }
          : l
      )
    );
  }

  function choisirEtudiant(cle: string, valeur: string) {
    if (valeur === '__ignorer') modifier(cle, { ignoree: true, manuel: true });
    else if (valeur === '') modifier(cle, { etudiantId: null, statut: 'nouveau', ignoree: false, manuel: true });
    else modifier(cle, { etudiantId: valeur, statut: 'ok', ignoree: false, manuel: true });
  }

  async function ajouterALaListe(l: LigneRevue) {
    setErreur(null);
    if (!l.nouveauMatricule.trim() || !l.nom.trim()) {
      setErreur('Saisis le matricule et le nom avant d\'ajouter à la liste.');
      return;
    }
    setAjoutEnCours(l.cle);
    try {
      await ajouterEtudiants(choix.specialiteId, choix.semestre, [
        { matricule: l.nouveauMatricule, nom_complet: l.nom },
      ]);
      const maj = await listEtudiants(choix.specialiteId, choix.semestre);
      setEtudiants(maj);
      const cree = maj.find(
        (e) => e.matricule.trim().toLowerCase() === l.nouveauMatricule.trim().toLowerCase()
      );
      if (cree) modifier(l.cle, { etudiantId: cree.id, statut: 'ok', manuel: true });
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAjoutEnCours(null);
    }
  }

  const nouveaux = (lignes ?? []).filter((l) => !l.ignoree && !l.etudiantId);
  const aEnregistrer = (lignes ?? []).filter((l) => !l.ignoree && l.etudiantId);
  const absentsDeLaFiche = useMemo(() => {
    if (!lignes) return [];
    const vus = new Set(aEnregistrer.map((l) => l.etudiantId));
    return etudiants.filter((e) => !vus.has(e.id));
  }, [lignes, etudiants, aEnregistrer]);

  async function enregistrer() {
    setErreur(null);
    setSucces(null);
    if (aEnregistrer.length === 0) {
      setErreur('Aucune ligne rattachée à un étudiant à enregistrer.');
      return;
    }
    setEnregistrement(true);
    try {
      // Un étudiant lu sur plusieurs photos : on fusionne (présent s'il l'est quelque part).
      const parEtudiant = new Map<string, (boolean | null)[]>();
      for (const l of aEnregistrer) {
        const prec = parEtudiant.get(l.etudiantId!);
        parEtudiant.set(
          l.etudiantId!,
          prec ? prec.map((c, i) => (c === null ? l.cases[i] : l.cases[i] === null ? c : c || l.cases[i])) : [...l.cases]
        );
      }
      const n = await enregistrerPresences({
        specialiteId: choix.specialiteId,
        semestre: choix.semestre,
        semaine: choix.semaine,
        jours,
        creneaux,
        parEtudiant,
      });
      setSucces(`Présences enregistrées pour ${n} étudiant(s).`);
      setLignes(null);
      setFichiers([]);
    } catch (e) {
      setErreur(`Échec de l'enregistrement : ${messageErreur(e)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  // ── Présentation ────────────────────────────────────────────────
  const actives = (lignes ?? []).filter((l) => !l.ignoree);
  const nbReconnus = actives.filter((l) => l.etudiantId && l.statut === 'ok').length;
  const nbAVerifier = actives.filter((l) => l.etudiantId && l.statut === 'incertain').length;
  const nbPresents = actives.reduce((n, l) => n + l.cases.filter((c) => c === true).length, 0);
  const nbAbsents = actives.reduce((n, l) => n + l.cases.filter((c) => c === false).length, 0);
  const tauxGlobal = nbPresents + nbAbsents ? Math.round((nbPresents / (nbPresents + nbAbsents)) * 100) : null;

  const etape = !groupePret ? 1 : fichiers.length === 0 ? 2 : !lignes ? 3 : 4;
  const etapes = ['Groupe', 'PDF', 'Analyse', 'Vérification'];

  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const requete = norm(recherche.trim());
  const visibles = (lignes ?? []).filter((l) => {
    if (requete) {
      const lie = etudiants.find((e) => e.id === l.etudiantId);
      const texte = norm(`${l.nom} ${l.matricule} ${lie?.nom_complet ?? ''} ${lie?.matricule ?? ''}`);
      if (!requete.split(/\s+/).every((m) => texte.includes(m))) return false;
    }
    if (filtre === 'traiter') return !l.ignoree && (!l.etudiantId || l.statut === 'incertain');
    if (filtre === 'ok') return !l.ignoree && !!l.etudiantId && l.statut === 'ok';
    return true;
  });

  const champ =
    'w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-red-600 focus:bg-white rounded-lg px-2 py-1 font-semibold text-gray-900 outline-none transition-colors';
  const liste =
    'w-full bg-white border border-gray-200 focus:border-red-600 rounded-lg px-2.5 py-1.5 text-gray-700 outline-none transition-colors';
  // Tailles critiques en style en ligne : elles ne dépendent pas du CSS global.
  const grille: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(6, 62px)',
    columnGap: 6,
    alignItems: 'center',
  };
  const TAILLE = 24;

  const Cellule = ({ valeur, onClick, desactive }: { valeur: boolean | null; onClick: () => void; desactive: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      style={{ width: TAILLE, height: TAILLE, borderRadius: 6, padding: 0, flexShrink: 0 }}
      className={`flex items-center justify-center transition-transform duration-100 hover:scale-110 active:scale-95 disabled:hover:scale-100 ${
        valeur === null
          ? 'bg-white border border-gray-300'
          : valeur
            ? 'bg-green-600 text-white'
            : 'bg-red-50 text-red-600 border border-red-200'
      }`}
      aria-label={valeur === null ? 'Vide' : valeur ? 'Présent' : 'Absent'}
    >
      {valeur === null ? (
        <span style={{ display: 'block', width: 4, height: 1, background: '#d1d5db' }} />
      ) : valeur ? (
        <Check size={12} strokeWidth={3} />
      ) : (
        <X size={12} strokeWidth={3} />
      )}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* En-tête */}
      <div className="mb-7">
        <p className="font-extrabold text-3xl text-gray-900 mb-1.5">Lecture des PDF de présence</p>
        <p className="text-sm text-gray-500 max-w-xl">
          Joins le PDF : les P et les A sont lus automatiquement. Tu vérifies, puis tu enregistres.
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-5">
          {etapes.map((nom, i) => {
            const n = i + 1;
            const fait = n < etape;
            const courant = n === etape;
            return (
              <div key={nom} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      courant ? 'bg-red-600 text-white' : fait ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {fait ? <Check size={11} strokeWidth={3} /> : n}
                  </span>
                  <span className={`text-xs font-semibold ${courant ? 'text-gray-900' : fait ? 'text-gray-500' : 'text-gray-300'}`}>
                    {nom}
                  </span>
                </div>
                {i < etapes.length - 1 && <span className="w-8 h-px bg-gray-200" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Groupe */}
      <div className="bg-white rounded-[20px] p-6 mb-4">
        <p className="font-bold text-base text-gray-900">Classe et semaine</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-5">Les présences seront rattachées à cette spécialité et à cette semaine.</p>
        <SelecteurGroupe valeur={choix} onChange={setChoix} />
      </div>

      {/* PDF */}
      {groupePret && (
        <div className="bg-white rounded-[20px] p-6 mb-4">
          <p className="font-bold text-base text-gray-900">PDF de présence</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-5">
            {etudiants.length} étudiant(s) dans la liste · semestre {choix.semestre}
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              ajouterFichiers(e.dataTransfer.files);
            }}
            onClick={() => fichierRef.current?.click()}
            className={`cursor-pointer rounded-2xl border border-dashed px-6 py-8 text-center transition-colors ${
              survol ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50/60 hover:border-red-300 hover:bg-white'
            }`}
          >
            <UploadCloud size={22} className="text-red-600 mx-auto mb-2.5" />
            <p className="font-semibold text-[13px] text-gray-900">Glisse le PDF ici ou clique pour le choisir</p>
            <p className="text-xs text-gray-400 mt-1">Un ou plusieurs PDF</p>
            <input
              ref={fichierRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => ajouterFichiers(e.target.files)}
            />
          </div>

          {fichiers.length > 0 && (
            <div className="flex flex-col gap-2 mt-4">
              {fichiers.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3 bg-gray-50" style={{ border: '1px solid #e5e7eb' }}>
                  <FileText size={16} className="text-red-600 shrink-0" />
                  <p className="text-[13px] font-semibold text-gray-900 truncate flex-1">{f.nom}</p>
                  <span className="text-xs text-gray-400 shrink-0">{f.lignes.length} ligne(s)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFichiers((fs) => fs.filter((_, k) => k !== i));
                      setLignes(null);
                    }}
                    className="text-gray-300 hover:text-gray-700 transition-colors"
                    aria-label="Retirer le PDF"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {fichiers.some((f) => f.semaineDetectee && f.semaineDetectee !== choix.semaine) && (
            <div className="flex items-start gap-2.5 bg-amber-50 text-amber-800 text-xs rounded-xl px-3.5 py-2.5 mt-4">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <span>
                Un PDF indique une autre semaine que celle choisie ({libelleSemaine(choix.semaine)}). Vérifie avant
                d'enregistrer.
              </span>
            </div>
          )}

          {!chargementListe && etudiants.length === 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 text-amber-800 text-xs rounded-xl px-3.5 py-2.5 mt-4">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <span>
                Aucun étudiant dans la liste de « {choix.specialiteNom || 'cette spécialité'} » au semestre {choix.semestre}.
                Vérifie la spécialité et le semestre choisis, sinon aucun nom ne pourra être reconnu.
              </span>
            </div>
          )}

          {fichiers.length > 0 && (
            <button
              type="button"
              onClick={analyser}
              disabled={chargementListe}
              className="mt-5 inline-flex disabled:opacity-50 items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] px-5 py-2.5 rounded-full transition-colors"
            >
              {chargementListe ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}
              {chargementListe ? 'Chargement de la liste…' : 'Analyser les présences'}
            </button>
          )}
        </div>
      )}

      {erreur && <div className="bg-red-50 text-red-700 text-[13px] rounded-xl px-4 py-3 mb-4">{erreur}</div>}
      {succes && (
        <div className="bg-white rounded-[20px] p-7 mb-4 text-center">
          <CheckCircle2 size={30} className="text-green-600 mx-auto mb-3" />
          <p className="font-semibold text-base text-gray-900">{succes}</p>
          <p className="text-xs text-gray-400 mt-1">Retrouve-les dans « Présences étudiants », avec le PDF à télécharger.</p>
        </div>
      )}

      {/* Vérification */}
      {lignes && (
        <>
          <div className="bg-white rounded-[20px] px-6 py-6 mb-4 grid grid-cols-2 sm:grid-cols-5 gap-y-4">
            {[
              { l: 'Lignes lues', v: String(lignes.length), c: 'text-gray-900' },
              { l: 'Reconnus', v: String(nbReconnus), c: 'text-green-600' },
              { l: 'À vérifier', v: String(nbAVerifier), c: nbAVerifier ? 'text-amber-600' : 'text-gray-900' },
              { l: 'Nouveaux noms', v: String(nouveaux.length), c: nouveaux.length ? 'text-red-600' : 'text-gray-900' },
              { l: 'Présence', v: tauxGlobal === null ? '—' : `${tauxGlobal} %`, c: 'text-gray-900' },
            ].map((k) => (
              <div key={k.l} className="px-5 first:pl-0" style={{ borderLeft: k.l === 'Lignes lues' ? 'none' : '1px solid #e5e7eb' }}>
                <p className={`font-extrabold text-3xl leading-none ${k.c}`}>{k.v}</p>
                <p className="text-xs font-semibold text-gray-500 mt-2">{k.l}</p>
              </div>
            ))}
          </div>

          {nbReconnus + nbAVerifier === 0 && lignes.length > 0 && (
            <div className="flex items-start gap-2.5 bg-red-50 text-red-700 text-[13px] rounded-xl px-4 py-3 mb-4">
              <AlertTriangle size={16} className="mt-px shrink-0" />
              <span>
                Aucun nom du PDF ne correspond à la liste de « {choix.specialiteNom || 'cette spécialité'} » ({etudiants.length}{' '}
                étudiant(s), semestre {choix.semestre}). Tu t'es probablement trompé de spécialité ou de semestre.
              </span>
            </div>
          )}

          {nouveaux.length > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 text-amber-800 text-[13px] rounded-xl px-4 py-3 mb-4">
              <AlertTriangle size={16} className="mt-px shrink-0" />
              <span>
                {nouveaux.length} nom(s) du PDF ne figurent pas dans la liste : ajoute-les (matricule requis),
                rattache-les à un étudiant existant ou ignore-les.
              </span>
            </div>
          )}

          <div className="bg-white rounded-[20px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-base text-gray-900">Vérification</p>
                <p className="text-xs text-gray-500 mt-0.5">Clique sur une case pour la corriger : vide → présent → absent.</p>
              </div>
              <div className="flex gap-0.5 bg-gray-100 rounded-full p-0.5">
                {([
                  ['tous', `Tous ${lignes.length}`],
                  ['traiter', `À traiter ${nouveaux.length + nbAVerifier}`],
                  ['ok', `Reconnus ${nbReconnus}`],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltre(k)}
                    className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                      filtre === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-5">
              <Search size={16} className="absolute text-gray-400" style={{ left: 16, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un étudiant (nom ou matricule)…"
                className="w-full bg-gray-50 focus:bg-white outline-none transition-colors"
                style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '11px 40px 11px 42px', fontSize: 14 }}
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche('')}
                  className="absolute text-gray-400 hover:text-gray-700"
                  style={{ right: 14, top: '50%', transform: 'translateY(-50%)' }}
                  aria-label="Effacer la recherche"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="overflow-x-auto -mx-2 px-2">
              <div style={{ minWidth: 640 }}>
                <div className="px-2 pt-6 pb-2" style={{ ...grille, borderBottom: '1px solid #e5e7eb' }}>
                  <span className="text-xs font-semibold text-gray-500">Étudiant</span>
                  {jours.map((j) => (
                    <div key={j} className="text-center">
                      <p className="text-xs font-bold text-gray-700">{j.slice(0, 3)}</p>
                      <div className="flex justify-center" style={{ gap: 4, marginTop: 2 }}>
                        {creneaux.map((c) => (
                          <span key={c} style={{ width: TAILLE, fontSize: 10, color: '#9ca3af', display: 'block' }}>
                            {c.slice(0, 2)}h
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  {visibles.length === 0 && <p className="text-center text-[13px] text-gray-400 py-10">{requete ? 'Aucun résultat pour cette recherche.' : 'Rien à afficher dans cette vue.'}</p>}
                  {visibles.map((l) => {
                    const sansCompte = !l.etudiantId && !l.ignoree;
                    const douteux = !!l.etudiantId && l.statut === 'incertain' && !l.ignoree;
                    const p = l.cases.filter((c) => c === true).length;
                    const t = l.cases.filter((c) => c !== null).length;
                    const lie = etudiants.find((e) => e.id === l.etudiantId);
                    const ouvert = ouverts.has(l.cle) || sansCompte || douteux || l.ignoree;
                    return (
                      <div
                        key={l.cle}
                        style={{ borderBottom: '1px solid #e5e7eb' }}
                        className={`px-2 py-3 transition-colors ${
                          l.ignoree ? 'opacity-50' : sansCompte ? 'bg-amber-50/50' : douteux ? 'bg-yellow-50/50' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <div style={grille}>
                          <div className="min-w-0">
                            <input
                              value={l.nom}
                              onChange={(e) => modifier(l.cle, { nom: e.target.value })}
                              className={champ}
                              style={{ fontSize: 14 }}
                            />
                            <p className="px-2 leading-tight" style={{ fontSize: 12, marginTop: 2 }}>
                              {sansCompte ? (
                                <span className="text-amber-700 font-medium">Nouveau nom</span>
                              ) : douteux ? (
                                <span className="text-yellow-700 font-medium">À vérifier</span>
                              ) : l.ignoree ? (
                                <span className="text-gray-400">Ignoré</span>
                              ) : (
                                <span className="text-green-600 font-medium">Reconnu</span>
                              )}
                              {lie && !l.ignoree && <span className="text-gray-400"> · {lie.matricule}</span>}
                              {t > 0 && <span className="text-gray-400"> · {p}/{t}</span>}
                              {!ouvert && (
                                <button
                                  type="button"
                                  onClick={() => setOuverts((o) => new Set(o).add(l.cle))}
                                  className="text-gray-400 hover:text-red-600 underline ml-2"
                                >
                                  changer
                                </button>
                              )}
                            </p>
                          </div>

                          {jours.map((j, ji) => (
                            <div key={j} className="flex justify-center rounded-lg bg-gray-100" style={{ gap: 4, padding: '5px 0' }}>
                              {creneaux.map((c, ci) => {
                                const k = ji * creneaux.length + ci;
                                return (
                                  <Cellule key={c} valeur={l.cases[k] ?? null} onClick={() => basculerCase(l.cle, k)} desactive={l.ignoree} />
                                );
                              })}
                            </div>
                          ))}
                        </div>

                        {ouvert && (
                          <div className="mt-2 px-2">
                            <select
                              value={l.ignoree ? '__ignorer' : l.etudiantId ?? ''}
                              onChange={(e) => choisirEtudiant(l.cle, e.target.value)}
                              className={liste}
                              style={{ fontSize: 12 }}
                            >
                              <option value="">— Nouveau nom —</option>
                              <option value="__ignorer">— Ignorer cette ligne —</option>
                              {etudiants.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.nom_complet} ({e.matricule})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {sansCompte && (
                          <div className="flex flex-wrap items-center gap-2.5 mt-2 px-2">
                            <span className="text-xs text-amber-800">Ou ajouter à la liste :</span>
                            <input
                              value={l.nouveauMatricule}
                              onChange={(e) => modifier(l.cle, { nouveauMatricule: e.target.value })}
                              placeholder="Matricule"
                              style={{ fontSize: 12 }}
                              className="bg-white border border-amber-200 focus:border-red-600 rounded-lg px-2.5 py-1.5 outline-none w-36"
                            />
                            <button
                              type="button"
                              onClick={() => ajouterALaListe(l)}
                              disabled={ajoutEnCours === l.cle}
                              className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-4 py-1.5 rounded-full disabled:opacity-50 transition-colors"
                            >
                              {ajoutEnCours === l.cle ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                              Ajouter
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {absentsDeLaFiche.length > 0 && (
              <p className="mt-5 text-xs text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-600">{absentsDeLaFiche.length} étudiant(s) de la liste</span> n'apparaissent pas
                dans le PDF, rien ne sera enregistré pour eux : {absentsDeLaFiche.map((e) => e.nom_complet).join(', ')}.
              </p>
            )}
            <div className="mt-6 pt-5 flex flex-wrap items-center justify-between gap-4" style={{ borderTop: '1px solid #e5e7eb' }}>
              <p className="text-sm text-gray-500">
                <span className="font-extrabold text-gray-900 text-base">{aEnregistrer.length}</span> étudiant(s) prêts à enregistrer
                {nouveaux.length > 0 && <span className="text-amber-600 font-semibold ml-2">· {nouveaux.length} non rattaché(s)</span>}
              </p>
              <button
                type="button"
                onClick={enregistrer}
                disabled={enregistrement || aEnregistrer.length === 0}
                className="group bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:-translate-y-px active:translate-y-0"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 52,
                  padding: '0 14px 0 28px',
                  borderRadius: 999,
                  fontSize: 15,
                  boxShadow: '0 8px 20px -8px rgba(220,38,38,0.65)',
                }}
              >
                <span>Enregistrer les présences</span>
                <span
                  className="flex items-center justify-center"
                  style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.22)' }}
                >
                  {enregistrement ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} strokeWidth={3} />}
                </span>
              </button>
            </div>
          </div>

        </>
      )}
    </div>
  );
}