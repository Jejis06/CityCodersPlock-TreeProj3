import { ArrowRight, Monitor, Tablet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/shared/Badge';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type User } from '@/types/domain';
import { homePathForRole, useCurrentUser } from '../CurrentUserContext';
import { AppBrand } from '../layouts/AppBrand';

const ACCOUNT_DESCRIPTIONS: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': 'Widok desktopowy. Pełny dostęp: mapa, karta rośliny, zlecanie zadań, kolejka zatwierdzeń.',
  '22222222-2222-2222-2222-222222222222':
    'Drugi urzędnik. Otwórz go w nowej karcie przeglądarki, aby pokazać blokadę MUTEX w kolejce zatwierdzeń.',
  '33333333-3333-3333-3333-333333333333':
    'Symulator tabletu w terenie: zadania do wykonania, zdjęcia z realizacji. Bez dostępu do umów i finansowania.',
};

export function RoleSelectPage() {
  const { user: currentUser, login } = useCurrentUser();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User[]>('/api/users')
      .then(setUsers)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać kont. Czy serwer działa?'),
      )
      .finally(() => setLoading(false));
  }, []);

  const choose = (user: User) => {
    login(user);
    navigate(homePathForRole(user.role));
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900">
      <header className="px-8 py-6">
        <AppBrand inverted />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="text-center text-4xl font-bold tracking-tight text-white">Wybierz konto testowe</h1>
        <p className="mt-3 max-w-xl text-center text-emerald-100">
          System ewidencji i pielęgnacji zieleni miejskiej Płocka. Logowanie jest symulowane — wybierz jedną z ról.
        </p>

        <div className="mt-10 grid w-full max-w-5xl gap-5 md:grid-cols-3">
          {loading && (
            <div className="col-span-full flex justify-center">
              <Spinner className="size-8 text-white" />
            </div>
          )}
          {error && (
            <ErrorMessage className="col-span-full">
              {error} Uruchom serwer: <code>npm run dev</code> w katalogu głównym repozytorium.
            </ErrorMessage>
          )}
          {users.map((user) => {
            const Icon = user.device === 'tablet' ? Tablet : Monitor;
            const isCurrent = currentUser?.id === user.id;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => choose(user)}
                className={cn(
                  'group flex flex-col rounded-2xl bg-white p-6 text-left shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300',
                  isCurrent && 'ring-4 ring-emerald-300',
                )}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'flex size-14 items-center justify-center rounded-xl',
                      user.role === 'official' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    <Icon className="size-7" />
                  </span>
                  <Badge variant={user.role === 'official' ? 'default' : 'warning'}>{ROLE_LABELS[user.role]}</Badge>
                </div>
                <p className="mt-5 text-xl font-semibold text-slate-900">{user.full_name}</p>
                <p className="text-sm text-slate-500">{user.device === 'tablet' ? 'Tablet w terenie' : 'Komputer w urzędzie'}</p>
                <p className="mt-3 flex-1 text-sm text-slate-600">{ACCOUNT_DESCRIPTIONS[user.id]}</p>
                <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-emerald-700">
                  {isCurrent ? 'Kontynuuj' : 'Wejdź'}
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
