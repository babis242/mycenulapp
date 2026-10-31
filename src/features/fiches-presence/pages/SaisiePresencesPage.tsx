// src/features/fiches-presence/pages/SaisiePresencesPage.tsx
//
// Saisie manuelle des présences : pour une classe et une semaine, on voit les
// créneaux réellement programmés ; tous les étudiants sont PRÉSENTS par défaut
// et on ne touche que les absents. Deux vues : un créneau à la fois, ou toute
// la semaine d'un coup.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Save, Search, UserX } from 'lucide-react';
import { listEtudiants, type Etudiant } from '@/features/referentiel/etudiants/api';
import SelecteurGroupe, { lundiCourant, type ChoixGroupe } from '../components/SelecteurGroupe';
import { listPresences } from '../lectureApi';
import {
  cleCase,
  enregistrerSaisieManuelle,
  getCreneauxProgrammes,
  type CreneauProgramme,
} from '../saisieApi';

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
  const [creneaux, setCreneaux] = useState<CreneauProgramme[]>([]);
  const [absents, setAbsents] = useState<Set<string>>(new Set()); // cases « absent »
  const [enregistres, setEnregistres] = useState<Set<string>>(new Set()); // "jour|creneau" déjà saisis
  const [mode, setMode] = useState<'creneau' | 'semaine'>('creneau');
  const [creneauChoisi, setCreneauChoisi] = useState('');
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [modifie, setModifie] = useState(false);

  useEffect(() => {
    setErreur(null);
    setSucces(null);
    setModifie(false);
    if (!choix.specialiteId || !choix.semestre || !choix.semaine) {
      setEtudiants([]); setCreneaux([]); setAbsents(new Set()); setEnregistres(new Set());
      return;
    }
    let actif = true;
    setChargement(true);
    Promise.all([
      listEtudiants(choix.specialiteId, choix.semestre),
      getCreneauxProgrammes(choix.specialiteId, choix.semestre, choix.semaine),
      listPresences(choix.specialiteId, choix.semestre, choix.semaine),
    ])
      .then(([e, c, p]) => {
        if (!actif) return;
        setEtudiants(e);
        setCreneaux(c);
        setAbsents(new Set(p.filter((x) => !x.present).map((x) => cleCase(x.etudiant_id, x.jour, x.creneau))));
        setEnregistres(new Set(p.map((x) => `${x.jour}|${x.creneau}`)));
        setCreneauChoisi((prev) => (c.some((x) => `${x.jour}|${x.creneau}` === prev) ? prev : c[0] ? `${c[0].jour}|${c[0].creneau}` : ''));
      })
      .catch((e) => actif && setErreur(e?.message ?? 'Erreur de chargement.'))
      .finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, [choix.specialiteId, choix.semestre, choix.semaine]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? etudiants.filter((e) => e.nom_complet.toLowerCase().includes(q)) : etudiants;
  }, [etudiants, recherche]);

  const creneauxVue = useMemo(
    () => (mode === 'creneau' ? creneaux.filter((c) => `${c.jour}|${c.creneau}` === creneauChoisi) : creneaux),
    [mode, creneaux, creneauChoisi]
  );

  function basculer(etudiantId: string, jour: string, creneau: string) {
    const k = cleCase(etudiantId, jour, creneau);
    setAbsents((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    setModifie(true); setSucces(null);
  }
  function toutDefinir(liste: Etudiant[], cases: CreneauProgramme[], absent: boolean) {
    setAbsents((prev) => {
      const n = new Set(prev);
      for (const e of liste) for (const c of cases) {
        const k = cleCase(e.id, c.jour, c.creneau);
        absent ? n.add(k) : n.delete(k);
      }
      return n;
    });
    setModifie(true); setSucces(null);
  }

  const nbAbsentsCreneau = (c: CreneauProgramme) => etudiants.filter((e) => absents.has(cleCase(e.id, c.jour, c.creneau))).length;

  async function enregistrer() {
    setEnvoi(true); setErreur(null); setSucces(null);
    try {
      const n = await enregistrerSaisieManuelle({
        specialiteId: choix.specialiteId,
        semestre: choix.semestre,
        semaine: choix.semaine,
        creneaux: creneauxVue,
        etudiantIds: etudiants.map((e) => e.id),
        present: (id, jour, creneau) => !absents.has(cleCase(id, jour, creneau)),
      });
      setEnregistres((prev) => { const s = new Set(prev); creneauxVue.forEach((c) => s.add(`${c.jour}|${c.creneau}`)); return s; });
      setModifie(false);
      setSucces(`${n} présence(s) enregistrée(s) pour ${creneauxVue.length} créneau(x).`);
    } catch (e: any) {
      setErreur(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  }

  const libelleCreneau = (c: CreneauProgramme) => `${c.jour} ${c.creneau}`;
  const prete = !!choix.specialiteId && !!choix.semestre && !chargement;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Saisie des présences</p>
      <p className="text-sm text-gray-400 mb-5">
        Tous les étudiants sont présents par défaut : touche uniquement les absents. Les créneaux affichés sont ceux
        réellement programmés dans l'emploi du temps de la semaine.
      </p>

      <div style={carte}>
        <SelecteurGroupe valeur={choix} onChange={setChoix} />
      </div>

      {erreur && <p style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>{erreur}</p>}
      {chargement && <Loader2 className="animate-spin text-red-600 mx-auto" />}

      {prete && creneaux.length === 0 && (
        <div style={carte}><p className="text-sm text-gray-500">Aucun créneau programmé pour cette classe cette semaine.</p></div>
      )}
      {prete && creneaux.length > 0 && etudiants.length === 0 && (
        <div style={carte}><p className="text-sm text-gray-500">Aucun étudiant inscrit dans cette classe pour ce semestre.</p></div>
      )}

      {prete && creneaux.length > 0 && etudiants.length > 0 && (
        <>
          <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={pastille(mode === 'creneau')} onClick={() => setMode('creneau')}>Par créneau</button>
              <button type="button" style={pastille(mode === 'semaine')} onClick={() => setMode('semaine')}>Toute la semaine</button>
            </div>

            {mode === 'creneau' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {creneaux.map((c) => {
                  const k = `${c.jour}|${c.creneau}`;
                  return (
                    <button key={k} type="button" onClick={() => setCreneauChoisi(k)} style={{ ...pastille(creneauChoisi === k), textAlign: 'left' }}>
                      {libelleCreneau(c)}
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, opacity: 0.75, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cours}</span>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 800, opacity: 0.8 }}>
                        {enregistres.has(k) ? `✓ saisi · ${nbAbsentsCreneau(c)} absent(s)` : 'pas encore saisi'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 999, padding: '9px 14px', flex: '1 1 220px' }}>
                <Search size={15} color="#9ca3af" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un étudiant…"
                  style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, width: '100%' }} />
              </div>
              {mode === 'creneau' && creneauxVue[0] && (
                <>
                  <button type="button" style={pastille(false)} onClick={() => toutDefinir(visibles, creneauxVue, false)}>Tous présents</button>
                  <button type="button" style={pastille(false)} onClick={() => toutDefinir(visibles, creneauxVue, true)}>Tous absents</button>
                </>
              )}
            </div>
          </div>

          {mode === 'creneau' && creneauxVue[0] && (
            <div style={carte}>
              <p style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{libelleCreneau(creneauxVue[0])} — {creneauxVue[0].cours}</p>
              <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>
                {creneauxVue[0].enseignants} · {etudiants.length - nbAbsentsCreneau(creneauxVue[0])} présent(s) · {nbAbsentsCreneau(creneauxVue[0])} absent(s)
              </p>
              {visibles.map((e) => {
                const absent = absents.has(cleCase(e.id, creneauxVue[0].jour, creneauxVue[0].creneau));
                return (
                  <button key={e.id} type="button" onClick={() => basculer(e.id, creneauxVue[0].jour, creneauxVue[0].creneau)}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: 0, borderBottom: '1px solid #f3f4f6', background: absent ? '#fef2f2' : 'transparent', padding: '10px 8px', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{e.nom_complet}<span style={{ color: '#9ca3af', fontWeight: 600, fontSize: 11 }}> · {e.matricule}</span></span>
                    <span style={{ flexShrink: 0, borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 800, background: absent ? '#dc2626' : '#dcfce7', color: absent ? '#fff' : '#15803d' }}>
                      {absent ? 'Absent' : 'Présent'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'semaine' && (
            <div style={{ ...carte, padding: 0, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 + creneaux.length * 78 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: '#fff', textAlign: 'left', padding: '12px 14px', fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', zIndex: 1 }}>Étudiant</th>
                    {creneaux.map((c) => (
                      <th key={`${c.jour}|${c.creneau}`} title={c.cours} style={{ padding: '8px 4px', fontSize: 11, fontWeight: 800, color: '#374151', textAlign: 'center', minWidth: 78 }}>
                        {c.jour.slice(0, 3)}<br /><span style={{ color: '#9ca3af', fontWeight: 700 }}>{c.creneau}</span>
                        <br /><span style={{ color: '#dc2626', fontSize: 10 }}>{nbAbsentsCreneau(c)} abs.</span>
                      </th>
                    ))}
                    <th style={{ padding: '8px 10px', fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>Semaine</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e) => {
                    const toutAbsent = creneaux.every((c) => absents.has(cleCase(e.id, c.jour, c.creneau)));
                    return (
                      <tr key={e.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', zIndex: 1 }}>{e.nom_complet}</td>
                        {creneaux.map((c) => {
                          const absent = absents.has(cleCase(e.id, c.jour, c.creneau));
                          return (
                            <td key={`${c.jour}|${c.creneau}`} style={{ textAlign: 'center', padding: 4 }}>
                              <button type="button" onClick={() => basculer(e.id, c.jour, c.creneau)}
                                style={{ border: 0, cursor: 'pointer', width: 56, height: 34, borderRadius: 10, fontSize: 13, fontWeight: 900, background: absent ? '#dc2626' : '#dcfce7', color: absent ? '#fff' : '#15803d' }}>
                                {absent ? 'A' : 'P'}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', padding: 4 }}>
                          <button type="button" title={toutAbsent ? 'Remettre présent partout' : 'Absent toute la semaine'} onClick={() => toutDefinir([e], creneaux, !toutAbsent)}
                            style={{ border: 0, cursor: 'pointer', borderRadius: 10, width: 40, height: 34, background: '#f3f4f6', color: toutAbsent ? '#dc2626' : '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <UserX size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ position: 'sticky', bottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={enregistrer} disabled={envoi}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 0, borderRadius: 999, padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', opacity: envoi ? 0.6 : 1 }}>
              {envoi ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {mode === 'creneau' ? 'Enregistrer ce créneau' : 'Enregistrer la semaine'}
            </button>
            {modifie && <span style={{ fontSize: 12, fontWeight: 800, color: '#d97706' }}>Modifications non enregistrées</span>}
            {succes && <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d', display: 'inline-flex', gap: 6, alignItems: 'center', background: '#fff', borderRadius: 999, padding: '6px 12px' }}><CheckCircle2 size={15} />{succes}</span>}
          </div>
        </>
      )}
    </div>
  );
}