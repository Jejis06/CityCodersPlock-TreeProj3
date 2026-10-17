import { Camera, FileCheck2, Maximize2 } from 'lucide-react';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/shared/Sheet';
import { StatusDot } from '@/components/shared/StatusDot';
import { assetUrl } from '@/lib/api';
import { PLANT_TYPE_LABELS, speciesLabel, TREE_STATUS_META, type TaskHistoryItem, type TreeDetails } from '@/types/domain';
import { taskToLightboxPhoto, type LightboxPhoto } from './PhotoLightbox';

interface TreeHeroHeaderProps {
  tree: TreeDetails;
  onOpenPhoto?: (photo: LightboxPhoto) => void;
}

function findLatestApprovedPhotoTask(tasks: TaskHistoryItem[]): TaskHistoryItem | null {
  const approvedWithPhoto = tasks.filter((t) => t.status === 'approved' && Boolean(t.contractor_photo_url));
  if (approvedWithPhoto.length === 0) return null;
  return [...approvedWithPhoto].sort((a, b) => {
    const aTime = a.reviewed_at ?? a.completed_at ?? a.created_at;
    const bTime = b.reviewed_at ?? b.completed_at ?? b.created_at;
    return bTime.localeCompare(aTime);
  })[0] ?? null;
}

/**
 * Nagłówek Karty Drzewa. Jeśli drzewo posiada zatwierdzone zadanie ze zdjęciem,
 * najnowsze zatwierdzone zdjęcie staje się tłem (hero image z ciemnym gradientem pod białym tekstem).
 */
export function TreeHeroHeader({ tree, onOpenPhoto }: TreeHeroHeaderProps) {
  const status = TREE_STATUS_META[tree.status];
  const isFromDecision = Boolean(tree.is_from_decision);
  const heroTask = findLatestApprovedPhotoTask(tree.tasks);
  const heroPhotoUrl = heroTask ? assetUrl(heroTask.contractor_photo_url) : undefined;
  const heroLightbox = heroTask ? taskToLightboxPhoto(heroTask, tree.code) : null;

  if (heroPhotoUrl) {
    return (
      <SheetHeader className="relative min-h-52 justify-end overflow-hidden border-b border-slate-800 bg-slate-900 p-0">
        <img
          src={heroPhotoUrl}
          alt={speciesLabel(tree.species_polish_name, tree.species_cultivar)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-900/40" />

        <div className="relative z-10 flex flex-col gap-2 p-6 pt-12 pr-14 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/95 px-2 py-0.5 font-mono text-sm font-bold text-slate-900 shadow-xs">
              {tree.code}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/75 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur-xs">
              <StatusDot status={tree.status} shape={tree.type === 'shrub' ? 'square' : 'circle'} className="size-3" />
              {status.label}
            </span>
            {isFromDecision && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-0.5 text-xs font-bold text-slate-950 shadow-xs">
                <FileCheck2 className="size-3.5" />
                Z DECYZJI
              </span>
            )}
          </div>

          <SheetTitle className="text-2xl font-bold text-white drop-shadow-xs">
            {speciesLabel(tree.species_polish_name, tree.species_cultivar)}
          </SheetTitle>
          <SheetDescription className="italic text-slate-200">
            {tree.species_latin_name} · {PLANT_TYPE_LABELS[tree.type]}
          </SheetDescription>

          {heroLightbox && onOpenPhoto && (
            <div className="mt-1 flex items-center justify-between gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <Camera className="size-3.5" />
                Aktualne zatwierdzone zdjęcie z odbioru
              </span>
              <button
                type="button"
                onClick={() => onOpenPhoto(heroLightbox)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur-xs transition hover:bg-white/25"
              >
                <Maximize2 className="size-3.5" />
                Powiększ zdjęcie
              </button>
            </div>
          )}
        </div>
      </SheetHeader>
    );
  }

  return (
    <SheetHeader className="bg-slate-50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-bold text-white">{tree.code}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${status.color}1f`, color: status.color }}
        >
          <StatusDot status={tree.status} shape={tree.type === 'shrub' ? 'square' : 'circle'} className="size-3" />
          {status.label}
        </span>
        {isFromDecision && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-300">
            <FileCheck2 className="size-3.5 text-amber-700" />
            Z DECYZJI
          </span>
        )}
      </div>
      <SheetTitle>{speciesLabel(tree.species_polish_name, tree.species_cultivar)}</SheetTitle>
      <SheetDescription className="italic">
        {tree.species_latin_name} · {PLANT_TYPE_LABELS[tree.type]}
      </SheetDescription>
    </SheetHeader>
  );
}
