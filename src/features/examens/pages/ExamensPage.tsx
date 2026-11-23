// Liste des examens + création (titre, semestre, spécialités concernées).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import {
  listCyclesDisponibles, listSpecialitesDuCycleSemestre, type CycleOption, type SpecialiteGroupe,
} from '@/features/emploi-du-temps/api';
import { creerExamen, listExamens, supprimerExamen, type Examen } from '../api';

const SEMESTRES = Array.from(new Set(Object.values(SEMESTRES_PAR_TYPE_CURSUS).flatMap((l) => l)));
const carte: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 18, marginBottom: 12 };
const champ: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 600, background: '#fff' };
const etiquette: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 };
const pilule = (actif: boolean): React.CSSProperties => ({ border: 0, cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, background: actif ? '#dc2626' : '#f3f4f6', color: actif ? '#fff' : '#374151' });

export default function ExamensPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const perimetre = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;

  const [examens, setExamens] = useState<Examen[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const [titre, setTitre] = useState('');
  const [annee, setAnnee] = useState('2026/2027');
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [cycleKey, setCycleKey] = useState('');
  const [semestre, setSemestre] = useState('');
  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);

  async function charger() {
    setChargement(true);
    try { setExamens(await listExamens()); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Chargement impossible (sql/examens.sql exécuté ?).'); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(); }, []);
  useEffect(() => { listCyclesDisponibles(perimetre).then(setCycles).catch(() => {}); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    setChoisies(new Set());
    if (!cycleKey || !semestre) { setSpecialites([]); return; }
    const [cycle, sous] = cycleKey.split('::');
    let actif = true;
    listSpecialitesDuCycleSemestre(cycle, sous || null, semestre, perimetre)
      .then((l) => { if (actif) { setSpecialites(l); setChoisies(new Set(l.map((x) => x.id))); } })
      .catch((e) => actif && setErreur(e?.message ?? 'Chargement impossible.'));
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey, semestre]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!titre.trim()) return setErreur("Donnez un titre à l'examen.");
    if (!semestre) return setErreur('Choisissez le semestre.');
    if (choisies.size === 0) return setErreur('Sélectionnez au moins une spécialité.');
    setEnvoi(true);
    try {
      const id = await creerExamen({ titre, anneeAcademique: annee, semestre, specialiteIds: Array.from(choisies) });
      navigate(`/examens/${id}`);
    } catch (err: any) {
      setErreur(err?.message ?? 'Création impossible.');
    } finally { setEnvoi(false); }
  }

  async function supprimer(ex: Examen) {
    if (!window.confirm(`Supprimer l'examen « ${ex.titre} » et tout son programme ?\n\nCette action est définitive.`)) return;
    try { await supprimerExamen(ex.id); setExamens((p) => p.filter((x) => x.id !== ex.id)); }
    catch (err: any) { setErreur(err?.message ?? 'Suppression impossible.'); }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 className="text-xl font-extrabold text-gray-900">Programmes d'examens</h1>
        <button type="button" onClick={() => setCreation((v) => !v)}
          style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '9px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Plus size={15} /> Nouvel examen
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Créez un examen, choisissez les spécialités et le semestre, puis construisez le programme et générez les PDF.</p>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}

      {creation && (
        <form onSubmit={creer} style={carte}>
          <label style={etiquette}>Titre de l'examen</label>
          <input style={champ} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex : Examens du 1er semestre — Session normale" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
            <div><label style={etiquette}>Année académique</label><input style={champ} value={annee} onChange={(e) => setAnnee(e.target.value)} /></div>
            <div>
              <label style={etiquette}>Cycle</label>
              <select style={champ} value={cycleKey} onChange={(e) => { setCycleKey(e.target.value); setSemestre(''); }}>
                <option value="">Cycle...</option>
                {cycles.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={etiquette}>Semestre</label>
              <select style={champ} value={semestre} disabled={!cycleKey} onChange={(e) => setSemestre(e.target.value)}>
                <option value="">Semestre...</option>
                {SEMESTRES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {specialites.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={etiquette}>Spécialités concernées ({choisies.size}/{specialites.length})</span>
                <span style={{ display: 'flex', gap: 10 }}>
                  <button type="button" style={{ border: 0, background: 'none', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer' }} onClick={() => setChoisies(new Set(specialites.map((s) => s.id)))}>Tout le cycle</button>
                  <button type="button" style={{ border: 0, background: 'none', color: '#9ca3af', fontWeight: 800, fontSize: 12, cursor: 'pointer' }} onClick={() => setChoisies(new Set())}>Aucune</button>
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {specialites.map((s) => (
                  <button key={s.id} type="button" style={pilule(choisies.has(s.id))}
                    onClick={() => setChoisies((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                    {s.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={envoi}
            style={{ marginTop: 18, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '11px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', gap: 8, alignItems: 'center', opacity: envoi ? 0.6 : 1 }}>
            {envoi && <Loader2 size={15} className="animate-spin" />} Créer et programmer
          </button>
        </form>
      )}

      {chargement && <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="animate-spin" /></div>}
      {!chargement && examens.length === 0 && <p className="text-sm text-gray-400" style={{ textAlign: 'center', padding: 24 }}>Aucun examen pour le moment.</p>}

      {examens.map((ex) => (
        <div key={ex.id} style={{ ...carte, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 8 }} onClick={() => navigate(`/examens/${ex.id}`)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{ex.titre}</p>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>{ex.semestre} · {ex.anneeAcademique} · {ex.specialites.length} spécialité(s) : {ex.specialites.map((s) => s.nom).join(', ')}</p>
          </div>
          <button type="button" title="Supprimer l'examen" onClick={(e) => { e.stopPropagation(); supprimer(ex); }}
            style={{ border: 0, background: '#fff7ed', color: '#c2410c', borderRadius: 999, padding: 8, cursor: 'pointer', display: 'inline-flex' }}><Trash2 size={15} /></button>
          <ChevronRight size={18} color="#9ca3af" />
        </div>
      ))}
    </div>
  );
}