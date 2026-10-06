import { ApolloProvider } from '@apollo/client/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/app-shell/app-layout';
import { useThemePreference } from '@/components/ui/theme-preference';
import { apolloClient } from '@/lib/apollo';
import { getToken } from '@/lib/auth';
import { todayIso } from '@/lib/date';
import { JournalRoute } from '@/routes/journal';
import { LoginPage } from '@/routes/login';
import { VerifyPage } from '@/routes/verify';
import './index.css';

/**
 * No token, no request: an expired one is caught by the error link instead.
 * The app chrome lives behind this, because the rail lists your days and the
 * signed-out screens are a single centred card with nothing to navigate.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

/**
 * index.html has already painted the theme by now; this is what keeps it right
 * afterwards. cubeui's hook owns the preference — the storage key, the class on
 * <html> — and mounting it once at the root is what makes `system` follow the OS
 * without a reload, on the login page as much as behind it.
 */
function ThemeSync() {
  useThemePreference();
  return null;
}

/**
 * Every day is a URL, so `/` is only ever a way in. Resolving it here rather
 * than rendering today's page at `/` means a bookmarked day stays that day and
 * the browser's back button walks the days you visited.
 *
 * `/login` and `/auth/verify` still win over `/:date` — react-router ranks a
 * static segment above a dynamic one — and anything else that is not a date
 * redirects from inside the route.
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('index.html has no #root element for the app to render into.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <ThemeSync />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/verify" element={<VerifyPage />} />
          <Route path="/" element={<Navigate to={`/${todayIso()}`} replace />} />
          <Route
            path="/:date"
            element={
              <RequireAuth>
                <JournalRoute />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>,
);
