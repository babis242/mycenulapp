// Page publique /qr/:token — ouverte depuis le lien WhatsApp envoyé à l'enseignant.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { genererImageQr, nomFichierQr } from '../api';

export default function QrPublicPage() {
  const { token = '' } = useParams();
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let courant: string | null = null;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('qr_public', { p_token: token });
        if (error) throw new Error(error.message);
        const l: any = Array.isArray(data) ? data[0] : data;
        if (!l) throw new Error("Ce lien n'est plus valide (QR remplacé ou inexistant). Contactez l'administration.");
        const b = await genererImageQr({ nom: l.nom, matricule: l.matricule, token });
        courant = URL.createObjectURL(b);
        setNom(l.nom);
        setBlob(b);
        setUrl(courant);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'QR indisponible.');
      }
    })();
    return () => {
      if (courant) URL.revokeObjectURL(courant);
    };
  }, [token]);

  function telecharger() {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomFichierQr(nom);
    a.click();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f7', padding: 16 }}>
      <div style={{ maxWidth: 420, margin: '0 auto', background: '#fff', borderRadius: 20, padding: 16, textAlign: 'center' }}>
        {erreur ? (
          <p style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{erreur}</p>
        ) : !url ? (
          <Loader2 className="animate-spin" style={{ margin: '30px auto' }} />
        ) : (
          <>
            <img src={url} alt={`QR de ${nom}`} style={{ width: '100%', borderRadius: 8 }} />
            <button
              type="button"
              onClick={telecharger}
              style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '9px 20px', fontSize: 14, fontWeight: 700, background: '#dc2626', color: '#fff', border: 0, cursor: 'pointer' }}
            >
              <Download size={15} /> Enregistrer l'image
            </button>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>Conservez cette image dans votre téléphone.</p>
          </>
        )}
      </div>
    </div>
  );
}