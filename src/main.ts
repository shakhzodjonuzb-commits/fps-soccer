import { App } from './app/App';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root topilmadi.');
const app = new App(root);
void app.init();

window.addEventListener('beforeunload', () => app.destroy(), { once: true });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Offline cache registration failed:', error)); });
}
