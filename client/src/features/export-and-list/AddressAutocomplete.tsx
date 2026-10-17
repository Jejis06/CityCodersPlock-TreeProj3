import { MapPin, Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';
import type { ListTree } from './inventoryModel';
import { normalizeText } from './listFilters';

interface StreetSuggestion {
  street: string;
  count: number;
}

interface AddressAutocompleteProps {
  trees: ListTree[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

const MAX_SUGGESTIONS = 8;

const plantsLabel = (n: number) => (n === 1 ? 'roślina' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'rośliny' : 'roślin');

/** Address search with street suggestions built from the inventory (e.g. "ul. Tumska" → all plants on that street). */
export function AddressAutocomplete({ trees, value, onChange, className, inputClassName }: AddressAutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tree of trees) {
      if (tree.street) counts.set(tree.street, (counts.get(tree.street) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([street, count]): StreetSuggestion => ({ street, count }))
      .sort((a, b) => a.street.localeCompare(b.street, 'pl'));
  }, [trees]);

  const suggestions = useMemo(() => {
    const query = normalizeText(value);
    const matching = query ? streets.filter((s) => normalizeText(s.street).includes(query)) : streets;
    return matching.filter((s) => s.street !== value).slice(0, MAX_SUGGESTIONS);
  }, [streets, value]);

  const choose = (street: string) => {
    onChange(street);
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
      choose(suggestions[highlighted].street);
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
        placeholder="Ulica lub adres, np. Tumska…"
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
          aria-label="Wyczyść adres"
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
          {suggestions.map((s, i) => (
            <li key={s.street} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                  i === highlighted ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50',
                )}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => choose(s.street)}
              >
                <MapPin className="size-4 shrink-0 text-emerald-700" />
                <span className="flex-1 truncate font-medium">{s.street}</span>
                <span className="text-xs text-slate-500">
                  {s.count} {plantsLabel(s.count)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
