// src/features/dashboard/pages/DashboardPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Users,
  DoorOpen,
  WifiOff,
  PlayCircle,
  Table2,
  Clock,
  CalendarClock,
  KeyRound,
  BarChart3,
  ClipboardEdit,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS } from '@/constants/roles';
import {
  getStatsReferentiel,
  getStatsReferentielDepuisCache,
  type StatsReferentiel,
} from '../api';
import {
  listMesCours,
  lireMesCoursDepuisCache,
  type MonCours,
} from '@/features/emploi-du-temps/api';
import { getSeanceDuMoment, type SeanceDuMoment } from '@/features/seances/api';
import { listMesHeuresMois, moisEnCours } from '@/features/heures/api';
import {
  listCodesPourSemaine,
  jourDAujourdhuiDansSemaine,
  dateReelleDuJour,
} from '@/features/codes-journaliers/api';

const ACCENT = '#dc2626';
const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function lundiDeLaSemaine(): string {
  const d = new Date();
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className="bg-white rounded-[20px] p-5 border-t-[3px]"
      style={{ borderTopColor: accent }}
    >
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
        {label}
      </p>
      <p className="text-3xl font-black" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function ActionCard({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-[20px] p-5 flex items-center gap-4 text-left hover:shadow-md transition-shadow"
    >
      <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 text-red-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-base text-gray-900">{label}</p>
        <p className="text-sm text-gray-400 mt-0.5 truncate">{sub}</p>
      </div>
    </button>
  );
}

function ActivityRow({
  text,
  time,
  accent,
}: {
  text: string;
  time: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div
        className="w-[3px] h-6 rounded-full flex-shrink-0"
        style={{ background: accent }}
      />
      <p className="flex-1 text-sm font-semibold text-gray-700 truncate">
        {text}
      </p>
      <p className="text-xs font-semibold text-gray-300 flex-shrink-0">
        {time}
      </p>
    </div>
  );
}

function Topbar({
  initials,
  sousTitre,
}: {
  initials: string;
  sousTitre: string;
}) {
  return (
    <div className="flex items-center justify-between mb-6 gap-3">
      <div className="min-w-0">
        <p className="font-extrabold text-2xl text-gray-900 truncate">
          Tableau de bord
        </p>
        <p className="text-sm text-gray-400 mt-0.5 truncate">{sousTitre}</p>
      </div>
      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white font-black text-sm">{initials}</span>
      </div>
    </div>
  );
}

function CacheBadge() {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-600 -mt-4 mb-4">
      <WifiOff size={12} /> Données locales — en attente de rafraîchissement
    </p>
  );
}

// ── Dashboard Administrateur ──────────────────────────────────────
function DashboardAdmin({
  initials,
  sousTitre,
  stats,
  depuisCache,
}: {
  initials: string;
  sousTitre: string;
  stats: StatsReferentiel;
  depuisCache: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto">
      <Topbar initials={initials} sousTitre={sousTitre} />
      {depuisCache && <CacheBadge />}

      <p className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-2 mt-1">
        Référentiel
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="UEs" value={stats.ues} accent="#0ea5e9" />
        <StatCard
          label="Enseignants"
          value={stats.enseignants}
          accent="#16a34a"
        />
        <StatCard label="Salles" value={stats.salles} accent="#ea580c" />
        <StatCard
          label="Spécialités"
          value={stats.specialites}
          accent="#7c3aed"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] p-5">
          <p className="font-extrabold text-base text-gray-900 mb-4">
            Actions rapides
          </p>
          <div className="flex flex-col gap-3">
            <ActionCard
              icon={<BookOpen size={20} />}
              label="Ajouter une UE"
              sub="Manuel ou import Excel"
              onClick={() => navigate('/referentiel/ues/nouvelle')}
            />
            <ActionCard
              icon={<Users size={20} />}
              label="Ajouter un enseignant"
              sub="Manuel ou import Excel"
              onClick={() => navigate('/referentiel/enseignants/nouveau')}
            />
            <ActionCard
              icon={<DoorOpen size={20} />}
              label="Ajouter une salle"
              sub="Manuel ou import Excel"
              onClick={() => navigate('/referentiel/salles/nouvelle')}
            />
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-5">
          <p className="font-extrabold text-base text-gray-900 mb-3">
            Activité récente
          </p>
          <ActivityRow
            text="Aucune activité pour l'instant"
            time=""
            accent={ACCENT}
          />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Enseignant ───────────────────────────────────────────
function DashboardEnseignant({
  initials,
  sousTitre,
  seanceDuMoment,
  prochainsCours,
  heuresMois,
  depuisCache,
}: {
  initials: string;
  sousTitre: string;
  seanceDuMoment: SeanceDuMoment | null;
  prochainsCours: MonCours[];
  heuresMois: number;
  depuisCache: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto">
      <Topbar initials={initials} sousTitre={sousTitre} />
      {depuisCache && <CacheBadge />}

      {seanceDuMoment && (
        <button
          onClick={() => navigate('/ma-seance')}
          className="w-full bg-red-600 rounded-[20px] p-5 flex items-center justify-between gap-4 text-left mb-4 hover:bg-red-700 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-white/70 uppercase mb-1">
              Cours en ce moment
            </p>
            <p className="font-extrabold text-white truncate">
              {seanceDuMoment.ueNom}
            </p>
            <p className="text-sm text-white/80">
              {seanceDuMoment.creneau} ·{' '}
              {seanceDuMoment.salleCode ?? 'Salle à confirmer'}
            </p>
          </div>
          <span className="shrink-0 bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            {!seanceDuMoment.heureOuverture
              ? 'Ouvrir'
              : !seanceDuMoment.heureFermeture
              ? 'Fermer'
              : 'Terminée'}
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Heures ce mois" value={heuresMois} accent="#16a34a" />
        <StatCard
          label="Cours à venir"
          value={prochainsCours.length}
          accent="#0ea5e9"
        />
      </div>

      {prochainsCours.length > 0 && (
        <div className="bg-white rounded-[20px] p-5 mb-4">
          <p className="font-extrabold text-base text-gray-900 mb-3">
            Prochains cours
          </p>
          {prochainsCours.slice(0, 4).map((c) => (
            <ActivityRow
              key={c.id}
              text={c.ueNom}
              time={`${c.jour} · ${c.creneau}`}
              accent={ACCENT}
            />
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <ActionCard
          icon={<PlayCircle size={20} />}
          label="Ma séance"
          sub="Ouvrir/fermer avec le code"
          onClick={() => navigate('/ma-seance')}
        />
        <ActionCard
          icon={<Table2 size={20} />}
          label="Mes cours"
          sub="Emploi du temps complet"
          onClick={() => navigate('/mes-cours')}
        />
        <ActionCard
          icon={<Clock size={20} />}
          label="Mes heures"
          sub="Heures effectuées"
          onClick={() => navigate('/mes-heures')}
        />
        <ActionCard
          icon={<CalendarClock size={20} />}
          label="Disponibilités"
          sub="Renseigner mes créneaux"
          onClick={() => navigate('/disponibilites/saisie')}
        />
      </div>
    </div>
  );
}

// ── Dashboard Responsable ───────────────────────────────────────────
function DashboardResponsable({
  initials,
  sousTitre,
  nbSpecialites,
}: {
  initials: string;
  sousTitre: string;
  nbSpecialites: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto">
      <Topbar initials={initials} sousTitre={sousTitre} />

      <div className="mb-4">
        <StatCard
          label="Spécialités sous ta responsabilité"
          value={nbSpecialites}
          accent="#7c3aed"
        />
      </div>
      {nbSpecialites === 0 && (
        <p className="text-xs font-semibold text-amber-600 -mt-2 mb-4">
          Aucune spécialité ne t'est encore assignée — contacte
          l'administrateur.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <ActionCard
          icon={<CalendarClock size={20} />}
          label="Disponibilités"
          sub="Lancer une demande"
          onClick={() => navigate('/disponibilites')}
        />
        <ActionCard
          icon={<Table2 size={20} />}
          label="Emploi du temps"
          sub="Générer et valider"
          onClick={() => navigate('/emploi-du-temps')}
        />
        <ActionCard
          icon={<KeyRound size={20} />}
          label="Codes journaliers"
          sub="Codes de la semaine"
          onClick={() => navigate('/codes-journaliers')}
        />
        <ActionCard
          icon={<BarChart3 size={20} />}
          label="Voir les états"
          sub="Heures effectuées"
          onClick={() => navigate('/heures')}
        />
      </div>
    </div>
  );
}

// ── Dashboard Secrétaire ────────────────────────────────────────────
function DashboardSecretaire({
  initials,
  sousTitre,
  seancesAujourdhui,
}: {
  initials: string;
  sousTitre: string;
  seancesAujourdhui: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto">
      <Topbar initials={initials} sousTitre={sousTitre} />

      <div className="mb-4">
        <StatCard
          label="Séances aujourd'hui"
          value={seancesAujourdhui}
          accent="#dc2626"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <ActionCard
          icon={<KeyRound size={20} />}
          label="Codes journaliers"
          sub="Consulter et imprimer"
          onClick={() => navigate('/codes-journaliers')}
        />
        <ActionCard
          icon={<ClipboardEdit size={20} />}
          label="Saisie manuelle"
          sub="Enregistrer une heure à la main"
          onClick={() => navigate('/seances/saisie-manuelle')}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Admin
  const [stats, setStats] = useState<StatsReferentiel>({
    ues: 0,
    enseignants: 0,
    salles: 0,
    specialites: 0,
  });
  const [depuisCacheAdmin, setDepuisCacheAdmin] = useState(false);

  // Enseignant
  const [seanceDuMoment, setSeanceDuMoment] = useState<SeanceDuMoment | null>(
    null
  );
  const [prochainsCours, setProchainsCours] = useState<MonCours[]>([]);
  const [heuresMois, setHeuresMois] = useState(0);
  const [depuisCacheEns, setDepuisCacheEns] = useState(false);

  // Secrétaire
  const [seancesAujourdhui, setSeancesAujourdhui] = useState(0);

  useEffect(() => {
    if (!user) return;
    let annule = false;

    async function chargerAdmin() {
      let aDesDonneesLocales = false;
      try {
        const local = await getStatsReferentielDepuisCache();
        const total =
          local.ues + local.enseignants + local.salles + local.specialites;
        if (!annule && total > 0) {
          setStats(local);
          setDepuisCacheAdmin(true);
          aDesDonneesLocales = true;
        }
      } catch {
        /* pas grave */
      }
      if (!navigator.onLine) return;
      try {
        const frais = await getStatsReferentiel();
        if (!annule) {
          setStats(frais);
          setDepuisCacheAdmin(false);
        }
      } catch {
        if (!aDesDonneesLocales) {
          /* compteurs restent à 0, honnête */
        }
      }
    }

    async function chargerEnseignant() {
      if (!user) return;

      // Cours (cache d'abord, réseau ensuite)
      let aDesDonneesLocales = false;
      try {
        const local = await lireMesCoursDepuisCache(user.matricule);
        if (!annule && local.length > 0) {
          setProchainsCours(filtrerAVenir(local));
          setDepuisCacheEns(true);
          aDesDonneesLocales = true;
        }
      } catch {
        /* pas grave */
      }
      if (navigator.onLine) {
        try {
          const frais = await listMesCours(user.matricule);
          if (!annule) {
            setProchainsCours(filtrerAVenir(frais));
            setDepuisCacheEns(false);
          }
        } catch {
          /* on garde le cache affiché */
        }

        // Cours du moment et heures du mois : uniquement en ligne, données
        // trop instantanées/agrégées pour être mises en cache utilement.
        try {
          const seance = await getSeanceDuMoment(user.matricule);
          if (!annule) setSeanceDuMoment(seance);
        } catch {
          /* pas de cours en ce moment, ou hors ligne */
        }
        try {
          const heures = await listMesHeuresMois(user.matricule, moisEnCours());
          if (!annule) {
            setHeuresMois(heures.reduce((acc, h) => acc + h.heures, 0));
          }
        } catch {
          /* pas grave */
        }
      } else if (!aDesDonneesLocales) {
        setProchainsCours([]);
      }
    }

    async function chargerSecretaire() {
      if (!navigator.onLine) return;
      try {
        const semaine = lundiDeLaSemaine();
        const jourDuJour = jourDAujourdhuiDansSemaine(semaine);
        if (!jourDuJour) return;
        const codes = await listCodesPourSemaine(semaine);
        if (!annule) {
          setSeancesAujourdhui(
            codes.filter((c) => c.jour === jourDuJour).length
          );
        }
      } catch {
        /* pas grave */
      }
    }

    function filtrerAVenir(liste: MonCours[]): MonCours[] {
      const auj = new Date();
      const ajISO = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(auj.getDate()).padStart(2, '0')}`;
      return liste
        .map((c) => ({ c, date: dateReelleDuJour(c.semaine, c.jour) }))
        .filter(({ date }) => date >= ajISO)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ c }) => c);
    }

    if (user.role === 'administrateur') chargerAdmin();
    else if (user.role === 'enseignant') chargerEnseignant();
    else if (user.role === 'secretaire') chargerSecretaire();

    return () => {
      annule = true;
    };
  }, [user]);

  if (!user) return null;

  const initials = user.matricule.substring(0, 2).toUpperCase();
  const sousTitre = `${ROLE_LABELS[user.role]} — ${today}`;

  if (user.role === 'administrateur')
    return (
      <DashboardAdmin
        initials={initials}
        sousTitre={sousTitre}
        stats={stats}
        depuisCache={depuisCacheAdmin}
      />
    );
  if (user.role === 'enseignant')
    return (
      <DashboardEnseignant
        initials={initials}
        sousTitre={sousTitre}
        seanceDuMoment={seanceDuMoment}
        prochainsCours={prochainsCours}
        heuresMois={heuresMois}
        depuisCache={depuisCacheEns}
      />
    );
  if (user.role === 'responsable')
    return (
      <DashboardResponsable
        initials={initials}
        sousTitre={sousTitre}
        nbSpecialites={user.perimetre_specialite_ids?.length ?? 0}
      />
    );
  return (
    <DashboardSecretaire
      initials={initials}
      sousTitre={sousTitre}
      seancesAujourdhui={seancesAujourdhui}
    />
  );
}
