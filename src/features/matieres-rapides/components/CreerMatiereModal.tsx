// src/features/matieres-rapides/components/CreerMatiereModal.tsx
import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { creerEnseignantProvisoire, creerMatiereRapide, listEnseignantsPourChoix, matiereExiste, type EnseignantChoix } from '../api';

const champ: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 14, fontWeight: 600, background: '#fff' };
const etiquette: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 5 };
const bouton: React.CSSProperties = { border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 800, background: '#dc2626', color: '#fff' };

export default function CreerMatiereModal({
  specialiteId, specialiteNom, semestre, onClose, onCree,
}: {
  specialiteId: string; specialiteNom: string; semestre: string;
  onClose: () => void; onCree: () => void | Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [heures, setHeures] = useState('');
  const [enseignants, setEnseignants] = useState<EnseignantChoix[]>([]);
  const [enseignantId, setEnseignantId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [provisoire, setProvisoire] = useState(false);
  const [nomProvisoire, setNomProvisoire] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => { listEnseignantsPourChoix().then(setEnseignants).catch((e) => setErreur(e?.message ?? 'Chargement des enseignants impossible.')); }, []);

  const filtres = enseignants.filter((e) => e.nom.toLowerCase().includes(recherche.toLowerCase()) || (e.matricule ?? '').toLowerCase().includes(recherche.toLowerCase()));

  async function enregistrer() {
    setErreur(null);
    if (!nom.trim()) return setErreur('Indiquez le nom de la matière.');
    const vol = heures.trim() === '' ? undefined : Number(heures);
    if (vol !== undefined && !(vol > 0)) return setErreur("Le nombre d'heures doit être positif.");
    setOccupe(true);
    try {
      if (await matiereExiste(specialiteId, semestre, nom)) {
        if (!window.confirm(`Une matière « ${nom.trim()} » existe déjà pour ${specialiteNom} (${semestre}). La créer quand même ?`)) { setOccupe(false); return; }
      }
      let idEns: string | null = enseignantId || null;
      if (provisoire) idEns = (await creerEnseignantProvisoire(nomProvisoire)).id;
      await creerMatiereRapide({ nom, code, volumeHoraire: vol, specialiteId, semestre, enseignantId: idEns });
      await onCree();
      onClose();
    } catch (e: any) {
      setErreur(e?.message ?? 'Création impossible.');
    } finally { setOccupe(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 20, width: 460, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>Créer une matière</h2>
          <button onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 14px' }}>{specialiteNom} · {semestre}</p>

        <div style={{ marginBottom: 12 }}>
          <label style={etiquette}>Nom de la matière</label>
          <input style={champ} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={etiquette}>Code (facultatif)</label><input style={champ} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div><label style={etiquette}>Nombre d'heures</label><input type="number" min={1} style={champ} value={heures} onChange={(e) => setHeures(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={etiquette}>Enseignant</label>
          {!provisoire ? (
            <>
              <input style={{ ...champ, marginBottom: 6 }} placeholder="Rechercher (nom ou matricule)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <select style={champ} size={5} value={enseignantId} onChange={(e) => setEnseignantId(e.target.value)}>
                <option value="">— Sans enseignant pour le moment —</option>
                {filtres.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.matricule ? ` (${e.matricule})` : ''}{e.provisoire ? ' · provisoire' : ''}</option>)}
              </select>
              <button type="button" onClick={() => { setProvisoire(true); setNomProvisoire(recherche); }} style={{ border: 0, background: 'none', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '6px 0 0' }}>
                + Créer un enseignant provisoire
              </button>
            </>
          ) : (
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: 12 }}>
              <label style={etiquette}>Nom de l'enseignant provisoire</label>
              <input style={champ} value={nomProvisoire} onChange={(e) => setNomProvisoire(e.target.value)} placeholder="Nom et prénom" />
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>Enregistré par son nom uniquement. Ouverture et fermeture de ses séances en saisie manuelle. Il pourra être remplacé plus tard par le véritable enseignant.</p>
              <button type="button" onClick={() => setProvisoire(false)} style={{ border: 0, background: 'none', color: '#6b7280', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '6px 0 0' }}>← Choisir un enseignant existant</button>
            </div>
          )}
        </div>

        {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>{erreur}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...bouton, background: '#f3f4f6', color: '#374151' }}>Annuler</button>
          <button onClick={enregistrer} disabled={occupe} style={bouton}>{occupe ? <Loader2 size={14} className="animate-spin" /> : 'Créer la matière'}</button>
        </div>
      </div>
    </div>
  );
}