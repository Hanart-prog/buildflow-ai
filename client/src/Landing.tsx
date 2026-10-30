import { useState } from 'react';
import type { User } from '../../shared/plan';
import { AuthDialog, type AuthMode } from './AuthDialog';
import { HowItWorks } from './HowItWorks';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from './theme';

// The start screen for visitors. Accounts only come up once they try to build.
export function Landing({ onDone }: { onDone: (user: User, idea?: string) => void }) {
  const { theme, toggle } = useTheme();
  const [speech, setSpeech] = useState('');
  const [auth, setAuth] = useState<{ mode: AuthMode; hasIdea: boolean } | null>(null);
  const idea = speech.trim();

  const tryBuild = () => {
    if (idea) setAuth({ mode: 'signup', hasIdea: true });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="pill identity">
          <span className="brand">BuildFlow</span>
        </div>
        <div className="actions">
          <ThemeToggle theme={theme} onToggle={toggle} disabled={false} />
          <button onClick={() => setAuth({ mode: 'login', hasIdea: false })}>Log in</button>
          <button className="primary" onClick={() => setAuth({ mode: 'signup', hasIdea: false })}>
            Sign up
          </button>
        </div>
      </header>

      <main className="dock hero">
        <div className="dock-main">
          <div className="hero-copy">
            <h1>Say what you want to build.</h1>
            <p>Talk it through and watch the plan draw itself.</p>
          </div>
          <div
            className="composer"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) tryBuild();
            }}
          >
            <button
              className="orb"
              aria-label="Start talking"
              title="Start talking"
              onClick={() => setAuth({ mode: 'signup', hasIdea: false })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4" />
              </svg>
            </button>
            <textarea
              aria-label="Describe your idea"
              placeholder="Talk, or type your idea here…"
              value={speech}
              onChange={(e) => setSpeech(e.target.value)}
              rows={3}
            />
            <div className="composer-actions">
              <button className="primary" onClick={tryBuild} disabled={!idea}>
                Build it
              </button>
            </div>
          </div>
        </div>
        <HowItWorks />
      </main>

      {auth && (
        <AuthDialog
          mode={auth.mode}
          hasIdea={auth.hasIdea}
          onMode={(mode) => setAuth({ ...auth, mode })}
          onClose={() => setAuth(null)}
          onDone={(user) => onDone(user, auth.hasIdea ? idea : undefined)}
        />
      )}
    </div>
  );
}
