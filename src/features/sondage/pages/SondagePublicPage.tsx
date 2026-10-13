// src/features/sondage/pages/SondagePublicPage.tsx
//
// Page PUBLIQUE (sans connexion) du sondage hebdomadaire. Un seul lien pour
// toute l'école : l'étudiant choisit sa spécialité, et les cours et
// enseignants programmés cette semaine sont chargés automatiquement.
// Les spécialités anglophones (HND) passent le formulaire en anglais.
import { useEffect, useMemo, useState } from 'react';
import {
  CONDITIONS_NEG,
  CONDITIONS_POS,
  NEGATIFS,
  POSITIFS,
  RAISONS_AMELIORER,
  TEXTES,
  type Langue,
} from '../codes';
import {
  envoyerReponse,
  getSondagesOuverts,
  type ContenuReponse,
  type ReponseCours,
  type SondageSemaine,
} from '../api';

const CSS = `
.sd{min-height:100vh;background:#f7f7f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827}
.sd *{box-sizing:border-box}
.sd .wrap{max-width:460px;margin:0 auto;padding:18px 16px 40px}
.sd .top{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.sd .top img{width:44px;height:44px;object-fit:contain}
.sd .top .tt{flex:1;min-width:0}.sd .top b{display:block;font-size:15px}.sd .top span{font-size:12px;color:#9ca3af}
.sd .lang{display:flex;border:1px solid #e5e7eb;border-radius:99px;overflow:hidden;background:#fff}
.sd .lang button{border:0;background:transparent;padding:6px 10px;font-size:12px;font-weight:800;color:#9ca3af;cursor:pointer}
.sd .lang button.on{background:#dc2626;color:#fff}
.sd .bar{height:6px;background:#e5e7eb;border-radius:9px;overflow:hidden;margin:6px 0 16px}
.sd .bar i{display:block;height:100%;background:#dc2626;border-radius:9px;transition:width .3s}
.sd .card{background:#fff;border-radius:20px;padding:18px;margin-bottom:14px;border:2px solid transparent}
.sd .card.err{border-color:#fca5a5}
.sd h1{font-size:22px;margin:0 0 4px;font-weight:800}.sd h2{font-size:16px;margin:0 0 2px;font-weight:800;line-height:1.3}
.sd p.s{font-size:13px;color:#9ca3af;margin:0 0 14px}
.sd label{display:block;font-size:12px;font-weight:700;color:#6b7280;margin:12px 0 6px}
.sd select,.sd textarea{display:block;width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:11px 13px;font-size:14px;font-weight:600;font-family:inherit;outline:none;background:#fff;color:#111827;height:auto;line-height:1.3}
.sd textarea{resize:none;height:72px;font-weight:500}
.sd select:focus,.sd textarea:focus{border-color:#dc2626}
.sd .note{font-size:12px;color:#6b7280;background:#f3f4f6;border-radius:12px;padding:10px 12px;margin-top:12px;line-height:1.45}
.sd .row{display:flex;gap:8px}.sd .row.w{flex-wrap:wrap}
.sd .opt{flex:1 1 30%;border:1.5px solid #e5e7eb;border-radius:14px;background:#fff;padding:10px 6px;text-align:center;cursor:pointer;font-size:12px;font-weight:700;color:#4b5563;font-family:inherit}
.sd .opt.big{flex:1 1 0;padding:10px 4px}
.sd .opt .e{display:block;font-size:24px;margin-bottom:2px}
.sd .opt.on.r{border-color:#dc2626;background:#fef2f2;color:#b91c1c}
.sd .opt.on.o{border-color:#f59e0b;background:#fffbeb;color:#b45309}
.sd .opt.on.g{border-color:#16a34a;background:#f0fdf4;color:#15803d}
.sd .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.sd .chip{border:1px solid #e5e7eb;border-radius:99px;padding:6px 11px;font-size:12px;font-weight:600;background:#fff;color:#4b5563;cursor:pointer;font-family:inherit}
.sd .chip.on.g{background:#f0fdf4;border-color:#16a34a;color:#15803d}
.sd .chip.on.r{background:#fef2f2;border-color:#dc2626;color:#b91c1c}
.sd .cours{margin-bottom:12px}.sd .cours small{display:block;font-size:12px;color:#9ca3af;margin-top:2px}
.sd .hor{font-size:11px;font-weight:700;color:#6b7280;margin-top:6px}
.sd .sep{border-top:1px solid #f1f1f1;margin:14px 0}
.sd .q{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px}
.sd .sub{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 0}
.sd .btn{display:block;width:100%;border:0;border-radius:99px;background:#dc2626;color:#fff;font-weight:800;font-size:15px;padding:15px;cursor:pointer;margin-top:4px;font-family:inherit}
.sd .btn:disabled{opacity:.6}
.sd .btn.g{background:#fff;color:#4b5563;border:1px solid #e5e7eb;margin-top:8px}
.sd .stars{display:flex;gap:6px;justify-content:center}
.sd .stars span{font-size:34px;color:#e5e7eb;cursor:pointer;line-height:1}.sd .stars span.on{color:#f59e0b}
.sd .ok{text-align:center;padding:30px 10px}
.sd .ok .c{width:64px;height:64px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:34px;line-height:64px;margin:0 auto 14px}
.sd .errmsg{font-size:12px;font-weight:700;color:#dc2626;margin:0 4px 10px}
.sd .hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
`;

function lundiVersTexte(iso: string, langue: Langue): string {
  const [y, m, d] = iso.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 5);
  const loc = langue === 'en' ? 'en-GB' : 'fr-FR';
  return `${a.toLocaleDateString(loc, { day: 'numeric', month: 'long' })} – ${b.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

function bascule(liste: string[] | undefined, code: string): string[] {
  const l = liste ?? [];
  return l.includes(code) ? l.filter((c) => c !== code) : [...l, code];
}

type Brouillon = Partial<ReponseCours>;

export default function SondagePublicPage() {
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<{ semaine: string; sondages: SondageSemaine[] } | null>(null);
  const [erreurChargement, setErreurChargement] = useState(false);

  const [langue, setLangue] = useState<Langue>('fr');
  const [choixId, setChoixId] = useState('');
  const [etape, setEtape] = useState(1);
  const [cours, setCours] = useState<Record<number, Brouillon>>({});
  const [invalides, setInvalides] = useState<Set<number>>(new Set());
  const [meilleur, setMeilleur] = useState({ enseignant: '', raisons: [] as string[] });
  const [ameliorer, setAmeliorer] = useState({ enseignant: '', raisons: [] as string[], commentaire: '' });
  const [revoir, setRevoir] = useState({ cours: [] as string[], precision: '' });
  const [ecole, setEcole] = useState({ conditions: [] as string[], infos: '' as '' | 'non' | 'parfois' | 'oui', suggestion: '' });
  const [note, setNote] = useState(0);
  const [piege, setPiege] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [termine, setTermine] = useState(false);
  const [dejaRepondu, setDejaRepondu] = useState(false);

  const t = TEXTES[langue];
  const sondage = useMemo(() => ouvert?.sondages.find((s) => s.id === choixId) ?? null, [ouvert, choixId]);
  const enseignants = useMemo(
    () => Array.from(new Set((sondage?.cours ?? []).map((c) => c.enseignant))).sort((a, b) => a.localeCompare(b, 'fr')),
    [sondage]
  );

  useEffect(() => {
    getSondagesOuverts()
      .then((r) => {
        setOuvert(r);
        try {
          if (r && localStorage.getItem(`sondage-envoye-${r.semaine}`)) setDejaRepondu(true);
        } catch {
          /* stockage indisponible : on ignore */
        }
      })
      .catch(() => setErreurChargement(true))
      .finally(() => setChargement(false));
  }, []);

  function choisir(id: string) {
    setChoixId(id);
    setMessage(null);
    const s = ouvert?.sondages.find((x) => x.id === id);
    if (s) setLangue(s.langue); // HND → anglais
    setCours({});
    setInvalides(new Set());
    setMeilleur({ enseignant: '', raisons: [] });
    setAmeliorer({ enseignant: '', raisons: [], commentaire: '' });
    setRevoir({ cours: [], precision: '' });
  }

  function maj(i: number, patch: Brouillon) {
    setCours((c) => ({ ...c, [i]: { ...c[i], ...patch } }));
  }

  function allerEtape2() {
    if (!sondage) {
      setMessage(t.erreurSpecialite);
      return;
    }
    setMessage(null);
    setEtape(2);
    window.scrollTo(0, 0);
  }

  function allerEtape3() {
    const mauvais = new Set<number>();
    (sondage?.cours ?? []).forEach((_, i) => {
      const r = cours[i] ?? {};
      if (!r.tenu || (r.tenu !== 'non' && (!r.compris || !r.qualite))) mauvais.add(i);
    });
    setInvalides(mauvais);
    if (mauvais.size > 0) {
      setMessage(t.erreurChoix);
      const premier = Math.min(...mauvais);
      document.getElementById(`sd-c${premier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setMessage(null);
    setEtape(3);
    window.scrollTo(0, 0);
  }

  async function envoyer() {
    if (!sondage || !ouvert) return;
    if (piege) {
      setTermine(true); // robot : on fait semblant
      return;
    }
    setEnvoi(true);
    setMessage(null);
    try {
      const contenu: ContenuReponse = {
        cours: sondage.cours.map((c, i) => {
          const r = cours[i] ?? {};
          const complet = r.tenu !== 'non';
          return {
            ue: c.ue,
            enseignant: c.enseignant,
            tenu: r.tenu ?? 'oui',
            compris: complet ? r.compris : undefined,
            ponctualite: complet ? r.ponctualite : undefined,
            support: complet ? r.support : undefined,
            qualite: complet ? r.qualite : undefined,
            positifs: complet ? r.positifs ?? [] : [],
            negatifs: complet ? r.negatifs ?? [] : [],
            commentaire: r.commentaire?.trim() || undefined,
          };
        }),
        meilleur: meilleur.enseignant ? meilleur : undefined,
        ameliorer: ameliorer.enseignant
          ? { ...ameliorer, commentaire: ameliorer.commentaire.trim() || undefined }
          : undefined,
        revoir: revoir.cours.length || revoir.precision.trim() ? { ...revoir, precision: revoir.precision.trim() || undefined } : undefined,
        ecole: {
          conditions: ecole.conditions,
          infos: ecole.infos || undefined,
          suggestion: ecole.suggestion.trim() || undefined,
        },
      };
      await envoyerReponse(sondage, langue, note || null, contenu);
      try {
        localStorage.setItem(`sondage-envoye-${ouvert.semaine}`, '1');
      } catch {
        /* ignore */
      }
      setTermine(true);
      window.scrollTo(0, 0);
    } catch {
      setMessage(t.erreurEnvoi);
    } finally {
      setEnvoi(false);
    }
  }

  const Chips = ({ liste, choisis, onToggle, kind }: { liste: { code: string; fr: string; en: string }[]; choisis: string[]; onToggle: (c: string) => void; kind: 'g' | 'r' }) => (
    <div className="chips">
      {liste.map((c) => (
        <button type="button" key={c.code} className={`chip ${kind}${choisis.includes(c.code) ? ' on' : ''}`} onClick={() => onToggle(c.code)}>
          {c[langue]}
        </button>
      ))}
    </div>
  );

  const Opts = ({ valeur, onChange, items }: { valeur: string | undefined; onChange: (v: string) => void; items: [string, string, string][] }) => (
    <div className="row w">
      {items.map(([v, label, c]) => (
        <button type="button" key={v} className={`opt ${c}${valeur === v ? ' on' : ''}`} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );

  const progression = termine || dejaRepondu ? 100 : etape * 25;
  const nbCours = sondage?.cours.length ?? 0;

  return (
    <div className="sd">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="top">
          <img src="/logo-cenulape.png" alt="" />
          <div className="tt">
            <b>CENULAPE · {t.titre}</b>
            {ouvert && <span>{t.semaine} {lundiVersTexte(ouvert.semaine, langue)}</span>}
          </div>
          <div className="lang">
            <button type="button" className={langue === 'fr' ? 'on' : ''} onClick={() => setLangue('fr')}>FR</button>
            <button type="button" className={langue === 'en' ? 'on' : ''} onClick={() => setLangue('en')}>EN</button>
          </div>
        </div>

        {chargement && <p className="s">{t.chargement}</p>}
        {!chargement && (erreurChargement || !ouvert) && (
          <div className="card"><p className="s" style={{ margin: 0 }}>{t.aucunSondage}</p></div>
        )}

        {!chargement && ouvert && (termine || dejaRepondu) && (
          <div className="card ok">
            <div className="c">✓</div>
            <h1>{t.merci}</h1>
            <p className="s">{dejaRepondu && !termine ? t.dejaRepondu : t.merciTexte}</p>
          </div>
        )}

        {!chargement && ouvert && !termine && !dejaRepondu && (
          <>
            <div className="bar"><i style={{ width: `${progression}%` }} /></div>

            {etape === 1 && (
              <>
                <div className="card">
                  <h1>{t.bienvenue}</h1>
                  <p className="s">{t.intro}</p>
                  <label>{t.laSpecialite}</label>
                  <select value={choixId} onChange={(e) => choisir(e.target.value)}>
                    <option value="">{t.choisirSpecialite}</option>
                    {ouvert.sondages.map((s) => (
                      <option key={s.id} value={s.id}>{s.specialite_nom} — {s.niveau}</option>
                    ))}
                  </select>
                  <div className="note">🔒 {t.anonyme}</div>
                </div>
                {message && <p className="errmsg">{message}</p>}
                <button type="button" className="btn" onClick={allerEtape2}>{t.commencer}</button>
              </>
            )}

            {etape === 2 && sondage && (
              <>
                <p className="s" style={{ margin: '0 2px 10px' }}>{t.partie1} ({nbCours})</p>
                {nbCours === 0 && <div className="card"><p className="s" style={{ margin: 0 }}>{t.aucunCours}</p></div>}
                {sondage.cours.map((c, i) => {
                  const r = cours[i] ?? {};
                  const complet = r.tenu && r.tenu !== 'non';
                  return (
                    <div key={`${c.ue}|${c.enseignant}`} id={`sd-c${i}`} className={`card${invalides.has(i) ? ' err' : ''}`}>
                      <div className="cours">
                        <h2>{c.ue}</h2>
                        <small>{c.enseignant}</small>
                        <div className="hor">{c.horaires.join(' · ')}</div>
                      </div>
                      <div className="q">{t.coursAEuLieu}</div>
                      <Opts valeur={r.tenu} onChange={(v) => maj(i, { tenu: v as ReponseCours['tenu'] })} items={[['oui', t.oui, 'g'], ['partiel', t.enPartie, 'o'], ['non', t.non, 'r']]} />
                      {complet && (
                        <>
                          <div className="sep" />
                          <div className="q">{t.compris}</div>
                          <div className="row">
                            {([['non', '😕', t.pasCompris, 'r'], ['moyen', '😐', t.moyen, 'o'], ['oui', '😊', t.biencompris, 'g']] as const).map(([v, e, l, col]) => (
                              <button type="button" key={v} className={`opt big ${col}${r.compris === v ? ' on' : ''}`} onClick={() => maj(i, { compris: v })}>
                                <span className="e">{e}</span>{l}
                              </button>
                            ))}
                          </div>
                          <div className="sep" />
                          <div className="q">{t.ponctualite}</div>
                          <Opts valeur={r.ponctualite} onChange={(v) => maj(i, { ponctualite: v as ReponseCours['ponctualite'] })} items={[['ok', t.alHeure, 'g'], ['retard', t.retard, 'o'], ['gros', t.grosRetard, 'r']]} />
                          <div className="q" style={{ marginTop: 14 }}>{t.support}</div>
                          <Opts valeur={r.support} onChange={(v) => maj(i, { support: v as ReponseCours['support'] })} items={[['oui', t.supportOui, 'g'], ['partiel', t.enPartie, 'o'], ['non', t.non, 'r']]} />
                          <div className="sep" />
                          <div className="q">{t.commentDonne}</div>
                          <div className="row">
                            {([['mal', '👎', t.malPasse, 'r'], ['bien', '👍', t.bienPasse, 'g']] as const).map(([v, e, l, col]) => (
                              <button type="button" key={v} className={`opt big ${col}${r.qualite === v ? ' on' : ''}`} onClick={() => maj(i, { qualite: v })}>
                                <span className="e">{e}</span>{l}
                              </button>
                            ))}
                          </div>
                          <p className="sub">{t.ceQuiEtaitBien}</p>
                          <Chips liste={POSITIFS} kind="g" choisis={r.positifs ?? []} onToggle={(code) => maj(i, { positifs: bascule(r.positifs, code) })} />
                          <p className="sub">{t.comportements}</p>
                          <Chips liste={NEGATIFS} kind="r" choisis={r.negatifs ?? []} onToggle={(code) => maj(i, { negatifs: bascule(r.negatifs, code) })} />
                        </>
                      )}
                      {r.tenu && (
                        <textarea style={{ marginTop: 14 }} placeholder={t.commentaireCours} value={r.commentaire ?? ''} onChange={(e) => maj(i, { commentaire: e.target.value.slice(0, 600) })} />
                      )}
                    </div>
                  );
                })}
                {message && <p className="errmsg">{message}</p>}
                <button type="button" className="btn" onClick={allerEtape3}>{t.continuer}</button>
                <button type="button" className="btn g" onClick={() => { setEtape(1); setMessage(null); }}>{t.retour}</button>
              </>
            )}

            {etape === 3 && sondage && (
              <>
                <p className="s" style={{ margin: '0 2px 10px' }}>{t.partie2}</p>
                <div className="card">
                  <h2>{t.meilleurTitre}</h2>
                  <p className="s">{t.meilleurAide}</p>
                  <select value={meilleur.enseignant} onChange={(e) => setMeilleur({ ...meilleur, enseignant: e.target.value })}>
                    <option value="">{t.choisirEns}</option>
                    {enseignants.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {meilleur.enseignant && (
                    <>
                      <label>{t.pourquoi}</label>
                      <Chips liste={POSITIFS} kind="g" choisis={meilleur.raisons} onToggle={(c) => setMeilleur({ ...meilleur, raisons: bascule(meilleur.raisons, c) })} />
                    </>
                  )}
                </div>
                <div className="card">
                  <h2>{t.ameliorerTitre}</h2>
                  <p className="s">{t.ameliorerAide}</p>
                  <select value={ameliorer.enseignant} onChange={(e) => setAmeliorer({ ...ameliorer, enseignant: e.target.value })}>
                    <option value="">{t.choisirEns}</option>
                    {enseignants.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {ameliorer.enseignant && (
                    <>
                      <label>{t.pourquoi2}</label>
                      <Chips liste={RAISONS_AMELIORER} kind="r" choisis={ameliorer.raisons} onToggle={(c) => setAmeliorer({ ...ameliorer, raisons: bascule(ameliorer.raisons, c) })} />
                      <textarea style={{ marginTop: 12 }} placeholder={t.unePhrase} value={ameliorer.commentaire} onChange={(e) => setAmeliorer({ ...ameliorer, commentaire: e.target.value.slice(0, 600) })} />
                    </>
                  )}
                </div>
                <div className="card">
                  <h2>{t.revoirTitre}</h2>
                  <p className="s">{t.revoirAide}</p>
                  <div className="chips" style={{ marginTop: 0 }}>
                    {Array.from(new Set(sondage.cours.map((c) => c.ue))).map((ue) => (
                      <button type="button" key={ue} className={`chip r${revoir.cours.includes(ue) ? ' on' : ''}`} onClick={() => setRevoir({ ...revoir, cours: bascule(revoir.cours, ue) })}>
                        {ue}
                      </button>
                    ))}
                  </div>
                  <textarea style={{ marginTop: 12 }} placeholder={t.revoirPrecision} value={revoir.precision} onChange={(e) => setRevoir({ ...revoir, precision: e.target.value.slice(0, 600) })} />
                </div>
                <button type="button" className="btn" onClick={() => { setEtape(4); window.scrollTo(0, 0); }}>{t.continuer}</button>
                <button type="button" className="btn g" onClick={() => setEtape(2)}>{t.retour}</button>
              </>
            )}

            {etape === 4 && (
              <>
                <p className="s" style={{ margin: '0 2px 10px' }}>{t.partie3}</p>
                <div className="card">
                  <h2>{t.conditions}</h2>
                  <p className="s">{t.touche}</p>
                  <Chips liste={CONDITIONS_POS} kind="g" choisis={ecole.conditions} onToggle={(c) => setEcole({ ...ecole, conditions: bascule(ecole.conditions, c) })} />
                  <Chips liste={CONDITIONS_NEG} kind="r" choisis={ecole.conditions} onToggle={(c) => setEcole({ ...ecole, conditions: bascule(ecole.conditions, c) })} />
                  <div className="sep" />
                  <h2>{t.admin}</h2>
                  <div className="q" style={{ marginTop: 10 }}>{t.infosClaires}</div>
                  <Opts valeur={ecole.infos} onChange={(v) => setEcole({ ...ecole, infos: v as typeof ecole.infos })} items={[['non', t.non, 'r'], ['parfois', t.parfois, 'o'], ['oui', t.oui, 'g']]} />
                  <div className="sep" />
                  <h2>{t.suggestion}</h2>
                  <p className="s">{t.facultatif}</p>
                  <textarea placeholder={t.suggestionPh} value={ecole.suggestion} onChange={(e) => setEcole({ ...ecole, suggestion: e.target.value.slice(0, 800) })} />
                  <div className="sep" />
                  <h2 style={{ textAlign: 'center' }}>{t.semaineGenerale}</h2>
                  <p className="s" style={{ textAlign: 'center' }}>{t.echelle}</p>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={n <= note ? 'on' : ''} onClick={() => setNote(n)}>★</span>
                    ))}
                  </div>
                </div>
                <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={piege} onChange={(e) => setPiege(e.target.value)} name="website" />
                {message && <p className="errmsg">{message}</p>}
                <button type="button" className="btn" disabled={envoi} onClick={envoyer}>{envoi ? t.envoi : t.envoyer}</button>
                <button type="button" className="btn g" onClick={() => setEtape(3)}>{t.retour}</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}