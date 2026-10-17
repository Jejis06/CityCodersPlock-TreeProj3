import { ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { EmptyState } from '@/components/shared/Feedback';

export function ApprovalQueuePage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Kolejka zatwierdzeń</h1>
      <p className="mt-1 text-slate-500">Zadania wykonane przez wykonawcę, czekające na decyzję urzędnika.</p>
      <Card className="mt-6">
        <EmptyState
          icon={<ClipboardCheck />}
          title="Kolejka w przygotowaniu"
          description="Lista zadań z blokadą MUTEX oraz akcjami Zatwierdź / Odrzuć powstaje na branchu feat/approval-queue-mutex."
        />
      </Card>
    </div>
  );
}
