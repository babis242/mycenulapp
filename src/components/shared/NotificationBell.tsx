// src/components/shared/NotificationBell.tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

interface NotificationRow {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lue: boolean;
  created_at: string;
}

// Cloche de notifications simple : liste les notifications du compte
// connecté, badge de non-lues, clic sur une notification → marque comme lue
// + navigue vers son lien s'il y en a un.
export default function NotificationBell({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [ouverte, setOuverte] = useState(false);
  const [loading, setLoading] = useState(false);

  const nbNonLues = notifications.filter((n) => !n.lue).length;

  async function charger() {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, titre, message, lien, lue, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    charger();

    // Temps réel : dès qu'une notification est insérée pour ce compte, elle
    // apparaît instantanément dans la cloche (badge + liste), sans attendre
    // un rechargement.
    // Suffixe aléatoire : évite une collision de nom de canal quand React
    // (StrictMode, en dev) monte l'effet deux fois d'affilée.
    const channel = supabase
      .channel(
        `notifications-${user.id}-${Math.random().toString(36).slice(2)}`
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `compte_id=eq.${user.id}`,
        },
        (payload) => {
          const nouvelle = payload.new as NotificationRow;
          setNotifications((prev) => [nouvelle, ...prev]);
        }
      )
      .subscribe();

    // Filet de sécurité : un polling à faible fréquence en complément, au
    // cas où la connexion temps réel serait momentanément coupée.
    const interval = setInterval(charger, 120000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id]);

  async function handleClicNotification(n: NotificationRow) {
    if (!n.lue) {
      await supabase.from('notifications').update({ lue: true }).eq('id', n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, lue: true } : x))
      );
    }
    setOuverte(false);
    if (n.lien) navigate(n.lien);
  }

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => {
          setOuverte(true);
          charger();
        }}
        className={
          className ??
          'relative w-11 h-11 rounded-2xl bg-white shadow-md flex items-center justify-center'
        }
      >
        <Bell size={19} className={iconClassName ?? 'text-red-600'} />
        {nbNonLues > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {nbNonLues > 9 ? '9+' : nbNonLues}
          </span>
        )}
      </button>

      {ouverte &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center sm:justify-end p-4"
            onClick={() => setOuverte(false)}
          >
            <div
              className="bg-white rounded-[20px] p-5 w-full max-w-sm max-h-[80vh] flex flex-col mt-16 sm:mr-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="font-extrabold text-base text-gray-900">
                  Notifications
                </p>
                <button
                  onClick={() => setOuverte(false)}
                  className="text-gray-300 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
                {loading ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Chargement...
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Aucune notification.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClicNotification(n)}
                      className={`w-full text-left py-3 border-b border-gray-50 last:border-0 ${
                        !n.lue ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2 px-2">
                        {!n.lue && (
                          <span className="w-2 h-2 rounded-full bg-red-600 mt-1.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">
                            {n.titre}
                          </p>
                          {n.message && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {n.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
