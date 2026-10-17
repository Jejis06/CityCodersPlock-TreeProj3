import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '@/types/domain';
import { homePathForRole, useCurrentUser } from './CurrentUserContext';

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useCurrentUser();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={homePathForRole(user.role)} replace />;
  return <>{children}</>;
}
