import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store';
import { App } from './App';
import { SyncProvider } from './components/sync';
import { ToastProvider } from './components/toast';
import { FocusProvider } from './components/focus';
import { RestProvider } from './components/rest';
import { RoutineProvider } from './components/routine';
import { TaskUIProvider } from './components/taskui';
import { setupPwa } from './lib/pwa';
import { disableZoom, lockScrollBehindOverlays } from './lib/mobile';
import './styles.css';

setupPwa();
disableZoom();
lockScrollBehindOverlays();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <ToastProvider>
          <FocusProvider>
            <RestProvider>
              <RoutineProvider>
                <TaskUIProvider>
                  <App />
                </TaskUIProvider>
              </RoutineProvider>
            </RestProvider>
          </FocusProvider>
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
