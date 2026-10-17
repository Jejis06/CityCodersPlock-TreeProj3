import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApprovalQueuePage } from '@/features/approval-queue/ApprovalQueuePage';
import { ContractorPage } from '@/features/contractor/ContractorPage';
import { IpadModeRedirect, IpadStandaloneApp } from '@/features/contractor/IpadStandaloneApp';
import { TreesListAndExportView } from '@/features/export-and-list/TreesListAndExportView';
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
          <Route
            path="/"
            element={
              <IpadModeRedirect>
                <RoleSelectPage />
              </IpadModeRedirect>
            }
          />
          <Route path="/ipad" element={<IpadStandaloneApp />} />
          <Route
            path="/official"
            element={
              <RequireRole role="official">
                <OfficialLayout />
              </RequireRole>
            }
          >
            <Route index element={<OfficialMapPage />} />
            <Route path="list" element={<TreesListAndExportView />} />
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
