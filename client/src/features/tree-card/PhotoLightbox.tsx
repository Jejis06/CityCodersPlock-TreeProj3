import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Calendar, ExternalLink, HardHat, MessageSquare, X } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { assetUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  TASK_SUBCATEGORY_LABELS,
  type TaskHistoryItem,
  type TaskStatus,
} from '@/types/domain';

export interface LightboxPhoto {
  url: string;
  title: string;
  dateLabel: string;
  contractorName: string | null;
  description: string | null;
  status?: TaskStatus;
  treeCode?: string;
}

export function taskToLightboxPhoto(task: TaskHistoryItem, treeCode?: string): LightboxPhoto | null {
  const url = assetUrl(task.contractor_photo_url);
  if (!url) return null;
  const dateSource = task.completed_at ?? task.reviewed_at ?? task.created_at;
  const descriptionParts = [task.contractor_comment, task.description].filter(Boolean);
  return {
    url,
    title: `${TASK_CATEGORY_LABELS[task.category]}: ${TASK_SUBCATEGORY_LABELS[task.subcategory]}`,
    dateLabel: formatDateTime(dateSource),
    contractorName: task.assigned_to_name,
    description: descriptionParts.length > 0 ? descriptionParts.join(' — ') : null,
    status: task.status,
    treeCode,
  };
}

interface PhotoLightboxProps {
  photo: LightboxPhoto | null;
  onClose: () => void;
}

/** Pełnoekranowy podgląd zdjęcia z historii prac (Lightbox) z metadanymi zabiegu. */
export function PhotoLightbox({ photo, onClose }: PhotoLightboxProps) {
  return (
    <DialogPrimitive.Root open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2100] bg-slate-950/85 backdrop-blur-xs" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[2101] flex max-h-[92vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/15 focus:outline-none">
          {photo && (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {photo.treeCode && (
                    <span className="rounded-md bg-emerald-600 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {photo.treeCode}
                    </span>
                  )}
                  <DialogPrimitive.Title className="truncate text-base font-semibold text-white">
                    {photo.title}
                  </DialogPrimitive.Title>
                  {photo.status && (
                    <Badge variant={photo.status === 'approved' ? 'default' : 'secondary'}>
                      {TASK_STATUS_LABELS[photo.status]}
                    </Badge>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-medium text-slate-200 transition hover:bg-white/20 hover:text-white"
                  >
                    <ExternalLink className="size-3.5" />
                    Oryginał
                  </a>
                  <DialogPrimitive.Close asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg p-0 text-slate-300 hover:bg-white/15 hover:text-white"
                    >
                      <X className="size-4" />
                      <span className="sr-only">Zamknij</span>
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-4">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
                />
              </div>

              <div className="flex flex-col gap-2 border-t border-white/10 bg-slate-900/95 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-4 text-emerald-400" />
                    <span className="text-slate-400">Data wykonania:</span>
                    <strong className="font-medium text-white">{photo.dateLabel}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <HardHat className="size-4 text-emerald-400" />
                    <span className="text-slate-400">Wykonawca:</span>
                    <strong className="font-medium text-white">{photo.contractorName ?? 'Nie przypisano'}</strong>
                  </span>
                </div>

                <DialogPrimitive.Description asChild>
                  <div className="flex items-start gap-2 text-slate-200">
                    <MessageSquare className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <span>
                      {photo.description ?? (
                        <span className="italic text-slate-400">Brak dodatkowego opisu wykonawcy.</span>
                      )}
                    </span>
                  </div>
                </DialogPrimitive.Description>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
