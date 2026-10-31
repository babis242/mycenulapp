// src/features/evenements-edt/pages/EvenementsEDTPage.tsx
//
// Création / suivi des événements de l'emploi du temps. Un événement bloque un
// jour + des créneaux pour des classes (spécialité + niveau) et supprime les
// séances déjà programmées à ces endroits.
import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Loader2, Trash2, AlertTriangle, CheckCircle2, Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tousLesCreneaux } from '@/constants/enums';
import {
  apercuEvenement,
  creerEvenement,
  listEvenements,
  modifierEvenement,
  semaineEtJour,
  supprimerEvenement,
  type ApercuEvenement,
  type CibleEvenement,
  type EvenementEDT,
} from '../api';

interface Spe {
  id: string;
  nom: string;
  cycle: string;
  nbNiveaux: number;
}

const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 20, marginBottom: 16 };
const champ: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600,
  outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box',
};
const etiquette: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, display: 'block' };

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function EvenementsEDTPage() {
  const user = useAuthStore((s) => s.user);
  const perimetre = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [specialites, setSpecialites] = useState<Spe[]>([]);
  const [evenements, setEvenements] = useState<EvenementEDT[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [creneaux, setCreneaux] = useState<string[]>([]);
  const [cibles, setCibles] = useState<Set<string>>(new Set()); // "specialiteId|niveau"

  const [apercu, setApercu] = useState<ApercuEvenement | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);
  const [enEdition, setEnEdition] = useState<string | null>(null);

  async function chargerEvenements() {
    try {
      setEvenements(await listEvenements());
    } catch (e: any) {
      setErreur(
        /relation .* does not exist|evenements_edt/i.test(e?.message ?? '')
          ? "Les tables d'événements n'existent pas encore : exécute sql/evenements_edt.sql dans Supabase."
          : e?.message || 'Chargement impossible.'
      );
    }
  }

  useEffect(() => {
    supabase
      .from('specialites')
      .select('id, nom, cycle, type_cursus')
      .then(({ data, error }) => {
        if (error) return setErreur(error.message);
        setSpecialites(
          ((data ?? []) as any[])
            .filter((s) => !perimetre || perimetre.includes(s.id))
            .map((s) => ({ id: s.id, nom: s.nom, cycle: s.cycle, nbNiveaux: s.type_cursus === 'sante_culinaire' ? 3 : 2 }))
            .sort((a, b) => a.cycle.localeCompare(b.cycle) || a.nom.localeCompare(b.nom, 'fr'))
        );
      });
    chargerEvenements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parCycle = useMemo(() => {
    const m = new Map<string, Spe[]>();
    for (const s of specialites) m.set(s.cycle, [...(m.get(s.cycle) ?? []), s]);
    return Array.from(m.entries());
  }, [specialites]);

  const listeCibles: CibleEvenement[] = useMemo(
    () => Array.from(cibles).map((k) => { const [specialiteId, n] = k.split('|'); return { specialiteId, niveau: Number(n) }; }),
    [cibles]
  );
  const sj = date ? semaineEtJour(date) : null;
  const dimanche = !!date && !sj;

  // Aperçu : séances qui seront supprimées, mis à jour dès que la saisie change.
  useEffect(() => {
    setApercu(null);
    setAccepte(false);
    if (!date || !sj || creneaux.length === 0 || listeCibles.length === 0) return;
    let actif = true;
    setCalcul(true);
    const t = setTimeout(() => {
      apercuEvenement({ titre, date, creneaux, cibles: listeCibles })
        .then((a) => actif && setApercu(a))
        .catch((e) => actif && setErreur(e?.message || 'Aperçu impossible.'))
        .finally(() => actif && setCalcul(false));
    }, 350);
    return () => {
      actif = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, creneaux, cibles]);

  function basculerCible(spId: string, niveau: number) {
    const k = `${spId}|${niveau}`;
    setCibles((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function basculerListe(liste: Spe[]) {
    const toutes = liste.flatMap((s) => Array.from({ length: s.nbNiveaux }, (_, i) => `${s.id}|${i + 1}`));
    setCibles((prev) => {
      const n = new Set(prev);
      const toutCoche = toutes.every((k) => n.has(k));
      toutes.forEach((k) => (toutCoche ? n.delete(k) : n.add(k)));
      return n;
    });
  }
  function basculerCreneau(c: string) {
    setCreneaux((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  const besoinAccord = !!apercu && (apercu.classesNonCibleesTouchees.length > 0 || apercu.protegees.length > 0);
  const peutCreer = !!titre.trim() && !!sj && creneaux.length > 0 && listeCibles.length > 0 && !!apercu && !envoi && (!besoinAccord || accepte);

  function commencerEdition(ev: EvenementEDT) {
    setEnEdition(ev.id);
    setTitre(ev.titre);
    setDescription(ev.description ?? '');
    setDate(ev.date);
    setCreneaux(ev.creneaux);
    setCibles(new Set(ev.cibles.map((c) => `${c.specialiteId}|${c.niveau}`)));
    setErreur(null);
    setSucces(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function annulerEdition() {
    setEnEdition(null);
    setTitre(''); setDescription(''); setDate(''); setCreneaux([]); setCibles(new Set()); setApercu(null);
  }

  async function creer() {
    if (!apercu) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    try {
      const saisie = { titre, description, date, creneaux, cibles: listeCibles };
      if (enEdition) await modifierEvenement(enEdition, saisie, apercu);
      else await creerEvenement(saisie, apercu);
      setSucces(
        `Événement ${enEdition ? 'modifié' : 'créé'}. ${apercu.aSupprimer.length} séance(s) supprimée(s)${apercu.protegees.length ? `, ${apercu.protegees.length} conservée(s) car déjà tenue(s)` : ''}.`
      );
      setTitre(''); setDescription(''); setDate(''); setCreneaux([]); setCibles(new Set()); setApercu(null);
      setEnEdition(null);
      await chargerEvenements();
    } catch (e: any) {
      setErreur(e?.message || 'Création impossible.');
      await chargerEvenements();
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(ev: EvenementEDT) {
    if (!window.confirm(`Supprimer l'événement « ${ev.titre} » ?\n\nLes créneaux seront de nouveau libres. Les séances qui avaient été supprimées ne reviennent PAS : il faudra les reprogrammer.`)) return;
    setSuppressionId(ev.id);
    try {
      await supprimerEvenement(ev.id);
      await chargerEvenements();
    } catch (e: any) {
      setErreur(e?.message || 'Suppression impossible.');
    } finally {
      setSuppressionId(null);
    }
  }

  const nomSpe = (id: string) => specialites.find((s) => s.id === id)?.nom ?? 'Spécialité';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Événements</p>
      <p className="text-sm text-gray-400 mb-5">
        Bloque un jour et des créneaux pour des classes précises (réunion, examen, jour férié, sortie…). L'événement apparaît
        dans l'emploi du temps et les séances déjà programmées à ce moment-là sont supprimées.
      </p>

      {enEdition && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>Modification d'un événement existant</span>
          <button type="button" onClick={annulerEdition} style={{ border: 0, background: 'transparent', color: '#92400e', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={14} /> Annuler la modification
          </button>
        </div>
      )}
      <div style={carte}>
        <label style={etiquette}>Titre</label>
        <input style={champ} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Journée de l'étudiant" />

        <div style={{ height: 14 }} />
        <label style={etiquette}>Description (facultative)</label>
        <input style={champ} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. Pas de cours pour les BTS 1" />

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={etiquette}>Date</label>
            <input type="date" style={champ} value={date} onChange={(e) => setDate(e.target.value)} />
            {sj && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6, fontWeight: 600 }}>{formatDate(date)}</p>}
            {dimanche && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 700 }}>Le dimanche n'est pas un jour de cours.</p>}
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={etiquette}>Créneaux bloqués</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tousLesCreneaux().map((c) => {
                const on = creneaux.includes(c);
                return (
                  <button key={c} type="button" onClick={() => basculerCreneau(c)}
                    style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '10px 16px', fontSize: 13, fontWeight: 800,
                      background: on ? '#dc2626' : '#fff', color: on ? '#fff' : '#4b5563', boxShadow: on ? 'none' : 'inset 0 0 0 1px #e5e7eb' }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={carte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <p className="font-extrabold text-sm text-gray-900">Classes concernées ({listeCibles.length})</p>
          <button type="button" onClick={() => basculerListe(specialites)}
            style={{ border: 0, background: '#f3f4f6', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, color: '#374151', cursor: 'pointer' }}>
            Tout cocher / décocher
          </button>
        </div>
        {parCycle.length === 0 && <p className="text-sm text-gray-400">Aucune spécialité.</p>}
        {parCycle.map(([cycle, liste]) => (
          <div key={cycle} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase' }}>{cycle}</p>
              <button type="button" onClick={() => basculerListe(liste)}
                style={{ border: 0, background: 'transparent', fontSize: 11, fontWeight: 800, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}>
                tout le cycle
              </button>
            </div>
            {liste.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', minWidth: 0, flex: 1 }}>{s.nom}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {Array.from({ length: s.nbNiveaux }, (_, i) => i + 1).map((n) => {
                    const on = cibles.has(`${s.id}|${n}`);
                    return (
                      <button key={n} type="button" onClick={() => basculerCible(s.id, n)}
                        style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800,
                          background: on ? '#111827' : '#fff', color: on ? '#fff' : '#4b5563', boxShadow: on ? 'none' : 'inset 0 0 0 1px #e5e7eb' }}>
                        Niveau {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {(calcul || apercu) && (
        <div style={carte}>
          <p className="font-extrabold text-sm text-gray-900 mb-2">Ce qui sera supprimé</p>
          {calcul && <p className="text-sm text-gray-400"><Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />Vérification…</p>}
          {!calcul && apercu && apercu.aSupprimer.length === 0 && apercu.protegees.length === 0 && (
            <p className="text-sm text-gray-500">Aucune séance programmée sur ces créneaux pour ces classes : rien à supprimer.</p>
          )}
          {!calcul && apercu && apercu.aSupprimer.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {apercu.aSupprimer.map((s) => (
                <li key={s.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <b>{s.ueNom}</b> — {s.jour} {s.creneau}{s.enseignantNom ? ` · ${s.enseignantNom}` : ''}
                  <span style={{ color: '#9ca3af' }}> · {s.classes.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          {!calcul && apercu && apercu.classesNonCibleesTouchees.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: 12, marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#92400e', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> Séances de tronc commun partagées avec des classes non cochées
              </p>
              <p style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                Ces séances sont communes : elles seront supprimées aussi pour {apercu.classesNonCibleesTouchees.join(', ')}. Coche ces classes si l'événement les concerne.
              </p>
            </div>
          )}
          {!calcul && apercu && apercu.protegees.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 12, marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> {apercu.protegees.length} séance(s) déjà tenue(s) : conservée(s), à traiter à la main
              </p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#991b1b' }}>
                {apercu.protegees.map((s) => <li key={s.id}>{s.ueNom} — {s.jour} {s.creneau}</li>)}
              </ul>
            </div>
          )}
          {besoinAccord && !calcul && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, fontWeight: 700, color: '#111827' }}>
              <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
              J'ai pris connaissance de ces avertissements
            </label>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
        <button type="button" onClick={creer} disabled={!peutCreer}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '12px 22px', fontSize: 14, fontWeight: 800, cursor: peutCreer ? 'pointer' : 'not-allowed', opacity: peutCreer ? 1 : 0.5 }}>
          {envoi ? <Loader2 size={16} className="animate-spin" /> : <CalendarX2 size={16} />} {enEdition ? 'Enregistrer les modifications' : 'Créer l\'événement'}
        </button>
        {succes && <span style={{ color: '#15803d', fontSize: 13, fontWeight: 700, display: 'inline-flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={15} />{succes}</span>}
      </div>
      {erreur && <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{erreur}</p>}

      <p className="font-extrabold text-sm text-gray-900 mb-2">Événements enregistrés</p>
      {evenements.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun événement.</p>
      ) : (
        evenements.map((ev) => {
          const classes = ev.cibles.map((c) => `${nomSpe(c.specialiteId)} N${c.niveau}`);
          return (
            <div key={ev.id} style={{ ...carte, padding: 16, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{ev.titre}</p>
                <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'capitalize' }}>{formatDate(ev.date)} · {ev.creneaux.join(' + ')}</p>
                {ev.description && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{ev.description}</p>}
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>{classes.join(' · ')}</p>
              </div>
              <button type="button" onClick={() => commencerEdition(ev)} title="Modifier l'événement"
                style={{ border: 0, background: '#f3f4f6', color: '#374151', borderRadius: 999, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => retirer(ev)} disabled={suppressionId === ev.id} title="Supprimer l'événement"
                style={{ border: 0, background: '#fef2f2', color: '#dc2626', borderRadius: 999, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {suppressionId === ev.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}