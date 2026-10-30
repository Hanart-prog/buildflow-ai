import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif';
import '@flowgram.ai/free-layout-editor/index.css';
import { App } from './App';
import { Shared } from './Shared';
import './styles.css';

// No StrictMode: its double mount binds FlowGram's dependency container twice
// and crashes the editor with an "Ambiguous match" error.
const shareId = window.location.pathname.match(/^\/share\/([\w-]+)/)?.[1];

createRoot(document.getElementById('root')!).render(shareId ? <Shared shareId={shareId} /> : <App />);
