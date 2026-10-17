import { ClipboardCheck, LogOut, Map as MapIcon, TableProperties } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/types/domain';
import { useCurrentUser } from '../CurrentUserContext';
import { AppBrand } from './AppBrand';

/** Working modes of the official (map vs table/analytics/export) followed by the approval queue. */
const navItems = [
  { to: '/official', label: 'Mapa Interaktywna', icon: MapIcon, end: true },
  { to: '/official/list', label: 'Lista Drzew, Analizy i Eksport', icon: TableProperties, end: false },
  { to: '/official/queue', label: 'Kolejka zatwierdzeń', icon: ClipboardCheck, end: false },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export function OfficialLayout() {
  const { user, logout } = useCurrentUser();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex h-16 shrink-0 items-center gap-8 border-b border-slate-200/80 bg-white/95 px-6 shadow-[0_1px_12px_-6px_rgba(15,23,42,0.12)] backdrop-blur">
        <AppBrand />
        <nav aria-label="Nawigacja urzędnika" className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white shadow-sm ring-2 ring-white">
                {initials(user.full_name)}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-900">{user.full_name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>
          )}
          <span className="h-8 w-px bg-slate-200" aria-hidden />
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <LogOut className="size-4" />
            Zmień konto
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
