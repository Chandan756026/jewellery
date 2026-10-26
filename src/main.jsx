import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import { CollectionsProvider } from './collections.jsx';
import { SettingsProvider } from './settings.jsx';
import { StoreProvider } from './store.jsx';
import './styles.css';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// The admin panel is a separate chunk: public visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

// Reuse the root across hot reloads in development
const container = document.getElementById('root');
const root = container.__root ?? (container.__root = createRoot(container));

root.render(
  <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
    <Routes>
      <Route
        path="/admin/*"
        element={(
          <Suspense fallback={<div className="boot">Loading…</div>}>
            <AdminApp />
          </Suspense>
        )}
      />
      <Route
        path="*"
        element={(
          <SettingsProvider>
            <CollectionsProvider>
              <StoreProvider>
                <App />
              </StoreProvider>
            </CollectionsProvider>
          </SettingsProvider>
        )}
      />
    </Routes>
  </BrowserRouter>
);
