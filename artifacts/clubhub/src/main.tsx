import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Register without waiting for notification permission, after the first page
// has loaded. Never intercept Vite's development modules or private API data.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const register = () => {
    const scope = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${scope}sw.js`, { scope }).catch((error) => {
      console.warn("Static app caching is unavailable:", error);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
