import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

async function fetchTournament(id: string) {
  const { data } = await apiClient.get(`/tournaments/${id}`);
  return data;
}

export default function TournamentOverview() {
  const { tournamentId } = React.useParams() as { tournamentId: string };
  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => fetchTournament(tournamentId),
  });

  if (isLoading) return <div className="p-8 text-center">Loading tournament...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error loading tournament.</div>;
  if (!data) return <div className="p-8 text-center">Tournament not found.</div>;

  const tournament = data.tournament;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{tournament.name}</h1>
        <div className="flex gap-2 mt-2">
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full uppercase">
            {tournament.format}
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full uppercase">
            {tournament.status}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Start Date</h3>
          <p className="text-xl font-semibold">{tournament.startDate || 'Not set'}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">End Date</h3>
          <p className="text-xl font-semibold">{tournament.endDate || 'Not set'}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Configuration</h3>
          <p className="text-sm text-gray-600 truncate">
            {JSON.stringify(tournament.configuration)}
          </p>
        </div>
      </div>
    </div>
  );
}
