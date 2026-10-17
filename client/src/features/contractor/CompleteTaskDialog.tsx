import { Camera, ImagePlus, Send, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/Dialog';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Label, Textarea } from '@/components/shared/FormControls';
import { api, assetUrl } from '@/lib/api';
import { speciesLabel, TASK_CATEGORY_LABELS, TASK_SUBCATEGORY_LABELS } from '@/types/domain';
import { DEMO_PHOTOS, type ContractorTask } from './types';

interface CompleteTaskDialogProps {
  task: ContractorTask | null;
  onClose: () => void;
  onCompleted: () => void;
}

export function CompleteTaskDialog({ task, onClose, onCompleted }: CompleteTaskDialogProps) {
  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {task && <CompleteTaskForm key={task.id} task={task} onCompleted={onCompleted} />}
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskForm({ task, onCompleted }: { task: ContractorTask; onCompleted: () => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setPhotoUrl((await api.upload(file)).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!photoUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${task.id}/complete`, {
        photo_url: photoUrl,
        comment: comment.trim() || undefined,
      });
      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zgłosić wykonania.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl">Wykonaj zadanie</DialogTitle>
        <DialogDescription>Dodaj zdjęcie potwierdzające wykonanie pracy.</DialogDescription>
      </DialogHeader>

      <div className="rounded-xl bg-slate-100 p-4">
        <p className="text-2xl font-bold">{task.tree_code}</p>
        <p className="text-base text-slate-700">{speciesLabel(task.species_polish_name, task.species_cultivar)}</p>
        <p className="mt-2 text-lg font-semibold text-emerald-800">
          {TASK_CATEGORY_LABELS[task.category]}: {TASK_SUBCATEGORY_LABELS[task.subcategory]}
        </p>
        {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}
      </div>

      <div className="mt-5 space-y-3">
        <Label>Zdjęcie (wymagane)</Label>
        {photoUrl && (
          <img
            src={assetUrl(photoUrl)}
            alt="Podgląd zdjęcia wykonania"
            className="h-44 w-full rounded-xl border border-slate-200 object-cover"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button size="touch" variant="secondary" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Spinner /> : <Upload />}
          {photoUrl ? 'Zmień zdjęcie' : 'Wgraj zdjęcie z urządzenia'}
        </Button>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_PHOTOS.map((photo) => (
            <Button
              key={photo.url}
              variant={photoUrl === photo.url ? 'default' : 'outline'}
              className="h-14 flex-col gap-0 whitespace-normal text-center text-xs leading-tight"
              onClick={() => setPhotoUrl(photo.url)}
            >
              <ImagePlus />
              Użyj zdjęcia demo: {photo.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="contractor-comment">Komentarz (opcjonalnie)</Label>
        <Textarea
          id="contractor-comment"
          rows={3}
          className="text-base"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="np. Podlano 40 l, gleba sucha."
        />
      </div>

      {error && <ErrorMessage className="mt-4">{error}</ErrorMessage>}

      <Button size="touch" className="mt-6 w-full" disabled={!photoUrl || submitting || uploading} onClick={() => void submit()}>
        {submitting ? <Spinner className="text-white" /> : <Send />}
        Zgłoś wykonanie
      </Button>
      {!photoUrl && (
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-slate-500">
          <Camera className="size-4" /> Najpierw dodaj zdjęcie.
        </p>
      )}
    </>
  );
}
