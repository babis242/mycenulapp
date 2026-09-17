// src/features/disponibilites/pages/SaisieDisponibilitesPage.tsx
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useAuthStore } from '@/stores/authStore';
import { JOURS, tousLesCreneaux } from '@/constants/enums';

interface CampagneActive {
  id: string;
  date_lancement: string;
}

// Reconstruit "ma campagne active + mes réponses existantes" depuis Dexie
// — utilisée hors ligne, ou pour un premier affichage instantané.
async function lireDepuisCache(matricule: string): Promise<{
  enseignantId: string | null;
  campagne: CampagneActive | null;
  selection: Set<string>;
}> {
  const enseignant = await db.enseignants
    .where('matricule')
    .equals(matricule)
    .first();
  if (!enseignant)
    return { enseignantId: null, campagne: null, selection: new Set() };

  const liaisons = await db.campagneEnseignants
    .where('enseignant_id')
    .equals(enseignant.id)
    .toArray();
  const campagnes = await db.campagnesDisponibilite.toArray();
  const campagneParId = new Map(campagnes.map((c: any) => [c.id, c]));

  const campagneActive = liaisons
    .map((l: any) => campagneParId.get(l.campagne_id))
    .find((c: any) => c?.statut === 'active');

  if (!campagneActive) {
    return {
      enseignantId: enseignant.id,
      campagne: null,
      selection: new Set(),
    };
  }

  const dispoExistantes = await db.disponibilites
    .where('campagne_id')
    .equals(campagneActive.id)
    .and((d: any) => d.enseignant_id === enseignant.id)
    .toArray();

  return {
    enseignantId: enseignant.id,
    campagne: {
      id: campagneActive.id,
      date_lancement: campagneActive.date_lancement,
    },
    selection: new Set(
      dispoExistantes
        .filter((d: any) => d.disponible)
        .map((d: any) => `${d.jour}|${d.creneau}`)
    ),
  };
}

// Écran Étape 3 — Saisie des disponibilités (journal.md Scénario 3).
// Tableau Jours (lignes) x Créneaux (colonnes), l'enseignant coche les
// cases où il est disponible pour la campagne active le concernant.
export default function SaisieDisponibilitesPage() {
  const user = useAuthStore((s) => s.user);

  const [enseignantId, setEnseignantId] = useState<string | null>(null);
  const [campagne, setCampagne] = useState<CampagneActive | null>(null);
  const [loading, setLoading] = useState(true);
  const [depuisCache, setDepuisCache] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set()); // clé = "jour|creneau"
  const [saving, setSaving] = useState(false);
  const [succes, setSucces] = useState(false);
  const [enregistreHorsLigne, setEnregistreHorsLigne] = useState(false);

  useEffect(() => {
    async function charger() {
      if (!user) return;
      setLoading(true);
      let aDesDonneesLocales = false;

      // 1. Cache local d'abord.
      try {
        const local = await lireDepuisCache(user.matricule);
        setEnseignantId(local.enseignantId);
        setCampagne(local.campagne);
        setSelection(local.selection);
        if (local.campagne) {
          setDepuisCache(true);
          aDesDonneesLocales = true;
        }
      } catch {
        // pas grave, on retombe sur le réseau
      }

      // 2. Réseau ensuite.
      if (!navigator.onLine) {
        setLoading(false);
        return;
      }
      try {
        const { data: enseignant } = await supabase
          .from('enseignants')
          .select('id')
          .eq('matricule', user.matricule)
          .maybeSingle();
        if (!enseignant) {
          setLoading(false);
          return;
        }
        setEnseignantId(enseignant.id);

        const { data: liaisons } = await supabase
          .from('campagne_enseignants')
          .select(
            'campagne_id, campagne:campagnes_disponibilite(id, date_lancement, statut)'
          )
          .eq('enseignant_id', enseignant.id);

        const campagneActive = (liaisons ?? [])
          .map((l: any) => l.campagne)
          .find((c: any) => c?.statut === 'active');

        if (campagneActive) {
          setCampagne({
            id: campagneActive.id,
            date_lancement: campagneActive.date_lancement,
          });

          const { data: dispoExistantes } = await supabase
            .from('disponibilites')
            .select('jour, creneau, disponible')
            .eq('campagne_id', campagneActive.id)
            .eq('enseignant_id', enseignant.id);

          setSelection(
            new Set(
              (dispoExistantes ?? [])
                .filter((d) => d.disponible)
                .map((d) => `${d.jour}|${d.creneau}`)
            )
          );
        } else {
          setCampagne(null);
        }
        setDepuisCache(false);
      } catch {
        // Le réseau échoue mais on a peut-être déjà le cache affiché.
        if (!aDesDonneesLocales) setCampagne(null);
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, [user?.matricule]);

  function toggleCase(jour: string, creneau: string) {
    const cle = `${jour}|${creneau}`;
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  }

  async function handleEnregistrer() {
    if (!campagne || !enseignantId) return;
    setSaving(true);
    try {
      const lignes = JOURS.flatMap((jour) =>
        tousLesCreneaux().map((creneau) => ({
          jour,
          creneau,
          disponible: selection.has(`${jour}|${creneau}`),
        }))
      );

      if (navigator.onLine) {
        // Supprime les réponses précédentes de cette campagne puis
        // réinsère — plus simple qu'un upsert ligne par ligne vu le
        // faible volume (12 cases max par enseignant/semaine).
        await supabase
          .from('disponibilites')
          .delete()
          .eq('campagne_id', campagne.id)
          .eq('enseignant_id', enseignantId);

        const { error } = await supabase.from('disponibilites').insert(
          lignes.map((l) => ({
            campagne_id: campagne.id,
            enseignant_id: enseignantId,
            ...l,
          }))
        );
        if (error) throw error;
        setEnregistreHorsLigne(false);
      } else {
        // Hors ligne : mise en file d'attente (rejouée au retour du
        // réseau, cf. src/lib/sync.ts), + écriture optimiste dans le
        // cache local pour que l'écran reflète la sélection si on revient
        // dessus avant la synchro.
        await enqueueSyncAction({
          entity: 'disponibilites',
          operation: 'update',
          payload: { campagneId: campagne.id, enseignantId, lignes },
        });
        await db.disponibilites
          .where('campagne_id')
          .equals(campagne.id)
          .and((d: any) => d.enseignant_id === enseignantId)
          .delete();
        await db.disponibilites.bulkPut(
          lignes.map((l, i) => ({
            id: `local-${campagne.id}-${enseignantId}-${i}`,
            campagne_id: campagne.id,
            enseignant_id: enseignantId,
            ...l,
          })) as any
        );
        setEnregistreHorsLigne(true);
      }

      setSucces(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!campagne) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="font-extrabold text-lg text-gray-900 mb-1">
          Aucune demande en cours
        </p>
        <p className="text-sm text-gray-400">
          Tu seras notifié dès qu'une nouvelle collecte de disponibilités sera
          lancée.
        </p>
      </div>
    );
  }

  if (succes) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
        <p className="font-extrabold text-lg text-gray-900 mb-1">
          Disponibilités enregistrées
        </p>
        {enregistreHorsLigne && (
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-600 mb-2">
            <WifiOff size={12} /> Hors ligne — seront envoyées dès le retour du
            réseau
          </p>
        )}
        <p className="text-sm text-gray-400 mb-6">
          Tu peux les modifier à tout moment tant que la collecte reste active.
        </p>
        <button
          onClick={() => setSucces(false)}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Mes disponibilités
      </p>
      <p className="text-sm text-gray-400 mb-2">
        Coche les créneaux où tu es disponible pour la semaine à venir.
      </p>
      {depuisCache && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-4">
          <WifiOff size={12} /> Données locales — en attente de rafraîchissement
        </p>
      )}

      <div className="bg-white rounded-[20px] overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">
                Jour
              </th>
              {tousLesCreneaux().map((c) => (
                <th
                  key={c}
                  className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wide"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {JOURS.map((jour) => (
              <tr key={jour} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-4 font-bold text-gray-900">{jour}</td>
                {tousLesCreneaux().map((creneau) => {
                  const coche = selection.has(`${jour}|${creneau}`);
                  return (
                    <td key={creneau} className="px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggleCase(jour, creneau)}
                        className={`relative w-10 h-10 rounded-xl border-2 transition-colors ${
                          coche
                            ? 'bg-red-50 border-red-600'
                            : 'bg-white border-gray-200 hover:border-red-300'
                        }`}
                      >
                        {coche && (
                          <CheckCircle2
                            size={16}
                            className="absolute -top-1.5 -right-1.5 text-red-600 bg-white rounded-full"
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleEnregistrer}
        disabled={saving}
        className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {saving && <Loader2 size={15} className="animate-spin" />}
        Enregistrer mes disponibilités
      </button>
    </div>
  );
}