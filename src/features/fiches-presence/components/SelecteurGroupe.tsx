// src/features/fiches-presence/components/SelecteurGroupe.tsx
//
// Choix cycle → semestre → spécialité + semaine, partagé par les pages
// de lecture et de consultation des présences.
import { useEffect, useState } from 'react';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import { useAuthStore } from '@/stores/authStore';
import { SEMESTRES_PAR_TYPE_CURSUS } from '@/constants/enums';
import { listCyclesDisponibles, type CycleOption, type SpecialiteGroupe } from '@/features/emploi-du-temps/api';
import { listSpecialitesPourFiches } from '../api';
import { libelleSemaine } from './FichesPresencePdf';

export interface ChoixGroupe {
  cycleKey: string;
  semestre: string;
  specialiteId: string;
  specialiteNom?: string;
  semaine: string;
}

export function lundiCourant(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const jour = d.getUTCDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + decalage))
    .toISOString()
    .slice(0, 10);
}

function versLundi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jour = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (jour === 0 ? -6 : 1 - jour));
  return dt.toISOString().slice(0, 10);
}

const champ =
  'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600 disabled:bg-gray-50 disabled:text-gray-300';

export default function SelecteurGroupe({
  valeur,
  onChange,
  avecSemaine = true,
}: {
  valeur: ChoixGroupe;
  onChange: (v: ChoixGroupe) => void;
  avecSemaine?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const perimetreIds = user?.role === 'responsable' ? user.perimetre_specialite_ids ?? [] : null;
  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [specialites, setSpecialites] = useState<SpecialiteGroupe[]>([]);
  const options =
    valeur.specialiteId && !specialites.some((x) => x.id === valeur.specialiteId) && valeur.specialiteNom
      ? [...specialites, { id: valeur.specialiteId, nom: valeur.specialiteNom } as SpecialiteGroupe]
      : specialites;
  const semestres = Array.from(new Set(Object.values(SEMESTRES_PAR_TYPE_CURSUS).flatMap((l) => l)));

  useEffect(() => {
    listCyclesDisponibles(perimetreIds).then(setCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!valeur.cycleKey || !valeur.semestre) {
      setSpecialites([]);
      return;
    }
    const [cycle, sousCycle] = valeur.cycleKey.split('::');
    listSpecialitesPourFiches(cycle, sousCycle || null, valeur.semestre, perimetreIds).then(setSpecialites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur.cycleKey, valeur.semestre]);

  return (
    <div>
      <div className="mb-4" style={{ border: '1px solid #e5e7eb', borderRadius: 999 }}>
        <RechercheSpecialite
          onSelect={(sp) =>
            onChange({
              ...valeur,
              cycleKey: `${sp.cycle}::${sp.sousCycle ?? ''}`,
              specialiteId: sp.id,
              specialiteNom: sp.nom,
            })
          }
        />
      </div>
      <div className={`grid grid-cols-1 gap-3 ${avecSemaine ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Cycle</label>
          <select
            value={valeur.cycleKey}
            onChange={(e) => onChange({ ...valeur, cycleKey: e.target.value, semestre: '', specialiteId: '', specialiteNom: '' })}
            className={champ}
          >
            <option value="">Cycle...</option>
            {cycles.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Semestre</label>
          <select
            value={valeur.semestre}
            disabled={!valeur.cycleKey}
            onChange={(e) => onChange({ ...valeur, semestre: e.target.value })}
            className={champ}
          >
            <option value="">Semestre...</option>
            {semestres.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Spécialité</label>
          <select
            value={valeur.specialiteId}
            disabled={!valeur.semestre}
            onChange={(e) =>
              onChange({
                ...valeur,
                specialiteId: e.target.value,
                specialiteNom: options.find((x) => x.id === e.target.value)?.nom ?? '',
              })
            }
            className={champ}
          >
            <option value="">Spécialité...</option>
            {options.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.nom}</option>
            ))}
          </select>
        </div>
        {avecSemaine && (
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Semaine (lundi)</label>
            <input
              type="date"
              value={valeur.semaine}
              onChange={(e) => e.target.value && onChange({ ...valeur, semaine: versLundi(e.target.value) })}
              className={champ}
            />
          </div>
        )}
      </div>
      {avecSemaine && (
        <p className="text-xs font-semibold text-gray-500 mt-2">Semaine du {libelleSemaine(valeur.semaine)}</p>
      )}
    </div>
  );
}