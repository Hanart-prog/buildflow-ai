import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board, BoardName, Plan, Project, ProjectSummary, Scope } from '../../shared/plan';
import { api } from './api';
import { BoardCanvas } from './BoardCanvas';
import { useRecorder } from './useRecorder';

const TABS: { name: BoardName; label: string }[] = [
  { name: 'system', label: 'System' },
  { name: 'features', label: 'Features' },
  { name: 'roadmap', label: 'Roadmap' },
];

const SCOPES: { name: Scope; label: string }[] = [
  { name: 'project', label: 'New project' },
  { name: 'feature', label: 'Add a feature' },
];

const SAVE_DELAY_MS = 600;
const UNTITLED = 'Untitled idea';
const NO_FRESH: Record<BoardName, string[]> = { system: [], features: [], roadmap: [] };

const nameFrom = (speech: string) => {
  const words = speech.trim().split(/\s+/);
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
};

const newNodeIds = (before: Plan, after: Plan) => {
  const fresh = { ...NO_FRESH };
  for (const { name } of TABS) {
    const known = new Set(before.boards[name].nodes.map((n) => n.id));
    fresh[name] = after.boards[name].nodes.filter((n) => !known.has(n.id)).map((n) => n.id);
  }
  return fresh;
};

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<BoardName>('system');
  // Bumped when a plan arrives from the server, so the canvas rebuilds from it.
  const [revision, setRevision] = useState(0);
  const [speech, setSpeech] = useState('');
  const [chosenScope, setChosenScope] = useState<Scope | null>(null);
  const [busy, setBusy] = useState<'transcribing' | 'reading' | 'mapping' | null>(null);
  const [progress, setProgress] = useState<{ placed: number; total: number } | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [error, setError] = useState<string | null>(null);

  const pendingSave = useRef<{ id: string; plan: Plan; timer: number } | null>(null);
  const fresh = useRef(NO_FRESH);
  const orb = useRef<HTMLButtonElement>(null);

  const flushSave = useCallback(async () => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    clearTimeout(pending.timer);
    try {
      await api.savePlan(pending.id, pending.plan);
      setSaveState('saved');
    } catch (e) {
      setSaveState('failed');
      throw e;
    }
  }, []);

  const show = (next: Project | null) => {
    fresh.current = NO_FRESH;
    setProject(next);
    setRevision((r) => r + 1);
    setSpeech('');
    setChosenScope(null);
    setProgress(null);
  };

  const open = useCallback(
    async (id: string) => {
      await flushSave();
      show(await api.get(id));
    },
    [flushSave],
  );

  const guard = (action: () => Promise<void>) => async () => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  useEffect(() => {
    guard(async () => {
      const list = await api.list();
      setProjects(list);
      if (list[0]) await open(list[0].id);
    })();
  }, [open]);

  const startNew = guard(async () => {
    await flushSave();
    show(null);
  });

  const ensureProject = async (name: string) => {
    if (project) return project;
    const created = await api.create(name);
    setProjects((list) => [created, ...list]);
    setProject(created);
    return created;
  };

  const deleteProject = guard(async () => {
    if (!project || !window.confirm(`Delete "${project.name}"?`)) return;
    if (pendingSave.current) {
      clearTimeout(pendingSave.current.timer);
      pendingSave.current = null;
    }
    await api.remove(project.id);
    const remaining = projects.filter((p) => p.id !== project.id);
    setProjects(remaining);
    show(null);
    if (remaining[0]) await open(remaining[0].id);
  });

  const onBoardChange = (name: BoardName, board: Board) => {
    setProject((current) => {
      if (!current) return current;
      const plan = { ...current.plan, boards: { ...current.plan.boards, [name]: board } };
      if (pendingSave.current) clearTimeout(pendingSave.current.timer);
      pendingSave.current = {
        id: current.id,
        plan,
        timer: window.setTimeout(() => flushSave().catch(() => {}), SAVE_DELAY_MS),
      };
      return { ...current, plan };
    });
    setSaveState('saving');
  };

  const { recording, start, stop } = useRecorder(
    (audio) =>
      guard(async () => {
        setBusy('transcribing');
        try {
          const target = await ensureProject(UNTITLED);
          const { text } = await api.transcribe(target.id, audio);
          setSpeech((current) => (current ? `${current} ${text}` : text));
        } finally {
          setBusy(null);
        }
      })(),
    orb,
  );

  const nodeCount = project
    ? TABS.reduce((sum, t) => sum + project.plan.boards[t.name].nodes.length, 0)
    : 0;
  const scope = chosenScope ?? (nodeCount > 0 ? 'feature' : 'project');

  const generate = guard(async () => {
    setBusy('reading');
    try {
      await flushSave();
      let target = await ensureProject(nameFrom(speech));
      if (target.name === UNTITLED) {
        target = await api.rename(target.id, nameFrom(speech));
        const { id, name } = target;
        setProjects((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
      }
      const before = target.plan;
      const updated = await api.generate(target.id, speech, scope, (requirements) => {
        setBusy('mapping');
        setProject((current) =>
          current && { ...current, plan: { ...current.plan, requirements } },
        );
      });
      fresh.current = newNodeIds(before, updated.plan);
      setTab('system');
      setProject(updated);
      setRevision((r) => r + 1);
      setSpeech('');
      setChosenScope(null);
    } finally {
      setBusy(null);
    }
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && speech.trim() && !busy) generate();
  };

  const hero = !busy && !progress && nodeCount === 0;
  const requirements = project?.plan.requirements ?? [];
  const status =
    busy === 'reading'
      ? 'Reading what you said'
      : busy === 'mapping'
        ? 'Designing the system, features and roadmap'
        : progress
          ? `Placing ${progress.placed} of ${progress.total}`
          : null;

  return (
    <div className="app">
      {project && (
        <BoardCanvas
          key={`${project.id}-${tab}-${revision}`}
          name={tab}
          board={project.plan.boards[tab]}
          fresh={fresh.current[tab]}
          onChange={(board) => onBoardChange(tab, board)}
          onProgress={(next) => {
            setProgress(next);
            if (!next) fresh.current = { ...fresh.current, [tab]: [] };
          }}
        />
      )}

      <header className="topbar">
        <div className="pill identity">
          <span className="brand">BuildFlow</span>
          {projects.length > 0 && (
            <select
              aria-label="Project"
              value={project?.id ?? ''}
              onChange={(e) => guard(() => open(e.target.value))()}
            >
              {!project && <option value="">New idea</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button className="quiet" onClick={startNew} disabled={!project}>
            New
          </button>
          {project && (
            <button className="quiet" onClick={deleteProject}>
              Delete
            </button>
          )}
        </div>

        {project && !hero && (
          <nav className="pill tabs">
            {TABS.map((t) => (
              <button
                key={t.name}
                className={t.name === tab ? 'active' : ''}
                onClick={() => setTab(t.name)}
              >
                {t.label}
                <span>{project.plan.boards[t.name].nodes.length}</span>
              </button>
            ))}
          </nav>
        )}

        {project && !hero && (
          <span className="save">{saveState === 'failed' ? 'Save failed' : saveState === 'saving' ? 'Saving' : 'Saved'}</span>
        )}
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button className="quiet" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {requirements.length > 0 && !hero && (
        <aside className="heard">
          <h3>What I heard</h3>
          <ul>
            {requirements.map((r, i) => (
              <li key={r.id} className={`req-${r.type}`} style={{ animationDelay: `${i * 40}ms` }}>
                <span>{r.type.replace('-', ' ')}</span>
                {r.text}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {status && (
        <div className="building" role="status">
          <i />
          {status}
        </div>
      )}

      <section className={`dock${hero ? ' hero' : ''}`}>
        {hero && (
          <div className="hero-copy">
            <h1>Say what you want to build.</h1>
            <p>A whole product or one new feature. Talk it through and watch the plan draw itself.</p>
          </div>
        )}
        <div className="composer" onKeyDown={onKeyDown}>
          <button
            ref={orb}
            className={`orb${recording ? ' live' : ''}`}
            aria-label={recording ? 'Stop recording' : 'Start talking'}
            title={recording ? 'Stop recording' : 'Start talking'}
            onClick={guard(recording ? async () => stop() : start)}
            disabled={busy !== null}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {recording ? (
                <rect x="7" y="7" width="10" height="10" rx="2" />
              ) : (
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4" />
              )}
            </svg>
          </button>
          <textarea
            aria-label="Describe your idea"
            placeholder={
              busy === 'transcribing'
                ? 'Transcribing…'
                : recording
                  ? 'Listening…'
                  : scope === 'feature'
                    ? 'Describe the feature to add…'
                    : 'Talk, or type your idea here…'
            }
            value={speech}
            onChange={(e) => setSpeech(e.target.value)}
            rows={hero ? 3 : 2}
          />
          <div className="composer-actions">
            <div className="scope" role="radiogroup" aria-label="What to plan">
              {SCOPES.map((s) => (
                <button
                  key={s.name}
                  role="radio"
                  aria-checked={scope === s.name}
                  className={scope === s.name ? 'active' : ''}
                  onClick={() => setChosenScope(s.name)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              className="primary"
              onClick={generate}
              disabled={!speech.trim() || busy !== null || recording || progress !== null}
            >
              {busy === 'reading' || busy === 'mapping' ? 'Building…' : 'Build it'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
