import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApprovalQueuePage } from '@/features/approval-queue/ApprovalQueuePage';
import { ContractorPage } from '@/features/contractor/ContractorPage';
import { CurrentUserProvider } from './CurrentUserContext';
import { OfficialLayout } from './layouts/OfficialLayout';
import { OfficialMapPage } from './pages/OfficialMapPage';
import { RoleSelectPage } from './pages/RoleSelectPage';
import { RequireRole } from './RequireRole';

export function App() {
  return (
    <CurrentUserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoleSelectPage />} />
          <Route
            path="/official"
            element={
              <RequireRole role="official">
                <OfficialLayout />
              </RequireRole>
            }
          >
            <Route index element={<OfficialMapPage />} />
            <Route path="queue" element={<ApprovalQueuePage />} />
          </Route>
          <Route
            path="/contractor"
            element={
              <RequireRole role="contractor">
                <ContractorPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CurrentUserProvider>
  );
}
