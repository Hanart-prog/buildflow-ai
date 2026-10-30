import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif';
import '@flowgram.ai/free-layout-editor/index.css';
import { App } from './App';
import './styles.css';

// No StrictMode: its double mount binds FlowGram's dependency container twice
// and crashes the editor with an "Ambiguous match" error.
createRoot(document.getElementById('root')!).render(<App />);
