import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { LocaleProvider } from './i18n';
import './i18n/rtl.css';

import './index.css';
import './admin.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <LocaleProvider><ErrorBoundary>
    <App />
  </ErrorBoundary></LocaleProvider>,
);
