import React from 'react';
import { Link } from 'react-router-dom';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">Tournament Manager</h1>
        <div className="flex gap-4">
          <Link to="/" className="text-sm text-gray-600 hover:text-blue-600">Dashboard</Link>
          <span className="text-sm text-gray-400">User: Admin</span>
        </div>
      </nav>

      <main className="p-8 max-w-7xl mx-auto">
        <div className="text-center py-20">
          <h2 className="text-4xl font-extrabold text-gray-900 mb-4">
            Welcome to the Tournament Portal
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Manage your Swiss, Knockout, and Round-Robin tournaments with ease.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/tournaments/some-id"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              View Sample Tournament
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
