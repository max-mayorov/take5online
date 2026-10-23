import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initAnalytics, reportError } from './analytics';
import { App } from './App';
import './styles.css';

initAnalytics();

createRoot(document.getElementById('root')!, {
  // A render error unmounts the app; keep the component stack to see where it happened.
  onUncaughtError: (error, info) => {
    console.error(error);
    reportError(error, { component_stack: info.componentStack });
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
