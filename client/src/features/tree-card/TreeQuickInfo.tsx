import { MapPin, X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card';
import { StatusDot } from '@/components/shared/StatusDot';
import { PLANT_TYPE_LABELS, speciesLabel, TREE_STATUS_META, type TreeListItem } from '@/types/domain';

interface TreeQuickInfoProps {
  tree: TreeListItem;
  onClose: () => void;
}

export function TreeQuickInfo({ tree, onClose }: TreeQuickInfoProps) {
  const rows: [string, string][] = [
    ['Gatunek (łac.)', tree.species_latin_name],
    ['Typ', PLANT_TYPE_LABELS[tree.type]],
    ['Rok posadzenia', tree.planting_year?.toString() ?? '—'],
    ['Adres', tree.address ?? '—'],
    ['Działka', tree.plot_number ?? '—'],
    ['Wykonawca', tree.contractor_name ?? '—'],
    ['Współrzędne', `${tree.latitude.toFixed(5)}, ${tree.longitude.toFixed(5)}`],
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tree.code}</p>
            <CardTitle className="text-base">{speciesLabel(tree.species_polish_name, tree.species_cultivar)}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Zamknij">
            <X />
          </Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <StatusDot status={tree.status} shape={tree.type === 'shrub' ? 'square' : 'circle'} />
          {TREE_STATUS_META[tree.status].label}
        </p>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        {tree.notes && (
          <p className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {tree.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
