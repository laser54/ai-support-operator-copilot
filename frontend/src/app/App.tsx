import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";

import { CasePage } from "../pages/CasePage";
import { DevComponentsPage } from "../pages/DevComponentsPage";
import { HomePage } from "../pages/HomePage";
import { NewCasePage } from "../pages/NewCasePage";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "./ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cases/new" element={<NewCasePage />} />
            <Route path="/cases/:caseId" element={<CasePage />} />
            <Route path="/dev/components" element={<DevComponentsPage />} />
          </Routes>
        </AppShell>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
