import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoadingState } from './components/common/LoadingState';

// Lazy-loaded routes for battle-tested bundle performance
const RegisterPage = lazy(() =>
  import('./views/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);
const SuccessPage = lazy(() =>
  import('./views/SuccessPage').then((m) => ({ default: m.SuccessPage }))
);
const TermsPage = lazy(() =>
  import('./views/TermsPage').then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import('./views/PrivacyPage').then((m) => ({ default: m.PrivacyPage }))
);
const AdminLoginPage = lazy(() =>
  import('./views/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage }))
);
const AdminDashboardPage = lazy(() =>
  import('./views/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
);

function ProtectedAdminRoute() {
  const { admin, isAuthenticated, loading, logout } = useAuth();

  if (loading) {
    return <LoadingState variant="full" message="Verifying zero-trust administrator credentials..." />;
  }

  if (!isAuthenticated || !admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminDashboardPage
      admin={admin}
      onLogout={logout}
      onViewPublic={() => {
        window.location.href = '/';
      }}
    />
  );
}

export function App() {
  useEffect(() => {
    // Non-blocking pre-warm ping to awaken deployed backend server early
    fetch('/api/health').catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingState variant="full" message="Loading registration experience..." />}>
          <Routes>
            {/* Public routes - Direct Registration at Root */}
            <Route path="/" element={<RegisterPage />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/register/success" element={<SuccessPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />

            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/*" element={<ProtectedAdminRoute />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
