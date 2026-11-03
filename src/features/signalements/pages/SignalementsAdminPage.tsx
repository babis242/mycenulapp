// Boîte de réception admin : signalements d'absence / de retard des enseignants.
import { useEffect, useState } from 'react';
import { Loader2, Paperclip, Check, X, MessageCircle } from 'lucide-react';
import {
  listSignalements, traiterSignalement, urlJustificatif, formaterDateFr,
  type Signalement, type StatutSignalement,
} from '../api';

const FILTRES: { id: StatutSignalement | 'tous'; label: string }[] = [
  { id: 'en_attente', label: 'En attente' },
  { id: 'accepte', label: 'Acceptés' },
  { id: 'refuse', label: 'Refusés' },
  { id: 'tous', label: 'Tous' },
];
const COULEUR = { en_attente: ['#fef3c7', '#d97706', 'En attente'], accepte: ['#dcfce7', '#15803d', 'Accepté'], refuse: ['#fee2e2', '#b91c1c', 'Refusé'] } as const;

function lienWhatsapp(s: Signalement): string | null {
  if (!s.enseignantWhatsapp) return null;
  const c = s.enseignantWhatsapp.replace(/\D/g, '');
  const num = c.startsWith('237') ? c : c.length === 9 ? `237${c}` : c;
  return `https://wa.me/${num}`;
}

export default function SignalementsAdminPage() {
  const [filtre, setFiltre] = useState<StatutSignalement | 'tous'>('en_attente');
  const [liste, setListe] = useState<Signalement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState<string | null>(null);

  async function charger(f = filtre) {
    setChargement(true); setErreur(null);
    try { setListe(await listSignalements(f)); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Chargement impossible.'); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(filtre); /* eslint-disable-next-line */ }, [filtre]);

  async function decider(s: Signalement, decision: 'accepte' | 'refuse') {
    setOccupe(s.id); setErreur(null);
    try {
      await traiterSignalement(s.id, decision, commentaires[s.id] ?? '');
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Décision impossible.');
    } finally { setOccupe(null); }
  }

  async function ouvrirPiece(s: Signalement) {
    if (!s.justificatifPath) return;
    const fenetre = window.open('about:blank', '_blank');
    try {
      const url = await urlJustificatif(s.justificatifPath);
      if (fenetre) fenetre.location.href = url; else window.location.href = url;
    } catch (e) {
      fenetre?.close();
      setErreur(e instanceof Error ? e.message : 'Pièce introuvable.');
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h1 className="text-xl font-extrabold text-gray-900 mb-1">Signalements des enseignants</h1>
      <p className="text-sm text-gray-500 mb-4">Absences et retards signalés par les enseignants. Acceptez ou refusez : l'enseignant est notifié de votre décision.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTRES.map((f) => (
          <button key={f.id} type="button" onClick={() => setFiltre(f.id)}
            style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 800, background: filtre === f.id ? '#dc2626' : '#fff', color: filtre === f.id ? '#fff' : '#374151' }}>
            {f.label}
          </button>
        ))}
      </div>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}
      {chargement && <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="animate-spin" /></div>}
      {!chargement && liste.length === 0 && <p className="text-sm text-gray-400" style={{ textAlign: 'center', padding: 24 }}>Aucun signalement.</p>}

      {liste.map((s) => {
        const [fond, couleur, texte] = COULEUR[s.statut];
        const wa = lienWhatsapp(s);
        return (
          <div key={s.id} style={{ background: '#fff', borderRadius: 20, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{s.enseignantNom}</p>
                <p style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>
                  {s.type === 'absence' ? 'Absence' : `Retard de ${s.minutesRetard} min`} — {s.ueNom}{s.specialiteNom ? ` (${s.specialiteNom})` : ''}
                </p>
                <p style={{ fontSize: 12, color: '#9ca3af' }}>{s.jour} {formaterDateFr(s.dateCours)} · {s.creneau} · signalé le {formaterDateFr(s.creeLe)}</p>
              </div>
              <span style={{ alignSelf: 'flex-start', background: fond, color: couleur, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>{texte}</span>
            </div>

            <p style={{ fontSize: 13, color: '#4b5563', margin: '10px 0' }}>« {s.raison} »</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {s.justificatifPath ? (
                <button type="button" onClick={() => ouvrirPiece(s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  <Paperclip size={13} /> Voir la pièce justificative
                </button>
              ) : <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>Aucune pièce justificative</span>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#15803d' }}><MessageCircle size={13} /> Contacter</a>}
            </div>

            {s.statut === 'en_attente' ? (
              <div style={{ marginTop: 12 }}>
                <input value={commentaires[s.id] ?? ''} onChange={(e) => setCommentaires((p) => ({ ...p, [s.id]: e.target.value }))}
                  placeholder="Commentaire pour l'enseignant (facultatif)" style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 13, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8, opacity: occupe === s.id ? 0.5 : 1, pointerEvents: occupe === s.id ? 'none' : 'auto' }}>
                  <button type="button" onClick={() => decider(s, 'accepte')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 0, borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}><Check size={14} /> Accepter</button>
                  <button type="button" onClick={() => decider(s, 'refuse')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}><X size={14} /> Refuser</button>
                </div>
              </div>
            ) : s.commentaireAdmin ? (
              <p style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginTop: 10 }}>Commentaire : {s.commentaireAdmin}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}