// src/features/qr-ouverture/components/ScannerQrModal.tsx
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { extraireCodeDuPayload } from '../api';

interface ScannerQrModalProps {
  // "ouvrir" ou "fermer" — juste pour le texte affiché, la validation
  // réelle se fait ensuite avec le code extrait, exactement comme un code
  // tapé à la main (voir MaSeancePage).
  mode: 'ouvrir' | 'fermer';
  onCodeDetecte: (code: string) => void;
  onFermer: () => void;
}

// Scan caméra + décodage QR 100% en local (jsQR lit les pixels d'un
// canvas, aucune restriction Safari/iOS contrairement au NFC ou au
// Bluetooth) — dès qu'un QR valide (préfixe CENULA-QR1) est détecté, le
// code est remonté au parent qui l'envoie au même circuit de validation
// que le code tapé à la main (ouvrirSeance/fermerSeance inchangés).
export default function ScannerQrModal({
  mode,
  onCodeDetecte,
  onFermer,
}: ScannerQrModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flotRef = useRef<MediaStream | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const detecteRef = useRef(false);

  useEffect(() => {
    let annule = false;
    let animationId: number;

    async function demarrer() {
      try {
        const flot = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (annule) {
          flot.getTracks().forEach((t) => t.stop());
          return;
        }
        flotRef.current = flot;
        if (videoRef.current) {
          videoRef.current.srcObject = flot;
          await videoRef.current.play();
          setPret(true);
        }
        boucleAnalyse();
      } catch {
        setErreur(
          "Impossible d'accéder à la caméra — vérifie que tu as autorisé l'accès, ou utilise le code tapé à la main ci-dessous."
        );
      }
    }

    function boucleAnalyse() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || annule) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const resultat = jsQR(image.data, image.width, image.height);
          if (resultat?.data && !detecteRef.current) {
            const code = extraireCodeDuPayload(resultat.data);
            if (code) {
              detecteRef.current = true;
              onCodeDetecte(code);
              return; // on arrête la boucle, le parent ferme la modale
            }
          }
        }
      }
      animationId = requestAnimationFrame(boucleAnalyse);
    }

    demarrer();
    return () => {
      annule = true;
      cancelAnimationFrame(animationId);
      flotRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="font-extrabold text-gray-900">
            Scanner le QR pour {mode === 'ouvrir' ? 'ouvrir' : 'fermer'}
          </p>
          <button
            onClick={onFermer}
            className="text-gray-300 hover:text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {erreur ? (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
            <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-red-700">{erreur}</p>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            {!pret && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70">
                <Loader2 size={22} className="animate-spin" />
              </div>
            )}
            <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3 text-center">
          Vise l'écran QR affiché au secrétariat — pas besoin de code à
          taper si le scan fonctionne.
        </p>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}