import { ClipboardCheck, LogOut, Map as MapIcon, UserRound } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/types/domain';
import { useCurrentUser } from '../CurrentUserContext';
import { AppBrand } from './AppBrand';

const navItems = [
  { to: '/official', label: 'Mapa', icon: MapIcon, end: true },
  { to: '/official/queue', label: 'Kolejka zatwierdzeń', icon: ClipboardCheck, end: false },
];

export function OfficialLayout() {
  const { user, logout } = useCurrentUser();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex h-16 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-5 shadow-sm">
        <AppBrand />
        <nav className="flex gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 text-sm">
              <UserRound className="size-4 text-slate-500" />
              <span className="font-medium">{user.full_name}</span>
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <LogOut />
            Zmień konto
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
