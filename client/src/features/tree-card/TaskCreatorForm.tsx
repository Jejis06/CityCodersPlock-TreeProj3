import { ArrowRight, Paperclip, Send, Upload } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label, Textarea } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TASK_SUBCATEGORIES,
  TASK_SUBCATEGORY_LABELS,
  TREE_STATUS_FOR_CATEGORY,
  TREE_STATUS_META,
  type TaskCategory,
  type TaskSubcategory,
  type TreeDetails,
} from '@/types/domain';

const CATEGORIES = Object.keys(TASK_SUBCATEGORIES) as TaskCategory[];

const DEFAULT_SUBCATEGORY: Record<TaskCategory, TaskSubcategory> = {
  pielegnacja: 'nawozenie',
  wycinka: 'wycinka',
  nasadzanie: 'korowanie',
};

interface TaskCreatorFormProps {
  tree: TreeDetails;
  onCreated: (tree: TreeDetails) => void;
  onCancel: () => void;
}

export function TaskCreatorForm({ tree, onCreated, onCancel }: TaskCreatorFormProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<TaskCategory>('pielegnacja');
  const [subcategory, setSubcategory] = useState<TaskSubcategory>(DEFAULT_SUBCATEGORY.pielegnacja);
  const [contractNumber, setContractNumber] = useState(tree.contract_number ?? '');
  const [contractScanUrl, setContractScanUrl] = useState(tree.contract_scan_url ?? '');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatus = TREE_STATUS_FOR_CATEGORY[category];

  const changeCategory = (next: TaskCategory) => {
    setCategory(next);
    setSubcategory(DEFAULT_SUBCATEGORY[next]);
  };

  const uploadScan = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.upload(file);
      setContractScanUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać skanu.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contractNumber.trim()) return setError('Podaj numer umowy.');
    setSaving(true);
    setError(null);
    try {
      const updated = await api.post<TreeDetails>(`/api/trees/${encodeURIComponent(tree.id)}/tasks`, {
        category,
        subcategory,
        contract_number: contractNumber,
        contract_scan_url: contractScanUrl,
        description,
      });
      onCreated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zlecić zadania.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="space-y-1.5">
        <Label>Kategoria</Label>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => changeCategory(c)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
                category === c ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <StatusDot status={TREE_STATUS_FOR_CATEGORY[c]} />
              {TASK_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Podkategoria</Label>
        <div className="flex flex-wrap gap-2">
          {TASK_SUBCATEGORIES[category].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={subcategory === s}
              onClick={() => setSubcategory(s)}
              className={cn(
                'h-8 rounded-full px-3 text-sm font-medium ring-1 transition-colors',
                subcategory === s
                  ? 'bg-emerald-100 text-emerald-900 ring-emerald-600'
                  : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
              )}
            >
              {TASK_SUBCATEGORY_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-contract`}>Numer umowy</Label>
        <Input
          id={`${id}-contract`}
          placeholder="np. UM/ZZ/2026/014"
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-scan`}>Skan umowy (opcjonalnie)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Paperclip className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id={`${id}-scan`}
              className="pl-9"
              placeholder="URL lub nazwa pliku PDF"
              value={contractScanUrl}
              onChange={(e) => setContractScanUrl(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Spinner className="size-4" /> : <Upload />}
            Wgraj
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => void uploadScan(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-description`}>Opis dla wykonawcy (opcjonalnie)</Label>
        <Textarea
          id={`${id}-description`}
          className="min-h-16"
          placeholder="np. Usunąć suche konary od strony jezdni."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <p className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 text-sm text-slate-600 ring-1 ring-slate-200">
        Status rośliny:
        <span className="inline-flex items-center gap-1.5 font-medium">
          <StatusDot status={tree.status} />
          {TREE_STATUS_META[tree.status].label}
        </span>
        <ArrowRight className="size-4 text-slate-400" />
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
          <StatusDot status={nextStatus} />
          {TREE_STATUS_META[nextStatus].label}
        </span>
      </p>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Anuluj
        </Button>
        <Button type="submit" disabled={saving || uploading}>
          {saving ? <Spinner className="size-4 text-white" /> : <Send />}
          Zleć zadanie
        </Button>
      </div>
    </form>
  );
}
