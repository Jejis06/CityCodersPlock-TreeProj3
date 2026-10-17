import { Axe, Leaf, Shovel, Sprout, TreeDeciduous, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PLANT_TYPE_LABELS,
  speciesLabel,
  TASK_CATEGORY_LABELS,
  TASK_SUBCATEGORY_LABELS,
  type PlantType,
  type TaskCategory,
  type TaskSubcategory,
} from '@/types/domain';

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'gap-1 px-2 py-0.5 text-xs [&_svg]:size-3.5',
  md: 'gap-1.5 px-2.5 py-1 text-sm [&_svg]:size-4',
  lg: 'gap-2 px-3 py-1.5 text-base [&_svg]:size-5',
};

const PLANT_TYPE_META: Record<PlantType, { icon: LucideIcon; label: string; className: string }> = {
  tree: {
    icon: TreeDeciduous,
    label: 'Drzewo',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  },
  shrub: {
    icon: Sprout,
    label: 'Krzew',
    className: 'bg-violet-50 text-indigo-800 ring-violet-300',
  },
};

const TASK_CATEGORY_META: Record<TaskCategory, { icon: LucideIcon; className: string }> = {
  pielegnacja: { icon: Leaf, className: 'bg-amber-50 text-amber-800 ring-amber-300' },
  wycinka: { icon: Axe, className: 'bg-red-50 text-red-800 ring-red-300' },
  nasadzanie: { icon: Shovel, className: 'bg-sky-50 text-sky-800 ring-sky-300' },
};

const chipBase = 'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset';

interface PlantBadgeProps {
  type: PlantType;
  code: string;
  size?: BadgeSize;
  className?: string;
}

/** `[🌳 Drzewo • D6/2026]` / `[🌱 Krzew • K6/2026]` — klasa rośliny + kod ewidencyjny. */
export function PlantBadge({ type, code, size = 'md', className }: PlantBadgeProps) {
  const { icon: Icon, label, className: tone } = PLANT_TYPE_META[type];
  return (
    <span className={cn(chipBase, SIZE_CLASSES[size], tone, className)} title={PLANT_TYPE_LABELS[type]}>
      <Icon aria-hidden />
      <span>{label}</span>
      <span aria-hidden className="opacity-50">•</span>
      <span className="font-mono tracking-tight">{code}</span>
    </span>
  );
}

interface TaskCategoryChipProps {
  category: TaskCategory;
  subcategory: TaskSubcategory;
  size?: BadgeSize;
  className?: string;
}

/** Kolorowy chip rodzaju pracy, np. `Pielęgnacja: Podlewanie`. */
export function TaskCategoryChip({ category, subcategory, size = 'md', className }: TaskCategoryChipProps) {
  const { icon: Icon, className: tone } = TASK_CATEGORY_META[category];
  const sub = TASK_SUBCATEGORY_LABELS[subcategory];
  const label = sub === TASK_CATEGORY_LABELS[category] ? sub : `${TASK_CATEGORY_LABELS[category]}: ${sub}`;
  return (
    <span className={cn(chipBase, SIZE_CLASSES[size], tone, className)}>
      <Icon aria-hidden />
      {label}
    </span>
  );
}

interface PlantIdentityProps {
  type: PlantType;
  code: string;
  speciesPolishName: string;
  speciesCultivar?: string | null;
  speciesLatinName?: string | null;
  size?: BadgeSize;
  className?: string;
}

/** Badge klasy + kodu i pod nim czytelna pełna nazwa gatunku (PL + opcjonalnie łacina). */
export function PlantIdentity({
  type,
  code,
  speciesPolishName,
  speciesCultivar = null,
  speciesLatinName,
  size = 'md',
  className,
}: PlantIdentityProps) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <PlantBadge type={type} code={code} size={size} />
      <p
        className={cn(
          'font-semibold leading-tight text-slate-900',
          size === 'lg' ? 'text-xl' : size === 'md' ? 'text-base' : 'text-sm',
        )}
      >
        {speciesLabel(speciesPolishName, speciesCultivar)}
        {speciesLatinName && <span className="ml-1.5 text-sm font-normal italic text-slate-500">{speciesLatinName}</span>}
      </p>
    </div>
  );
}
