// src/features/referentiel/responsables/pages/AjouterResponsablePage.tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Search,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, enqueueSyncAction } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  createResponsable,
  listSpecialitesPourPerimetre,
  type SpecialitePourPerimetre,
} from '../api';

// Ajouter un responsable, manuellement, avec assignation du périmètre de
// spécialités à la création (règle transversale, journal.md). Le
// matricule est généré par la base. Comme pour l'enseignant, une Edge
// Function crée ensuite le compte de connexion et envoie les identifiants
// par email — adapte le nom de la fonction ci-dessous si la tienne
// s'appelle différemment.
export default function AjouterResponsablePage() {
  const navigate = useNavigate();
  const enLigne = useOnlineStatus();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');

  const [specialites, setSpecialites] = useState<SpecialitePourPerimetre[]>([]);
  const [chargementSpecialites, setChargementSpecialites] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [specialiteIds, setSpecialiteIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<{
    matricule: string | null;
    emailEnvoye: boolean;
    horsLigne: boolean;
  } | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      listSpecialitesPourPerimetre()
        .then(setSpecialites)
        .finally(() => setChargementSpecialites(false));
    } else {
      Promise.all([
        db.specialites.toArray(),
        db.filieres.toArray(),
        db.ecoles.toArray(),
      ]).then(([sps, fs, es]) => {
        const filiereParId = new Map(fs.map((f: any) => [f.id, f]));
        const ecoleParId = new Map(es.map((e: any) => [e.id, e]));
        setSpecialites(
          (sps as any[])
            .map((s) => {
              const filiere = filiereParId.get(s.filiere_id);
              const ecole = filiere ? ecoleParId.get(filiere.ecole_id) : null;
              return {
                id: s.id,
                nom: s.nom,
                filiereNom: filiere?.nom ?? '',
                ecoleNom: ecole?.nom ?? '',
              };
            })
            .sort((a, b) => a.nom.localeCompare(b.nom))
        );
        setChargementSpecialites(false);
      });
    }
  }, []);

  function toggleSpecialite(id: string) {
    setSpecialiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const specialitesFiltrees = specialites.filter(
    (s) =>
      s.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      s.filiereNom.toLowerCase().includes(recherche.toLowerCase())
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !email.trim()) {
      setError("Le nom et l'email sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      if (navigator.onLine) {
        const responsable = await createResponsable({
          nom: nom.trim(),
          email: email.trim(),
          numero_telephone: telephone.trim() || undefined,
          specialiteIds: Array.from(specialiteIds),
        });

        const { data, error: fnError } = await supabase.functions.invoke(
          'create-responsable-account',
          { body: { responsableId: responsable.id } }
        );

        if (fnError || data?.error) {
          setSucces({
            matricule: responsable.matricule,
            emailEnvoye: false,
            horsLigne: false,
          });
        } else {
          setSucces({
            matricule: responsable.matricule,
            emailEnvoye: true,
            horsLigne: false,
          });
        }
      } else {
        const id = crypto.randomUUID();
        await db.responsables.put({
          id,
          matricule: '(en attente de synchronisation)',
          nom: nom.trim(),
          email: email.trim(),
          statut: 'actif',
        } as any);
        await enqueueSyncAction({
          entity: 'responsables',
          operation: 'create',
          payload: {
            id,
            nom: nom.trim(),
            email: email.trim(),
            numero_telephone: telephone.trim() || null,
            specialiteIds: Array.from(specialiteIds),
          },
        });
        setSucces({ matricule: null, emailEnvoye: false, horsLigne: true });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la création.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (succes) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        {succes.horsLigne ? (
          <>
            <WifiOff size={40} className="text-amber-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Responsable enregistré localement
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Le matricule sera attribué et le compte de connexion créé dès le
              retour du réseau.
            </p>
          </>
        ) : succes.emailEnvoye ? (
          <>
            <CheckCircle2 size={40} className="text-green-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Responsable créé
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Matricule :{' '}
              <span className="font-mono font-bold text-gray-700">
                {succes.matricule}
              </span>
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Identifiants envoyés par email.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
            <p className="font-extrabold text-lg text-gray-900 mb-1">
              Responsable créé
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Matricule :{' '}
              <span className="font-mono font-bold text-gray-700">
                {succes.matricule}
              </span>
            </p>
            <p className="text-sm text-gray-400 mb-6">
              La fiche est enregistrée, mais l'envoi de l'email des identifiants
              a échoué.
            </p>
          </>
        )}
        <button
          onClick={() => navigate('/referentiel/responsables')}
          className="bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => navigate('/referentiel/responsables')}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> Retour à la liste
      </button>

      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Ajouter un responsable
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Le matricule et le mot de passe seront générés automatiquement.
      </p>
      {!enLigne && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <WifiOff size={15} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-700">
            Hors ligne — la fiche (avec périmètre) sera enregistrée localement ;
            matricule et compte de connexion suivront au retour du réseau.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-[20px] p-5 flex flex-col gap-4"
      >
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Nom complet *
          </label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            placeholder="Aïcha Ngo Bella"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            placeholder="aicha.ngobella@exemple.com"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Téléphone
          </label>
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            placeholder="+237 6XX XXX XXX"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">
            Périmètre — spécialités sous sa responsabilité
          </label>
          <div className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-2 mb-2">
              <Search size={14} className="text-gray-300 shrink-0" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une spécialité..."
                className="flex-1 text-sm font-semibold outline-none bg-transparent"
              />
            </div>

            {chargementSpecialites ? (
              <div className="flex items-center justify-center py-8 text-gray-300">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : specialitesFiltrees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Aucune spécialité trouvée.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
                {specialitesFiltrees.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={specialiteIds.has(s.id)}
                      onChange={() => toggleSpecialite(s.id)}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {s.nom}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {s.filiereNom} · {s.ecoleNom}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          {specialiteIds.size === 0 && (
            <p className="text-xs text-amber-600 font-semibold mt-1.5">
              Aucune spécialité sélectionnée — le responsable pourra être
              assigné plus tard.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => navigate('/referentiel/responsables')}
            className="px-5 py-2.5 text-sm font-bold text-gray-500"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
