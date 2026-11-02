// QR personnels des enseignants — visualisation, téléchargement, envoi WhatsApp.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, MessageCircle, RefreshCw, Search, X, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  listerQrEnseignants,
  regenererQr,
  genererImageQr,
  nomFichierQr,
  numeroWhatsappFormate,
  type QrEnseignant,
} from '../api';

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const bouton = (rouge = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  border: '1.5px solid #dc2626', background: rouge ? '#dc2626' : '#fff', color: rouge ? '#fff' : '#dc2626',
});

export default function QrEnseignantsAdminPage() {
  const [liste, setListe] = useState<QrEnseignant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [apercu, setApercu] = useState<{ q: QrEnseignant; url: string } | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      setListe(await listerQrEnseignants());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }
  useEffect(() => {
    charger();
  }, []);

  const filtre = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return t ? liste.filter((q) => q.nom.toLowerCase().includes(t) || q.matricule.toLowerCase().includes(t)) : liste;
  }, [liste, recherche]);

  async function voir(q: QrEnseignant) {
    setOccupe(q.enseignantId);
    try {
      const blob = await genererImageQr(q);
      setApercu({ q, url: URL.createObjectURL(blob) });
    } finally {
      setOccupe(null);
    }
  }

  async function telechargerQr(q: QrEnseignant) {
    setOccupe(q.enseignantId);
    try {
      telecharger(await genererImageQr(q), nomFichierQr(q.nom));
    } finally {
      setOccupe(null);
    }
  }

  function texteMessage(q: QrEnseignant): string {
    return [
      `Bonjour Monsieur/Madame ${q.nom},`,
      '',
      'Veuillez trouver ci-joint votre QR personnel CENULAPP.',
      '',
      "⚠️ Ce QR est à utiliser UNIQUEMENT EN CAS D'INDISPONIBILITÉ des codes d'ouverture/fermeture et du scan du QR de l'école (réseau, application ou téléphone qui ne fonctionne pas). Dans les autres cas, continuez à ouvrir votre cours normalement depuis « Ma séance ».",
      '',
      'Procédure :',
      "1. Avant votre cours, présentez-vous à l'administration ou au secrétariat.",
      '2. Montrez ce QR (sur votre téléphone ou imprimé).',
      "3. L'administration le scanne : si le QR est valide, votre cours s'ouvre immédiatement à l'heure du scan. À la fin du cours, faites de même pour la fermeture.",
      "4. Si le QR n'est pas reconnu, l'administration est automatiquement alertée.",
      '',
      `Vous retrouvez aussi ce QR à tout moment dans l'application, menu « Mon QR » : ${window.location.origin}/mon-qr`,
      '',
      "Ce QR est strictement personnel : ne le partagez avec personne. En cas de perte ou de doute, informez-nous pour qu'il soit remplacé.",
      '',
      'Merci.',
    ].join('\n');
  }

  const [lienWeb, setLienWeb] = useState<string | null>(null);

  // Ouvre directement l'application WhatsApp (schéma whatsapp://, sans passer par
  // la page WhatsApp Web) sur le numéro de l'enseignant, message prêt. WhatsApp ne
  // permet pas de joindre une image par lien : la carte QR est téléchargée en même
  // temps (à joindre), et le message contient le lien « Mon QR ». Pour envoyer
  // l'image elle-même, utiliser « Partager l'image ».
  function ouvrirWhatsApp(q: QrEnseignant) {
    setInfo(null);
    setErreur(null);
    setLienWeb(null);
    if (!q.numeroWhatsapp) {
      setErreur(`Aucun numéro WhatsApp enregistré pour ${q.nom} : renseignez-le dans sa fiche enseignant.`);
      return;
    }
    const chiffres = numeroWhatsappFormate(q.numeroWhatsapp);
    const texte = encodeURIComponent(texteMessage(q));
    const imagePromise = genererImageQr(q); // lancée avant la navigation
    window.location.href = `whatsapp://send?phone=${chiffres}&text=${texte}`;
    setLienWeb(`https://web.whatsapp.com/send?phone=${chiffres}&text=${texte}`);
    setInfo(`WhatsApp s'ouvre sur le numéro de ${q.nom}. Joignez l'image du QR (téléchargée) à la conversation.`);
    imagePromise.then((blob) => telecharger(blob, nomFichierQr(q.nom))).catch(() => {});
  }

  // Menu de partage du téléphone : envoie l'image du QR + le message (le contact
  // se choisit dans WhatsApp).
  async function partagerImage(q: QrEnseignant) {
    setInfo(null);
    setErreur(null);
    setLienWeb(null);
    setOccupe(q.enseignantId);
    try {
      const blob = await genererImageQr(q);
      const fichier = new File([blob], nomFichierQr(q.nom), { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [fichier] })) {
        try {
          await nav.share({ files: [fichier], text: texteMessage(q), title: 'QR personnel' });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
      }
      telecharger(blob, nomFichierQr(q.nom));
      setInfo("Le partage d'image n'est pas disponible sur cet appareil : l'image a été téléchargée.");
    } finally {
      setOccupe(null);
    }
  }

  async function regenerer(q: QrEnseignant) {
    if (!window.confirm(`Régénérer le QR de ${q.nom} ?\n\nSon ancien QR cessera de fonctionner immédiatement ; il faudra lui envoyer le nouveau.`)) return;
    setOccupe(q.enseignantId);
    try {
      const token = await regenererQr(q.enseignantId);
      setListe((prev) => prev.map((x) => (x.enseignantId === q.enseignantId ? { ...x, token } : x)));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Régénération impossible.');
    } finally {
      setOccupe(null);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 className="text-xl font-extrabold text-gray-900">QR des enseignants</h1>
        <Link to="/scanner-enseignant" style={bouton(true)}>
          <ScanLine size={15} /> Scanner un enseignant
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Chaque enseignant a un QR unique et permanent, aussi visible dans son espace. Envoyez-le-lui par WhatsApp ; il ne l'utilise qu'en cas d'indisponibilité des codes et du scan du QR de l'école.
      </p>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#9ca3af' }} />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un enseignant…"
          style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 999, border: '1px solid #e5e7eb', fontSize: 14, background: '#fff' }}
        />
      </div>

      {erreur && <p style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{erreur}</p>}
      {info && (
        <p style={{ color: '#15803d', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {info}
          {lienWeb && (
            <> <a href={lienWeb} target="_blank" rel="noreferrer" style={{ color: '#dc2626', textDecoration: 'underline' }}>Si rien ne s'ouvre, utiliser WhatsApp Web</a></>
          )}
        </p>
      )}

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Loader2 className="animate-spin" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtre.map((q) => (
            <div key={q.enseignantId} style={{ background: '#fff', borderRadius: 20, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{q.nom}</p>
                <p style={{ fontSize: 12, color: '#9ca3af' }}>{q.matricule}{q.numeroWhatsapp ? ` · ${q.numeroWhatsapp}` : ' · pas de numéro WhatsApp'}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', opacity: occupe === q.enseignantId ? 0.5 : 1, pointerEvents: occupe === q.enseignantId ? 'none' : 'auto' }}>
                <button type="button" style={bouton()} onClick={() => voir(q)}>Voir</button>
                <button type="button" style={bouton()} onClick={() => telechargerQr(q)}><Download size={14} /> PNG</button>
                <button type="button" style={bouton(true)} onClick={() => ouvrirWhatsApp(q)}><MessageCircle size={14} /> WhatsApp</button>
                <button type="button" style={bouton()} onClick={() => partagerImage(q)}>Partager l'image</button>
                <button type="button" style={{ ...bouton(), borderColor: '#d1d5db', color: '#6b7280' }} title="Régénérer" onClick={() => regenerer(q)}><RefreshCw size={14} /></button>
              </div>
            </div>
          ))}
          {filtre.length === 0 && <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, padding: 20 }}>Aucun enseignant.</p>}
        </div>
      )}

      {apercu && (
        <div
          onClick={() => { URL.revokeObjectURL(apercu.url); setApercu(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 16, maxWidth: 360, width: '100%', position: 'relative' }}>
            <button type="button" onClick={() => { URL.revokeObjectURL(apercu.url); setApercu(null); }} style={{ position: 'absolute', right: 12, top: 12, background: 'none', border: 0, cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
            <img src={apercu.url} alt={`QR de ${apercu.q.nom}`} style={{ width: '100%', marginTop: 18, borderRadius: 8 }} />
          </div>
        </div>
      )}
    </div>
  );
}