// The page of the admin: the admin itself, or its login page (data-view="login" of #app).
import { createRoot } from 'react-dom/client';
import { App } from './app.jsx';
import { Login } from './views/login.jsx';
import { FeedbackProvider } from './feedback.jsx';
import './styles.css';

// The theme before the first paint (no flash of the other one).
try {
  const theme = window.localStorage.getItem('xufa.admin.theme');
  const dark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch {
  // The theme of the system, once the page asks.
}

const element = document.getElementById('app');
const csrf = document.querySelector('meta[name="csrf-token"]');
createRoot(element).render(
  <FeedbackProvider>
    {element.dataset.view === 'login' ? (
      <Login title={element.dataset.title || 'Admin'} csrf={csrf ? csrf.getAttribute('content') : ''} />
    ) : (
      <App />
    )}
  </FeedbackProvider>
);
