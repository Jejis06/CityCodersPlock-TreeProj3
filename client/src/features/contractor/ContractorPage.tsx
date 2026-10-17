import { CheckCircle2, ListTodo, LogOut, Maximize2, Tablet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { EmptyState, ErrorMessage } from '@/components/shared/Feedback';
import { TabletFrame } from '@/components/shared/TabletFrame';
import { TreeMap } from '@/features/map/TreeMap';
import { useTrees } from '@/features/map/useTrees';
import { cn } from '@/lib/utils';

const FRAME_KEY = 'tree-monitor:tablet-frame';

type ContractorTab = 'todo' | 'done';

export function ContractorPage() {
  const { user, logout } = useCurrentUser();
  const navigate = useNavigate();
  const { trees, error } = useTrees();
  const [framed, setFramed] = useState(() => sessionStorage.getItem(FRAME_KEY) !== 'full');
  const [tab, setTab] = useState<ContractorTab>('todo');

  const toggleFrame = () => {
    setFramed((prev) => {
      sessionStorage.setItem(FRAME_KEY, prev ? 'full' : 'frame');
      return !prev;
    });
  };

  const switchAccount = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex h-full flex-col bg-slate-800">
      <div className="flex h-12 shrink-0 items-center gap-3 px-4 text-sm text-slate-200">
        <Tablet className="size-4" />
        <span className="font-medium">Symulator tabletu wykonawcy</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={toggleFrame}>
            {framed ? <Maximize2 /> : <Tablet />}
            {framed ? 'Pełny ekran' : 'Ramka tabletu'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TabletFrame framed={framed}>
          <div className="flex h-full flex-col">
            <header className="flex h-16 shrink-0 items-center gap-4 bg-emerald-800 px-5 text-white">
              <div>
                <p className="text-lg font-bold leading-tight">Tree Monitor · Teren</p>
                <p className="text-sm text-emerald-100">{user?.full_name} · Wykonawca</p>
              </div>
              <Button size="lg" variant="secondary" className="ml-auto" onClick={switchAccount}>
                <LogOut />
                Zmień konto
              </Button>
            </header>

            <div className="flex min-h-0 flex-1">
              <aside className="flex w-[340px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
                <div className="grid grid-cols-2 gap-2 p-3">
                  {(
                    [
                      { id: 'todo', label: 'Do wykonania', icon: ListTodo },
                      { id: 'done', label: 'Wykonane', icon: CheckCircle2 },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={cn(
                        'flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-base font-semibold transition',
                        tab === id
                          ? 'bg-emerald-700 text-white shadow'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {error && <ErrorMessage>{error}</ErrorMessage>}
                  <EmptyState
                    icon={tab === 'todo' ? <ListTodo /> : <CheckCircle2 />}
                    title={tab === 'todo' ? 'Lista zadań w przygotowaniu' : 'Historia w przygotowaniu'}
                    description="Zadania wykonawcy i zgłaszanie wykonania powstają na branchu feat/contractor-tablet-view."
                  />
                </div>
              </aside>

              <section className="min-w-0 flex-1">
                <TreeMap trees={trees} layersCollapsed showCadControl={false} />
              </section>
            </div>
          </div>
        </TabletFrame>
      </div>
    </div>
  );
}
