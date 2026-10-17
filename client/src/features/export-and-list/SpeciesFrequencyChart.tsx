import { BarChart3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/Feedback';
import { cn } from '@/lib/utils';
import type { SpeciesFrequency } from './inventoryModel';

const TYPE_COLORS = { tree: '#047857', shrub: '#7c3aed' } as const;
/** Bar gradients (top → bottom): deep green → teal for trees, violet for shrubs. */
const TYPE_GRADIENTS = {
  tree: ['#0d9488', '#047857'],
  shrub: ['#a78bfa', '#7c3aed'],
} as const;
const MAX_BARS = 20;

const VIEW_HEIGHT = 300;
const PAD = { top: 28, right: 16, bottom: 92, left: 46 };
const MIN_SLOT = 52;
const MAX_BAR_WIDTH = 28;
const BAR_RADIUS = 6;

/** Bar path with rounded top corners and a flat base. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(BAR_RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface SpeciesFrequencyChartProps {
  data: SpeciesFrequency[];
  selectedSpeciesId?: number | null;
  onBarClick?: (speciesId: number) => void;
  className?: string;
}

function yTicks(max: number): number[] {
  const step = Math.max(1, Math.ceil(max / 5));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

const shorten = (label: string) => (label.length > 24 ? `${label.slice(0, 23)}…` : label);

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry?.contentRect.width ?? 0),
        height: Math.floor(entry?.contentRect.height ?? 0),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Bar chart for the currently filtered plants — OX: species, OY: number of occurrences.
 * Fills the height of its parent (at least `VIEW_HEIGHT`), so it can be stretched next to taller panels.
 */
export function SpeciesFrequencyChart({ className, ...props }: SpeciesFrequencyChartProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {props.data.length === 0 ? (
        <EmptyState
          icon={<BarChart3 />}
          title="Brak danych do wykresu"
          description="Żadna roślina nie spełnia filtrów."
        />
      ) : (
        <ChartBody {...props} />
      )}
    </div>
  );
}

function ChartBody({ data, selectedSpeciesId = null, onBarClick }: Omit<SpeciesFrequencyChartProps, 'className'>) {
  const [plotRef, plotSize] = useElementSize<HTMLDivElement>();
  const containerWidth = plotSize.width;
  const height = Math.max(plotSize.height, VIEW_HEIGHT);
  const bars = data.slice(0, MAX_BARS);
  const hidden = data.length - bars.length;
  const ticks = yTicks(Math.max(...bars.map((b) => b.count)));
  const yMax = ticks[ticks.length - 1] ?? 1;

  const width = Math.max(containerWidth, PAD.left + bars.length * MIN_SLOT + PAD.right, 320);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const slot = plotWidth / bars.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.5);
  const y = (v: number) => PAD.top + plotHeight - (v / yMax) * plotHeight;

  return (
    <figure className="flex flex-1 flex-col gap-2">
      <div ref={plotRef} className="relative min-h-[300px] flex-1">
        <div className="absolute inset-0 overflow-x-auto overflow-y-hidden">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Wykres słupkowy: liczba wystąpień gatunków"
          >
            <defs>
              {(Object.keys(TYPE_GRADIENTS) as (keyof typeof TYPE_GRADIENTS)[]).map((type) => (
                <linearGradient key={type} id={`species-bar-${type}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TYPE_GRADIENTS[type][0]} />
                  <stop offset="100%" stopColor={TYPE_GRADIENTS[type][1]} />
                </linearGradient>
              ))}
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#e2e8f0"
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text x={PAD.left - 10} y={y(t)} dy="0.35em" textAnchor="end" className="fill-slate-400 text-[11px]">
                  {t}
                </text>
              </g>
            ))}

            <text
              transform={`translate(12 ${PAD.top + plotHeight / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-slate-500 text-[11px] font-medium"
            >
              OY: ilość wystąpień
            </text>

            {bars.map((bar, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const top = y(bar.count);
              const active = selectedSpeciesId === bar.speciesId;
              const dimmed = selectedSpeciesId !== null && !active;
              return (
                <g
                  key={bar.key}
                  className={cn('group transition-opacity', onBarClick && 'cursor-pointer')}
                  onClick={() => onBarClick?.(bar.speciesId)}
                  opacity={dimmed ? 0.3 : 1}
                >
                  <title>{`${bar.label} (${bar.latinName}): ${bar.count}`}</title>
                  <rect
                    x={cx - slot / 2 + 2}
                    y={PAD.top}
                    width={slot - 4}
                    height={plotHeight}
                    rx={8}
                    className={cn('fill-transparent transition-colors', onBarClick && 'group-hover:fill-slate-100/70')}
                  />
                  <path
                    d={barPath(cx - barWidth / 2, top, barWidth, PAD.top + plotHeight - top)}
                    fill={`url(#species-bar-${bar.type})`}
                    stroke={active ? '#0f172a' : 'none'}
                    strokeWidth={1.5}
                  />
                  <text x={cx} y={top - 8} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
                    {bar.count}
                  </text>
                  <text
                    transform={`translate(${cx} ${PAD.top + plotHeight + 12}) rotate(-35)`}
                    textAnchor="end"
                    className="fill-slate-600 text-[11px]"
                  >
                    {shorten(bar.label)}
                  </text>
                </g>
              );
            })}

            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotHeight}
              y2={PAD.top + plotHeight}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <text
              x={width - PAD.right}
              y={height - 6}
              textAnchor="end"
              className="fill-slate-500 text-[11px] font-medium"
            >
              OX: gatunek
            </text>
          </svg>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-2 font-medium text-slate-700">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS.tree }} /> Drzewa
        </span>
        <span className="flex items-center gap-2 font-medium text-slate-700">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS.shrub }} /> Krzewy / byliny
        </span>
        {onBarClick && <span className="ml-auto">Kliknij słupek, aby filtrować tabelę po gatunku.</span>}
        {hidden > 0 && (
          <span>
            Pokazano {bars.length} najliczniejszych gatunków (pominięto {hidden}).
          </span>
        )}
      </figcaption>
    </figure>
  );
}
