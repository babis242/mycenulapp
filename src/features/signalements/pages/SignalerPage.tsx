// Formulaire enseignant : signaler une absence ou un retard, avec justificatif.
import { useEffect, useState } from 'react';
import { Loader2, Paperclip, CheckCircle2, Clock, XCircle, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  creerSignalement, listMesSignalements, listSeancesSignalables, formaterDateFr, TAILLE_MAX_JUSTIFICATIF,
  type SeanceSignalable, type Signalement, type TypeSignalement,
} from '../api';

const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 18, marginBottom: 14 };
const champ: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 600, background: '#fff' };
const etiquette: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 };

const STATUTS = {
  en_attente: { texte: 'En attente', couleur: '#d97706', fond: '#fef3c7', Icone: Clock },
  accepte: { texte: 'Accepté', couleur: '#15803d', fond: '#dcfce7', Icone: CheckCircle2 },
  refuse: { texte: 'Refusé', couleur: '#b91c1c', fond: '#fee2e2', Icone: XCircle },
} as const;

export default function SignalerPage() {
  const user = useAuthStore((s) => s.user);
  const [seances, setSeances] = useState<SeanceSignalable[]>([]);
  const [historique, setHistorique] = useState<Signalement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [seanceId, setSeanceId] = useState('');
  const [type, setType] = useState<TypeSignalement>('retard');
  const [minutes, setMinutes] = useState('');
  const [raison, setRaison] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);

  async function charger() {
    if (!user) return;
    setChargement(true);
    try {
      const [s, h] = await Promise.all([listSeancesSignalables(user.matricule), listMesSignalements()]);
      setSeances(s);
      setHistorique(h);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible (connexion requise).');
    } finally {
      setChargement(false);
    }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [user?.matricule]);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErreur(null); setSucces(null);
    if (!seanceId) return setErreur('Sélectionnez le cours concerné.');
    if (type === 'retard' && !(Number(minutes) > 0)) return setErreur('Indiquez la durée estimée du retard, en minutes.');
    if (!raison.trim()) return setErreur('Précisez la raison.');
    setEnvoi(true);
    try {
      await creerSignalement({ matricule: user.matricule, seanceId, type, minutesRetard: type === 'retard' ? Number(minutes) : null, raison, fichier });
      setSucces("Signalement envoyé à l'administration. Vous serez notifié de sa décision.");
      setSeanceId(''); setMinutes(''); setRaison(''); setFichier(null);
      setHistorique(await listMesSignalements());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  const libelle = (s: SeanceSignalable) => `${s.jour} ${formaterDateFr(s.date)} · ${s.creneau} · ${s.ueNom}${s.specialiteNom ? ` (${s.specialiteNom})` : ''}`;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 className="text-xl font-extrabold text-gray-900 mb-1">Signaler une absence ou un retard</h1>
      <p className="text-sm text-gray-500 mb-4">Prévenez l'administration. Elle accepte ou refuse votre signalement et vous êtes notifié de sa décision.</p>

      <form onSubmit={envoyer} style={carte}>
        <label style={etiquette}>Cours concerné</label>
        <select style={champ} value={seanceId} onChange={(e) => setSeanceId(e.target.value)} disabled={chargement}>
          <option value="">{chargement ? 'Chargement…' : seances.length === 0 ? 'Aucun cours trouvé' : 'Sélectionner le cours…'}</option>
          {seances.map((s) => <option key={s.id} value={s.id}>{libelle(s)}</option>)}
        </select>

        <label style={{ ...etiquette, marginTop: 14 }}>Je signale</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['retard', 'absence'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              style={{ flex: 1, border: 0, cursor: 'pointer', borderRadius: 999, padding: '10px 0', fontSize: 14, fontWeight: 800, background: type === t ? '#dc2626' : '#f3f4f6', color: type === t ? '#fff' : '#374151' }}>
              {t === 'retard' ? 'Un retard' : 'Une absence'}
            </button>
          ))}
        </div>

        {type === 'retard' && (
          <>
            <label style={{ ...etiquette, marginTop: 14 }}>Durée estimée du retard (minutes)</label>
            <input style={{ ...champ, maxWidth: 160 }} type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="ex : 30" />
          </>
        )}

        <label style={{ ...etiquette, marginTop: 14 }}>Raison</label>
        <textarea style={{ ...champ, minHeight: 90, resize: 'vertical' }} value={raison} onChange={(e) => setRaison(e.target.value)} placeholder="Expliquez brièvement la raison…" />

        <label style={{ ...etiquette, marginTop: 14 }}>Pièce justificative (PDF ou image, 5 Mo max)</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
          <Paperclip size={15} /> {fichier ? fichier.name : 'Joindre un fichier'}
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > TAILLE_MAX_JUSTIFICATIF) { setErreur('La pièce justificative dépasse 5 Mo.'); return; }
              setErreur(null); setFichier(f);
            }} />
        </label>
        {fichier && <button type="button" onClick={() => setFichier(null)} style={{ marginLeft: 10, border: 0, background: 'none', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Retirer</button>}

        {erreur && <p style={{ color: '#b91c1c', fontSize: 13, fontWeight: 700, marginTop: 12 }}>{erreur}</p>}
        {succes && <p style={{ color: '#15803d', fontSize: 13, fontWeight: 700, marginTop: 12 }}>{succes}</p>}

        <button type="submit" disabled={envoi}
          style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '11px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: envoi ? 0.6 : 1 }}>
          {envoi ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer le signalement
        </button>
      </form>

      <h2 className="text-base font-extrabold text-gray-900 mb-2">Mes signalements</h2>
      {historique.length === 0 && !chargement && <p className="text-sm text-gray-400">Aucun signalement pour le moment.</p>}
      {historique.map((h) => {
        const st = STATUTS[h.statut];
        return (
          <div key={h.id} style={{ ...carte, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>
                  {h.type === 'absence' ? 'Absence' : `Retard de ${h.minutesRetard} min`} — {h.ueNom}
                </p>
                <p style={{ fontSize: 12, color: '#9ca3af' }}>{h.jour} {formaterDateFr(h.dateCours)} · {h.creneau}</p>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.fond, color: st.couleur, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
                <st.Icone size={13} /> {st.texte}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#4b5563', marginTop: 6 }}>{h.raison}</p>
            {h.commentaireAdmin && <p style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginTop: 6 }}>Réponse de l'administration : {h.commentaireAdmin}</p>}
          </div>
        );
      })}
    </div>
  );
}