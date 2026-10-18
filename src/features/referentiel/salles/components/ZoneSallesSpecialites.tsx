// src/features/referentiel/salles/components/ZoneSallesSpecialites.tsx
//
// Zone à droite du formulaire « Ajouter une salle » : quelles spécialités ont
// déjà une salle par défaut (et laquelle), et lesquelles n'en ont pas encore.
// Un clic sur une spécialité la sélectionne dans le formulaire.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, WifiOff } from 'lucide-react';
import { listSalles } from '../api';
import { listSpecialitesRecherche, type SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { supabase } from '@/lib/supabase';
import { niveauDeSemestre } from '@/lib/niveau';

interface Props {
  selectionId: string;
  niveau: number;
  onNiveau: (n: number) => void;
  onChoisir: (s: SpecialiteRecherche) => void;
}

// Toutes les offres (spécialité + semestre), paginées par 1000.
async function chargerNiveauxParSpecialite(): Promise<Map<string, Set<number>>> {
  const m = new Map<string, Set<number>>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('offres')
      .select('specialite_id, semestre')
      .range(debut, debut + 999);
    if (error) throw error;
    for (const o of (data ?? []) as any[]) {
      const n = niveauDeSemestre(o.semestre);
      if (n == null) continue;
      if (!m.has(o.specialite_id)) m.set(o.specialite_id, new Set());
      m.get(o.specialite_id)!.add(n);
    }
    if ((data ?? []).length < 1000) break;
  }
  return m;
}

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const labelCycle = (s: SpecialiteRecherche) => (s.sousCycle ? `${s.cycle} (${s.sousCycle})` : s.cycle);

// Effectif d'étudiants par « spécialité|niveau » (niveau = semestre / 2 arrondi
// au supérieur), requêtes paginées par 1000.
async function chargerEffectifs(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('etudiants')
      .select('specialite_id, semestre')
      .order('id', { ascending: true })
      .range(debut, debut + 999);
    if (error) throw error;
    for (const e of (data ?? []) as any[]) {
      const n = niveauDeSemestre(e.semestre);
      if (n == null || !e.specialite_id) continue;
      const k = `${e.specialite_id}|${n}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    if ((data ?? []).length < 1000) break;
  }
  return m;
}

export default function ZoneSallesSpecialites({ selectionId, niveau, onNiveau, onChoisir }: Props) {
  const [specialites, setSpecialites] = useState<SpecialiteRecherche[]>([]);
  const [sallesBrutes, setSallesBrutes] = useState<{ code: string; specialiteId: string; niveau: number | null }[]>([]);
  const [effectifs, setEffectifs] = useState<Map<string, number>>(new Map());
  const [niveauxParSpecialite, setNiveauxParSpecialite] = useState<Map<string, Set<number>>>(new Map());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    if (!navigator.onLine) {
      setChargement(false);
      setErreur(true);
      return;
    }
    Promise.all([listSpecialitesRecherche(), listSalles(), chargerNiveauxParSpecialite(), chargerEffectifs()])
      .then(([specs, salles, niveaux, eff]) => {
        setEffectifs(eff);
        setSpecialites(specs);
        setNiveauxParSpecialite(niveaux);
        setSallesBrutes(
          salles
            .filter((s) => !!s.specialite_par_defaut_id)
            .map((s) => ({ code: s.code_salle, specialiteId: s.specialite_par_defaut_id, niveau: s.niveau ?? null }))
        );
      })
      .catch(() => setErreur(true))
      .finally(() => setChargement(false));
  }, []);

  // Niveaux proposés : tous ceux qui existent dans les offres (au moins 1..2).
  const niveauxDispo = useMemo(() => {
    const t = new Set<number>([1, 2]);
    niveauxParSpecialite.forEach((set) => set.forEach((n) => t.add(n)));
    return Array.from(t).sort((a, b) => a - b);
  }, [niveauxParSpecialite]);

  // Salles du niveau choisi : celles de ce niveau + celles « tous niveaux ».
  const sallesParSpecialite = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of sallesBrutes) {
      if (r.niveau != null && r.niveau !== niveau) continue;
      if (!m.has(r.specialiteId)) m.set(r.specialiteId, []);
      m.get(r.specialiteId)!.push(r.niveau == null ? `${r.code} (tous)` : r.code);
    }
    m.forEach((l) => l.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })));
    return m;
  }, [sallesBrutes, niveau]);

  // Spécialités qui ont ce niveau (si on ne connaît pas leurs offres, on les garde).
  const specialitesDuNiveau = useMemo(
    () => specialites.filter((s) => {
      const n = niveauxParSpecialite.get(s.id);
      return !n || n.size === 0 || n.has(niveau);
    }),
    [specialites, niveauxParSpecialite, niveau]
  );

  const { sans, avec } = useMemo(() => {
    const q = sansAccent(recherche.trim());
    const filtrees = specialitesDuNiveau.filter(
      (s) => !q || sansAccent(`${s.nom} ${s.cycle} ${s.filiereNom} ${s.ecoleNom}`).includes(q)
    );
    const tri = (a: SpecialiteRecherche, b: SpecialiteRecherche) =>
      labelCycle(a).localeCompare(labelCycle(b), 'fr') || a.nom.localeCompare(b.nom, 'fr');
    return {
      sans: filtrees.filter((s) => !sallesParSpecialite.has(s.id)).sort(tri),
      avec: filtrees.filter((s) => sallesParSpecialite.has(s.id)).sort(tri),
    };
  }, [specialitesDuNiveau, sallesParSpecialite, recherche]);

  const totalSans = specialitesDuNiveau.filter((s) => !sallesParSpecialite.has(s.id)).length;
  const totalAvec = specialitesDuNiveau.length - totalSans;

  function Ligne({ s, salles }: { s: SpecialiteRecherche; salles?: string[] }) {
    const choisie = s.id === selectionId;
    return (
      <button
        type="button"
        onClick={() => onChoisir(s)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          border: choisie ? '2px solid #dc2626' : '1px solid #f1f1f1',
          borderRadius: 12,
          padding: choisie ? '7px 10px' : '8px 11px',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="block text-xs font-bold text-gray-900 truncate">
            {s.nom} ({effectifs.get(`${s.id}|${niveau}`) ?? 0})
          </span>
          <span className="block text-[10px] text-gray-400 truncate">
            {labelCycle(s)} · Niveau {niveau} · {s.ecoleNom}
          </span>
        </span>
        {salles ? (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {salles.map((c) => (
              <span
                key={c}
                style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}
              >
                {c}
              </span>
            ))}
          </span>
        ) : (
          <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
            Sans salle
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[20px] p-4">
      <p className="font-extrabold text-sm text-gray-900">Salles par spécialité</p>
      <p className="text-[11px] text-gray-400 mb-3">Choisis un niveau, puis clique sur une spécialité pour la sélectionner dans le formulaire.</p>

      {chargement ? (
        <div className="flex justify-center py-6 text-gray-300">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : erreur ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
          <WifiOff size={14} className="shrink-0" /> Liste disponible en ligne uniquement.
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>NIVEAU</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {niveauxDispo.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onNiveau(n)}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 800,
                  background: n === niveau ? '#dc2626' : '#f3f4f6',
                  color: n === niveau ? '#fff' : '#4b5563',
                }}
              >
                Niveau {n}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
              {totalSans} sans salle
            </span>
            <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
              {totalAvec} avec salle
            </span>
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: '#9ca3af' }} />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Filtrer les spécialités…"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 12, padding: '8px 12px 8px 32px', fontSize: 13, fontWeight: 600, outline: 'none' }}
            />
          </div>

          <p style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>
            SANS SALLE ({sans.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '32vh', overflowY: 'auto', marginBottom: 14 }}>
            {sans.length === 0 ? (
              <p className="text-xs text-gray-400">{recherche ? 'Aucun résultat.' : 'Toutes les spécialités ont une salle 🎉'}</p>
            ) : (
              sans.map((s) => <Ligne key={s.id} s={s} />)
            )}
          </div>

          <p style={{ fontSize: 11, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>
            AVEC SALLE ({avec.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '32vh', overflowY: 'auto' }}>
            {avec.length === 0 ? (
              <p className="text-xs text-gray-400">{recherche ? 'Aucun résultat.' : 'Aucune salle attribuée pour le moment.'}</p>
            ) : (
              avec.map((s) => <Ligne key={s.id} s={s} salles={sallesParSpecialite.get(s.id)} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}