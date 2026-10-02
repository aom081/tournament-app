import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import TournamentOverview from './pages/tournament/TournamentOverview';
import App from './App';

const queryClient = new QueryClient();

export function Router() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/tournaments/:tournamentId" element={<TournamentOverview />} />
          {/* Other routes will be added as we build the pages */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
