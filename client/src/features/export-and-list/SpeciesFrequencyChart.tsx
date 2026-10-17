import { BarChart3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/Feedback';
import { cn } from '@/lib/utils';
import type { SpeciesFrequency } from './inventoryModel';

const TYPE_COLORS = { tree: '#047857', shrub: '#7c3aed' } as const;
const MAX_BARS = 20;

const VIEW_HEIGHT = 300;
const PAD = { top: 28, right: 16, bottom: 92, left: 46 };
const MIN_SLOT = 52;

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

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Bar chart for the currently filtered plants — OX: species, OY: number of occurrences. */
export function SpeciesFrequencyChart({ className, ...props }: SpeciesFrequencyChartProps) {
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={containerRef} className={cn('min-w-0', className)}>
      {props.data.length === 0 ? (
        <EmptyState icon={<BarChart3 />} title="Brak danych do wykresu" description="Żadna roślina nie spełnia filtrów." />
      ) : (
        <ChartBody {...props} containerWidth={containerWidth} />
      )}
    </div>
  );
}

function ChartBody({
  data,
  selectedSpeciesId = null,
  onBarClick,
  containerWidth,
}: Omit<SpeciesFrequencyChartProps, 'className'> & { containerWidth: number }) {
  const bars = data.slice(0, MAX_BARS);
  const hidden = data.length - bars.length;
  const ticks = yTicks(Math.max(...bars.map((b) => b.count)));
  const yMax = ticks[ticks.length - 1] ?? 1;

  const width = Math.max(containerWidth, PAD.left + bars.length * MIN_SLOT + PAD.right, 320);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = VIEW_HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / bars.length;
  const barWidth = Math.min(44, slot * 0.62);
  const y = (v: number) => PAD.top + plotHeight - (v / yMax) * plotHeight;

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={VIEW_HEIGHT}
          viewBox={`0 0 ${width} ${VIEW_HEIGHT}`}
          role="img"
          aria-label="Wykres słupkowy: liczba wystąpień gatunków"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
              <text x={PAD.left - 8} y={y(t)} dy="0.35em" textAnchor="end" className="fill-slate-500 text-[11px]">
                {t}
              </text>
            </g>
          ))}

          <text
            transform={`translate(12 ${PAD.top + plotHeight / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-slate-600 text-[11px] font-semibold"
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
                className={cn(onBarClick && 'cursor-pointer')}
                onClick={() => onBarClick?.(bar.speciesId)}
                opacity={dimmed ? 0.35 : 1}
              >
                <title>{`${bar.label} (${bar.latinName}): ${bar.count}`}</title>
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotHeight} fill="transparent" />
                <rect
                  x={cx - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={PAD.top + plotHeight - top}
                  rx={4}
                  fill={TYPE_COLORS[bar.type]}
                  stroke={active ? '#0f172a' : 'none'}
                  strokeWidth={2}
                />
                <text x={cx} y={top - 6} textAnchor="middle" className="fill-slate-900 text-[12px] font-bold">
                  {bar.count}
                </text>
                <text
                  transform={`translate(${cx} ${PAD.top + plotHeight + 10}) rotate(-35)`}
                  textAnchor="end"
                  className="fill-slate-700 text-[11px]"
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
            stroke="#64748b"
            strokeWidth={1.5}
          />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotHeight} stroke="#64748b" strokeWidth={1.5} />
          <text x={width - PAD.right} y={VIEW_HEIGHT - 6} textAnchor="end" className="fill-slate-600 text-[11px] font-semibold">
            OX: gatunek
          </text>
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS.tree }} /> Drzewa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS.shrub }} /> Krzewy / byliny
        </span>
        {onBarClick && <span>Kliknij słupek, aby filtrować tabelę po gatunku.</span>}
        {hidden > 0 && <span>Pokazano {bars.length} najliczniejszych gatunków (pominięto {hidden}).</span>}
      </figcaption>
    </figure>
  );
}
