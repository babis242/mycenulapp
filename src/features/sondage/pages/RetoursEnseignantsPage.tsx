// src/features/sondage/pages/RetoursEnseignantsPage.tsx
//
// Envoi, par WhatsApp, des retours des étudiants à chaque enseignant évalué :
// un message poli (points appréciés, puis pistes d'amélioration) généré à
// partir du sondage, relu et modifiable avant l'ouverture de WhatsApp.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, MessageCircle, RotateCcw, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
  cleNom,
  getContactsEnseignants,
  getSondagesDeLaSemaine,
  listReponses,
  listRetoursEnvoyes,
  listSemainesPubliees,
  marquerRetour,
  type LigneReponse,
  type SondageSemaine,
} from '../api';
import type { Langue } from '../codes';
import { agreger, type StatEnseignant } from '../resultats';
import { construireMessage, lienWhatsApp, libelleSemaineRetour, normaliserNumero, reperes } from '../retours';

type Onglet = 'a_envoyer' | 'envoyes';

function Puce({ texte, couleur, fond }: { texte: string; couleur: string; fond: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: couleur, background: fond, borderRadius: 99, padding: '4px 10px', whiteSpace: 'nowrap' }}>
      {texte}
    </span>
  );
}

export default function RetoursEnseignantsPage() {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;
  const dansPerimetre = (id: string) => !perimetreIds || perimetreIds.includes(id);

  const [semaines, setSemaines] = useState<string[]>([]);
  const [semaine, setSemaine] = useState('');
  const [filtre, setFiltre] = useState('');
  const [sondages, setSondages] = useState<SondageSemaine[]>([]);
  const [reponses, setReponses] = useState<LigneReponse[]>([]);
  const [contacts, setContacts] = useState<Map<string, string | null>>(new Map());
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());
  const [suivi, setSuivi] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [onglet, setOnglet] = useState<Onglet>('a_envoyer');
  const [recherche, setRecherche] = useState('');
  const [langues, setLangues] = useState<Record<string, Langue>>({});
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [citations, setCitations] = useState<Record<string, number[]>>({});
  const [numeros, setNumeros] = useState<Record<string, string>>({});
  const [copie, setCopie] = useState<string | null>(null);
  const [ouvertCommentaires, setOuvertCommentaires] = useState<string | null>(null);

  useEffect(() => {
    listSemainesPubliees()
      .then((l) => {
        setSemaines(l);
        setSemaine(l[0] ?? '');
        if (!l.length) setChargement(false);
      })
      .catch((e) => {
        setErreur(e?.message || 'Chargement impossible.');
        setChargement(false);
      });
  }, []);

  useEffect(() => {
    if (!semaine) return;
    setChargement(true);
    setErreur(null);
    setTextes({});
    setCitations({});
    setLangues({});
    Promise.all([getSondagesDeLaSemaine(semaine), listReponses(semaine), listRetoursEnvoyes(semaine)])
      .then(async ([s, r, env]) => {
        const sOk = s.filter((x) => dansPerimetre(x.specialite_id));
        const rOk = r.filter((x) => dansPerimetre(x.specialite_id));
        setSondages(sOk);
        setReponses(rOk);
        setEnvoyes(env.envoyes);
        setSuivi(env.suivi);
        const noms = agreger(rOk).enseignants.map((e) => e.nom);
        setContacts(await getContactsEnseignants(noms));
      })
      .catch((e) => setErreur(e?.message || 'Chargement impossible.'))
      .finally(() => setChargement(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaine]);

  const resume = useMemo(
    () => agreger(reponses.filter((r) => !filtre || `${r.specialite_id}|${r.niveau}` === filtre)),
    [reponses, filtre]
  );

  // Langue par défaut d'un enseignant : anglais s'il n'apparaît que dans des sondages HND.
  const langueParDefaut = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of sondages) for (const c of s.cours) {
      const k = cleNom(c.enseignant);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(s.langue);
    }
    return (nom: string): Langue => {
      const l = m.get(cleNom(nom));
      return l && l.size === 1 && l.has('en') ? 'en' : 'fr';
    };
  }, [sondages]);

  const liste = useMemo(
    () =>
      resume.enseignants
        .filter((e) => e.avis > 0)
        .filter((e) => !recherche.trim() || cleNom(e.nom).includes(cleNom(recherche)))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [resume, recherche]
  );
  const aEnvoyer = liste.filter((e) => !envoyes.has(cleNom(e.nom)));
  const dejaEnvoyes = liste.filter((e) => envoyes.has(cleNom(e.nom)));
  const affiches = onglet === 'a_envoyer' ? aEnvoyer : dejaEnvoyes;

  const langueDe = (e: StatEnseignant): Langue => langues[e.nom] ?? langueParDefaut(e.nom);
  const messageDe = (e: StatEnseignant): string => {
    if (textes[e.nom] !== undefined) return textes[e.nom];
    const choisis = (citations[e.nom] ?? []).map((i) => e.commentaires[i]?.texte).filter(Boolean) as string[];
    return construireMessage(e, {
      nom: e.nom,
      langue: langueDe(e),
      semaine,
      commentaires: choisis,
      coursGlobaux: resume.cours,
    });
  };

  async function envoyer(e: StatEnseignant, lien: string) {
    window.open(lien, '_blank', 'noopener');
    setEnvoyes((s) => new Set(s).add(cleNom(e.nom)));
    if (suivi) await marquerRetour(semaine, e.nom, true);
  }
  async function annulerEnvoi(e: StatEnseignant) {
    setEnvoyes((s) => {
      const n = new Set(s);
      n.delete(cleNom(e.nom));
      return n;
    });
    if (suivi) await marquerRetour(semaine, e.nom, false);
  }
  async function copier(e: StatEnseignant) {
    try {
      await navigator.clipboard.writeText(messageDe(e));
      setCopie(e.nom);
      setTimeout(() => setCopie((c) => (c === e.nom ? null : c)), 1800);
    } catch {
      window.prompt('Copie ce message :', messageDe(e));
    }
  }

  const carte = 'bg-white rounded-[20px] p-5 mb-4';
  const champ = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, outline: 'none', background: '#fff' } as const;
  const pilule = (actif: boolean) =>
    ({ border: 0, cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 800, background: actif ? '#dc2626' : '#fff', color: actif ? '#fff' : '#4b5563', boxShadow: actif ? 'none' : 'inset 0 0 0 1px #e5e7eb' }) as const;

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/sondage-etudiants" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#6b7280', textDecoration: 'none', marginBottom: 10 }}>
        <ArrowLeft size={15} /> Sondage étudiants
      </Link>
      <p className="font-extrabold text-2xl text-gray-900 mb-1">Retours aux enseignants</p>
      <p className="text-sm text-gray-400 mb-5">
        Pour chaque enseignant évalué, un message WhatsApp poli reprend ce que les étudiants ont apprécié, puis quelques
        pistes d'amélioration. Les avis restent anonymes : seule la synthèse est transmise. Relis et modifie le message
        avant de l'envoyer.
      </p>

      <div className={carte}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={semaine} onChange={(e) => { setSemaine(e.target.value); setFiltre(''); }} style={champ}>
            {semaines.map((s) => <option key={s} value={s}>Semaine du {libelleSemaineRetour(s, 'fr')}</option>)}
          </select>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={champ}>
            <option value="">Toutes les spécialités</option>
            {sondages.map((s) => (
              <option key={s.id} value={`${s.specialite_id}|${s.niveau}`}>{s.specialite_nom} ({s.niveau})</option>
            ))}
          </select>
          <div style={{ position: 'relative', flex: '1 1 180px' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: '#9ca3af' }} />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un enseignant…"
              style={{ ...champ, paddingLeft: 34, width: '100%' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setOnglet('a_envoyer')} style={pilule(onglet === 'a_envoyer')}>À envoyer ({aEnvoyer.length})</button>
          <button onClick={() => setOnglet('envoyes')} style={pilule(onglet === 'envoyes')}>Envoyés ({dejaEnvoyes.length})</button>
        </div>
        {!suivi && (
          <p className="text-xs font-semibold mt-3" style={{ color: '#b45309' }}>
            Le suivi des envois n'est pas activé (table « sondages_retours » absente) : la page fonctionne, mais elle ne
            se souviendra pas de ce qui a déjà été envoyé.
          </p>
        )}
        {erreur && <p className="text-xs font-semibold text-red-600 mt-3">{erreur}</p>}
      </div>

      {chargement ? (
        <div className={carte}><p className="text-sm text-gray-400" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="animate-spin" /> Chargement…</p></div>
      ) : semaines.length === 0 ? (
        <div className={carte}><p className="text-sm text-gray-400">Aucun sondage publié pour l'instant.</p></div>
      ) : affiches.length === 0 ? (
        <div className={carte}>
          <p className="text-sm text-gray-400">
            {onglet === 'a_envoyer'
              ? resume.reponses === 0
                ? 'Aucune réponse reçue pour cette semaine.'
                : 'Tous les retours ont été envoyés. 🎉'
              : "Aucun retour n'a encore été envoyé."}
          </p>
        </div>
      ) : (
        affiches.map((e) => {
          const r = reperes(e);
          const numeroBrut = contacts.get(cleNom(e.nom)) ?? null;
          const numero = normaliserNumero(numeroBrut) ? numeroBrut : numeros[e.nom] ?? '';
          const lien = lienWhatsApp(numero, messageDe(e));
          const L = langueDe(e);
          const envoye = envoyes.has(cleNom(e.nom));
          const choisies = citations[e.nom] ?? [];
          return (
            <div key={e.nom} className={carte}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <p className="font-extrabold text-gray-900" style={{ fontSize: 16 }}>{e.nom}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <Puce texte={`${e.avis} avis`} couleur="#374151" fond="#f3f4f6" />
                    {r.bienPct !== null && <Puce texte={`Bien passé ${r.bienPct} %`} couleur={r.bienPct >= 60 ? '#15803d' : '#b45309'} fond={r.bienPct >= 60 ? '#f0fdf4' : '#fffbeb'} />}
                    {r.comprisPct !== null && <Puce texte={`Compris ${r.comprisPct} %`} couleur={r.comprisPct >= 60 ? '#15803d' : '#b45309'} fond={r.comprisPct >= 60 ? '#f0fdf4' : '#fffbeb'} />}
                    {e.voteAmeliorer > 0 && <Puce texte={`${e.voteAmeliorer} vote(s) « à améliorer »`} couleur="#b91c1c" fond="#fef2f2" />}
                    {e.avis < 3 && <Puce texte="Peu d'avis : à interpréter avec prudence" couleur="#92400e" fond="#fef3c7" />}
                    {envoye && <Puce texte="Envoyé" couleur="#15803d" fond="#dcfce7" />}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['fr', 'en'] as Langue[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setLangues((s) => ({ ...s, [e.nom]: l }));
                        setTextes((s) => { const n = { ...s }; delete n[e.nom]; return n; });
                      }}
                      style={{ ...pilule(L === l), padding: '6px 12px', fontSize: 12 }}
                    >
                      {l === 'fr' ? 'Français' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              {e.commentaires.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => setOuvertCommentaires(ouvertCommentaires === e.nom ? null : e.nom)}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#6b7280', padding: 0 }}
                  >
                    {ouvertCommentaires === e.nom ? '▾' : '▸'} Citer des commentaires d'étudiants ({choisies.length}/{e.commentaires.length})
                  </button>
                  {ouvertCommentaires === e.nom && (
                    <div style={{ marginTop: 8 }}>
                      {e.commentaires.map((c, i) => (
                        <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, background: '#f7f7f7', borderRadius: 10, padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={choisies.includes(i)}
                            onChange={() => {
                              setCitations((s) => {
                                const cur = s[e.nom] ?? [];
                                return { ...s, [e.nom]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
                              });
                              setTextes((s) => { const n = { ...s }; delete n[e.nom]; return n; });
                            }}
                            style={{ marginTop: 2 }}
                          />
                          <span><span style={{ color: '#9ca3af' }}>{c.ue} · </span>{c.texte}</span>
                        </label>
                      ))}
                      <p className="text-xs text-gray-400">Vérifie que le commentaire est constructif avant de le citer.</p>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={messageDe(e)}
                onChange={(ev) => setTextes((s) => ({ ...s, [e.nom]: ev.target.value }))}
                rows={14}
                style={{ ...champ, width: '100%', marginTop: 12, fontSize: 13, fontWeight: 500, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
              />
              {textes[e.nom] !== undefined && (
                <button
                  onClick={() => setTextes((s) => { const n = { ...s }; delete n[e.nom]; return n; })}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <RotateCcw size={13} /> Revenir au message généré
                </button>
              )}

              {!normaliserNumero(numeroBrut) && (
                <div style={{ marginTop: 10 }}>
                  <p className="text-xs font-semibold" style={{ color: '#b45309', marginBottom: 6 }}>
                    {numeroBrut ? 'Le numéro enregistré est invalide.' : 'Aucun numéro WhatsApp enregistré.'} Saisis-le ici pour envoyer le message (il n'est pas enregistré).
                  </p>
                  <input
                    value={numeros[e.nom] ?? ''}
                    onChange={(ev) => setNumeros((s) => ({ ...s, [e.nom]: ev.target.value }))}
                    placeholder="Ex. 6 90 00 00 00"
                    inputMode="tel"
                    style={{ ...champ, width: 220 }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => lien && envoyer(e, lien)}
                  disabled={!lien}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '10px 20px', fontSize: 14, fontWeight: 700, border: 0, cursor: lien ? 'pointer' : 'not-allowed', opacity: lien ? 1 : 0.45 }}
                >
                  <MessageCircle size={15} /> {envoye ? 'Renvoyer sur WhatsApp' : 'Envoyer sur WhatsApp'}
                </button>
                <button
                  onClick={() => copier(e)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#4b5563', borderRadius: 999, padding: '10px 18px', fontSize: 14, fontWeight: 700, border: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  {copie === e.nom ? <Check size={15} /> : <Copy size={15} />} {copie === e.nom ? 'Copié' : 'Copier'}
                </button>
                {envoye && (
                  <button
                    onClick={() => annulerEnvoi(e)}
                    style={{ background: 'transparent', color: '#6b7280', border: 0, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Marquer comme non envoyé
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}