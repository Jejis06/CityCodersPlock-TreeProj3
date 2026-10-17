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
import { PlantBadge, TaskCategoryChip } from '@/components/shared/PlantBadge';
import { api, assetUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { speciesLabel } from '@/types/domain';
import { RejectionReasonField } from './RejectionReasonField';
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
          <div className="flex flex-wrap items-center gap-2">
            <PlantBadge type={task.tree_type} code={task.tree_code} />
            <TaskCategoryChip category={task.category} subcategory={task.subcategory} />
          </div>
          <DialogTitle>{speciesLabel(task.species_polish_name, task.species_cultivar)}</DialogTitle>
          <DialogDescription>
            <span className="italic">{task.species_latin_name}</span> · {task.tree_address ?? 'brak adresu'}
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

          {rejecting && <RejectionReasonField value={reason} onChange={setReason} />}
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>

        <DialogFooter className="flex-wrap">
          {rejecting ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                Wstecz
              </Button>
              <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void decide('reject')}>
                <Undo2 /> Zwróć wykonawcy do poprawy
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                <Undo2 /> Odrzuć / Do poprawy
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
