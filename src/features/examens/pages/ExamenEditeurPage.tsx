// Construction du programme d'un examen — même principe que la création de l'emploi du temps :
// grille jours × créneaux, bouton « + » par case, fenêtre de saisie, colonne des matières.
// Une épreuve de TRONC COMMUN est enregistrée une seule fois et apparaît dans toutes les
// spécialités concernées. Génération des PDF (une page par spécialité).
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Pencil, Printer, Coffee, X, Trash2, Link2, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { listSalles } from '@/features/referentiel/salles/api';
import {
  ajouterJours, ajouterLigne, attribuerSalle, listSpecialitesCandidates, modifierSpecialitesExamen, cleMatiere, conflitHoraire, conflitsRessources, dateFr, DUREE_EPREUVE_DEFAUT,
  DUREE_PAUSE_DEFAUT, getExamen, heureVersMinutes, jourDeDate, joursEntre, lignesPourSpecialite, listLignes,
  listMatieresExamen, minutesVersChamp, minutesVersHeure, modifierLigne, nomLigne, seChevauchent, specialitesDeLigne, supprimerJour,
  supprimerLigne, type Examen, type LigneExamen, type MatiereExamen,
} from '../api';
import { calculerEtatMatieres } from '@/features/etat-matieres/api';
import ExamenPdf from '../components/ExamenPdf';

const champ: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 14, fontWeight: 600, background: '#fff' };
const etiquette: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 };
const pilule = (actif: boolean): React.CSSProperties => ({ border: 0, cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, background: actif ? '#dc2626' : '#f3f4f6', color: actif ? '#fff' : '#374151' });
const bouton: React.CSSProperties = { border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 800, background: '#dc2626', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 };

type Saisie = {
  ligneId: string | null; type: 'epreuve' | 'pause'; cle: string; date: string;
  debut: string; duree: number; salle: string;
  /** Nom affiché dans le programme (vide = nom de l'UE). */
  libelle: string;
  /** Pause : spécialités concernées. */
  specs: string[];
  /** Pause en modification : lignes existantes du groupe (spécialité → id de ligne). */
  groupe: Record<string, string>;
};

const DEBUT_JOURNEE = 8 * 60;

export default function ExamenEditeurPage() {
  const { id = '' } = useParams();
  const [examen, setExamen] = useState<Examen | null>(null);
  const [lignes, setLignes] = useState<LigneExamen[]>([]);
  const [matieres, setMatieres] = useState<MatiereExamen[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [onglet, setOnglet] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [modal, setModal] = useState<Saisie | null>(null);
  const [erreurModal, setErreurModal] = useState<string | null>(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const user = useAuthStore((st) => st.user);
  const perimetre = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;
  const [panneauSpec, setPanneauSpec] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; nom: string }[]>([]);
  const [selSpec, setSelSpec] = useState<Set<string>>(new Set());
  const [panneauSalle, setPanneauSalle] = useState(false);
  const [salleBloc, setSalleBloc] = useState('');
  const [specsBloc, setSpecsBloc] = useState<Set<string>>(new Set());
  const [joursBloc, setJoursBloc] = useState<Set<string>>(new Set());
  const [ecraser, setEcraser] = useState(true);
  const [pct, setPct] = useState<Map<string, number>>(new Map());
  const [seuilActif, setSeuilActif] = useState(false);
  const [seuil, setSeuil] = useState(70);
  const [dateSeuil, setDateSeuil] = useState(() => new Date().toISOString().slice(0, 10));
  const [pdfSpecialites, setPdfSpecialites] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const ex = await getExamen(id);
        setExamen(ex);
        setOnglet(ex.specialites[0]?.id ?? '');
        setPdfSpecialites(ex.specialites);
        const [l, m] = await Promise.all([listLignes(id), listMatieresExamen(ex.specialites.map((s) => s.id), ex.semestre)]);
        setLignes(l); setMatieres(m);
        listSalles().then((s) => setSalles(s.map((x) => x.code_salle))).catch(() => {});
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      } finally { setChargement(false); }
    })();
  }, [id]);

  useEffect(() => {
    if (!examen || matieres.length === 0) return;
    let annule = false;
    const troncParOffre = new Map(matieres.filter((m) => m.troncId).map((m) => [m.offreId, m.troncId as string]));
    calculerEtatMatieres(examen.specialites, examen.semestre, { jusquau: dateSeuil || undefined, troncParOffre })
      .then((r) => { if (!annule) setPct(new Map(r.lignes.map((x) => [x.offreId, x.pourcentage]))); })
      .catch(() => {});
    return () => { annule = true; };
  }, [examen, matieres, dateSeuil]);

  /** Matière éligible : seuil désactivé, ou avancement ≥ seuil (tronc commun : une des UE du tronc suffit). */
  const eligible = (m: MatiereExamen) => {
    if (!seuilActif) return true;
    const offres = m.troncId ? matieres.filter((x) => x.troncId === m.troncId) : [m];
    return offres.some((x) => (pct.get(x.offreId) ?? -1) >= seuil);
  };
  const matieresToutes = useMemo(() => matieres.filter((m) => m.specialiteId === onglet), [matieres, onglet]);
  const matieresSpec = useMemo(
    () => matieresToutes.filter(eligible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matieresToutes, seuilActif, seuil, pct]
  );
  const lignesSpec = useMemo(() => lignesPourSpecialite(lignes, matieres, onglet), [lignes, matieres, onglet]);
  const programmees = useMemo(() => new Set(lignesSpec.filter((l) => l.type === 'epreuve').map((l) => l.offreId)), [lignesSpec]);
  const nomsSpec = useMemo(() => new Map((examen?.specialites ?? []).map((s) => [s.id, s.nom])), [examen]);

  async function rafraichir() {
    const ex = await getExamen(id);
    setExamen(ex);
    setLignes(await listLignes(id));
  }

  async function ouvrirPanneauSpec() {
    if (!examen) return;
    setErreur(null);
    setSelSpec(new Set(examen.specialites.map((x) => x.id)));
    setPanneauSpec(true);
    try { setCandidates(await listSpecialitesCandidates(examen.semestre, perimetre)); }
    catch (e: any) { setErreur(e?.message ?? 'Chargement des spécialités impossible.'); }
  }

  async function enregistrerSpecialites() {
    if (!examen) return;
    const actuelles = examen.specialites.map((x) => x.id);
    const retirees = examen.specialites.filter((x) => !selSpec.has(x.id));
    if (retirees.length > 0 && !window.confirm(`Retirer ${retirees.map((x) => x.nom).join(', ')} supprime aussi leur programme (épreuves et pauses propres). Continuer ?`)) return;
    setOccupe(true);
    setErreur(null);
    try {
      await modifierSpecialitesExamen(id, actuelles, Array.from(selSpec));
      const ex = await getExamen(id);
      setExamen(ex);
      setPdfSpecialites(ex.specialites);
      setOnglet((o) => (ex.specialites.some((x) => x.id === o) ? o : ex.specialites[0]?.id ?? ''));
      const [l, m] = await Promise.all([listLignes(id), listMatieresExamen(ex.specialites.map((x) => x.id), ex.semestre)]);
      setLignes(l); setMatieres(m);
      setPanneauSpec(false);
    } catch (e: any) { setErreur(e?.message ?? 'Modification impossible.'); }
    finally { setOccupe(false); }
  }

  function basculer(set: Set<string>, v: string, actif: boolean) {
    const n = new Set(set);
    if (actif) n.add(v); else n.delete(v);
    return n;
  }

  /** Épreuves concernées par l'attribution (une ligne de tronc commun n'est comptée qu'une fois). */
  function lignesBloc(): LigneExamen[] {
    const vues = new Map<string, LigneExamen>();
    for (const sp of specsBloc) {
      for (const l of lignesPourSpecialite(lignes, matieres, sp)) {
        if (l.type !== 'epreuve' || !joursBloc.has(l.date)) continue;
        if (!ecraser && l.salle) continue;
        vues.set(l.troncCommunId ? 'T' + l.id : l.id, l);
      }
    }
    return Array.from(vues.values());
  }

  async function appliquerSalle() {
    setErreur(null);
    if (!salleBloc.trim()) return setErreur('Indiquez la salle à attribuer.');
    if (specsBloc.size === 0 || joursBloc.size === 0) return setErreur('Choisissez au moins une spécialité et un jour.');
    const cibles = lignesBloc();
    if (cibles.length === 0) return setErreur("Aucune épreuve programmée pour cette sélection (ou salles déjà renseignées).");
    const ids = new Set(cibles.map((l) => l.id));
    // Alertes : deux épreuves différentes, même salle, même plage.
    const finales = lignes.map((l) => (ids.has(l.id) ? { ...l, salle: salleBloc.trim() } : l));
    const alertes: string[] = [];
    for (let i = 0; i < finales.length; i++) {
      for (let j = i + 1; j < finales.length; j++) {
        const a = finales[i], b = finales[j];
        if (!ids.has(a.id) && !ids.has(b.id)) continue;
        if (a.type !== 'epreuve' || b.type !== 'epreuve' || a.date !== b.date || !seChevauchent(a, b)) continue;
        if (a.salle?.trim().toLowerCase() !== salleBloc.trim().toLowerCase() || b.salle?.trim().toLowerCase() !== salleBloc.trim().toLowerCase()) continue;
        alertes.push(`${dateFr(a.date)} ${minutesVersHeure(a.debutMin)}-${minutesVersHeure(a.debutMin + a.dureeMin)} : salle « ${salleBloc.trim()} » utilisée par deux épreuves en même temps.`);
      }
    }
    const unique = Array.from(new Set(alertes));
    if (unique.length > 0 && !window.confirm(`Attention :\n\n${unique.slice(0, 6).join('\n')}${unique.length > 6 ? '\n…' : ''}\n\nAttribuer quand même ?`)) return;
    setOccupe(true);
    try {
      await attribuerSalle(Array.from(ids), salleBloc);
      setLignes(await listLignes(id));
      setPanneauSalle(false);
    } catch (e: any) { setErreur(e?.message ?? 'Attribution impossible.'); }
    finally { setOccupe(false); }
  }

  async function ajouterPeriode(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!du) return setErreur('Choisissez la date de début.');
    const jours = joursEntre(du, au || du);
    if (jours.length === 0) return setErreur('Période invalide.');
    setOccupe(true);
    try { await ajouterJours(id, jours); await rafraichir(); setDu(''); setAu(''); }
    catch (err: any) { setErreur(err?.message ?? 'Ajout impossible.'); }
    finally { setOccupe(false); }
  }

  async function retirerJour(date: string) {
    if (!window.confirm(`Retirer le ${dateFr(date)} et toutes les épreuves/pauses de ce jour (toutes spécialités) ?`)) return;
    setOccupe(true);
    try { await supprimerJour(id, date); await rafraichir(); }
    catch (err: any) { setErreur(err?.message ?? 'Suppression impossible.'); }
    finally { setOccupe(false); }
  }

  /** Heure de début proposée : fin de la dernière ligne du jour (pour la spécialité), sinon 08h00. */
  function debutPropose(date: string): number {
    const duJour = lignesSpec.filter((l) => l.date === date);
    if (duJour.length === 0) return DEBUT_JOURNEE;
    return Math.max(...duJour.map((l) => l.debutMin + l.dureeMin));
  }

  function ouvrirNouveau(date: string, cleMat?: string) {
    const libre = matieresSpec.find((m) => !programmees.has(m.offreId));
    setErreurModal(null);
    setModal({
      ligneId: null, type: 'epreuve', cle: cleMat ?? (libre ? cleMatiere(libre) : ''), date,
      debut: minutesVersChamp(debutPropose(date) % 1440), duree: DUREE_EPREUVE_DEFAUT, salle: '', libelle: '', specs: [onglet], groupe: {},
    });
  }

  function ouvrirEdition(l: LigneExamen) {
    setErreurModal(null);
    const m = l.type === 'epreuve' ? matieres.find((x) => x.offreId === l.offreId) : null;
    const groupe: Record<string, string> = {};
    if (l.type === 'pause') {
      for (const x of lignes) {
        if (x.type === 'pause' && x.specialiteId && x.date === l.date && x.debutMin === l.debutMin && x.dureeMin === l.dureeMin) groupe[x.specialiteId] = x.id;
      }
    }
    setModal({
      ligneId: l.id, type: l.type, cle: m ? cleMatiere(m) : '', date: l.date,
      debut: minutesVersChamp(l.debutMin), duree: l.dureeMin, salle: l.salle ?? '', libelle: l.libelle ?? '',
      specs: l.type === 'pause' ? Object.keys(groupe) : [onglet], groupe,
    });
  }

  const matiereModal = modal ? matieresSpec.find((m) => cleMatiere(m) === modal.cle) ?? null : null;
  const concernees = matiereModal?.troncId
    ? Array.from(new Set(matieres.filter((m) => m.troncId === matiereModal.troncId).map((m) => nomsSpec.get(m.specialiteId) ?? '')))
    : [];

  async function enregistrer() {
    if (!modal || !examen) return;
    setErreurModal(null);
    const debutMin = heureVersMinutes(modal.debut);
    if (debutMin == null) return setErreurModal('Heure de début invalide.');
    if (!(modal.duree >= 5)) return setErreurModal('Durée invalide.');
    if (!modal.date) return setErreurModal('Choisissez le jour.');
    let spIds = [onglet];
    if (modal.type === 'pause') {
      if (modal.specs.length === 0) return setErreurModal('Choisissez au moins une spécialité pour la pause.');
      spIds = modal.specs;
    }
    if (modal.type === 'epreuve') {
      if (!matiereModal) return setErreurModal('Choisissez la matière.');
      if (matiereModal.troncId) spIds = Array.from(new Set(matieres.filter((m) => m.troncId === matiereModal.troncId).map((m) => m.specialiteId)));
    }
    const base = { specialiteIds: spIds, date: modal.date, debutMin, dureeMin: modal.duree };
    const ignorer = modal.type === 'pause' && modal.ligneId ? Object.values(modal.groupe) : modal.ligneId ?? undefined;
    const conflit = conflitHoraire(base, lignes, matieres, ignorer);
    if (conflit) return setErreurModal(conflit + (spIds.length > 1 ? ' (tronc commun : vérifié pour toutes les spécialités concernées)' : ''));
    if (modal.type === 'epreuve') {
      const alertes = conflitsRessources({ ...base, salle: modal.salle || null }, lignes, matieres, modal.ligneId ?? undefined);
      if (alertes.length > 0 && !window.confirm(`Attention :\n\n${alertes.join('\n')}\n\nEnregistrer quand même ?`)) return;
    }
    setOccupe(true);
    try {
      if (modal.type === 'pause') {
        const base2 = { date: modal.date, debutMin, dureeMin: modal.duree, salle: null };
        for (const sp of modal.specs) {
          if (modal.groupe[sp]) await modifierLigne(modal.groupe[sp], base2);
          else await ajouterLigne({ examenId: id, specialiteId: sp, type: 'pause', offreId: null, ...base2 });
        }
        for (const [sp, lid] of Object.entries(modal.groupe)) if (!modal.specs.includes(sp)) await supprimerLigne(lid);
      } else if (modal.ligneId) {
        await modifierLigne(modal.ligneId, { date: modal.date, debutMin, dureeMin: modal.duree, salle: modal.salle || null, libelle: modal.libelle.trim() || null });
      } else {
        await ajouterLigne({
          examenId: id, type: 'epreuve', date: modal.date, debutMin, dureeMin: modal.duree, salle: modal.salle || null, libelle: modal.libelle.trim() || null,
          ...(matiereModal!.troncId
            ? { specialiteId: null, troncCommunId: matiereModal!.troncId, offreId: null }
            : { specialiteId: onglet, offreId: matiereModal!.offreId }),
        });
      }
      setLignes(await listLignes(id));
      setModal(null);
    } catch (err: any) {
      setErreurModal(err?.message ?? 'Enregistrement impossible.');
    } finally { setOccupe(false); }
  }

  async function retirer() {
    if (!modal?.ligneId) return;
    const l = lignes.find((x) => x.id === modal.ligneId);
    const tronc = !!l?.troncCommunId;
    const nbPause = modal.type === 'pause' ? Object.keys(modal.groupe).length : 0;
    if (!window.confirm(tronc ? 'Cette épreuve est un tronc commun : elle sera retirée de TOUTES les spécialités concernées. Continuer ?' : nbPause > 1 ? `Cette pause est commune à ${nbPause} spécialités : elle sera retirée de toutes. Continuer ?` : 'Retirer cet élément du programme ?')) return;
    setOccupe(true);
    try {
      const ids = modal.type === 'pause' && Object.keys(modal.groupe).length > 1 ? Object.values(modal.groupe) : [modal.ligneId];
      for (const lid of ids) await supprimerLigne(lid);
      setLignes(await listLignes(id)); setModal(null); }
    catch (err: any) { setErreurModal(err?.message ?? 'Suppression impossible.'); }
    finally { setOccupe(false); }
  }

  function imprimer(liste: { id: string; nom: string }[]) {
    setPdfSpecialites(liste);
    const avant = document.title;
    document.title = `Programme examens - ${examen?.titre ?? ''}`;
    const restaurer = () => { document.title = avant; window.removeEventListener('afterprint', restaurer); };
    window.addEventListener('afterprint', restaurer);
    setTimeout(() => window.print(), 150);
  }

  if (chargement) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div>;
  if (!examen) return <div style={{ padding: 24 }}><p style={{ color: '#dc2626', fontWeight: 700 }}>{erreur ?? 'Examen introuvable.'}</p><Link to="/examens">Retour</Link></div>;

  const nbEpreuves = lignesSpec.filter((l) => l.type === 'epreuve').length;

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        @media print { @page { size: A4 landscape; margin: 0; } html, body { background: #fff !important; } .ex-ui { display: none !important; } .ex-pdf { position: static !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .ex-pdf { position: absolute; left: -99999px; top: 0; width: 297mm; }
        .ex-grille { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
        .ex-main { flex: 1 1 560px; min-width: 0; }
        .ex-aside { flex: 0 0 300px; width: 300px; max-width: 100%; }
        .ex-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .ex-table th { padding: 12px; text-align: left; font-size: 11px; font-weight: 800; color: #9ca3af; text-transform: uppercase; border-bottom: 1px solid #f3f4f6; }
        .ex-table td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        .ex-plus { width: 32px; height: 32px; border-radius: 8px; border: 1px dashed #d1d5db; background: #fff; color: #9ca3af; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .ex-plus:hover { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
      `}</style>

      <div className="ex-ui">
        <Link to="/examens" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#6b7280', textDecoration: 'none', marginBottom: 8 }}>
          <ArrowLeft size={14} /> Programmes d'examens
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{examen.titre}</h1>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>Semestre {examen.semestre} · {examen.anneeAcademique}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={bouton} onClick={() => imprimer(examen.specialites.filter((s) => s.id === onglet))}><Printer size={14} /> PDF de cette spécialité</button>
            <button style={{ ...bouton, background: '#111827' }} onClick={() => imprimer(examen.specialites)}><Printer size={14} /> PDF de toutes les spécialités</button>
          </div>
        </div>

        {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>{erreur}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {examen.specialites.map((s) => (
            <button key={s.id} style={pilule(onglet === s.id)} onClick={() => setOnglet(s.id)}>{s.nom}</button>
          ))}
          <button onClick={ouvrirPanneauSpec} style={{ border: '1px dashed #d1d5db', background: '#fff', cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 800, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Pencil size={12} /> Modifier les spécialités
          </button>
        </div>

        {panneauSpec && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <p style={{ fontWeight: 900, fontSize: 14, margin: '0 0 2px' }}>Spécialités concernées par l'examen</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>Semestre {examen.semestre}. Une spécialité ajoutée reçoit automatiquement les épreuves de tronc commun déjà programmées.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginBottom: 12 }}>
              {candidates.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: selSpec.has(c.id) ? '#fef2f2' : '#f9fafb', borderRadius: 12, padding: '8px 12px' }}>
                  <input type="checkbox" checked={selSpec.has(c.id)} onChange={(e) => setSelSpec((prev) => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                  {c.nom}
                </label>
              ))}
              {candidates.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>Chargement…</p>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={bouton} disabled={occupe || selSpec.size === 0} onClick={enregistrerSpecialites}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button style={{ ...bouton, background: '#f3f4f6', color: '#374151' }} onClick={() => setPanneauSpec(false)}>Annuler</button>
            </div>
          </div>
        )}

        {/* Jours de l'examen */}
        <form onSubmit={ajouterPeriode} style={{ background: '#fff', borderRadius: 20, padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label style={etiquette}>Ajouter des jours : du</label><input type="date" style={{ ...champ, width: 170 }} value={du} onChange={(e) => setDu(e.target.value)} /></div>
          <div><label style={etiquette}>au (facultatif)</label><input type="date" style={{ ...champ, width: 170 }} value={au} min={du} onChange={(e) => setAu(e.target.value)} /></div>
          <button type="submit" style={bouton} disabled={occupe}><Plus size={14} /> Ajouter</button>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, flex: '1 1 200px' }}>Les dimanches sont ignorés. Chaque jour devient une ligne de la grille.</p>
        </form>

        <div style={{ marginBottom: 14 }}>
          <button
            style={{ ...bouton, background: '#fff', color: '#111827', border: '1px solid #e5e7eb' }}
            onClick={() => { setPanneauSalle((v) => !v); setSpecsBloc(new Set(examen.specialites.map((x) => x.id))); setJoursBloc(new Set(examen.jours)); }}
          >
            Attribuer une salle à plusieurs spécialités / jours
          </button>
        </div>
        {panneauSalle && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <p style={{ fontWeight: 900, fontSize: 14, margin: '0 0 10px' }}>Attribuer une salle</p>
            <div style={{ maxWidth: 320, marginBottom: 12 }}>
              <label style={etiquette}>Salle</label>
              <input list="ex-salles" style={champ} value={salleBloc} onChange={(e) => setSalleBloc(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: '1 1 260px' }}>
                <label style={etiquette}>Spécialités</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button type="button" style={pilule(specsBloc.size === examen.specialites.length)} onClick={() => setSpecsBloc(new Set(examen.specialites.map((x) => x.id)))}>Toutes</button>
                  <button type="button" style={pilule(false)} onClick={() => setSpecsBloc(new Set())}>Aucune</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {examen.specialites.map((x) => (
                    <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={specsBloc.has(x.id)} onChange={(e) => setSpecsBloc(basculer(specsBloc, x.id, e.target.checked))} />{x.nom}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <label style={etiquette}>Jours</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button type="button" style={pilule(joursBloc.size === examen.jours.length)} onClick={() => setJoursBloc(new Set(examen.jours))}>Tous</button>
                  <button type="button" style={pilule(false)} onClick={() => setJoursBloc(new Set())}>Aucun</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {examen.jours.map((d) => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={joursBloc.has(d)} onChange={(e) => setJoursBloc(basculer(joursBloc, d, e.target.checked))} />{jourDeDate(d)} {dateFr(d)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={ecraser} onChange={(e) => setEcraser(e.target.checked)} /> Remplacer les salles déjà renseignées
            </label>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
              {lignesBloc().length} épreuve(s) concernée(s). Une épreuve de tronc commun reçoit la salle pour toutes ses spécialités.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={bouton} disabled={occupe} onClick={appliquerSalle}>{occupe ? 'Attribution…' : 'Attribuer'}</button>
              <button style={{ ...bouton, background: '#f3f4f6', color: '#374151' }} onClick={() => setPanneauSalle(false)}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 20, padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            <input type="checkbox" checked={seuilActif} onChange={(e) => setSeuilActif(e.target.checked)} />
            Ne programmer que les matières ayant atteint
          </label>
          <input type="number" min={0} max={100} style={{ ...champ, width: 90 }} value={seuil} disabled={!seuilActif} onChange={(e) => setSeuil(Math.max(0, Math.min(100, Number(e.target.value))))} />
          <span style={{ fontSize: 13, fontWeight: 800 }}>% du volume horaire au</span>
          <input type="date" style={{ ...champ, width: 170 }} value={dateSeuil} disabled={!seuilActif} onChange={(e) => setDateSeuil(e.target.value)} />
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Avancement = heures réellement effectuées jusqu'à cette date / volume horaire de l'UE.</span>
        </div>

        <div className="ex-grille">
          <div className="ex-main">
            <div style={{ background: '#fff', borderRadius: 20, overflowX: 'auto', marginBottom: 16 }}>
              {examen.jours.length === 0 ? (
                <p style={{ padding: 28, textAlign: 'center', color: '#9ca3af', fontWeight: 600, fontSize: 14 }}>Ajoutez d'abord les jours de l'examen ci-dessus.</p>
              ) : (
                <table className="ex-table">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Jour</th>
                      <th>Programme du jour (selon les heures)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examen.jours.map((date) => (
                      <tr key={date}>
                        <td>
                          <p style={{ fontWeight: 800, margin: 0 }}>{jourDeDate(date)}</p>
                          <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>{dateFr(date)}</p>
                          <button onClick={() => retirerJour(date)} title="Retirer ce jour" style={{ border: 0, background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}>Retirer</button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
                            {lignesSpec.filter((l) => l.date === date).map((l) => {
                              const pause = l.type === 'pause';
                              const tronc = !!l.troncCommunId;
                              return (
                                <div key={l.id} style={{ borderRadius: 12, padding: '8px 12px', minWidth: 170, maxWidth: 260, background: pause ? '#dcfce7' : '#fee2e2', border: tronc ? '1px solid #f59e0b' : '1px solid transparent' }}>
                                  <p style={{ margin: 0, fontWeight: 900, fontSize: 12, color: pause ? '#166534' : '#dc2626' }}>
                                    {minutesVersHeure(l.debutMin)} - {minutesVersHeure(l.debutMin + l.dureeMin)}
                                  </p>
                                  <p style={{ margin: '2px 0 0', fontWeight: 800, fontSize: 12, color: '#111827' }}>{pause ? 'PAUSE' : nomLigne(l)}</p>
                                  {!pause && <p style={{ margin: '1px 0 4px', fontSize: 11, color: '#6b7280' }}>{l.salle || 'Aucune salle'}</p>}
                                  {tronc && (
                                    <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Link2 size={10} /> Tronc commun · {specialitesDeLigne(l, matieres).length} spécialités
                                    </p>
                                  )}
                                  <button onClick={() => ouvrirEdition(l)} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Pencil size={11} /> Modifier
                                  </button>
                                </div>
                              );
                            })}
                            <button className="ex-plus" style={{ alignSelf: 'center' }} onClick={() => ouvrirNouveau(date)} title="Programmer ce jour"><Plus size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <aside className="ex-aside">
            <div style={{ background: '#fff', borderRadius: 20, padding: 16 }}>
              <p style={{ fontWeight: 900, fontSize: 14, margin: 0 }}>Matières à programmer</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 10px' }}>{nomsSpec.get(onglet)} · {nbEpreuves}/{matieresSpec.length} programmée{nbEpreuves > 1 ? 's' : ''}{seuilActif ? ` · ≥ ${seuil} % au ${dateFr(dateSeuil)}` : ''}</p>
              {matieresSpec.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>{seuilActif ? 'Aucune matière n\'atteint ce seuil.' : 'Aucune matière pour ce semestre.'}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...matieresSpec].sort((a, b) => Number(programmees.has(a.offreId)) - Number(programmees.has(b.offreId))).map((m) => {
                  const fait = programmees.has(m.offreId);
                  return (
                    <button
                      key={m.offreId}
                      disabled={fait || examen.jours.length === 0}
                      onClick={() => ouvrirNouveau(examen.jours[0], cleMatiere(m))}
                      style={{ textAlign: 'left', cursor: fait ? 'default' : 'pointer', borderRadius: 12, padding: '8px 12px', background: fait ? '#fee2e2' : '#fff', border: '1px solid ' + (fait ? '#fecaca' : '#e5e7eb'), display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      {fait ? <Check size={14} color="#dc2626" /> : <Plus size={14} color="#9ca3af" />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: fait ? '#991b1b' : '#111827' }}>{m.ueNom}{pct.has(m.offreId) ? ` · ${String(pct.get(m.offreId)).replace('.', ',')} %` : ''}</span>
                        {m.troncId && <span style={{ fontSize: 10, fontWeight: 800, color: '#b45309' }}>Tronc commun</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

      </div>

      <datalist id="ex-salles">{salles.map((x) => <option key={x} value={x} />)}</datalist>
      {modal && (
        <div className="ex-ui" onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 20, width: 440, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>{modal.ligneId ? 'Modifier' : 'Programmer'} · {nomsSpec.get(onglet)}</h2>
              <button onClick={() => setModal(null)} style={{ border: 0, background: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {!modal.ligneId && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button style={pilule(modal.type === 'epreuve')} onClick={() => setModal({ ...modal, type: 'epreuve', duree: DUREE_EPREUVE_DEFAUT })}>Épreuve</button>
                <button style={{ ...pilule(modal.type === 'pause'), display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setModal({ ...modal, type: 'pause', duree: DUREE_PAUSE_DEFAUT })}><Coffee size={13} /> Pause</button>
              </div>
            )}

            {modal.type === 'epreuve' && (
              <div style={{ marginBottom: 12 }}>
                <label style={etiquette}>Matière</label>
                <select style={champ} disabled={!!modal.ligneId} value={modal.cle} onChange={(e) => setModal({ ...modal, cle: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {matieresSpec.filter((m) => modal.ligneId || !programmees.has(m.offreId)).map((m) => (
                    <option key={m.offreId} value={cleMatiere(m)}>{m.ueNom}{m.troncId ? ' (tronc commun)' : ''}</option>
                  ))}
                </select>
                <label style={{ ...etiquette, marginTop: 10 }}>Nom affiché dans le programme (facultatif)</label>
                <input style={champ} placeholder={matiereModal?.ueNom ?? 'Nom de la matière'} value={modal.libelle} onChange={(e) => setModal({ ...modal, libelle: e.target.value })} />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Change seulement l'affichage dans ce programme (grille et PDF) ; l'UE n'est pas modifiée. Vide = nom de l'UE.</p>
                {concernees.length > 1 && (
                  <p style={{ background: '#fffbeb', color: '#92400e', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, margin: '8px 0 0' }}>
                    Tronc commun : cette épreuve sera programmée en même temps pour {concernees.join(', ')}.
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={etiquette}>Jour</label>
                <select style={champ} value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })}>
                  {examen.jours.map((d) => <option key={d} value={d}>{jourDeDate(d)} {dateFr(d)}</option>)}
                </select>
              </div>
              <div>
                <label style={etiquette}>Heure de début</label>
                <input type="time" style={champ} value={modal.debut} onChange={(e) => setModal({ ...modal, debut: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={etiquette}>Durée (minutes)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {[60, 90, 120, 150, 180].map((d) => (
                  <button key={d} type="button" style={pilule(modal.duree === d)} onClick={() => setModal({ ...modal, duree: d })}>{d / 60 % 1 ? `${Math.floor(d / 60)}h30` : `${d / 60}h`}</button>
                ))}
              </div>
              <input type="number" min={5} max={600} step={5} style={champ} value={modal.duree} onChange={(e) => setModal({ ...modal, duree: Number(e.target.value) })} />
              {heureVersMinutes(modal.debut) != null && modal.duree >= 5 && (
                <p style={{ fontSize: 12, color: '#6b7280', margin: '5px 0 0' }}>
                  {minutesVersHeure(heureVersMinutes(modal.debut)!)} → {minutesVersHeure(heureVersMinutes(modal.debut)! + modal.duree)}
                </p>
              )}
            </div>

            {modal.type === 'pause' && (
              <div style={{ marginBottom: 12 }}>
                <label style={etiquette}>Spécialités concernées par la pause</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button type="button" style={pilule(modal.specs.length === examen.specialites.length)} onClick={() => setModal({ ...modal, specs: examen.specialites.map((x) => x.id) })}>Toutes (pause commune)</button>
                  <button type="button" style={pilule(modal.specs.length === 1 && modal.specs[0] === onglet)} onClick={() => setModal({ ...modal, specs: [onglet] })}>Celle-ci seulement</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, padding: 8 }}>
                  {examen.specialites.map((x) => (
                    <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={modal.specs.includes(x.id)} onChange={(e) => setModal({ ...modal, specs: e.target.checked ? [...modal.specs, x.id] : modal.specs.filter((y) => y !== x.id) })} />
                      {x.nom}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {modal.type === 'epreuve' && (
              <div style={{ marginBottom: 12 }}>
                <label style={etiquette}>Salle (facultatif)</label>
                <input list="ex-salles" style={champ} value={modal.salle} onChange={(e) => setModal({ ...modal, salle: e.target.value })} />
              </div>
            )}

            {erreurModal && <p style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{erreurModal}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {modal.ligneId ? (
                <button type="button" onClick={retirer} disabled={occupe} style={{ ...bouton, background: '#fff', color: '#dc2626', border: '1px solid #fecaca' }}><Trash2 size={14} /> Retirer</button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setModal(null)} style={{ ...bouton, background: '#f3f4f6', color: '#374151' }}>Annuler</button>
                <button type="button" onClick={enregistrer} disabled={occupe} style={bouton}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="ex-pdf"><ExamenPdf examen={examen} lignes={lignes} matieres={matieres} specialites={pdfSpecialites} /></div>
    </div>
  );
}