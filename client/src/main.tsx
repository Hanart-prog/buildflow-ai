import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/newsreader/400.css';
import '@flowgram.ai/free-layout-editor/index.css';
import { Root } from './Root';
import { Shared } from './Shared';
import { initTheme } from './theme';
import './styles.css';

// No StrictMode: its double mount binds FlowGram's dependency container twice
// and crashes the editor with an "Ambiguous match" error.
initTheme();

const shareId = window.location.pathname.match(/^\/share\/([\w-]+)/)?.[1];

createRoot(document.getElementById('root')!).render(shareId ? <Shared shareId={shareId} /> : <Root />);
