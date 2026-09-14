// src/components/shared/RechercheSpecialite.tsx
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  listSpecialitesRecherche,
  type SpecialiteRecherche,
} from '@/lib/rechercheSpecialite';

interface RechercheSpecialiteProps {
  onSelect: (specialite: SpecialiteRecherche) => void;
  placeholder?: string;
}

// Recherche directe d'une spécialité par son nom (ou celui de sa filière/
// école) — évite de descendre la cascade École → Filière → Cycle →
// Spécialité quand on connaît déjà le nom. Au clic sur un résultat,
// `onSelect` renvoie tout le contexte nécessaire pour préremplir cette
// cascade côté appelant.
export default function RechercheSpecialite({
  onSelect,
  placeholder = 'Rechercher une spécialité...',
}: RechercheSpecialiteProps) {
  const [terme, setTerme] = useState('');
  const [toutes, setToutes] = useState<SpecialiteRecherche[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fermerSiClicExterieur(e: MouseEvent) {
      if (
        conteneurRef.current &&
        !conteneurRef.current.contains(e.target as Node)
      ) {
        setOuvert(false);
      }
    }
    document.addEventListener('mousedown', fermerSiClicExterieur);
    return () =>
      document.removeEventListener('mousedown', fermerSiClicExterieur);
  }, []);

  function handleFocus() {
    setOuvert(true);
    if (toutes === null) {
      listSpecialitesRecherche().then(setToutes);
    }
  }

  const q = terme.trim().toLowerCase();
  const resultats = (toutes ?? []).filter(
    (s) =>
      !q ||
      s.nom.toLowerCase().includes(q) ||
      s.filiereNom.toLowerCase().includes(q) ||
      s.ecoleNom.toLowerCase().includes(q)
  );

  function handleSelect(s: SpecialiteRecherche) {
    onSelect(s);
    setTerme(s.nom);
    setOuvert(false);
  }

  return (
    <div ref={conteneurRef} className="relative">
      <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2.5 w-full">
        <Search size={15} className="text-gray-300 shrink-0" />
        <input
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          className="w-full text-sm font-semibold outline-none placeholder:text-gray-300"
        />
        {terme && (
          <button
            onClick={() => {
              setTerme('');
              setOuvert(false);
            }}
            className="text-gray-300 hover:text-gray-500 shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {ouvert && (
        <div className="absolute z-20 mt-1.5 w-full bg-white rounded-2xl shadow-lg border border-gray-100 max-h-72 overflow-y-auto">
          {toutes === null ? (
            <p className="text-xs text-gray-400 px-4 py-3">Chargement...</p>
          ) : resultats.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">Aucun résultat.</p>
          ) : (
            resultats.slice(0, 30).map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <p className="text-sm font-bold text-gray-900">{s.nom}</p>
                <p className="text-xs text-gray-400">
                  {s.ecoleNom} · {s.filiereNom} · {s.cycle}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}