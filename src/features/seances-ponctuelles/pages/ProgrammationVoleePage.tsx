// src/features/seances-ponctuelles/pages/ProgrammationVoleePage.tsx
import { useEffect, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  Calendar,
  KeyRound,
  Copy,
  CheckCircle2,
  X,
} from 'lucide-react';
import { tousLesCreneaux, CRENEAUX } from '@/constants/enums';
import type { Creneau } from '@/types';
import RechercheSpecialite from '@/components/shared/RechercheSpecialite';
import type { SpecialiteRecherche } from '@/lib/rechercheSpecialite';
import { listEnseignantsOptions, type EnseignantOption } from '@/features/repartition/api';
import { listSalles, type SalleAvecSpecialite } from '@/features/referentiel/salles/api';
import {
  listSeancesAnnulees,
  listOffresPourSpecialite,
  programmerCoursVolant,
  type SeanceAnnulee,
  type OffreOption,
  type CodesGeneres,
} from '../api';

function aujourdhuiISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// Programmation à la volée — un cours à n'importe quelle date/créneau,
// typiquement pour remplacer un cours annulé par un enseignant, mais
// utilisable pour n'importe quel besoin ponctuel (rattrapage, etc.).
export default function ProgrammationVoleePage() {
  const [annulees, setAnnulees] = useState<SeanceAnnulee[]>([]);
  const [loadingAnnulees, setLoadingAnnulees] = useState(true);

  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [salles, setSalles] = useState<SalleAvecSpecialite[]>([]);

  const [date, setDate] = useState(aujourdhuiISO());
  const [creneau, setCreneau] = useState<Creneau>(CRENEAUX[0]);
  const [specialite, setSpecialite] = useState<SpecialiteRecherche | null>(
    null
  );
  const [offres, setOffres] = useState<OffreOption[]>([]);
  const [offreChoisie, setOffreChoisie] = useState('');
  const [enseignantId, setEnseignantId] = useState('');
  const [salleId, setSalleId] = useState('');
  const [motif, setMotif] = useState('');
  const [remplaceSeanceId, setRemplaceSeanceId] = useState<string | null>(
    null
  );

  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [codes, setCodes] = useState<CodesGeneres | null>(null);

  function chargerAnnulees() {
    setLoadingAnnulees(true);
    listSeancesAnnulees()
      .then(setAnnulees)
      .finally(() => setLoadingAnnulees(false));
  }

  useEffect(() => {
    chargerAnnulees();
    listEnseignantsOptions().then(setEnseignants);
    listSalles().then(setSalles);
  }, []);

  function handleSelectionSpecialite(s: SpecialiteRecherche) {
    setSpecialite(s);
    setOffreChoisie('');
    listOffresPourSpecialite(s.id).then(setOffres);
  }

  function handleProgrammerRemplacement(s: SeanceAnnulee) {
    setRemplaceSeanceId(s.id);
    setMotif(`Remplacement du cours annulé (${s.jour} ${s.creneau})`);
    if (s.specialiteId) {
      listOffresPourSpecialite(s.specialiteId).then((liste) => {
        setOffres(liste);
        const trouvee = liste.find(
          (o) =>
            (s.troncCommunId && o.troncCommunId === s.troncCommunId) ||
            (s.offreId && o.offreId === s.offreId)
        );
        if (trouvee) {
          setOffreChoisie(
            trouvee.troncCommunId
              ? `tronc:${trouvee.troncCommunId}`
              : `offre:${trouvee.offreId}`
          );
        }
      });
    }
    setSpecialite(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!date || !creneau || !offreChoisie || !enseignantId) {
      setErreur('Date, créneau, UE et enseignant sont obligatoires.');
      return;
    }
    const offre = offres.find(
      (o) =>
        (o.troncCommunId && offreChoisie === `tronc:${o.troncCommunId}`) ||
        (o.offreId && offreChoisie === `offre:${o.offreId}`)
    );
    if (!offre) {
      setErreur('Choisis une UE ou un tronc commun.');
      return;
    }

    setEnregistrement(true);
    try {
      const resultat = await programmerCoursVolant({
        date,
        creneau,
        offreId: offre.offreId ?? undefined,
        troncCommunId: offre.troncCommunId ?? undefined,
        specialiteId: specialite?.id ?? '',
        enseignantId,
        salleId: salleId || undefined,
        remplaceSeanceEdtId: remplaceSeanceId ?? undefined,
        motif: motif.trim() || undefined,
      });
      setCodes(resultat);
      setOffreChoisie('');
      setEnseignantId('');
      setSalleId('');
      setMotif('');
      setRemplaceSeanceId(null);
      chargerAnnulees();
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Erreur lors de la programmation."
      );
    } finally {
      setEnregistrement(false);
    }
  }

  function copier(texte: string) {
    navigator.clipboard?.writeText(texte);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold text-2xl text-gray-900 mb-1">
        Programmation à la volée
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Programme un cours à n'importe quelle date/créneau — typiquement
        pour remplacer un cours annulé par un enseignant.
      </p>

      <div className="mb-6">
        <p className="font-extrabold text-sm text-gray-900 mb-2.5">
          Cours annulés
        </p>
        {loadingAnnulees ? (
          <div className="flex items-center justify-center py-8 text-gray-300">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : annulees.length === 0 ? (
          <div className="bg-white rounded-[20px] p-6 text-center text-sm text-gray-400">
            Aucun cours annulé en attente de remplacement.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {annulees.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-[20px] p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <AlertTriangle size={16} className="text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {a.ueNom} — {a.enseignantNom}
                      </p>
                      <p className="text-xs text-gray-400">
                        {a.jour} {a.creneau} · annulé le{' '}
                        {new Date(a.annuleeLe).toLocaleDateString('fr-FR')}
                        {a.motif ? ` · ${a.motif}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleProgrammerRemplacement(a)}
                    className="text-xs font-bold text-red-600 bg-red-50 rounded-full px-3.5 py-2 hover:bg-red-100 shrink-0"
                  >
                    Programmer un remplacement
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-[20px] p-5">
        <p className="font-extrabold text-sm text-gray-900 mb-3 flex items-center gap-1.5">
          <Calendar size={15} className="text-red-600" />
          Programmer un cours ponctuel
        </p>

        {remplaceSeanceId && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 rounded-xl px-3.5 py-2.5 mb-4">
            <p className="text-xs font-semibold text-amber-700">
              Ce cours remplacera un cours annulé.
            </p>
            <button
              onClick={() => setRemplaceSeanceId(null)}
              className="text-amber-600 hover:text-amber-800 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">
                Créneau
              </label>
              <select
                value={creneau}
                onChange={(e) => setCreneau(e.target.value as Creneau)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              >
                {tousLesCreneaux().map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Spécialité
            </label>
            <RechercheSpecialite onSelect={handleSelectionSpecialite} />
            {specialite && (
              <p className="text-xs font-semibold text-gray-500 mt-1.5">
                {specialite.nom} — {specialite.ecoleNom}
              </p>
            )}
          </div>

          {offres.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1.5 block">
                UE / Tronc commun
              </label>
              <select
                value={offreChoisie}
                onChange={(e) => {
                  setOffreChoisie(e.target.value);
                  const o = offres.find(
                    (o) =>
                      (o.troncCommunId &&
                        e.target.value === `tronc:${o.troncCommunId}`) ||
                      (o.offreId && e.target.value === `offre:${o.offreId}`)
                  );
                  if (o?.enseignantAttribueId) {
                    setEnseignantId(o.enseignantAttribueId);
                  }
                }}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
              >
                <option value="">Choisir...</option>
                {offres.map((o) => (
                  <option
                    key={o.offreId ?? `tronc:${o.troncCommunId}`}
                    value={
                      o.troncCommunId
                        ? `tronc:${o.troncCommunId}`
                        : `offre:${o.offreId}`
                    }
                  >
                    {o.nom}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Enseignant
            </label>
            <select
              value={enseignantId}
              onChange={(e) => setEnseignantId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">Choisir...</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} ({e.matricule})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Salle (optionnel)
            </label>
            <select
              value={salleId}
              onChange={(e) => setSalleId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-red-600"
            >
              <option value="">À confirmer</option>
              {salles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code_salle}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
              Motif (optionnel)
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-red-600 resize-none"
            />
          </div>

          {erreur && (
            <p className="text-xs font-semibold text-red-600">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={enregistrement}
            className="flex items-center justify-center gap-2 bg-red-600 rounded-full px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {enregistrement && <Loader2 size={15} className="animate-spin" />}
            Programmer le cours
          </button>
        </form>
      </div>

      {codes && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[20px] p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={18} className="text-green-600" />
              <p className="font-extrabold text-gray-900">
                Cours programmé !
              </p>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Communique ces codes de vive voix à l'enseignant — ils ne
              seront plus affichés ensuite.
            </p>

            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-2">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-gray-400" />
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    Ouverture
                  </p>
                  <p className="text-lg font-black tracking-widest text-gray-900">
                    {codes.codeOuverture}
                  </p>
                </div>
              </div>
              <button
                onClick={() => copier(codes.codeOuverture)}
                className="text-gray-400 hover:text-red-600"
              >
                <Copy size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-5">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-gray-400" />
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    Fermeture
                  </p>
                  <p className="text-lg font-black tracking-widest text-gray-900">
                    {codes.codeFermeture}
                  </p>
                </div>
              </div>
              <button
                onClick={() => copier(codes.codeFermeture)}
                className="text-gray-400 hover:text-red-600"
              >
                <Copy size={16} />
              </button>
            </div>

            <button
              onClick={() => setCodes(null)}
              className="w-full bg-red-600 rounded-full px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              J'ai noté les codes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}