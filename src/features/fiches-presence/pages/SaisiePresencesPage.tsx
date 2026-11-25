// src/features/fiches-presence/pages/SaisiePresencesPage.tsx
//
// Saisie hebdomadaire des absences : pour une classe et une semaine, on saisit pour
// chaque étudiant son cumul d'heures d'absence de la semaine (0 par défaut) et on joint
// les photos de la fiche de présence physique (une ou plusieurs, stockées sur Cloudflare R2).
import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Eye, Loader2, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import { estMatriculeProvisoire, listEtudiants, supprimerEtudiant, type Etudiant } from '@/features/referentiel/etudiants/api';
import AjouterEtudiantModal from '@/features/referentiel/etudiants/components/AjouterEtudiantModal';
import ModifierEtudiantModal from '@/features/referentiel/etudiants/components/ModifierEtudiantModal';
import SelecteurGroupe, { lundiCourant, type ChoixGroupe } from '../components/SelecteurGroupe';
import { ajouterFicheImage, listerFichesImages, retirerFicheImage, urlFicheImage, type FicheImage } from '../ficheImageApi';
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
  const [fiches, setFiches] = useState<FicheImage[]>([]); // photos déjà jointes
  const [photos, setPhotos] = useState<File[]>([]); // nouvelles photos, envoyées à l'enregistrement
  const [apercus, setApercus] = useState<string[]>([]);
  const [ajout, setAjout] = useState(false);
  const [aModifier, setAModifier] = useState<Etudiant | null>(null);

  useEffect(() => {
    setErreur(null); setSucces(null); setModifie(false); setPhotos([]); setFiches([]);
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
      listerFichesImages(choix.specialiteId, choix.semestre, choix.semaine).catch(() => [] as FicheImage[]),
    ])
      .then(([e, c, abs, f]) => {
        if (!actif) return;
        setEtudiants(e);
        setProgH(heuresProgrammees(c));
        setValeurs(Object.fromEntries(e.map((x) => [x.id, String(abs.get(x.id) ?? 0)])));
        setFiches(f);
      })
      .catch((e) => actif && setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, [choix.specialiteId, choix.semestre, choix.semaine]);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setApercus(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? etudiants.filter((e) => e.nom_complet.toLowerCase().includes(q)) : etudiants;
  }, [etudiants, recherche]);

  const heuresDe = (id: string) => Math.max(0, Number((valeurs[id] ?? '0').replace(',', '.')) || 0);
  const nbAvecAbsence = etudiants.filter((e) => heuresDe(e.id) > 0).length;
  const depassent = etudiants.filter((e) => progH > 0 && heuresDe(e.id) > progH + 1e-9);

  // Recharge la liste après un ajout / une modification / une suppression, en gardant les heures déjà saisies.
  async function rechargerEtudiants(message?: string) {
    try {
      const e = await listEtudiants(choix.specialiteId, choix.semestre);
      setEtudiants(e);
      setValeurs((p) => Object.fromEntries(e.map((x) => [x.id, p[x.id] ?? '0'])));
      if (message) setSucces(message);
    } catch (err: any) {
      setErreur(err?.message ?? 'Rechargement impossible.');
    }
  }

  async function retirer(e: Etudiant) {
    if (!window.confirm(`Supprimer « ${e.nom_complet} » (${e.matricule}) ? Ses absences enregistrées seront aussi supprimées.`)) return;
    setErreur(null); setSucces(null);
    try {
      await supprimerEtudiant(e.id);
      await rechargerEtudiants(`« ${e.nom_complet} » a été supprimé.`);
    } catch (err: any) {
      setErreur(/row-level security|permission denied/i.test(err?.message ?? '')
        ? 'Suppression refusée : exécutez sql/gestion_etudiants_saisie.sql dans Supabase.'
        : err?.message ?? 'Suppression impossible.');
    }
  }

  function saisir(id: string, v: string) {
    setValeurs((p) => ({ ...p, [id]: v }));
    setModifie(true); setSucces(null);
  }

  async function enregistrer() {
    setErreur(null); setSucces(null);
    if (photos.length === 0 && fiches.length === 0) {
      setErreur('Joignez au moins une photo de la fiche de présence avant d’enregistrer.');
      return;
    }
    if (depassent.length > 0) {
      setErreur(`${depassent.length} étudiant(s) ont plus d’heures d’absence (${depassent.map((e) => e.nom_complet).slice(0, 3).join(', ')}…) que d’heures de cours programmées (${formatHeures(progH)}).`);
      return;
    }
    setEnvoi(true);
    try {
      // Une photo à la fois : celles déjà envoyées sont retirées de la file, pour ne pas les renvoyer en cas d'échec.
      for (const f of [...photos]) {
        const ajoutee = await ajouterFicheImage(choix.specialiteId, choix.semestre, choix.semaine, f);
        setFiches((p) => [...p, ajoutee]);
        setPhotos((p) => p.filter((x) => x !== f));
      }
      const n = await enregistrerAbsencesHebdo({
        specialiteId: choix.specialiteId,
        semestre: choix.semestre,
        semaine: choix.semaine,
        heuresProgrammees: progH,
        absences: etudiants.map((e) => ({ etudiantId: e.id, heures: heuresDe(e.id) })),
      });
      setModifie(false);
      setSucces(`${n} étudiant(s) enregistré(s), fiche de présence jointe.`);
    } catch (e: any) {
      setErreur(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  function voirFiche(f: FicheImage) {
    window.open(urlFicheImage(f.chemin), '_blank');
  }

  async function retirerFiche(f: FicheImage) {
    if (!window.confirm('Retirer cette photo de la fiche ?')) return;
    setErreur(null);
    try {
      await retirerFicheImage(f.id);
      setFiches((p) => p.filter((x) => x.id !== f.id));
    } catch (e: any) {
      setErreur(e?.message ?? 'Suppression impossible.');
    }
  }

  function ajouterPhotos(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    // Copie IMMÉDIATE : la liste du champ est « vivante » et se vide dès qu'on réinitialise le champ.
    const nouvelles = Array.from(liste);
    setPhotos((p) => [...p, ...nouvelles]);
    setModifie(true); setSucces(null);
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
        <div style={carte}>
          <button type="button" onClick={() => setAjout(true)} style={{ ...pastille(true), display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Plus size={15} /> Ajouter un étudiant
          </button>
          <p className="text-sm text-gray-500">Aucun étudiant inscrit dans cette classe pour ce semestre. (Si la classe a bien des étudiants, ce compte n'a peut-être pas le droit de les lire : exécutez sql/acces_secretaire_presences.sql dans Supabase.)</p></div>
      )}

      {prete && etudiants.length > 0 && (
        <>
          <div style={carte}>
            <p style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginBottom: 2 }}>Fiche de présence (photos)</p>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>
              Une ou plusieurs photos de la fiche physique de la classe pour cette semaine, jointes à l'enregistrement.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...pastille(false), display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Camera size={15} /> Prendre une photo
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(ev) => { ajouterPhotos(ev.target.files); ev.target.value = ''; }} />
              </label>
              <label style={{ ...pastille(false), display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Plus size={15} /> Choisir des images
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(ev) => { ajouterPhotos(ev.target.files); ev.target.value = ''; }} />
              </label>
              {photos.length + fiches.length === 0 && <span style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Aucune photo jointe</span>}
              {fiches.length > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>✓ {fiches.length} photo{fiches.length > 1 ? 's' : ''} jointe{fiches.length > 1 ? 's' : ''}</span>}
            </div>
            {(fiches.length > 0 || photos.length > 0) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {fiches.map((f, i) => (
                  <div key={f.id} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>Photo {i + 1}</span>
                    <button type="button" title="Voir" onClick={() => voirFiche(f)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#15803d', padding: 4 }}><Eye size={15} /></button>
                    <button type="button" title="Retirer" onClick={() => retirerFiche(f)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#f87171', padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                ))}
                {photos.map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={apercus[i]} alt={f.name} style={{ height: 110, borderRadius: 10, border: '1px solid #e5e7eb', display: 'block' }} />
                    <button type="button" title="Ne pas joindre" onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}
                      style={{ position: 'absolute', top: 4, right: 4, border: 0, borderRadius: 999, background: 'rgba(17,24,39,0.75)', color: '#fff', width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: '22px' }}>×</button>
                    <span style={{ position: 'absolute', bottom: 4, left: 4, background: '#fef3c7', color: '#b45309', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>à envoyer</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={carte}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 999, padding: '9px 14px', flex: '1 1 220px' }}>
                <Search size={15} color="#9ca3af" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un étudiant…"
                  style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, width: '100%' }} />
              </div>
              <button type="button" onClick={() => setAjout(true)} style={{ ...pastille(true), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Plus size={15} /> Ajouter un étudiant
              </button>
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', minWidth: 0 }}>
                    {e.nom_complet}
                    {estMatriculeProvisoire(e.matricule) && (
                      <span style={{ marginLeft: 8, background: '#fef3c7', color: '#b45309', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>
                        {e.matricule}
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <input type="number" min={0} step={0.5} inputMode="decimal" value={valeurs[e.id] ?? '0'}
                      onChange={(ev) => saisir(e.id, ev.target.value)}
                      onFocus={(ev) => ev.target.select()}
                      style={{ width: 80, border: `1px solid ${trop ? '#dc2626' : '#e5e7eb'}`, borderRadius: 10, padding: '7px 10px', fontSize: 15, fontWeight: 800, textAlign: 'center', color: h > 0 ? '#dc2626' : '#111827' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>h</span>
                    <button type="button" title="Modifier l’étudiant" onClick={() => setAModifier(e)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#9ca3af', padding: 6 }}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" title="Supprimer l’étudiant" onClick={() => retirer(e)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#f87171', padding: 6 }}>
                      <Trash2 size={15} />
                    </button>
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

      {ajout && (
        <AjouterEtudiantModal
          specialiteId={choix.specialiteId}
          semestre={choix.semestre}
          onFermer={() => setAjout(false)}
          onCree={(e) => {
            setAjout(false);
            rechargerEtudiants(`« ${e.nom_complet} » ajouté (matricule ${e.matricule}).`);
          }}
        />
      )}
      {aModifier && (
        <ModifierEtudiantModal
          etudiant={aModifier}
          onFermer={() => setAModifier(null)}
          onEnregistre={() => {
            setAModifier(null);
            rechargerEtudiants('Étudiant modifié.');
          }}
        />
      )}
    </div>
  );
}