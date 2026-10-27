import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import { App } from './App';
import { SyncProvider } from './components/sync';
import { ToastProvider } from './components/toast';
import { FocusProvider } from './components/focus';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <ToastProvider>
          <FocusProvider>
            <App />
          </FocusProvider>
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
