// src/features/matieres-rapides/components/PanneauProvisoire.tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { promouvoirProvisoire, listEnseignantsPourChoix, remplacerProvisoire, type EnseignantChoix, type PromotionProvisoire } from '../api';
import BoutonWhatsAppIdentifiants from '@/features/referentiel/enseignants/components/BoutonWhatsAppIdentifiants';

/** Fiche d'un enseignant provisoire : le remplacer par un vrai enseignant, ou le convertir en vrai compte. */
export default function PanneauProvisoire({ id, nom, onTermine }: { id: string; nom: string; onTermine: (supprime: boolean) => void }) {
  const [reels, setReels] = useState<EnseignantChoix[]>([]);
  const [recherche, setRecherche] = useState('');
  const [reelId, setReelId] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cellulaire, setCellulaire] = useState('');
  const [promu, setPromu] = useState<PromotionProvisoire | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [chargement, setChargement] = useState(true);
  useEffect(() => {
    listEnseignantsPourChoix()
      .then((l) => setReels(l.filter((e) => !e.provisoire)))
      .catch((e) => setErreur(`Liste des enseignants indisponible : ${e?.message ?? 'erreur de chargement'}`))
      .finally(() => setChargement(false));
  }, []);
  const filtres = reels.filter((e) => e.nom.toLowerCase().includes(recherche.toLowerCase()) || (e.matricule ?? '').toLowerCase().includes(recherche.toLowerCase()));

  async function remplacer() {
    const cible = reels.find((e) => e.id === reelId);
    setInfo(null);
    if (!cible) return setErreur('Choisissez d’abord le véritable enseignant dans la liste ci-dessus (cliquez sur son nom).');
    if (!window.confirm(`Remplacer « ${nom} » par « ${cible.nom} » ?\n\nSes matières, séances, heures et rapports seront transférés à ${cible.nom}, puis la fiche provisoire sera supprimée. Cette action est définitive.`)) return;
    setOccupe(true); setErreur(null);
    try { const n = await remplacerProvisoire(id, reelId); setInfo(`${n} élément(s) transféré(s).`); onTermine(true); }
    catch (e: any) { setErreur(e?.message ?? 'Remplacement impossible.'); }
    finally { setOccupe(false); }
  }

  async function convertir() {
    setInfo(null);
    if (!email.trim()) return setErreur('Saisissez l’email de l’enseignant avant de continuer.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErreur('L’email saisi n’est pas valide.');
    setOccupe(true); setErreur(null);
    try {
      setPromu(await promouvoirProvisoire(id, nom, { email, numero_whatsapp: whatsapp, numero_cellulaire: cellulaire }));
    } catch (e: any) { setErreur(e?.message ?? 'Conversion impossible.'); }
    finally { setOccupe(false); }
  }

  const champ: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 14, background: '#fff' };
  const btn: React.CSSProperties = { border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 800, background: '#dc2626', color: '#fff' };
  if (promu) {
    return (
      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 20, padding: 16, marginTop: 16 }}>
        <p style={{ fontWeight: 900, fontSize: 14, margin: '0 0 4px' }}>« {promu.nom} » est maintenant un véritable enseignant</p>
        <p style={{ fontSize: 13, margin: '0 0 2px' }}>Matricule : <b>{promu.matricule ?? 'en cours d’attribution'}</b></p>
        <p style={{ fontSize: 12, color: '#047857', margin: '0 0 2px' }}>{promu.nbTransferes} élément(s) de son historique transféré(s).</p>
        <p style={{ fontSize: 12, margin: '0 0 12px', color: promu.emailEnvoye ? '#047857' : '#b45309', fontWeight: 700 }}>
          {promu.emailEnvoye ? `Identifiants envoyés par email à ${email.trim()}.` : "Compte créé ou à créer, mais l'email des identifiants n'a pas pu être envoyé."}
        </p>
        <BoutonWhatsAppIdentifiants enseignantId={promu.id} nom={promu.nom} numeroWhatsapp={whatsapp} numeroCellulaire={cellulaire} />
        <button style={{ ...btn, background: '#111827', marginTop: 12 }} onClick={() => onTermine(true)}>Terminer</button>
      </div>
    );
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: 16, marginTop: 16 }}>
      <p style={{ fontWeight: 900, fontSize: 14, margin: '0 0 2px' }}>Enseignant provisoire</p>
      <p style={{ fontSize: 12, color: '#92400e', margin: '0 0 12px' }}>Enregistré par son nom uniquement : pas de compte, pas de code ni de QR. Ses séances s'ouvrent et se ferment en saisie manuelle.</p>

      <p style={{ fontWeight: 800, fontSize: 13, margin: '0 0 6px' }}>Le remplacer par un véritable enseignant</p>
      <input style={{ ...champ, marginBottom: 6 }} placeholder="Rechercher (nom ou matricule)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      <select style={champ} size={5} value={reelId} onChange={(e) => { setReelId(e.target.value); setErreur(null); }}>
        {filtres.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.matricule ? ` (${e.matricule})` : ''}</option>)}
      </select>
      <p style={{ fontSize: 12, fontWeight: 700, margin: '6px 0 0', color: reelId ? '#166534' : '#92400e' }}>
        {chargement ? 'Chargement de la liste…' : filtres.length === 0 ? 'Aucun enseignant trouvé.' : reelId ? `Sélectionné : ${reels.find((e) => e.id === reelId)?.nom ?? ''}` : 'Cliquez sur un nom dans la liste pour le sélectionner.'}
      </p>
      <button style={{ ...btn, marginTop: 8, opacity: occupe ? 0.6 : 1 }} disabled={occupe} onClick={remplacer}>{occupe ? <Loader2 size={14} className="animate-spin" /> : 'Remplacer et transférer son historique'}</button>

      <hr style={{ border: 0, borderTop: '1px solid #fde68a', margin: '16px 0' }} />

      <p style={{ fontWeight: 800, fontSize: 13, margin: '0 0 6px' }}>Ou en faire un véritable enseignant (son historique est conservé)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input style={{ ...champ, gridColumn: '1 / -1' }} type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={champ} placeholder="Numéro WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <input style={champ} placeholder="Numéro cellulaire" value={cellulaire} onChange={(e) => setCellulaire(e.target.value)} />
      </div>
      <button style={{ ...btn, background: '#111827', opacity: occupe ? 0.6 : 1 }} disabled={occupe} onClick={convertir}>{occupe ? <Loader2 size={14} className="animate-spin" /> : 'Créer l’enseignant et envoyer ses identifiants'}</button>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, margin: '12px 0 0' }}>{erreur}</p>}
      {info && <p style={{ fontSize: 12, color: '#166534', fontWeight: 700, margin: '8px 0 0' }}>{info}</p>}
    </div>
  );
}