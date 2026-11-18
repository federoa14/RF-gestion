import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initInternalDatabase} from './utils/localInternalDb';

initInternalDatabase().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
