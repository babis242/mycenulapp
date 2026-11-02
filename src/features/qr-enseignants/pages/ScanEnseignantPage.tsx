// src/features/qr-ouverture → écran de scan des QR personnels des enseignants
// (administrateur, responsable, secrétaire).
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ScanLine } from 'lucide-react';
import { traiterScan, type ResultatScan } from '../api';
import { formatHeureCameroun as formatHeure } from '@/lib/formatHeureCameroun';

const FOND = { ok: '#16a34a', info: '#d97706', ko: '#dc2626' } as const;

function presentation(r: ResultatScan): { ton: keyof typeof FOND; titre: string; detail?: string } {
  const cours = (s: { ueNom: string; specialiteNom: string | null; creneau: string }) =>
    `${s.ueNom}${s.specialiteNom ? ` · ${s.specialiteNom}` : ''} · ${s.creneau}`;
  switch (r.type) {
    case 'ouvert':
      return { ton: 'ok', titre: `${r.enseignantNom} — cours ouvert à ${formatHeure(r.heure)}`, detail: cours(r.seance) };
    case 'ferme':
      return { ton: 'ok', titre: `${r.enseignantNom} — cours fermé à ${formatHeure(r.heure)}`, detail: cours(r.seance) };
    case 'deja_ouvert':
      return { ton: 'info', titre: `${r.enseignantNom} — déjà ouvert à ${formatHeure(r.seance.heureOuverture!)}`, detail: cours(r.seance) };
    case 'deja_ferme':
      return { ton: 'info', titre: `${r.enseignantNom} — déjà fermé à ${formatHeure(r.seance.heureFermeture!)}`, detail: cours(r.seance) };
    case 'pas_ouverte':
      return { ton: 'info', titre: `${r.enseignantNom} — ce cours n'a pas été ouvert`, detail: cours(r.seance) };
    case 'aucun_cours':
      return { ton: 'info', titre: `${r.enseignantNom} — aucun cours programmé en ce moment` };
    case 'qr_invalide':
      return { ton: 'ko', titre: 'QR non reconnu', detail: 'Les administrateurs ont été notifiés.' };
    case 'pas_un_qr_enseignant':
      return { ton: 'ko', titre: "Ce QR n'est pas un QR d'enseignant" };
    case 'erreur':
      return { ton: 'ko', titre: 'Erreur', detail: r.message };
  }
}

export default function ScanEnseignantPage() {
  const [mode, setMode] = useState<'ouvrir' | 'fermer'>('ouvrir');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [resultat, setResultat] = useState<ResultatScan | null>(null);
  const [traitement, setTraitement] = useState(false);
  const [erreurCamera, setErreurCamera] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const occupeRef = useRef(false);
  const dernierRef = useRef<{ texte: string; t: number } | null>(null);

  useEffect(() => {
    let annule = false;
    let raf = 0;
    let flot: MediaStream | null = null;

    async function traiter(texte: string) {
      occupeRef.current = true;
      setTraitement(true);
      const r = await traiterScan(texte, modeRef.current);
      if (annule) return;
      try {
        navigator.vibrate?.(r.type === 'ouvert' || r.type === 'ferme' ? 120 : [80, 60, 80]);
      } catch {
        /* sans importance */
      }
      setResultat(r);
      setTraitement(false);
      // Pause avant de reprendre le scan (évite de re-scanner le même QR).
      setTimeout(() => {
        occupeRef.current = false;
      }, 2500);
    }

    function boucle() {
      if (annule) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !occupeRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const lu = jsQR(img.data, img.width, img.height);
          if (lu?.data) {
            const d = dernierRef.current;
            if (!d || d.texte !== lu.data || Date.now() - d.t > 6000) {
              dernierRef.current = { texte: lu.data, t: Date.now() };
              traiter(lu.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(boucle);
    }

    (async () => {
      try {
        flot = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 }, frameRate: { ideal: 15 } },
        });
        if (annule) {
          flot.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = flot;
          await videoRef.current.play();
          setPret(true);
        }
        boucle();
      } catch {
        setErreurCamera("Impossible d'accéder à la caméra — autorisez-la dans le navigateur.");
      }
    })();

    return () => {
      annule = true;
      cancelAnimationFrame(raf);
      flot?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const p = resultat ? presentation(resultat) : null;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 className="text-xl font-extrabold text-gray-900 mb-1">Scanner un enseignant</h1>
      <p className="text-sm text-gray-500 mb-4">
        L'enseignant présente son QR personnel : si le code est valide, son cours en cours s'ouvre (ou se ferme) tout de suite.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['ouvrir', 'fermer'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              border: '1.5px solid #dc2626',
              background: mode === m ? '#dc2626' : '#fff',
              color: mode === m ? '#fff' : '#dc2626',
            }}
          >
            {m === 'ouvrir' ? 'Ouverture du cours' : 'Fermeture du cours'}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 20, padding: 14 }}>
        {erreurCamera ? (
          <div style={{ display: 'flex', gap: 8, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            {erreurCamera}
          </div>
        ) : (
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '1 / 1' }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {(!pret || traitement) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)', color: '#fff' }}>
                <Loader2 size={26} className="animate-spin" />
              </div>
            )}
            <div style={{ position: 'absolute', inset: '12%', border: '2px solid rgba(255,255,255,.75)', borderRadius: 18, pointerEvents: 'none' }} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 10, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
          <ScanLine size={13} /> Le scan reprend automatiquement après chaque lecture.
        </p>
      </div>

      {p && (
        <div style={{ marginTop: 14, background: '#fff', borderRadius: 20, padding: 16, borderLeft: `6px solid ${FOND[p.ton]}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {p.ton === 'ok' ? <CheckCircle2 size={24} color={FOND.ok} /> : p.ton === 'info' ? <AlertTriangle size={24} color={FOND.info} /> : <XCircle size={24} color={FOND.ko} />}
          <div>
            <p style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{p.titre}</p>
            {p.detail && <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{p.detail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}