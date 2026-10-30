import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board, BoardName, Plan, Project, ProjectSummary } from '../../shared/plan';
import { api } from './api';
import { BoardCanvas } from './BoardCanvas';
import { useRecorder } from './useRecorder';

const TABS: { name: BoardName; label: string }[] = [
  { name: 'system', label: 'System design' },
  { name: 'features', label: 'Features' },
  { name: 'roadmap', label: 'Roadmap' },
];

const SAVE_DELAY_MS = 600;

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<BoardName>('system');
  // Bumped when a plan arrives from the server, so the canvas rebuilds from it.
  const [revision, setRevision] = useState(0);
  const [speech, setSpeech] = useState('');
  const [busy, setBusy] = useState<'transcribing' | 'generating' | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [error, setError] = useState<string | null>(null);

  const pendingSave = useRef<{ id: string; plan: Plan; timer: number } | null>(null);

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

  const open = useCallback(async (id: string) => {
    await flushSave();
    setProject(await api.get(id));
    setRevision((r) => r + 1);
    setSpeech('');
  }, [flushSave]);

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

  const createProject = guard(async () => {
    const name = window.prompt('Project name')?.trim();
    if (!name) return;
    await flushSave();
    const created = await api.create(name);
    setProjects((list) => [created, ...list]);
    setProject(created);
    setRevision((r) => r + 1);
    setSpeech('');
  });

  const deleteProject = guard(async () => {
    if (!project || !window.confirm(`Delete "${project.name}"?`)) return;
    if (pendingSave.current) {
      clearTimeout(pendingSave.current.timer);
      pendingSave.current = null;
    }
    await api.remove(project.id);
    const remaining = projects.filter((p) => p.id !== project.id);
    setProjects(remaining);
    setProject(null);
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

  const { recording, start, stop } = useRecorder((audio) =>
    guard(async () => {
      if (!project) return;
      setBusy('transcribing');
      try {
        const { text } = await api.transcribe(project.id, audio);
        setSpeech((current) => (current ? `${current} ${text}` : text));
      } finally {
        setBusy(null);
      }
    })(),
  );

  const generate = guard(async () => {
    if (!project) return;
    setBusy('generating');
    try {
      await flushSave();
      setProject(await api.generate(project.id, speech));
      setRevision((r) => r + 1);
      setSpeech('');
    } finally {
      setBusy(null);
    }
  });

  const nodeCount = project
    ? TABS.reduce((sum, t) => sum + project.plan.boards[t.name].nodes.length, 0)
    : 0;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BuildFlow</span>
        <select
          aria-label="Project"
          value={project?.id ?? ''}
          onChange={(e) => guard(() => open(e.target.value))()}
        >
          {!project && <option value="">No project</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={createProject}>New project</button>
        {project && (
          <button className="quiet" onClick={deleteProject}>
            Delete
          </button>
        )}
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.name}
              className={t.name === tab ? 'active' : ''}
              onClick={() => setTab(t.name)}
              disabled={!project}
            >
              {t.label}
              {project && <span>{project.plan.boards[t.name].nodes.length}</span>}
            </button>
          ))}
        </nav>
        {project && (
          <span className="status">
            {nodeCount} nodes · {saveState === 'failed' ? 'save failed' : saveState}
          </span>
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

      {project ? (
        <main className="workspace">
          <section className="session">
            <button
              className={`mic${recording ? ' live' : ''}`}
              onClick={guard(recording ? async () => stop() : start)}
              disabled={busy !== null}
            >
              {recording ? 'Stop recording' : 'Start talking'}
            </button>
            <textarea
              aria-label="Speech transcript"
              placeholder="Your words land here. You can also type or fix them before generating."
              value={speech}
              onChange={(e) => setSpeech(e.target.value)}
              rows={7}
            />
            <button
              className="primary"
              onClick={generate}
              disabled={!speech.trim() || busy !== null || recording}
            >
              {busy === 'transcribing'
                ? 'Transcribing…'
                : busy === 'generating'
                  ? 'Mapping your plan…'
                  : 'Generate plan'}
            </button>

            <h3>Requirements ({project.plan.requirements.length})</h3>
            <ul className="requirements">
              {project.plan.requirements.map((r) => (
                <li key={r.id} className={`req-${r.type}`}>
                  <span>{r.type}</span>
                  {r.text}
                </li>
              ))}
            </ul>

            {project.transcript && (
              <details>
                <summary>Past transcript</summary>
                <p>{project.transcript}</p>
              </details>
            )}
          </section>

          <BoardCanvas
            key={`${project.id}-${tab}-${revision}`}
            name={tab}
            board={project.plan.boards[tab]}
            onChange={(board) => onBoardChange(tab, board)}
          />
        </main>
      ) : (
        <div className="welcome">
          <h1>Say what you want to build.</h1>
          <p>Create a project, talk through the idea, and get a plan you can edit.</p>
          <button className="primary" onClick={createProject}>
            New project
          </button>
        </div>
      )}
    </div>
  );
}
