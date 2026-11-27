// src/features/mes-ues/components/DepotDocument.tsx
import { useRef } from 'react';
import { Loader2, UploadCloud, CheckCircle2, Pencil } from 'lucide-react';
import { ACCEPT_DOCUMENT, urlPubliqueR2 } from '@/lib/r2';

// Bloc d'envoi simple d'un document PDF / Word : une ligne, un bouton.
// Sert au support de cours comme à la fiche de progression.
export default function DepotDocument({
  titre,
  cleFichier,
  nomFichier,
  dateEnvoi,
  enCours,
  erreur,
  onChoisir,
}: {
  titre: string;
  cleFichier: string | null;
  nomFichier: string | null;
  dateEnvoi: string | null;
  enCours: boolean;
  erreur?: string;
  onChoisir: (fichier: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const envoye = !!cleFichier;

  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-gray-900">{titre}</p>
          {envoye ? (
            <a
              href={urlPubliqueR2(cleFichier!)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-green-700 hover:underline truncate"
            >
              <CheckCircle2 size={13} className="shrink-0" />
              <span className="truncate">{nomFichier ?? 'Voir le fichier'}</span>
            </a>
          ) : (
            <p className="text-[11px] text-gray-400">
              PDF ou Word (.pdf, .doc, .docx) — pas encore envoyé
            </p>
          )}
          {dateEnvoi && (
            <p className="text-[11px] text-gray-400">
              Envoyé le {new Date(dateEnvoi).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={enCours}
          onClick={() => ref.current?.click()}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold disabled:opacity-60 ${
            envoye
              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {enCours ? (
            <Loader2 size={14} className="animate-spin" />
          ) : envoye ? (
            <Pencil size={14} />
          ) : (
            <UploadCloud size={14} />
          )}
          {enCours ? 'Envoi…' : envoye ? 'Remplacer' : 'Envoyer'}
        </button>
        <input
          ref={ref}
          type="file"
          accept={ACCEPT_DOCUMENT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onChoisir(f);
          }}
        />
      </div>
      {erreur && (
        <p className="text-xs font-semibold text-red-600 mt-2">{erreur}</p>
      )}
    </div>
  );
}