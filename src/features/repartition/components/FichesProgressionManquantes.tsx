// src/features/repartition/components/FichesProgressionManquantes.tsx
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import type { SupportCoursLigne } from '../api';

interface LigneListe {
  id: string;
  enseignant: string;
  fiche: string; // ex. "0/3" ou "✔"
  support: string;
}

function etat(recus: number, total: number): string {
  if (total === 1) return recus === 1 ? '✔' : '✘';
  return `${recus}/${total}`;
}

// Un enseignant par ligne (sans doublon de cours), avec l'état d'envoi de
// la fiche de progression et du support de cours. Sont listés ceux à qui
// il manque l'un OU l'autre.
function construireListe(lignes: SupportCoursLigne[]): LigneListe[] {
  const parEns = new Map<
    string,
    Map<string, { fiche: boolean; support: boolean }>
  >();
  for (const l of lignes) {
    const ens = (l.enseignantNom || '(enseignant non renseigné)').trim();
    const cours = parEns.get(ens) ?? new Map();
    const cle = l.ueNom.trim().toLowerCase();
    const c = cours.get(cle) ?? { fiche: true, support: true };
    c.fiche = c.fiche && !!l.ficheKey;
    c.support = c.support && l.supportEnvoye;
    cours.set(cle, c);
    parEns.set(ens, cours);
  }
  return Array.from(parEns.entries())
    .map(([enseignant, cours]) => {
      const v = Array.from(cours.values());
      const f = v.filter((c) => c.fiche).length;
      const sp = v.filter((c) => c.support).length;
      return { enseignant, f, sp, n: v.length };
    })
    .filter((e) => e.f < e.n || e.sp < e.n)
    .sort((a, b) => a.enseignant.localeCompare(b.enseignant))
    .map((e, i) => ({
      id: `l${i}`,
      enseignant: e.enseignant,
      fiche: etat(e.f, e.n),
      support: etat(e.sp, e.n)
    }));
}

// Liste simple, modifiable avant export PDF : on corrige un nom, retire
// un enseignant, ajoute une ligne, puis on exporte.
export default function FichesProgressionManquantes({
  lignes
}: {
  lignes: SupportCoursLigne[];
}) {
  const initiale = useMemo(() => construireListe(lignes), [lignes]);
  const [liste, setListe] = useState<LigneListe[]>(initiale);
  const [titre, setTitre] = useState(
    'Suivi des envois : fiche de progression et support de cours'
  );
  const [numero, setNumero] = useState(0);
  const [colonnes, setColonnes] = useState(2);

  useEffect(() => {
    setListe(initiale);
  }, [initiale]);

  function maj(
    id: string,
    champ: 'enseignant' | 'fiche' | 'support',
    valeur: string
  ) {
    setListe((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l))
    );
  }

  function ajouter() {
    setNumero((n) => n + 1);
    setListe((prev) => [
      ...prev,
      { id: `n${Date.now()}${numero}`, enseignant: '', fiche: '', support: '' }
    ]);
  }

  function imprimer() {
    const ancien = document.title;
    document.title = 'Fiches de progression non reçues';
    const restaurer = () => {
      document.title = ancien;
      window.removeEventListener('afterprint', restaurer);
    };
    window.addEventListener('afterprint', restaurer);
    window.print();
  }

  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div>
      <div className="bg-white rounded-2xl p-4 mb-4">
        <label className="block text-xs font-bold text-gray-500 mb-1.5">
          Titre du document
        </label>
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-xs font-bold text-gray-400 mr-auto">
          {liste.length} enseignant{liste.length > 1 ? 's' : ''} — modifie la
          liste puis exporte.
        </p>
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
          Colonnes
          <select
            value={colonnes}
            onChange={(e) => setColonnes(Number(e.target.value))}
            className="border border-gray-200 rounded-lg bg-white px-2 py-1.5 text-xs font-bold outline-none"
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setListe(initiale)}
          className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          <RotateCcw size={13} /> Réinitialiser
        </button>
        <button
          onClick={ajouter}
          className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          <Plus size={13} /> Ajouter une ligne
        </button>
        <button
          onClick={imprimer}
          disabled={liste.length === 0}
          className="flex items-center gap-1.5 bg-red-600 rounded-full px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          <Printer size={14} /> Exporter en PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {liste.length === 0 ? (
          <p className="p-8 text-center text-sm font-semibold text-gray-300">
            Aucune ligne. Tous les enseignants ont tout envoyé, ou tu as
            tout retiré.
          </p>
        ) : (
          liste.map((l, i) => (
            <div
              key={l.id}
              className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 last:border-0"
            >
              <span className="w-6 text-xs font-bold text-gray-300 text-right shrink-0">
                {i + 1}
              </span>
              <input
                value={l.enseignant}
                onChange={(e) => maj(l.id, 'enseignant', e.target.value)}
                placeholder="Nom de l'enseignant"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-bold outline-none focus:border-red-600"
              />
              {(['fiche', 'support'] as const).map((champ) => (
                <input
                  key={champ}
                  value={l[champ]}
                  onChange={(e) => maj(l.id, champ, e.target.value)}
                  title={
                    champ === 'fiche'
                      ? 'Fiche de progression'
                      : 'Support de cours'
                  }
                  placeholder={champ === 'fiche' ? 'Fiche' : 'Support'}
                  className="w-16 shrink-0 border border-gray-200 rounded-lg px-1.5 py-2 text-xs font-bold text-center outline-none focus:border-red-600"
                />
              ))}
              <button
                onClick={() =>
                  setListe((prev) => prev.filter((x) => x.id !== l.id))
                }
                title="Retirer"
                className="p-2 text-gray-300 hover:text-red-600 shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {createPortal(
        <>
          <style>{`
            @page { size: A4 portrait; margin: 14mm; }
            @media print {
              html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
              #root { display: none !important; }
              .fp-pdf { position: static !important; left: auto !important; width: 100% !important; overflow: visible !important; }
              * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            .fp-pdf { position: absolute; left: -99999px; top: 0; width: 182mm; font-family: Nunito, sans-serif; color: #111; }
            .fp-pdf ol { margin: 0; padding: 0; list-style: none; column-gap: 8mm; column-rule: 1px solid #ccc; font-size: 9pt; line-height: 1.35; }
            .fp-pdf li { break-inside: avoid; padding: 1.5px 0; border-bottom: 1px dotted #bbb; display: flex; gap: 4px; }
            .fp-pdf li span.nm { flex: 1; }
            .fp-pdf li span.e { width: 14mm; text-align: center; font-weight: 700; }
            .fp-pdf li span.n { color: #666; min-width: 6mm; text-align: right; }
          `}</style>
          <div className="fp-pdf">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/logo-cenulape.png" alt="" style={{ height: 52 }} />
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
                  {titre}
                </p>
                <p style={{ fontSize: 10, margin: '2px 0 0', color: '#555' }}>
                  Édité le {date}
                </p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 8,
                color: '#555',
                marginTop: 10
              }}
            >
              <span>
                F = fiche de progression · S = support de cours · ✔ envoyé · ✘
                non envoyé · x/y = cours reçus / cours attribués
              </span>
            </div>
            <ol style={{ marginTop: 6, columnCount: colonnes }}>
              {liste
                .filter((l) => l.enseignant.trim())
                .map((l, i) => (
                  <li key={l.id}>
                    <span className="n">{i + 1}.</span>
                    <span className="nm">{l.enseignant.trim()}</span>
                    <span className="e">F {l.fiche}</span>
                    <span className="e">S {l.support}</span>
                  </li>
                ))}
            </ol>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}