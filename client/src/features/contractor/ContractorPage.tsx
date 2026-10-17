import { CheckCircle2, ListTodo, LogOut, Maximize2, Tablet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { useNavigate } from 'react-router';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { ErrorMessage } from '@/components/shared/Feedback';
import { TabletFrame } from '@/components/shared/TabletFrame';
import { TreeMap } from '@/features/map/TreeMap';
import { useTrees } from '@/features/map/useTrees';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { TreeListItem } from '@/types/domain';
import { CompletedMapLegend } from './CompletedMapLegend';
import { CompletedTreeMarker } from './CompletedTreeMarker';
import { CompleteTaskDialog } from './CompleteTaskDialog';
import { TaskList } from './TaskList';
import type { ContractorTask } from './types';
import { useContractorMapFilter, type ContractorTab } from './useContractorMapFilter';

const FRAME_KEY = 'tree-monitor:tablet-frame';

const FOCUS_ZOOM = 20;

/** Centers the map on the selected task's tree (rendered as a TreeMap child). */
function FlyToTarget({ target }: { target: { lat: number; lng: number; key: string } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.8 });
  }, [map, target]);
  return null;
}

export function ContractorPage() {
  const { user, logout } = useCurrentUser();
  const navigate = useNavigate();
  const { trees, error, reload: reloadTrees } = useTrees();
  const [tasks, setTasks] = useState<ContractorTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ContractorTask | null>(null);
  const [executing, setExecuting] = useState<ContractorTask | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; key: string } | null>(null);
  const [framed, setFramed] = useState(() => sessionStorage.getItem(FRAME_KEY) !== 'full');
  const [tab, setTab] = useState<ContractorTab>('todo');

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.get<ContractorTask[]>('/api/tasks'));
      setTasksError(null);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Nie udało się pobrać zadań.');
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const { todoTasks, doneTasks, tabTasks, mapTrees, markerVariant, taskForTree } = useContractorMapFilter({
    tasks,
    trees,
    userId: user?.id,
    tab,
  });

  const selectTask = (task: ContractorTask) => {
    setSelectedTask(task);
    setFlyTarget({ lat: task.tree_latitude, lng: task.tree_longitude, key: `${task.id}-${Date.now()}` });
  };

  const onTreeClick = useCallback(
    (tree: TreeListItem) => {
      const task = taskForTree(tree.id);
      if (task) setSelectedTask(task);
    },
    [taskForTree],
  );

  const switchTab = (next: ContractorTab) => {
    setTab(next);
    setSelectedTask(null);
  };

  const selectedTreeId = selectedTask?.tree_id ?? null;

  const onCompleted = () => {
    setExecuting(null);
    setTab('done');
    void loadTasks();
    void reloadTrees();
  };

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
            {framed ? 'Pełny ekran' : 'Widok Tabletu (Ramka iPad)'}
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
                      { id: 'todo', label: `Do wykonania (${todoTasks.length})`, icon: ListTodo },
                      { id: 'done', label: `Wykonane / W weryfikacji (${doneTasks.length})`, icon: CheckCircle2 },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => switchTab(id)}
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
                  {(error || tasksError) && <ErrorMessage className="mb-3">{error ?? tasksError}</ErrorMessage>}
                  <TaskList
                    tasks={tabTasks}
                    mode={tab}
                    selectedTaskId={selectedTask?.id ?? null}
                    onSelect={selectTask}
                    onExecute={setExecuting}
                  />
                </div>
              </aside>

              <section className="relative min-w-0 flex-1">
                <TreeMap
                  trees={markerVariant === 'status' ? mapTrees : []}
                  selectedTreeId={selectedTreeId}
                  onTreeClick={onTreeClick}
                  layersCollapsed
                  showCadControl={false}
                  showLegend={markerVariant === 'status'}
                >
                  {markerVariant === 'completed' &&
                    mapTrees.map((tree) => (
                      <CompletedTreeMarker
                        key={tree.id}
                        tree={tree}
                        selected={tree.id === selectedTreeId}
                        onClick={onTreeClick}
                      />
                    ))}
                  <FlyToTarget target={flyTarget} />
                </TreeMap>
                {markerVariant === 'completed' && <CompletedMapLegend />}
              </section>
            </div>
          </div>
        </TabletFrame>
      </div>
      <CompleteTaskDialog task={executing} onClose={() => setExecuting(null)} onCompleted={onCompleted} />
    </div>
  );
}
