// src/features/sondage/pages/SondageAdminPage.tsx
//
// Administration du sondage étudiants : lien public + QR, publication de la
// semaine (cours et enseignants pris de l'emploi du temps) et résultats.
import { Fragment, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, ChevronDown, ChevronUp, Copy, Loader2, Send, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { lundiCourant } from '@/features/fiches-presence/components/SelecteurGroupe';
import {
  fermerSondage,
  getSondagesDeLaSemaine,
  listReponses,
  listSemainesPubliees,
  publierSondage,
  type LigneReponse,
  type SondageSemaine,
} from '../api';
import { agreger, pourcent, type StatEnseignant } from '../resultats';
import { libelleCode } from '../codes';

function versLundi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jour = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (jour === 0 ? -6 : 1 - jour));
  return dt.toISOString().slice(0, 10);
}

function libelleSemaine(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 5);
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  return `${a.toLocaleDateString('fr-FR', o)} – ${b.toLocaleDateString('fr-FR', { ...o, year: 'numeric' })}`;
}

const top = (m: Map<string, number>, n = 3) =>
  Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);

function Jauge({ valeur, bon }: { valeur: number | null; bon: boolean }) {
  if (valeur === null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const couleur = bon ? (valeur >= 70 ? '#16a34a' : valeur >= 40 ? '#f59e0b' : '#dc2626') : (valeur >= 40 ? '#dc2626' : valeur >= 20 ? '#f59e0b' : '#16a34a');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 74 }}>
      <div style={{ flex: 1, height: 6, background: '#f1f1f1', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ width: `${valeur}%`, height: '100%', background: couleur, borderRadius: 9 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: couleur, width: 30, textAlign: 'right' }}>{valeur}%</span>
    </div>
  );
}

function Kpi({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ flex: '1 1 120px', background: '#f7f7f7', borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{valeur}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function SondageAdminPage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;
  const dansPerimetre = (id: string) => !perimetreIds || perimetreIds.includes(id);

  const lien = `${window.location.origin}/sondage`;
  const [qr, setQr] = useState('');
  const [copie, setCopie] = useState(false);

  const [semainePub, setSemainePub] = useState(lundiCourant());
  const [action, setAction] = useState<'publier' | 'fermer' | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [semaines, setSemaines] = useState<string[]>([]);
  const [semaineRes, setSemaineRes] = useState('');
  const [sondages, setSondages] = useState<SondageSemaine[]>([]);
  const [reponses, setReponses] = useState<LigneReponse[]>([]);
  const [chargement, setChargement] = useState(false);
  const [filtre, setFiltre] = useState(''); // "specialite_id|niveau"
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(lien, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
  }, [lien]);

  async function chargerSemaines(choisir?: string) {
    const l = await listSemainesPubliees();
    setSemaines(l);
    setSemaineRes((s) => (choisir && l.includes(choisir) ? choisir : s && l.includes(s) ? s : l[0] ?? ''));
  }
  useEffect(() => {
    chargerSemaines().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!semaineRes) {
      setSondages([]);
      setReponses([]);
      return;
    }
    setChargement(true);
    Promise.all([getSondagesDeLaSemaine(semaineRes), listReponses(semaineRes)])
      .then(([s, r]) => {
        setSondages(s.filter((x) => dansPerimetre(x.specialite_id)));
        setReponses(r.filter((x) => dansPerimetre(x.specialite_id)));
      })
      .catch((e) => setErreur(e?.message || 'Chargement impossible.'))
      .finally(() => setChargement(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaineRes]);

  async function publier() {
    setErreur(null);
    setInfo(null);
    if (!navigator.onLine) return setErreur('Une connexion Internet est nécessaire.');
    setAction('publier');
    try {
      const r = await publierSondage(semainePub, perimetreIds);
      setInfo(
        r.nbSondages === 0
          ? "Aucun cours programmé cette semaine : rien n'a été publié. Vérifie l'emploi du temps."
          : `Sondage publié : ${r.nbSondages} spécialité(s)/niveau(x), ${r.nbCours} cours.`
      );
      await chargerSemaines(semainePub);
    } catch (e: any) {
      setErreur(e?.message || 'Publication impossible.');
    } finally {
      setAction(null);
    }
  }

  async function retirer() {
    if (!window.confirm(`Retirer le sondage de la semaine du ${libelleSemaine(semainePub)} ? Les réponses déjà reçues sont conservées.`)) return;
    setErreur(null);
    setInfo(null);
    setAction('fermer');
    try {
      await fermerSondage(semainePub, perimetreIds);
      setInfo('Sondage retiré.');
      await chargerSemaines();
    } catch (e: any) {
      setErreur(e?.message || 'Opération impossible.');
    } finally {
      setAction(null);
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      window.prompt('Copie ce lien :', lien);
    }
  }

  const reponsesFiltrees = useMemo(
    () => reponses.filter((r) => !filtre || `${r.specialite_id}|${r.niveau}` === filtre),
    [reponses, filtre]
  );
  const resume = useMemo(() => agreger(reponsesFiltrees), [reponsesFiltrees]);
  const parGroupe = useMemo(() => {
    const m = new Map<string, number>();
    reponses.forEach((r) => m.set(`${r.specialite_id}|${r.niveau}`, (m.get(`${r.specialite_id}|${r.niveau}`) ?? 0) + 1));
    return m;
  }, [reponses]);

  const carte = 'bg-white rounded-[20px] p-5 mb-4';
  const champ = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, outline: 'none', background: '#fff' } as const;
  const bouton = (fond: string, couleur = '#fff') => ({ display: 'inline-flex', alignItems: 'center', gap: 8, background: fond, color: couleur, borderRadius: 999, padding: '10px 20px', fontSize: 14, fontWeight: 700, border: 0, cursor: 'pointer' } as const);

  return (
    <div className="max-w-4xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Sondage étudiants</p>
      <p className="text-sm text-gray-400 mb-6">
        Un seul lien public et anonyme. Chaque semaine, tu publies le sondage : les cours et enseignants de chaque
        spécialité sont repris de l'emploi du temps (en anglais pour les HND).
      </p>

      <div className={carte}>
        <p className="font-extrabold text-gray-900 mb-3">1 · Lien public</p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {qr && <img src={qr} alt="QR code du sondage" style={{ width: 120, height: 120, borderRadius: 12, border: '1px solid #f1f1f1' }} />}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ ...champ, fontSize: 13, wordBreak: 'break-all', background: '#f7f7f7' }}>{lien}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={copier} style={bouton('#dc2626')}>
                {copie ? <Check size={15} /> : <Copy size={15} />} {copie ? 'Copié' : 'Copier le lien'}
              </button>
              {qr && (
                <a href={qr} download="qr-sondage.png" style={{ ...bouton('#111827'), textDecoration: 'none' }}>
                  Télécharger le QR
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">Affiche le QR en classe ou envoie le lien : il ouvre toujours le sondage de la dernière semaine publiée.</p>
          </div>
        </div>
      </div>

      <div className={carte}>
        <p className="font-extrabold text-gray-900 mb-3">2 · Publier la semaine</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={semainePub}
            onChange={(e) => e.target.value && setSemainePub(versLundi(e.target.value))}
            style={champ}
          />
          <span className="text-xs font-semibold text-gray-500">Semaine du {libelleSemaine(semainePub)}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={publier} disabled={action !== null} style={{ ...bouton('#dc2626'), opacity: action ? 0.6 : 1 }}>
            {action === 'publier' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publier / mettre à jour
          </button>
          <button onClick={retirer} disabled={action !== null} style={{ ...bouton('#fff', '#4b5563'), border: '1px solid #e5e7eb', opacity: action ? 0.6 : 1 }}>
            {action === 'fermer' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Retirer le sondage
          </button>
        </div>
        {info && <p className="text-xs font-semibold text-green-700 mt-3">{info}</p>}
        {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Republier après une modification de l'emploi du temps met le sondage à jour. Les réponses déjà reçues sont conservées.
        </p>
      </div>

      <div className={carte}>
        <p className="font-extrabold text-gray-900 mb-3">3 · Résultats</p>
        {semaines.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun sondage publié pour l'instant.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <select value={semaineRes} onChange={(e) => { setSemaineRes(e.target.value); setFiltre(''); }} style={champ}>
                {semaines.map((s) => <option key={s} value={s}>Semaine du {libelleSemaine(s)}</option>)}
              </select>
              <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={champ}>
                <option value="">Toutes les spécialités</option>
                {sondages.map((s) => (
                  <option key={s.id} value={`${s.specialite_id}|${s.niveau}`}>
                    {s.specialite_nom} ({s.niveau}) — {parGroupe.get(`${s.specialite_id}|${s.niveau}`) ?? 0} rép.
                  </option>
                ))}
              </select>
            </div>

            {chargement ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : resume.reponses === 0 ? (
              <p className="text-sm text-gray-400">Aucune réponse pour le moment.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                  <Kpi label="Réponses" valeur={String(resume.reponses)} />
                  <Kpi label="Note de la semaine" valeur={resume.noteMoyenne !== null ? `${resume.noteMoyenne}/5` : '—'} />
                  <Kpi label="Cours bien compris" valeur={resume.pctCompris !== null ? `${resume.pctCompris}%` : '—'} />
                  <Kpi label="Support fourni" valeur={resume.pctSupport !== null ? `${resume.pctSupport}%` : '—'} />
                  <Kpi label="Cours non tenus signalés" valeur={String(resume.coursNonTenus)} />
                </div>

                <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>ENSEIGNANTS</p>
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11 }}>
                        <th style={{ padding: '6px 8px' }}>Enseignant</th>
                        <th style={{ padding: '6px 8px' }}>Avis</th>
                        <th style={{ padding: '6px 8px' }}>Bien passé</th>
                        <th style={{ padding: '6px 8px' }}>Compris</th>
                        <th style={{ padding: '6px 8px' }}>Support</th>
                        <th style={{ padding: '6px 8px' }}>Retards</th>
                        <th style={{ padding: '6px 8px' }}>🏆 / ⚠️</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {resume.enseignants.map((e: StatEnseignant) => {
                        const sel = ouvert === e.nom;
                        return (
                          <Fragment key={e.nom}>
                            <tr style={{ borderTop: '1px solid #f1f1f1', cursor: 'pointer' }} onClick={() => setOuvert(sel ? null : e.nom)}>
                              <td style={{ padding: '10px 8px', fontWeight: 700 }}>{e.nom}</td>
                              <td style={{ padding: '10px 8px' }}>{e.avis}{e.nonTenus > 0 && <span style={{ color: '#dc2626', fontSize: 11 }}> (+{e.nonTenus} non tenu)</span>}</td>
                              <td style={{ padding: '10px 8px' }}><Jauge valeur={pourcent(e.bien, e.bien + e.mal)} bon /></td>
                              <td style={{ padding: '10px 8px' }}><Jauge valeur={pourcent(e.comprisOui, e.comprisOui + e.comprisMoyen + e.comprisNon)} bon /></td>
                              <td style={{ padding: '10px 8px' }}><Jauge valeur={pourcent(e.supportOui, e.supportOui + e.supportPartiel + e.supportNon)} bon /></td>
                              <td style={{ padding: '10px 8px' }}><Jauge valeur={pourcent(e.retards, e.avis)} bon={false} /></td>
                              <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{e.voteMeilleur} / {e.voteAmeliorer}</td>
                              <td style={{ padding: '10px 4px', color: '#9ca3af' }}>{sel ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</td>
                            </tr>
                            {sel && (
                              <tr style={{ background: '#fafafa' }}>
                                <td colSpan={8} style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 220px' }}>
                                      <p style={{ fontSize: 11, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>POINTS POSITIFS</p>
                                      {e.positifs.size === 0 ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span> : top(e.positifs, 5).map(([k, n]) => (
                                        <div key={k} style={{ fontSize: 12, marginBottom: 3 }}>👍 {libelleCode(k)} <b>×{n}</b></div>
                                      ))}
                                    </div>
                                    <div style={{ flex: '1 1 220px' }}>
                                      <p style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>COMPORTEMENTS SIGNALÉS</p>
                                      {e.negatifs.size === 0 ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span> : top(e.negatifs, 6).map(([k, n]) => (
                                        <div key={k} style={{ fontSize: 12, marginBottom: 3 }}>⚠️ {libelleCode(k)} <b>×{n}</b></div>
                                      ))}
                                    </div>
                                  </div>
                                  {e.commentaires.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                      <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>COMMENTAIRES</p>
                                      {e.commentaires.map((c, i) => (
                                        <div key={i} style={{ fontSize: 12, background: '#fff', borderRadius: 10, padding: '8px 10px', marginBottom: 6 }}>
                                          <span style={{ color: '#9ca3af' }}>{c.ue} · </span>{c.texte}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>COURS LES MOINS COMPRIS</p>
                <div style={{ marginBottom: 20 }}>
                  {resume.cours.slice(0, 8).map((c) => (
                    <div key={c.ue} style={{ borderTop: '1px solid #f1f1f1', padding: '9px 2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{c.ue}</span>
                        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>à revoir : <b>{c.aRevoir}</b></span>
                          <Jauge valeur={pourcent(c.pasCompris, c.avis)} bon={false} />
                        </span>
                      </div>
                      {c.precisions.slice(0, 3).map((p, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>↳ {p}</div>
                      ))}
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>CONDITIONS ET SUGGESTIONS</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {top(resume.conditions, 12).map(([k, n]) => (
                    <span key={k} style={{ fontSize: 12, fontWeight: 700, borderRadius: 99, padding: '5px 11px', background: ['salles_propres', 'bon_materiel', 'horaires_respectes', 'bonne_ambiance'].includes(k) ? '#f0fdf4' : '#fef2f2', color: ['salles_propres', 'bon_materiel', 'horaires_respectes', 'bonne_ambiance'].includes(k) ? '#15803d' : '#b91c1c' }}>
                      {libelleCode(k)} ×{n}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Informations claires — oui : <b>{resume.infos.oui}</b> · parfois : <b>{resume.infos.parfois}</b> · non : <b>{resume.infos.non}</b>
                </p>
                {resume.suggestions.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, background: '#f7f7f7', borderRadius: 10, padding: '8px 10px', marginBottom: 6 }}>
                    <span style={{ color: '#9ca3af' }}>{s.niveau} · </span>{s.texte}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}