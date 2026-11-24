// src/features/fiches-presence/pages/SaisiePresencesPage.tsx
//
// Saisie hebdomadaire des absences : pour une classe et une semaine, on saisit pour
// chaque étudiant son cumul d'heures d'absence de la semaine (0 par défaut) et on joint
// la photo de la fiche de présence physique (stockée sur Cloudflare R2).
import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Eye, Loader2, Save, Search } from 'lucide-react';
import { listEtudiants, type Etudiant } from '@/features/referentiel/etudiants/api';
import SelecteurGroupe, { lundiCourant, type ChoixGroupe } from '../components/SelecteurGroupe';
import { enregistrerFicheImage, getFicheImage, urlFicheImage, type FicheImage } from '../ficheImageApi';
import {
  enregistrerAbsencesHebdo,
  getCreneauxProgrammes,
  heuresProgrammees,
  lireAbsencesHebdo,
} from '../saisieApi';
import { formatHeures } from '../convocationApi';

const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, marginBottom: 16 };

function pastille(actif: boolean): React.CSSProperties {
  return {
    border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 800,
    background: actif ? '#111827' : '#fff', color: actif ? '#fff' : '#4b5563',
    boxShadow: actif ? 'none' : 'inset 0 0 0 1px #e5e7eb',
  };
}

export default function SaisiePresencesPage() {
  const [choix, setChoix] = useState<ChoixGroupe>({ cycleKey: '', semestre: '', specialiteId: '', semaine: lundiCourant() });
  const [etudiants, setEtudiants] = useState<Etudiant[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, string>>({}); // heures d'absence saisies ('0' par défaut)
  const [progH, setProgH] = useState(0); // heures de cours programmées dans la semaine
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [modifie, setModifie] = useState(false);
  const [ficheExistante, setFicheExistante] = useState<FicheImage | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  useEffect(() => {
    setErreur(null); setSucces(null); setModifie(false); setPhoto(null); setFicheExistante(null);
    if (!choix.specialiteId || !choix.semestre || !choix.semaine) {
      setEtudiants([]); setValeurs({}); setProgH(0);
      return;
    }
    let actif = true;
    setChargement(true);
    Promise.all([
      listEtudiants(choix.specialiteId, choix.semestre),
      getCreneauxProgrammes(choix.specialiteId, choix.semestre, choix.semaine).catch(() => []),
      lireAbsencesHebdo(choix.specialiteId, choix.semestre, choix.semaine),
      getFicheImage(choix.specialiteId, choix.semestre, choix.semaine).catch(() => null),
    ])
      .then(([e, c, abs, f]) => {
        if (!actif) return;
        setEtudiants(e);
        setProgH(heuresProgrammees(c));
        setValeurs(Object.fromEntries(e.map((x) => [x.id, String(abs.get(x.id) ?? 0)])));
        setFicheExistante(f);
      })
      .catch((e) => actif && setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, [choix.specialiteId, choix.semestre, choix.semaine]);

  useEffect(() => {
    if (!photo) { setApercu(null); return; }
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? etudiants.filter((e) => e.nom_complet.toLowerCase().includes(q)) : etudiants;
  }, [etudiants, recherche]);

  const heuresDe = (id: string) => Math.max(0, Number((valeurs[id] ?? '0').replace(',', '.')) || 0);
  const nbAvecAbsence = etudiants.filter((e) => heuresDe(e.id) > 0).length;
  const depassent = etudiants.filter((e) => progH > 0 && heuresDe(e.id) > progH + 1e-9);

  function saisir(id: string, v: string) {
    setValeurs((p) => ({ ...p, [id]: v }));
    setModifie(true); setSucces(null);
  }

  async function enregistrer() {
    setErreur(null); setSucces(null);
    if (!photo && !ficheExistante) {
      setErreur('Joignez la photo de la fiche de présence avant d’enregistrer.');
      return;
    }
    if (depassent.length > 0) {
      setErreur(`${depassent.length} étudiant(s) ont plus d’heures d’absence (${depassent.map((e) => e.nom_complet).slice(0, 3).join(', ')}…) que d’heures de cours programmées (${formatHeures(progH)}).`);
      return;
    }
    setEnvoi(true);
    try {
      if (photo) {
        setFicheExistante(await enregistrerFicheImage(choix.specialiteId, choix.semestre, choix.semaine, photo));
        setPhoto(null);
      }
      const n = await enregistrerAbsencesHebdo({
        specialiteId: choix.specialiteId,
        semestre: choix.semestre,
        semaine: choix.semaine,
        heuresProgrammees: progH,
        absences: etudiants.map((e) => ({ etudiantId: e.id, heures: heuresDe(e.id) })),
      });
      setModifie(false);
      setSucces(`${n} étudiant(s) enregistré(s), photo de la fiche jointe.`);
    } catch (e: any) {
      setErreur(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  function voirFiche() {
    if (!ficheExistante) return;
    try { window.open(urlFicheImage(ficheExistante.chemin), '_blank'); }
    catch (e: any) { setErreur(e?.message ?? 'Photo introuvable.'); }
  }

  const prete = !!choix.specialiteId && !!choix.semestre && !chargement;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Saisie des absences de la semaine</p>
      <p className="text-sm text-gray-400 mb-5">
        Pour la classe et la semaine choisies, indiquez le cumul d’heures d’absence de chaque étudiant (0 par défaut)
        et joignez la photo de la fiche de présence.
      </p>

      <div style={carte}>
        <SelecteurGroupe valeur={choix} onChange={setChoix} />
      </div>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}
      {chargement && <Loader2 className="animate-spin text-red-600 mx-auto" />}

      {prete && etudiants.length === 0 && (
        <div style={carte}><p className="text-sm text-gray-500">Aucun étudiant inscrit dans cette classe pour ce semestre. (Si la classe a bien des étudiants, ce compte n'a peut-être pas le droit de les lire : exécutez sql/acces_secretaire_presences.sql dans Supabase.)</p></div>
      )}

      {prete && etudiants.length > 0 && (
        <>
          <div style={carte}>
            <p style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginBottom: 2 }}>Fiche de présence (photo)</p>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>
              Photo de la fiche physique de la classe pour cette semaine, jointe à l'enregistrement.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...pastille(false), display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Camera size={15} />
                {photo || ficheExistante ? 'Remplacer la photo' : 'Prendre / choisir la photo'}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(ev) => { setPhoto(ev.target.files?.[0] ?? null); setModifie(true); setSucces(null); ev.target.value = ''; }} />
              </label>
              {ficheExistante && !photo && (
                <button type="button" onClick={voirFiche} style={{ ...pastille(false), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={15} /> Voir la photo jointe
                </button>
              )}
              {!photo && !ficheExistante && <span style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Aucune photo jointe</span>}
              {!photo && ficheExistante && <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>✓ Photo jointe</span>}
            </div>
            {apercu && <img src={apercu} alt="Fiche de présence à joindre" style={{ marginTop: 12, maxHeight: 260, maxWidth: '100%', borderRadius: 12, border: '1px solid #e5e7eb' }} />}
          </div>

          <div style={carte}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 999, padding: '9px 14px', flex: '1 1 220px' }}>
                <Search size={15} color="#9ca3af" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un étudiant…"
                  style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, width: '100%' }} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 10 }}>
              {etudiants.length} étudiant(s) · {nbAvecAbsence} avec des absences
              {progH > 0 ? ` · ${formatHeures(progH)} de cours programmées cette semaine` : ' · aucun cours programmé trouvé pour cette semaine'}
            </p>
            {visibles.map((e) => {
              const h = heuresDe(e.id);
              const trop = progH > 0 && h > progH + 1e-9;
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #f3f4f6', background: h > 0 ? '#fef2f2' : 'transparent', padding: '8px 8px' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{e.nom_complet}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <input type="number" min={0} step={0.5} inputMode="decimal" value={valeurs[e.id] ?? '0'}
                      onChange={(ev) => saisir(e.id, ev.target.value)}
                      onFocus={(ev) => ev.target.select()}
                      style={{ width: 80, border: `1px solid ${trop ? '#dc2626' : '#e5e7eb'}`, borderRadius: 10, padding: '7px 10px', fontSize: 15, fontWeight: 800, textAlign: 'center', color: h > 0 ? '#dc2626' : '#111827' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>h</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ position: 'sticky', bottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={enregistrer} disabled={envoi}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', opacity: envoi ? 0.6 : 1 }}>
              {envoi ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer la semaine
            </button>
            {modifie && <span style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Modifications non enregistrées</span>}
            {succes && <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d', display: 'inline-flex', gap: 6, alignItems: 'center', background: '#fff', borderRadius: 999, padding: '6px 12px' }}><CheckCircle2 size={15} />{succes}</span>}
          </div>
        </>
      )}
    </div>
  );
}