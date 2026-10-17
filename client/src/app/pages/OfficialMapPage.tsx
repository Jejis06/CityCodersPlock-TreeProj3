import { MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card';
import { EmptyState, ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { StatusDot } from '@/components/shared/StatusDot';
import { TreeMap } from '@/features/map/TreeMap';
import { useTrees } from '@/features/map/useTrees';
import { TreeQuickInfo } from '@/features/tree-card/TreeQuickInfo';
import { TREE_STATUS_META, TREE_STATUSES, type TreeListItem } from '@/types/domain';

export function OfficialMapPage() {
  const { trees, loading, error } = useTrees();
  const [selected, setSelected] = useState<TreeListItem | null>(null);

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Rośliny w ewidencji
              {loading ? <Spinner className="size-4" /> : <span className="text-slate-500">{trees.length}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {TREE_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2 text-sm">
                  <StatusDot status={status} />
                  <span className="flex-1 text-slate-700">{TREE_STATUS_META[status].label}</span>
                  <span className="font-semibold">{trees.filter((t) => t.status === status).length}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {selected ? (
          <TreeQuickInfo tree={selected} onClose={() => setSelected(null)} />
        ) : (
          <Card>
            <EmptyState
              icon={<MousePointerClick />}
              title="Wybierz roślinę"
              description="Kliknij punkt na mapie, aby zobaczyć podstawowe dane rośliny."
            />
          </Card>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        <TreeMap trees={trees} selectedTreeId={selected?.id} onTreeClick={setSelected} />
      </section>
    </div>
  );
}
