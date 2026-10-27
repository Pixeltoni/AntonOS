import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import { App } from './App';
import { SyncProvider } from './components/sync';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
