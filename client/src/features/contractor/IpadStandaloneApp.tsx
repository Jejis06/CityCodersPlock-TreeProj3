import { useEffect, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useCurrentUser } from '@/app/CurrentUserContext';
import { TreeDeciduous } from 'lucide-react';
import type { User } from '@/types/domain';
import { ContractorPage } from './ContractorPage';

/** Hard-wired contractor account used by the iPad web-app (Jan Zieliński). */
const IPAD_CONTRACTOR: User = {
  id: '33333333-3333-3333-3333-333333333333',
  full_name: 'Jan Zieliński',
  role: 'contractor',
  device: 'tablet',
};

const COMPANY_NAME = 'Eko-Ogrody Płock';

/** Header of the field app: no role switcher, no logout, no tablet-frame toggle. */
function IpadHeader() {
  return (
    <>
      <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600">
        <TreeDeciduous className="size-6" />
      </div>
      <div>
        <p className="text-lg font-bold leading-tight">Tree Monitor Field • Płock</p>
        <p className="text-sm text-emerald-100">{COMPANY_NAME}</p>
      </div>
      <div className="ml-auto flex items-center gap-2 rounded-full bg-emerald-900/60 px-4 py-2 text-sm font-medium">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-green-400" />
        </span>
        Połączono na żywo (iPadOS)
      </div>
    </>
  );
}

/** Full-screen contractor app at `/ipad`; always logs in as the contractor. */
export function IpadStandaloneApp() {
  const { user, login } = useCurrentUser();
  const ready = user?.id === IPAD_CONTRACTOR.id && user.role === 'contractor';

  useEffect(() => {
    if (!ready) login(IPAD_CONTRACTOR);
  }, [ready, login]);

  if (!ready) return <div className="h-full w-full bg-slate-900" />;
  return <ContractorPage standalone header={<IpadHeader />} />;
}

/** Wraps a route: `?mode=ipad` redirects to the standalone iPad app. */
export function IpadModeRedirect({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  if (params.get('mode') === 'ipad') return <Navigate to="/ipad" replace />;
  return <>{children}</>;
}
