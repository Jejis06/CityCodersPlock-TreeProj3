import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  HardHat,
  History,
  Landmark,
  Lock,
  MapPin,
  ExternalLink,
  Navigation,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { Button } from '@/components/shared/Button';
import { ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shared/Sheet';
import { StatusDot } from '@/components/shared/StatusDot';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PLANT_TYPE_LABELS, speciesLabel, TREE_STATUS_META, type TreeDetails } from '@/types/domain';
import { TaskCreatorForm } from './TaskCreatorForm';
import { TaskTimeline } from './TaskTimeline';
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
  /** Wywoływane po zmianie rośliny (np. nowe zadanie zmieniło jej kolor) — odśwież mapę. */
  onTreeUpdated?: (tree: TreeDetails) => void;
}

/** Karta ewidencyjna rośliny w wysuwanym panelu. Sekcje umowy i zlecania zadań widzi tylko urzędnik. */
export function TreeCardSheet({ treeId, onClose, onTreeUpdated }: TreeCardSheetProps) {
  const { user } = useCurrentUser();
  const isOfficial = user?.role === 'official';
  const { details, setDetails, loading, error } = useTreeDetails(treeId);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCreating(false);
    setNotice(null);
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

  return (
    <Sheet open={treeId !== null} onOpenChange={(open) => !open && onClose()} modal={false}>
      <SheetContent
        modal={false}
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {details ? (
          <>
            <CardHeader tree={details} />
            <div className="flex flex-col gap-6 p-6">
              {error && <ErrorMessage>{error}</ErrorMessage>}

              <Section title="Parametry" icon={<MapPin />}>
                <ParametersList tree={details} />
              </Section>

              {isOfficial && (
                <Section title="Umowa i finansowanie" icon={<Lock />} tone="sensitive">
                  <ContractDetails tree={details} />
                </Section>
              )}

              {isOfficial && (
                <Section title="Zleć nowe zadanie" icon={<ClipboardPlus />}>
                  {notice && (
                    <p
                      role="status"
                      className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
                    >
                      <CheckCircle2 className="size-4 shrink-0" />
                      {notice}
                    </p>
                  )}
                  {creating ? (
                    <TaskCreatorForm tree={details} onCreated={handleTaskCreated} onCancel={() => setCreating(false)} />
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
                aside={<span className="text-xs font-normal text-slate-500">{entriesLabel(details.tasks.length)}</span>}
              >
                <TaskTimeline tasks={details.tasks} />
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
  );
}

function CardHeader({ tree }: { tree: TreeDetails }) {
  const status = TREE_STATUS_META[tree.status];
  return (
    <SheetHeader className="bg-slate-50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-bold text-white">{tree.code}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${status.color}1f`, color: status.color }}
        >
          <StatusDot status={tree.status} shape={tree.type === 'shrub' ? 'square' : 'circle'} className="size-3" />
          {status.label}
        </span>
      </div>
      <SheetTitle>{speciesLabel(tree.species_polish_name, tree.species_cultivar)}</SheetTitle>
      <SheetDescription className="italic">
        {tree.species_latin_name} · {PLANT_TYPE_LABELS[tree.type]}
      </SheetDescription>
    </SheetHeader>
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
          {tree.planting_year ?? '—'}
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
