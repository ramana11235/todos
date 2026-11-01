import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {App} from './App';

// Safari in a browser tab ignores user-scalable=no in the viewport, so a
// pinch is stopped here as it starts.
document.addEventListener('gesturestart', event => event.preventDefault());

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
