import { MapPin, Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Spinner } from '@/components/shared/Feedback';
import { Input } from '@/components/shared/FormControls';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AddressSuggestion } from './useReverseGeocode';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface AddressAutocompleteProps {
  /** Street currently used as a tree filter (shown as a chip instead of the input). */
  value: string | null;
  /** Called with the picked suggestion: filter trees (when `filter_value`) and fly to the point. */
  onSelect: (suggestion: AddressSuggestion) => void;
  onClear: () => void;
  className?: string;
}

/** "Szukaj po ulicy / adresie": streets from our tree database + Płock addresses (GUGiK). */
export function AddressAutocomplete({ value, onSelect, onClear, className }: AddressAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const listId = useId();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get<AddressSuggestion[]>(`/api/geocode/suggest?q=${encodeURIComponent(trimmed)}`)
        .then((result) => {
          if (cancelled) return;
          setSuggestions(result);
          setHighlighted(0);
        })
        .catch(() => !cancelled && setSuggestions([]))
        .finally(() => !cancelled && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const select = (suggestion: AddressSuggestion) => {
    onSelect(suggestion);
    setQuery('');
    setOpen(false);
  };

  if (value && !open) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-50 px-3 text-sm font-medium text-emerald-900',
          className,
        )}
      >
        <MapPin className="size-4 shrink-0" />
        <span className="flex-1 truncate" title={value}>
          {value}
        </span>
        <button type="button" onClick={onClear} aria-label="Wyczyść filtr adresu" className="rounded p-0.5 hover:bg-emerald-100">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const showList = open && query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className="pl-9 pr-9"
        placeholder="Szukaj po ulicy / adresie…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && showList && suggestions[highlighted]) {
            e.preventDefault();
            select(suggestions[highlighted]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {loading && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[1100] mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {suggestions.length === 0 && !loading && <li className="px-3 py-2 text-sm text-slate-500">Brak podpowiedzi.</li>}
          {suggestions.map((s, index) => (
            <li
              key={`${s.source}:${s.label}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={cn('cursor-pointer px-3 py-2 text-sm', index === highlighted && 'bg-emerald-50')}
            >
              <span className="block font-medium text-slate-900">{s.label}</span>
              <span className="block text-xs text-slate-500">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
