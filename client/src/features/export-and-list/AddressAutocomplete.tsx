import { Hash, MapPin, Search, X, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';
import { compareTreeCodes, type ListTree } from './inventoryModel';
import { codeMatchesSearch, normalizeText } from './listFilters';

type SuggestionKind = 'code' | 'street';

interface SearchSuggestion {
  kind: SuggestionKind;
  /** Value put into the search field (code or street). */
  value: string;
  detail: string;
}

interface AddressAutocompleteProps {
  trees: ListTree[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

const MAX_SUGGESTIONS = 8;
const MAX_CODE_SUGGESTIONS = 5;

const KIND_ICONS: Record<SuggestionKind, LucideIcon> = { code: Hash, street: MapPin };

/** Suggestions put the closest code first: D3/2026 before D30/2024 (number, then natural order). */
const codeNumber = (code: string) => Number(/^[A-Z](\d+)\//.exec(code)?.[1] ?? Number.MAX_SAFE_INTEGER);
const compareCodeSuggestions = (a: string, b: string) => codeNumber(a) - codeNumber(b) || compareTreeCodes(a, b);

const plantsLabel = (n: number) => (n === 1 ? 'roślina' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'rośliny' : 'roślin');

function countBy(trees: ListTree[], key: (tree: ListTree) => string | null): [string, number][] {
  const counts = new Map<string, number>();
  for (const tree of trees) {
    const value = key(tree);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()];
}

/**
 * One search field for the list view: inventory codes (D32/2026) and streets (e.g. "ul. Tumska" → all plants on that street),
 * both built from the inventory.
 */
export function AddressAutocomplete({ trees, value, onChange, className, inputClassName }: AddressAutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streets = useMemo(
    () => countBy(trees, (t) => t.street).sort(([a], [b]) => a.localeCompare(b, 'pl')),
    [trees],
  );

  const suggestions = useMemo(() => {
    const query = normalizeText(value);
    const codes: SearchSuggestion[] = query
      ? trees
          .filter((t) => codeMatchesSearch(t.code, query))
          .sort((a, b) => compareCodeSuggestions(a.code, b.code))
          .slice(0, MAX_CODE_SUGGESTIONS)
          .map((t) => ({ kind: 'code', value: t.code, detail: [t.species_label, t.address].filter(Boolean).join(' • ') }))
      : [];
    const streetMatches: SearchSuggestion[] = streets
      .filter(([street]) => !query || normalizeText(street).includes(query))
      .map(([street, count]) => ({ kind: 'street', value: street, detail: `${count} ${plantsLabel(count)}` }));
    return [...codes, ...streetMatches].filter((s) => s.value !== value).slice(0, MAX_SUGGESTIONS);
  }, [trees, streets, value]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && suggestions[highlighted]) {
      e.preventDefault();
      choose(suggestions[highlighted].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className={cn(inputClassName, 'pl-9 pr-8')}
        placeholder="Kod (D32/2026) lub ulica…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          aria-label="Wyczyść wyszukiwanie"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onChange('')}
        >
          <X className="size-3.5" />
        </button>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {suggestions.map((s, i) => {
            const Icon = KIND_ICONS[s.kind];
            return (
              <li key={`${s.kind}:${s.value}`} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                    i === highlighted ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50',
                  )}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => choose(s.value)}
                >
                  <Icon className="size-4 shrink-0 text-emerald-700" />
                  <span className="shrink-0 font-medium">{s.value}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-xs text-slate-500">{s.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
