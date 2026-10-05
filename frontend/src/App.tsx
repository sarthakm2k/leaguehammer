import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { TournamentDashboard } from './features/tournaments/TournamentDashboard';
import { TournamentOverviewPage } from './features/tournaments/TournamentOverviewPage';
import { AuctioneerConsolePage } from './features/auction/AuctioneerConsolePage';
import { ProjectorPage } from './features/auction/ProjectorPage';
import { AuctionHistoryPage } from './features/auction/AuctionHistoryPage';

const AuctionResultsPage = lazy(() => import('./features/auction/AuctionResultsPage').then(module => ({ default: module.AuctionResultsPage })));
const AuctionRecapPage = lazy(() => import('./features/auction/AuctionRecapPage').then(module => ({ default: module.AuctionRecapPage })));
const PlayerRegistrationPage = lazy(() => import('./features/registrations/PlayerRegistrationPage').then(module => ({ default: module.PlayerRegistrationPage })));

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <ThemeToggle />
      <AuthProvider>
        <Suspense fallback={<div className="min-h-screen bg-[#070c15] text-slate-200 p-8">Loading auction views…</div>}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register/:slug" element={<PlayerRegistrationPage />} />
          <Route path="/tournaments/:id/projector" element={<ProjectorPage />} />
          <Route path="/tournaments/:id/stage" element={<ProjectorPage />} />
          <Route path="/live/:slug" element={<AuctionResultsPage publicView />} />
          <Route path="/live/:slug/projector" element={<ProjectorPage />} />
          <Route path="/live/:slug/recap" element={<AuctionRecapPage publicView />} />
          <Route path="/live/:slug/teams/:teamId" element={<AuctionResultsPage publicView />} />
          <Route path="/tournaments/:id/results" element={<ProtectedRoute><AuctionResultsPage /></ProtectedRoute>} />
          <Route path="/tournaments/:id/recap" element={<ProtectedRoute><AuctionRecapPage /></ProtectedRoute>} />
          <Route path="/tournaments/:id/teams/:teamId/squad" element={<ProtectedRoute><AuctionResultsPage /></ProtectedRoute>} />
          <Route path="/tournaments/:id/auction/history" element={<ProtectedRoute><AuctionHistoryPage /></ProtectedRoute>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <TournamentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tournaments/:id"
            element={
              <ProtectedRoute>
                <TournamentOverviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tournaments/:id/auction"
            element={
              <ProtectedRoute>
                <AuctioneerConsolePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
