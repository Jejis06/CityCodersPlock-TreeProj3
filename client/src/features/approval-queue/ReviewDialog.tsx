import { CheckCircle2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/Dialog';
import { ErrorMessage } from '@/components/shared/Feedback';
import { Label, Textarea } from '@/components/shared/FormControls';
import { api, assetUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { speciesLabel, TASK_CATEGORY_LABELS, TASK_SUBCATEGORY_LABELS } from '@/types/domain';
import type { QueueTask } from './types';

interface ReviewDialogProps {
  task: QueueTask;
  onClose: () => void;
}

/** Modal weryfikacji. Blokada jest już przejęta (POST /lock); zamknięcie bez decyzji zwalnia ją. */
export function ReviewDialog({ task, onClose }: ReviewDialogProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decided = useRef(false);

  // Blokada wygasa po 5 min — odświeżamy ją, dopóki modal jest otwarty.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!decided.current) void api.post(`/api/tasks/${task.id}/lock`).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [task.id]);

  const close = () => {
    if (!decided.current) void api.post(`/api/tasks/${task.id}/unlock`).catch(() => undefined);
    onClose();
  };

  const decide = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !reason.trim()) {
      setError('Podaj powód odrzucenia.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${task.id}/${action}`, action === 'reject' ? { reason: reason.trim() } : undefined);
      decided.current = true;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operacja nie powiodła się.');
      setBusy(false);
    }
  };

  const photo = assetUrl(task.contractor_photo_url);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {task.tree_code} — {TASK_CATEGORY_LABELS[task.category]}: {TASK_SUBCATEGORY_LABELS[task.subcategory]}
          </DialogTitle>
          <DialogDescription>
            {speciesLabel(task.species_polish_name, task.species_cultivar)} · {task.tree_address ?? 'brak adresu'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {photo ? (
            <img src={photo} alt="Zdjęcie wykonawcy" className="max-h-64 w-full rounded-lg border object-cover" />
          ) : (
            <p className="text-slate-500">Brak zdjęcia.</p>
          )}
          <p>
            <span className="font-medium">Zgłoszono:</span> {formatDateTime(task.completed_at)}
          </p>
          <p>
            <span className="font-medium">Komentarz wykonawcy:</span> {task.contractor_comment ?? '—'}
          </p>
          {task.official_rejection_reason && (
            <p className="text-slate-500">
              <span className="font-medium">Poprzednie odrzucenie:</span> {task.official_rejection_reason}
            </p>
          )}

          {rejecting && (
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Powód odrzucenia (wymagany)</Label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Co wykonawca musi poprawić?"
                autoFocus
              />
            </div>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>

        <DialogFooter className="flex-wrap">
          {rejecting ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                Wstecz
              </Button>
              <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void decide('reject')}>
                <Undo2 /> Odrzuć i zwróć wykonawcy
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                <Undo2 /> Odrzuć i zwróć wykonawcy
              </Button>
              <Button disabled={busy} onClick={() => void decide('approve')}>
                <CheckCircle2 /> Zatwierdź pracę (wraca do zielonego)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
