// src/features/rapports-pdf/pages/RapportJournalierPage.tsx
//
// Rapport journalier : cours programmés / effectués, absences justifiées et non justifiées
// (chaque absence peut être justifiée ici), envoyé par WhatsApp.
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Loader2, MessageCircle, Undo2 } from 'lucide-react';
import { lienWhatsApp, normaliserNumero } from '@/features/sondage/retours';
import {
  ajouterJours,
  genererRapportJournalier,
  justifierAbsence,
  messageRapportJournalier,
  retirerJustificationAbsence,
  type AbsenceJour,
  type RapportJournalier,
} from '../api';

const CONTACT_PAR_DEFAUT = '697136820';
const CLE_CONTACT = 'rapport_journalier_contact';

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function contactMemorise(): string {
  try { return localStorage.getItem(CLE_CONTACT) || CONTACT_PAR_DEFAUT; } catch { return CONTACT_PAR_DEFAUT; }
}

const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, marginBottom: 16 };
const bouton = (fond: string, couleur = '#fff'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, cursor: 'pointer', borderRadius: 999,
  padding: '8px 16px', fontSize: 13, fontWeight: 800, background: fond, color: couleur,
});

export default function RapportJournalierPage() {
  const [date, setDate] = useState(aujourdhui());
  const [rapport, setRapport] = useState<RapportJournalier | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [contact, setContact] = useState(contactMemorise());
  const [enCours, setEnCours] = useState<string | null>(null); // séance en cours de justification
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);

  async function charger() {
    setChargement(true); setErreur(null);
    try { setRapport(await genererRapportJournalier(date)); }
    catch (e: any) { setErreur(e?.message ?? 'Chargement impossible.'); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [date]);

  useEffect(() => {
    try { localStorage.setItem(CLE_CONTACT, contact); } catch { /* stockage indisponible */ }
  }, [contact]);

  const message = useMemo(() => (rapport ? messageRapportJournalier(rapport) : ''), [rapport]);
  const lien = rapport ? lienWhatsApp(contact, message) : null;

  async function valider(a: AbsenceJour) {
    if (!motif.trim()) return setErreur('Indiquez le motif de la justification.');
    setOccupe(a.seanceId); setErreur(null);
    try { await justifierAbsence(a.seanceId, motif.trim()); setEnCours(null); setMotif(''); await charger(); }
    catch (e: any) { setErreur(e?.message ?? 'Justification impossible.'); }
    finally { setOccupe(null); }
  }

  async function retirer(a: AbsenceJour) {
    if (!window.confirm(`Retirer la justification de l'absence de ${a.enseignant} ?`)) return;
    setOccupe(a.seanceId); setErreur(null);
    try { await retirerJustificationAbsence(a.seanceId); await charger(); }
    catch (e: any) { setErreur(e?.message ?? 'Opération impossible.'); }
    finally { setOccupe(null); }
  }

  const tuile = (valeur: number, libelle: string, couleur: string) => (
    <div style={{ flex: '1 1 120px', background: '#f9fafb', borderRadius: 16, padding: '14px 16px' }}>
      <p style={{ fontSize: 28, fontWeight: 900, color: couleur, lineHeight: 1 }}>{valeur}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginTop: 4 }}>{libelle}</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Rapport journalier</p>
      <p className="text-sm text-gray-400 mb-5">
        Bilan de la journée envoyé par WhatsApp : cours programmés et effectués, absences justifiées et non justifiées.
      </p>

      <div style={{ ...carte, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setDate(ajouterJours(date, -1))} style={bouton('#f3f4f6', '#374151')}><ChevronLeft size={15} /></button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '8px 12px', fontSize: 14, fontWeight: 700 }} />
        <button type="button" onClick={() => setDate(ajouterJours(date, 1))} style={bouton('#f3f4f6', '#374151')}><ChevronRight size={15} /></button>
        <button type="button" onClick={() => setDate(aujourdhui())} style={bouton('#111827')}>Aujourd’hui</button>
        {chargement && <Loader2 size={18} className="animate-spin text-gray-400" />}
      </div>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}

      {rapport && (
        <>
          <div style={carte}>
            <p style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>{rapport.libelle}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {tuile(rapport.nbProgrammes, 'Cours programmés', '#111827')}
              {tuile(rapport.nbEffectues, 'Cours effectués', '#15803d')}
              {tuile(rapport.nbJustifiees, 'Absences justifiées', '#2563eb')}
              {tuile(rapport.nbNonJustifiees, 'Absences non justifiées', '#dc2626')}
            </div>
            {(rapport.nbAVenir > 0 || rapport.nbAnnules > 0) && (
              <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginTop: 10 }}>
                {rapport.nbAVenir > 0 && `${rapport.nbAVenir} cours pas encore tenus (à venir ou en cours). `}
                {rapport.nbAnnules > 0 && `${rapport.nbAnnules} cours annulés (non comptés).`}
              </p>
            )}
          </div>

          {rapport.retards.length > 0 && (
            <div style={carte}>
              <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Enseignants en retard ({rapport.retards.length})</p>
              {rapport.retards.map((t, i) => (
                <div key={i} style={{ borderTop: i ? '1px solid #f3f4f6' : 'none', padding: '10px 0' }}>
                  <p style={{ fontWeight: 800, fontSize: 14 }}>{t.enseignant} <span style={{ color: '#b45309', fontSize: 12 }}>· {t.minutes} min</span></p>
                  <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{t.cours}{t.specialite ? ` · ${t.specialite}` : ''} · {t.creneau}</p>
                </div>
              ))}
            </div>
          )}

          <div style={carte}>
            <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Absences de la journée</p>
            {rapport.absences.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>Aucune absence d’enseignant ce jour.</p>
            ) : rapport.absences.map((a) => (
              <div key={a.seanceId} style={{ borderTop: '1px solid #f3f4f6', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 14 }}>{a.enseignant}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                      {a.cours}{a.specialite ? ` · ${a.specialite}` : ''} · {a.creneau}
                    </p>
                    {a.statut === 'justifiee' && a.motif && <p style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700, marginTop: 2 }}>Motif : {a.motif}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800,
                      background: a.statut === 'justifiee' ? '#dbeafe' : a.statut === 'en_attente' ? '#fef3c7' : '#fee2e2',
                      color: a.statut === 'justifiee' ? '#1d4ed8' : a.statut === 'en_attente' ? '#b45309' : '#b91c1c',
                    }}>
                      {a.statut === 'justifiee' ? 'Justifiée' : a.statut === 'en_attente' ? 'Justificatif en attente' : 'Non justifiée'}
                    </span>
                    {a.statut === 'justifiee' ? (
                      <button type="button" disabled={occupe === a.seanceId} onClick={() => retirer(a)} style={bouton('#f3f4f6', '#374151')}>
                        <Undo2 size={14} /> Retirer
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setEnCours(enCours === a.seanceId ? null : a.seanceId); setMotif(''); setErreur(null); }} style={bouton('#2563eb')}>
                        <BadgeCheck size={14} /> Justifier
                      </button>
                    )}
                  </div>
                </div>
                {enCours === a.seanceId && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <input autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (maladie, deuil, mission…)"
                      onKeyDown={(e) => e.key === 'Enter' && valider(a)}
                      style={{ flex: '1 1 240px', border: '1px solid #e5e7eb', borderRadius: 12, padding: '9px 12px', fontSize: 14 }} />
                    <button type="button" disabled={occupe === a.seanceId} onClick={() => valider(a)} style={bouton('#16a34a')}>
                      {occupe === a.seanceId ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Valider
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={carte}>
            <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Message WhatsApp</p>
            <pre style={{ background: '#f9fafb', borderRadius: 12, padding: 14, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginBottom: 12 }}>{message}</pre>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>
                Destinataire&nbsp;
                <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="tel"
                  style={{ width: 150, border: '1px solid #e5e7eb', borderRadius: 12, padding: '8px 12px', fontSize: 14, fontWeight: 700 }} />
              </label>
              <a href={lien ?? undefined} target="_blank" rel="noreferrer"
                onClick={(e) => { if (!lien) e.preventDefault(); }}
                style={{ ...bouton('#16a34a'), textDecoration: 'none', opacity: lien ? 1 : 0.5 }}>
                <MessageCircle size={15} /> Envoyer par WhatsApp
              </a>
            </div>
            {!normaliserNumero(contact) && <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginTop: 8 }}>Numéro invalide.</p>}
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginTop: 8 }}>
              WhatsApp s’ouvre avec le message prêt (préfixe +237 ajouté automatiquement) ; il suffit d’appuyer sur envoyer.
            </p>
          </div>
        </>
      )}
    </div>
  );
}