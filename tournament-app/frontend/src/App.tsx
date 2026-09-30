import { useEffect, useState } from 'react';

type HealthStatus = 'checking' | 'ok' | 'unreachable';

function App() {
  const [status, setStatus] = useState<HealthStatus>('checking');

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => (res.ok ? setStatus('ok') : setStatus('unreachable')))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Tournament Management</h1>
      <p>
        Project scaffold initialized (Phase 0). Backend API status:{' '}
        <strong>{status}</strong>
      </p>
    </main>
  );
}

export default App;
