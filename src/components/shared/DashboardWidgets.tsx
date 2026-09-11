import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLE_LABELS } from '@/constants/roles';
import type { AuthUser } from '@/types';

// Composants partagés de style "cartes" pour les tableaux de bord
// (Admin, Responsable, Enseignant...) — inspirés d'une maquette de référence,
// police Nunito, accent rouge, coins très arrondis.

export function StatCard({
  label,
  value,
  loading,
  accent = 'var(--color-primary)',
}: {
  label: string;
  value: number;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <div
      className="bg-card rounded-lg p-5 border-t-[3px] shadow-sm"
      style={{ borderTopColor: accent }}
    >
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
        {label}
      </p>
      {loading ? (
        <Loader2 size={22} className="animate-spin" style={{ color: accent }} />
      ) : (
        <p className="text-3xl font-black" style={{ color: accent }}>
          {value}
        </p>
      )}
    </div>
  );
}

export function ActionCard({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-card rounded-lg p-5 flex items-center gap-4 text-left hover:shadow-md transition-shadow shadow-sm"
    >
      <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0 text-accent-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-base text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{sub}</p>
      </div>
    </button>
  );
}

export function ActivityRow({
  text,
  time,
  accent = 'var(--color-primary)',
}: {
  text: string;
  time: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div
        className="w-[3px] h-6 rounded-full flex-shrink-0"
        style={{ background: accent }}
      />
      <p className="flex-1 text-sm font-semibold text-foreground truncate">
        {text}
      </p>
      <p className="text-xs font-semibold text-muted-foreground flex-shrink-0">
        {time}
      </p>
    </div>
  );
}

export function DashboardTopbar({
  title,
  sub,
  user,
}: {
  title: string;
  sub: string;
  user: AuthUser;
}) {
  const initials = user.matricule.substring(0, 2).toUpperCase();
  return (
    <div className="flex items-center justify-between mb-6 gap-3">
      <div className="min-w-0">
        <p className="font-extrabold text-2xl text-foreground truncate">
          {title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">{sub}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-black text-sm">
            {initials}
          </span>
        </div>
        <div className="hidden sm:block">
          <p className="font-bold text-sm text-foreground">{user.nom}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
      </div>
    </div>
  );
}
