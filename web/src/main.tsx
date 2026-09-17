import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, getThemeMode } from './theme';
import './styles.css';

applyTheme(getThemeMode());

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
