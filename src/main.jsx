import { createRoot } from 'react-dom/client';
import MozFutHouse from './App.jsx';
import './styles.css';

const isNativeApp = typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
if (!isNativeApp && 'serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline opcional */ });
  });
}

createRoot(document.getElementById('root')).render(<MozFutHouse />);