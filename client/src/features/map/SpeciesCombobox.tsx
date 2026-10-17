import { Search, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Spinner } from '@/components/shared/Feedback';
import { Input } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';
import { PLANT_TYPE_LABELS, speciesLabel, type PlantType, type Species } from '@/types/domain';
import { useSpecies } from './useSpecies';

interface SpeciesComboboxProps {
  value: Species | null;
  onChange: (species: Species | null) => void;
  /** Restricts the dictionary to trees or shrubs. */
  type?: PlantType | null;
  placeholder?: string;
  id?: string;
  className?: string;
}

export function SpeciesCombobox({
  value,
  onChange,
  type = null,
  placeholder = 'Szukaj gatunku…',
  id,
  className,
}: SpeciesComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const { species, loading, error } = useSpecies(query, type);
  const listId = useId();

  const select = (item: Species) => {
    onChange(item);
    setQuery('');
    setOpen(false);
  };

  if (value && !open) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm',
          className,
        )}
      >
        <button
          type="button"
          id={id}
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => setOpen(true)}
          title={value.latin_name}
        >
          <span className="font-medium text-slate-900">{speciesLabel(value.polish_name, value.cultivar)}</span>{' '}
          <span className="italic text-slate-500">{value.latin_name}</span>
        </button>
        <button
          type="button"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onChange(null)}
          aria-label="Wyczyść gatunek"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className="pl-9"
        placeholder={placeholder}
        value={query}
        autoFocus={open && value !== null}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, species.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && species[highlighted]) {
            e.preventDefault();
            select(species[highlighted]);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {loading && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[2100] mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {error && <li className="px-3 py-2 text-sm text-red-700">{error}</li>}
          {!error && !loading && species.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Brak gatunków dla „{query}”.</li>
          )}
          {species.map((item, index) => (
            <li
              key={item.id}
              role="option"
              aria-selected={value?.id === item.id}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm',
                index === highlighted ? 'bg-emerald-50' : 'hover:bg-slate-50',
              )}
              onMouseEnter={() => setHighlighted(index)}
              // keep focus in the input so onBlur doesn't close the list before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(item)}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-slate-900">{speciesLabel(item.polish_name, item.cultivar)}</span>{' '}
                <span className="italic text-slate-500">{item.latin_name}</span>
              </span>
              {!type && <span className="shrink-0 text-xs text-slate-400">{PLANT_TYPE_LABELS[item.type]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
