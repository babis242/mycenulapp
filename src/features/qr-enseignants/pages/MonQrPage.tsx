// QR personnel de l'enseignant connecté.
import { useEffect, useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { monQr, genererImageQr, nomFichierQr, type QrEnseignant } from '../api';

export default function MonQrPage() {
  const [qr, setQr] = useState<QrEnseignant | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let courant: string | null = null;
    (async () => {
      try {
        const q = await monQr();
        const b = await genererImageQr(q);
        courant = URL.createObjectURL(b);
        setQr(q);
        setBlob(b);
        setUrl(courant);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'QR indisponible (connexion requise).');
      }
    })();
    return () => {
      if (courant) URL.revokeObjectURL(courant);
    };
  }, []);

  function telecharger() {
    if (!blob || !qr) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomFichierQr(qr.nom);
    a.click();
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1 className="text-xl font-extrabold text-gray-900 mb-1">Mon QR</h1>
      <p className="text-sm text-gray-500 mb-4">
        À utiliser uniquement si les codes d'ouverture/fermeture et le scan du QR de l'école sont indisponibles : présentez ce QR à l'administration ou au secrétariat, qui le scanne pour ouvrir (puis fermer) votre cours. Il est strictement personnel, ne le partagez pas.
      </p>
      <div style={{ background: '#fff', borderRadius: 20, padding: 16, textAlign: 'center' }}>
        {erreur ? (
          <p style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{erreur}</p>
        ) : !url ? (
          <Loader2 className="animate-spin" style={{ margin: '30px auto' }} />
        ) : (
          <>
            <img src={url} alt="Mon QR" style={{ width: '100%', borderRadius: 8 }} />
            <button
              type="button"
              onClick={telecharger}
              style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 18px', fontSize: 14, fontWeight: 700, background: '#dc2626', color: '#fff', border: 0, cursor: 'pointer' }}
            >
              <Download size={15} /> Enregistrer l'image
            </button>
          </>
        )}
      </div>
    </div>
  );
}