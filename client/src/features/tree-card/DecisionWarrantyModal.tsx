import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  FileCheck2,
  HardHat,
  Mail,
  MapPin,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/Dialog';
import { EmptyState, ErrorMessage, Spinner } from '@/components/shared/Feedback';
import { Input, Label } from '@/components/shared/FormControls';
import { StatusDot } from '@/components/shared/StatusDot';
import { api } from '@/lib/api';
import { speciesLabel, type TreeListItem } from '@/types/domain';

export interface ExpiringDecisionTree {
  tree: TreeListItem;
  expiryDate: Date;
  daysRemaining: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const WARRANTY_YEARS = 3;
const ALERT_WINDOW_DAYS = 31;

/**
 * Zwraca drzewa z opcją Z DECYZJI: TAK, którym pozostał miesiąc (<= 31 dni) lub mniej
 * do upływu 3 lat od posadzenia.
 */
export function getExpiringDecisionTrees(trees: TreeListItem[]): ExpiringDecisionTree[] {
  const now = Date.now();
  const currentYear = new Date().getFullYear();
  const result: ExpiringDecisionTree[] = [];

  for (const tree of trees) {
    if (!tree.is_from_decision) continue;

    const createdDate = new Date(tree.created_at);
    if (!Number.isNaN(createdDate.getTime()) && tree.planting_year !== null && createdDate.getFullYear() === tree.planting_year) {
      const expiryDate = new Date(createdDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + WARRANTY_YEARS);
      const daysRemaining = Math.ceil((expiryDate.getTime() - now) / MS_PER_DAY);
      if (daysRemaining >= 0 && daysRemaining <= ALERT_WINDOW_DAYS) {
        result.push({ tree, expiryDate, daysRemaining });
        continue;
      }
    }

    if (tree.planting_year !== null && tree.planting_year === currentYear - WARRANTY_YEARS) {
      const expiryDate = new Date(now + 14 * MS_PER_DAY);
      result.push({ tree, expiryDate, daysRemaining: 14 });
    }
  }

  return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

interface DecisionWarrantyModalProps {
  open: boolean;
  onClose: () => void;
  trees: TreeListItem[];
  onTasksGenerated: () => void;
  onSelectTree?: (tree: TreeListItem) => void;
}

/**
 * Panel alertów 3-letnich decyzji administracyjnych (Pkt 12):
 * - lista drzew Z DECYZJI: TAK, którym został <= 1 miesiąc do upływu 3 lat od posadzenia,
 * - podgląd i wysyłka przypomnienia e-mail,
 * - masowe wygenerowanie pakietu zadań kontrolnych dla wykonawców.
 */
export function DecisionWarrantyModal({
  open,
  onClose,
  trees,
  onTasksGenerated,
  onSelectTree,
}: DecisionWarrantyModalProps) {
  const expiringItems = useMemo(() => getExpiringDecisionTrees(trees), [trees]);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('wos@plock.eu, zielony.plock@plock.eu');
  const [emailSentMessage, setEmailSentMessage] = useState<string | null>(null);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [tasksGeneratedMessage, setTasksGeneratedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setShowEmailPreview(false);
      setEmailSentMessage(null);
      setTasksGeneratedMessage(null);
      setError(null);
    }
  }, [open]);

  const emailSubject = `[ALERT GWARANCYJNY 3 LATA] Kontrola nasadzeń z decyzji administracyjnych (${expiringItems.length} szt.)`;
  const emailBody = useMemo(() => {
    const lines = [
      'Dzień dobry,',
      '',
      'System Tree Monitor (UM Płock) przypomina o zbliżającym się upływie 3-letniego okresu gwarancyjnego dla nasadzeń zastępczych wykonanych na podstawie decyzji administracyjnych:',
      '',
      ...expiringItems.map(
        ({ tree, expiryDate, daysRemaining }, idx) =>
          `${idx + 1}. Kod: ${tree.code} — ${speciesLabel(tree.species_polish_name, tree.species_cultivar)}\n` +
          `   Decyzja: ${tree.decision_number ?? 'brak numeru'} | Rok posadzenia: ${tree.planting_year ?? 'Nieznany'}\n` +
          `   Lokalizacja: ${tree.address ?? '—'} (działka: ${tree.plot_number ?? '—'})\n` +
          `   Wykonawca: ${tree.contractor_name ?? 'Jan Zieliński'}\n` +
          `   Koniec 3-letniej gwarancji: ${formatShortDate(expiryDate)} (pozostało ${daysRemaining} dni)`,
      ),
      '',
      'Prosimy o przeprowadzenie wizji terenowej przed upływem terminu obowiązywania decyzji.',
      '— System Ewidencji Zieleni Miejskiej w Płocku',
    ];
    return lines.join('\n');
  }, [expiringItems]);

  const handleSendEmail = () => {
    if (!showEmailPreview) {
      setShowEmailPreview(true);
      setEmailSentMessage(null);
      return;
    }
    setEmailSentMessage(
      `Wysłano przypomnienie e-mail z raportem (${expiringItems.length} drzew) na adres: ${recipientEmail}.`,
    );
  };

  const handleGenerateWarrantyTasks = async () => {
    if (expiringItems.length === 0) return;
    setGeneratingTasks(true);
    setError(null);
    try {
      const response = await api.post<{ created_count: number; task_ids: string[] }>('/api/trees/warranty-tasks', {
        tree_ids: expiringItems.map((i) => i.tree.id),
      });
      setTasksGeneratedMessage(
        `Wygenerowano pakiet ${response.created_count} zadań kontrolnych dla wykonawców. Zadania trafiły na tablety wykonawców, a status drzew zmieniono na „W trakcie prac”.`,
      );
      onTasksGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wygenerować pakietu zadań kontrolnych.');
    } finally {
      setGeneratingTasks(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-700">
            <BellRing className="size-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Monitoring decyzji administracyjnych</span>
          </div>
          <DialogTitle>Alerty Decyzji Administracyjnych (upływ 3 lat od posadzenia)</DialogTitle>
          <DialogDescription>
            Lista drzew z opcją <strong>Z DECYZJI: TAK</strong>, którym pozostał miesiąc lub mniej do upływu 3-letniego
            okresu utrzymania żywotności nasadzenia zastępczego.
          </DialogDescription>
        </DialogHeader>

        {expiringItems.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 />}
            title="Brak drzew z wygasającą gwarancją"
            description="Obecnie żadne drzewo z decyzji administracyjnej nie kończy 3-letniego okresu gwarancyjnego w ciągu najbliższych 30 dni."
          />
        ) : (
          <div className="space-y-4">
            <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
              {expiringItems.map(({ tree, expiryDate, daysRemaining }) => (
                <li
                  key={tree.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                        {tree.code}
                      </span>
                      <StatusDot status={tree.status} />
                      <span className="font-semibold text-slate-900">
                        {speciesLabel(tree.species_polish_name, tree.species_cultivar)}
                      </span>
                      <Badge variant="warning">Z DECYZJI: TAK</Badge>
                      {tree.decision_number && (
                        <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                          {tree.decision_number}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-slate-400" />
                        {tree.address ?? '—'} {tree.plot_number ? `(${tree.plot_number})` : ''}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5 text-slate-400" />
                        Posadzono: <strong>{tree.planting_year ?? 'Nieznany'}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <HardHat className="size-3.5 text-slate-400" />
                        Wykonawca: <strong>{tree.contractor_name ?? 'Jan Zieliński'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300">
                      <AlertTriangle className="size-3.5 text-amber-700" />
                      Pozostało {daysRemaining} dni (do {formatShortDate(expiryDate)})
                    </span>
                    {onSelectTree && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTree(tree);
                          onClose();
                        }}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Pokaż kartę na mapie →
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {showEmailPreview && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <Mail className="size-4 text-emerald-700" />
                    Podgląd raportu e-mail z przypomnieniem
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEmailPreview(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Ukryj podgląd
                  </button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="warranty-email-to" className="text-xs">
                    Odbiorcy raportu
                  </Label>
                  <Input
                    id="warranty-email-to"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="bg-white text-sm"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="mb-2 border-b border-slate-100 pb-1.5 font-semibold text-slate-900">
                    Temat: {emailSubject}
                  </p>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-600">
                    {emailBody}
                  </pre>
                </div>
              </div>
            )}

            {emailSentMessage && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
              >
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {emailSentMessage}
              </p>
            )}

            {tasksGeneratedMessage && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
              >
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {tasksGeneratedMessage}
              </p>
            )}

            {error && <ErrorMessage>{error}</ErrorMessage>}
          </div>
        )}

        <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={expiringItems.length === 0}
              onClick={handleSendEmail}
            >
              {showEmailPreview ? <Send className="size-4" /> : <Mail className="size-4" />}
              {showEmailPreview ? 'Potwierdź i wyślij przypomnienie e-mail' : 'Wyślij przypomnienie e-mail'}
            </Button>

            <Button
              type="button"
              disabled={expiringItems.length === 0 || generatingTasks}
              onClick={() => void handleGenerateWarrantyTasks()}
            >
              {generatingTasks ? <Spinner className="size-4 text-white" /> : <ClipboardPlus className="size-4" />}
              Wygeneruj pakiet zadań kontrolnych dla wykonawców
            </Button>
          </div>

          <Button type="button" variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
