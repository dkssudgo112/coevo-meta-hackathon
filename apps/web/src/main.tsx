import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Readiness } from '../../../packages/contracts/index';
import './style.css';

function App() {
  const [status, setStatus] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('The local API is unavailable.'); return r.json(); })
      .then(setStatus)
      .catch(e => { if (e.name !== 'AbortError') setError('Check the local API server. Run npm run dev to start both development servers.'); });
    return () => controller.abort();
  }, []);
  return <main>
    <p className="eyebrow">COEVO / META GLOBAL AI DEVELOPER HACKATHON</p>
    <h1>Do better work.<br/>Make the judgment yours.</h1>
    <p className="intro">Follow the evidence, verify a decision, and apply what you learn—all within the same development task.</p>
    <section aria-label="Development environment status">
      <h2>Development workspace</h2>
      <p>This is a readiness screen for the initial scaffold. Coaching and content generation are not implemented yet.</p>
      <dl>
        <div><dt>Local API</dt><dd>{status ? 'Connected' : error ? 'Check required' : 'Checking'}</dd></div>
        <div><dt>Meta key</dt><dd>{status ? status.metaKeyConfigured ? 'Configured' : 'Not configured' : '—'}</dd></div>
        <div><dt>Mode</dt><dd>{status?.mode ?? '—'}</dd></div>
        <div><dt>Live calls</dt><dd>{status?.liveCallsEnabled ? 'Enabled' : 'Off'}</dd></div>
      </dl>
      {error && <p role="alert">{error}</p>}
    </section>
    <section><h2>The first complete journey</h2><p>Review retry logic → Find evidence of duplicate processing → Choose an idempotency design → Verify → Practice a changed scenario → Return to the original task</p><div className="formats">{['Notes','Manuals','Flashcards','Two-person podcasts','Vertical shorts'].map(v => <span key={v}>{v}</span>)}</div></section>
    <footer>Submission deadline · November 5, 2026, 11:00 KST</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
