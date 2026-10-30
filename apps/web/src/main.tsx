import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing.tsx';
import { CaddieApp } from './phone/Caddie.tsx';
import { DeskApp } from './desk/Desk.tsx';
import { SampleApp } from './desk/Sample.tsx';
import { DemoPage } from './Demo.tsx';
import './style.css';

function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/caddie' || path === '/c') return <CaddieApp />;
  if (path === '/desk') return <DeskApp />;
  if (path === '/sample') return <SampleApp />;
  if (path === '/demo') return <DemoPage />;
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
