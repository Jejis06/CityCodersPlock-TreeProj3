import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
  ImageOff,
  Maximize2,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, type BadgeProps } from '@/components/shared/Badge';
import { EmptyState } from '@/components/shared/Feedback';
import { assetUrl } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  TASK_SUBCATEGORY_LABELS,
  type TaskHistoryItem,
  type TaskStatus,
} from '@/types/domain';
import { PhotoLightbox, taskToLightboxPhoto, type LightboxPhoto } from './PhotoLightbox';

const TASK_STATUS_STYLE: Record<TaskStatus, { badge: BadgeProps['variant']; dot: string; icon: ReactNode }> = {
  assigned: { badge: 'info', dot: 'bg-blue-600', icon: <ClipboardList /> },
  pending_approval: { badge: 'warning', dot: 'bg-amber-500', icon: <Clock /> },
  approved: { badge: 'default', dot: 'bg-emerald-600', icon: <CheckCircle2 /> },
  rejected: { badge: 'destructive', dot: 'bg-red-600', icon: <XCircle /> },
};

interface TaskTimelineProps {
  tasks: TaskHistoryItem[];
  treeCode?: string;
  onOpenPhoto?: (photo: LightboxPhoto) => void;
}

export function TaskTimeline({ tasks, treeCode, onOpenPhoto }: TaskTimelineProps) {
  const [internalPhoto, setInternalPhoto] = useState<LightboxPhoto | null>(null);
  const handleOpenPhoto = onOpenPhoto ?? setInternalPhoto;

  if (tasks.length === 0) {
    return (
      <EmptyState
        className="rounded-lg border border-dashed border-slate-200 p-6"
        icon={<ClipboardList />}
        title="Brak zabiegów"
        description="Dla tej rośliny nie zlecono jeszcze żadnych prac."
      />
    );
  }

  return (
    <>
      <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
        {tasks.map((task) => (
          <TimelineItem key={task.id} task={task} treeCode={treeCode} onOpenPhoto={handleOpenPhoto} />
        ))}
      </ol>
      {!onOpenPhoto && <PhotoLightbox photo={internalPhoto} onClose={() => setInternalPhoto(null)} />}
    </>
  );
}

function TimelineItem({
  task,
  treeCode,
  onOpenPhoto,
}: {
  task: TaskHistoryItem;
  treeCode?: string;
  onOpenPhoto: (photo: LightboxPhoto) => void;
}) {
  const style = TASK_STATUS_STYLE[task.status];
  const photoUrl = assetUrl(task.contractor_photo_url);
  const lightboxPhoto = taskToLightboxPhoto(task, treeCode);

  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[33px] top-1 flex size-4 items-center justify-center rounded-full ring-4 ring-white',
          style.dot,
        )}
      />
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">
              {TASK_CATEGORY_LABELS[task.category]}: {TASK_SUBCATEGORY_LABELS[task.subcategory]}
            </p>
            <p className="text-xs text-slate-500">Zlecono {formatDateTime(task.created_at)}</p>
          </div>
          <Badge variant={style.badge}>
            {style.icon}
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        </div>

        <dl className="mt-2 space-y-1 text-sm">
          <Row icon={<HardHat />} label="Wykonawca" value={task.assigned_to_name ?? 'Nie przypisano'} />
          {task.completed_at && <Row icon={<Clock />} label="Wykonano" value={formatDateTime(task.completed_at)} />}
          {task.reviewed_at && (
            <Row
              icon={task.status === 'rejected' ? <XCircle /> : <CheckCircle2 />}
              label={task.status === 'rejected' ? 'Odrzucono' : 'Zatwierdzono'}
              value={`${formatDateTime(task.reviewed_at)}${task.reviewed_by_name ? ` · ${task.reviewed_by_name}` : ''}`}
            />
          )}
          {task.contract_number && <Row icon={<FileText />} label="Umowa" value={task.contract_number} />}
        </dl>

        {task.description && <p className="mt-2 text-sm text-slate-600">{task.description}</p>}

        {(task.contractor_comment || photoUrl) && (
          <div className="mt-3 flex gap-3 rounded-lg bg-slate-50 p-2">
            {photoUrl && lightboxPhoto ? (
              <button
                type="button"
                onClick={() => onOpenPhoto(lightboxPhoto)}
                className="group relative shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200 transition hover:ring-2 hover:ring-emerald-600 focus:outline-none"
                title="Kliknij, aby powiększyć zdjęcie na pełny ekran"
              >
                <img
                  src={photoUrl}
                  alt={`Zdjęcie: ${TASK_SUBCATEGORY_LABELS[task.subcategory]}`}
                  className="size-20 object-cover transition group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/45 group-hover:opacity-100">
                  <Maximize2 className="size-5 drop-shadow-xs" />
                </span>
              </button>
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                <ImageOff className="size-6" />
              </div>
            )}
            <p className="flex gap-1.5 text-sm text-slate-700">
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-slate-400" />
              {task.contractor_comment ?? <span className="italic text-slate-400">Brak komentarza wykonawcy</span>}
            </p>
          </div>
        )}

        {task.official_rejection_reason && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
            <span className="font-semibold">Powód odrzucenia: </span>
            {task.official_rejection_reason}
          </p>
        )}
      </div>
    </li>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-slate-400">
      {icon}
      <dt className="w-24 shrink-0">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
