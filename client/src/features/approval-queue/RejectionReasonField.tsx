import { Check, MessageSquareWarning, Plus } from 'lucide-react';
import { Label, Textarea } from '@/components/shared/FormControls';
import { cn } from '@/lib/utils';

export const REJECTION_HINTS = [
  'Brak wymaganej warstwy kory',
  'Niewystarczające podlanie',
  'Krzywo wbity palik',
  'Nieprawidłowe zdjęcie',
  'Zdjęcie nie pokazuje całej rośliny',
  'Prace wykonane przy niewłaściwej roślinie',
] as const;

interface RejectionReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const toLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Uwagi dla wykonawcy przy odrzuceniu: pole tekstowe + chipy szybkich podpowiedzi (dopisują/usuwają linię). */
export function RejectionReasonField({ value, onChange }: RejectionReasonFieldProps) {
  const lines = toLines(value);

  const toggleHint = (hint: string) => {
    onChange((lines.includes(hint) ? lines.filter((l) => l !== hint) : [...lines, hint]).join('\n'));
  };

  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
      <Label htmlFor="reject-reason" className="flex items-center gap-1.5 text-red-900">
        <MessageSquareWarning className="size-4" />
        Opisz dokładnie, co zostało wykonane nieprawidłowo (informacja dla wykonawcy)
      </Label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Szybkie podpowiedzi">
        {REJECTION_HINTS.map((hint) => {
          const active = lines.includes(hint);
          return (
            <button
              key={hint}
              type="button"
              aria-pressed={active}
              onClick={() => toggleHint(hint)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition',
                active
                  ? 'bg-red-600 text-white ring-red-600'
                  : 'bg-white text-red-800 ring-red-300 hover:bg-red-100',
              )}
            >
              {active ? <Check className="size-3" /> : <Plus className="size-3" />}
              {hint}
            </button>
          );
        })}
      </div>
      <Textarea
        id="reject-reason"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="np. Palik przy D3/2026 stoi pod kątem ok. 30°, należy go wbić pionowo i ponownie przywiązać drzewo."
        className="bg-white"
        autoFocus
      />
      <p className="text-xs text-red-700">Wymagane — treść zobaczy wykonawca w boksie „Do poprawy”.</p>
    </div>
  );
}
