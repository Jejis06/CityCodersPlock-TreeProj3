import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  ExternalLink,
  FileCheck2,
  FileText,
  HardHat,
  History,
  Landmark,
  Lock,
  MapPin,
  Navigation,
  Settings2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shared/Sheet';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { TreeDetails } from '@/types/domain';
import { PhotoLightbox, type LightboxPhoto } from './PhotoLightbox';
import { TaskCreatorForm } from './TaskCreatorForm';
import { TaskTimeline } from './TaskTimeline';
import { TreeHeroHeader } from './TreeHeroHeader';
import { TreeLocationEditor, type RelocateTarget } from './TreeLocationEditor';
import { useTreeDetails } from './useTreeDetails';

const SUCCESS_NOTICE_MS = 4000;

function entriesLabel(count: number): string {
  if (count === 1) return '1 wpis';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${few ? 'wpisy' : 'wpisów'}`;
}

interface TreeCardSheetProps {
  /** `null` zamyka panel. */
  treeId: string | null;
  onClose: () => void;
  /** Wywoływane po zmianie rośliny (np. nowe zadanie, zmiana wykonawcy, przesunięcie punktu) — odśwież mapę. */
  onTreeUpdated?: (tree: TreeDetails) => void;
  /** Wywoływane po usunięciu rośliny. */
  onTreeDeleted?: (treeId: string) => void;
  /** Tryb przesuwania punktu na mapie. */
  relocating?: boolean;
  relocateTarget?: RelocateTarget | null;
  onToggleRelocate?: () => void;
}

/** Karta ewidencyjna rośliny w wysuwanym panelu. Sekcje umowy, edycji i zlecania zadań widzi tylko urzędnik. */
export function TreeCardSheet({
  treeId,
  onClose,
  onTreeUpdated,
  onTreeDeleted,
  relocating = false,
  relocateTarget = null,
  onToggleRelocate,
}: TreeCardSheetProps) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const isOfficial = user?.role === 'official';
  const { details, setDetails, loading, error } = useTreeDetails(treeId);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  useEffect(() => {
    setCreating(false);
    setNotice(null);
    setLightboxPhoto(null);
  }, [treeId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleTaskCreated = (updated: TreeDetails) => {
    setDetails(updated);
    setCreating(false);
    setNotice('Zadanie zlecone wykonawcy. Kolor rośliny na mapie został zaktualizowany.');
    onTreeUpdated?.(updated);
  };

  const handleTreeEdited = (updated: TreeDetails, noticeMessage?: string) => {
    setDetails(updated);
    if (noticeMessage) setNotice(noticeMessage);
    onTreeUpdated?.(updated);
  };

  const handleTreeDeleted = (deletedId: string) => {
    onTreeDeleted?.(deletedId);
    onClose();
  };

  const pendingApprovalTask = details?.tasks.find((t) => t.status === 'pending_approval') ?? null;

  return (
    <>
      <Sheet open={treeId !== null} onOpenChange={(open) => !open && onClose()} modal={false}>
        <SheetContent
          modal={false}
          className="max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {details ? (
            <>
              <TreeHeroHeader tree={details} onOpenPhoto={setLightboxPhoto} />
              <div className="flex flex-col gap-6 p-6">
                {error && <ErrorMessage>{error}</ErrorMessage>}

                {isOfficial && pendingApprovalTask && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/official/queue?taskId=${encodeURIComponent(pendingApprovalTask.id)}`)
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-950 shadow-xs transition hover:bg-amber-100"
                  >
                    <span className="flex items-center gap-2.5">
                      <ClipboardCheck className="size-5 shrink-0 text-amber-700" />
                      <span>To drzewo ma pracę oczekującą na odbiór -&gt; Rozpatrz w kolejce</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-amber-800" />
                  </button>
                )}

                {notice && (
                  <p
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-medium text-emerald-800"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    {notice}
                  </p>
                )}

                <Section title="Parametry" icon={<MapPin />}>
                  <ParametersList tree={details} />
                </Section>

                {isOfficial && (
                  <Section title="Zarządzanie lokalizacją i wykonawcą" icon={<Settings2 />}>
                    <TreeLocationEditor
                      tree={details}
                      relocating={relocating}
                      relocateTarget={relocateTarget}
                      onToggleRelocate={() => onToggleRelocate?.()}
                      onTreeUpdated={handleTreeEdited}
                      onTreeDeleted={handleTreeDeleted}
                    />
                  </Section>
                )}

                {isOfficial && (
                  <Section title="Umowa i finansowanie" icon={<Lock />} tone="sensitive">
                    <ContractDetails tree={details} />
                  </Section>
                )}

                {isOfficial && (
                  <Section title="Zleć nowe zadanie" icon={<ClipboardPlus />}>
                    {creating ? (
                      <TaskCreatorForm
                        tree={details}
                        onCreated={handleTaskCreated}
                        onCancel={() => setCreating(false)}
                      />
                    ) : (
                      <Button className="w-full" onClick={() => setCreating(true)}>
                        <ClipboardPlus />
                        Zleć zadanie
                      </Button>
                    )}
                  </Section>
                )}

                <Section
                  title="Dziennik pielęgnacji i historia prac"
                  icon={<History />}
                  aside={
                    <span className="text-xs font-normal text-slate-500">{entriesLabel(details.tasks.length)}</span>
                  }
                >
                  <TaskTimeline
                    tasks={details.tasks}
                    treeCode={details.code}
                    onOpenPhoto={setLightboxPhoto}
                  />
                </Section>
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Karta ewidencyjna</SheetTitle>
                <SheetDescription>Wczytywanie danych rośliny…</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 items-start justify-center p-6">
                {loading && <Spinner className="size-8" />}
                {error && <ErrorMessage className="w-full">{error}</ErrorMessage>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </>
  );
}

function Section({
  title,
  icon,
  aside,
  tone = 'default',
  children,
}: {
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  tone?: 'default' | 'sensitive';
  children: ReactNode;
}) {
  return (
    <section className={cn(tone === 'sensitive' && 'rounded-lg border border-amber-200 bg-amber-50/60 p-4')}>
      <h3
        className={cn(
          'mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide [&_svg]:size-4',
          tone === 'sensitive' ? 'text-amber-800' : 'text-slate-500',
        )}
      >
        {icon}
        {title}
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-slate-400">
      {icon}
      <dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function ParametersList({ tree }: { tree: TreeDetails }) {
  const isFromDecision = Boolean(tree.is_from_decision);
  return (
    <>
      <dl className="divide-y divide-slate-100">
        <InfoRow icon={<Navigation />} label="Współrzędne">
          <span className="font-mono">
            {tree.latitude.toFixed(6)}, {tree.longitude.toFixed(6)}
          </span>
        </InfoRow>
        <InfoRow icon={<MapPin />} label="Adres">
          {tree.address ?? '—'}
        </InfoRow>
        <InfoRow icon={<Landmark />} label="Działka">
          <span className="break-all font-mono">{tree.plot_number ?? '—'}</span>
        </InfoRow>
        <InfoRow icon={<CalendarDays />} label="Rok posadzenia">
          {tree.planting_year ?? 'Nieznany'}
        </InfoRow>
        <InfoRow icon={<FileCheck2 />} label="Z decyzji">
          {isFromDecision ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-amber-800">Tak</span>
              {tree.decision_number && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
                  {tree.decision_number}
                </span>
              )}
            </span>
          ) : (
            'Nie'
          )}
        </InfoRow>
        <InfoRow icon={<HardHat />} label="Wykonawca">
          {tree.contractor_name ?? 'Nie przypisano'}
        </InfoRow>
      </dl>
      {tree.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tree.notes}</p>}
    </>
  );
}

function ContractDetails({ tree }: { tree: TreeDetails }) {
  const scanUrl = assetUrl(tree.contract_scan_url);
  return (
    <dl>
      <InfoRow icon={<FileText />} label="Numer umowy">
        {tree.contract_number ?? '—'}
      </InfoRow>
      <InfoRow icon={<Banknote />} label="Finansowanie">
        {tree.funding_source ?? '—'}
      </InfoRow>
      <div className="pt-2">
        {scanUrl ? (
          <a
            href={scanUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            <FileText className="size-4" />
            Otwórz skan umowy (PDF)
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <p className="text-sm text-slate-500">Brak skanu umowy.</p>
        )}
      </div>
    </dl>
  );
}
