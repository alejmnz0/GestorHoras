import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { api } from './lib/api';
import './index.css';

// Los errores no controlados de la interfaz se registran en el log de la aplicación.
window.addEventListener('error', (e) => void api.app.logError(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => void api.app.logError(String(e.reason?.stack ?? e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
