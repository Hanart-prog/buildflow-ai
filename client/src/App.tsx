import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board, BoardName, Plan, Project, ProjectSummary, Question, Scope } from '../../shared/plan';
import { api } from './api';
import { BoardCanvas } from './BoardCanvas';
import { readDrop, readPicked } from './importProject';
import { Preview } from './Preview';
import type { LiveBoard } from './liveBuild';
import { useRecorder } from './useRecorder';

const TABS: { name: BoardName; label: string }[] = [
  { name: 'system', label: 'System' },
  { name: 'features', label: 'Features' },
  { name: 'roadmap', label: 'Roadmap' },
];

const SCOPES: { name: Scope; label: string }[] = [
  { name: 'project', label: 'Whole product' },
  { name: 'feature', label: 'One feature' },
];

const SAVE_DELAY_MS = 600;
const UNTITLED = 'Untitled idea';
// Answering these brings up the next ones, so the list stays short.
const QUESTIONS_SHOWN = 4;
const NO_FRESH: Record<BoardName, string[]> = { system: [], features: [], roadmap: [] };
const NO_COUNTS: Record<BoardName, number> = { system: 0, features: 0, roadmap: 0 };

const DRAWING: Record<BoardName, string> = {
  system: 'Drawing the system',
  features: 'Breaking down the features',
  roadmap: 'Laying out the roadmap',
};

const nameFrom = (speech: string) => {
  const words = speech.trim().split(/\s+/);
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
};

const QuestionCard = ({ question, onAnswer }: { question: Question; onAnswer: (answer: string) => void }) => (
  <li className="question">
    <span>{question.topic}</span>
    <p>{question.text}</p>
    {question.options.length > 0 && (
      <div className="answers">
        {question.options.map((option) => (
          <button
            key={option}
            className={question.answer === option ? 'active' : ''}
            onClick={() => onAnswer(option)}
          >
            {option}
          </button>
        ))}
      </div>
    )}
    <input
      aria-label={question.text}
      placeholder="Or say it your way"
      value={question.options.includes(question.answer ?? '') ? '' : (question.answer ?? '')}
      onChange={(e) => onAnswer(e.target.value)}
    />
  </li>
);

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
  const [previewing, setPreviewing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // Bumped when a plan arrives from the server, so the canvas rebuilds from it.
  const [revision, setRevision] = useState(0);
  const [speech, setSpeech] = useState('');
  const [chosenScope, setChosenScope] = useState<Scope | null>(null);
  const [busy, setBusy] = useState<'transcribing' | 'reading' | 'mapping' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [placed, setPlaced] = useState<number | null>(null);
  // Nodes streamed so far per board, shown on the tabs until the plan lands.
  const [streamed, setStreamed] = useState(NO_COUNTS);
  const [drawing, setDrawing] = useState<BoardName | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [error, setError] = useState<string | null>(null);

  const pendingSave = useRef<{ id: string; plan: Plan; timer: number } | null>(null);
  const fresh = useRef(NO_FRESH);
  const live = useRef<LiveBoard | null>(null);
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
    setPreviewing(false);
    fresh.current = NO_FRESH;
    setProject(next);
    setRevision((r) => r + 1);
    setSpeech('');
    setChosenScope(null);
    setPlaced(null);
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

  const updatePlan = (change: (plan: Plan) => Plan) => {
    setProject((current) => {
      if (!current) return current;
      const plan = change(current.plan);
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

  const onBoardChange = (name: BoardName, board: Board) =>
    updatePlan((plan) => ({ ...plan, boards: { ...plan.boards, [name]: board } }));

  const answerQuestion = (id: string, answer: string) =>
    updatePlan((plan) => ({
      ...plan,
      questions: plan.questions.map((q) => (q.id === id ? { ...q, answer: answer || undefined } : q)),
    }));

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
  // A feature needs a product to attach to, whether planned here or dropped in.
  const scope = nodeCount > 0 ? (chosenScope ?? 'feature') : 'project';
  const questions = project?.plan.questions ?? [];
  const openQuestions = questions.filter((q) => !q.used);
  const decisions = questions.filter((q) => q.used && q.answer);

  const build = (text: string, buildScope: Scope, name: string, source?: string) => guard(async () => {
    setBusy('reading');
    try {
      await flushSave();
      let target = await ensureProject(name);
      if (target.name === UNTITLED) {
        target = await api.rename(target.id, name);
        const { id } = target;
        setProjects((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
      }
      const before = target.plan;
      setTab('system');
      setPreviewing(false);
      setStreamed(NO_COUNTS);
      try {
        const updated = await api.generate(target.id, text, buildScope, (event) => {
          if (event.type === 'requirements') {
            const { requirements, questions: asked } = event;
            setBusy('mapping');
            setProject(
              (current) => current && { ...current, plan: { ...current.plan, requirements, questions: asked } },
            );
            return;
          }
          setDrawing(event.board);
          setStreamed((counts) =>
            event.type === 'node' ? { ...counts, [event.board]: counts[event.board] + 1 } : counts,
          );
          if (event.board === 'system') {
            live.current?.add(event.type === 'node' ? { node: event.node } : { edge: event.edge });
          }
        }, source);
        fresh.current = newNodeIds(before, updated.plan);
        setProject(updated);
        setStreamed(NO_COUNTS);
        setDrawing('system');
        if (live.current) {
          fresh.current = { ...fresh.current, system: [] };
          await live.current.finish(updated.plan.boards.system);
        } else {
          setRevision((r) => r + 1);
        }
        setSpeech('');
        setChosenScope(null);
      } catch (e) {
        // Whatever was drawn or streamed so far was never saved.
        live.current?.dispose();
        setProject((current) => current && { ...current, plan: before });
        setRevision((r) => r + 1);
        setPlaced(null);
        throw e;
      } finally {
        setStreamed(NO_COUNTS);
        setDrawing(null);
      }
    } finally {
      setBusy(null);
    }
  })();

  const generate = () => build(speech, scope, nameFrom(speech));

  const useAnswers = () => {
    const fresh = openQuestions.filter((q) => q.answer);
    const text = fresh.map((q) => `${q.text} ${q.answer}`).join('\n');
    if (project) build(text, 'project', project.name);
  };

  const importFiles = (read: () => Promise<{ name: string; source: string | null }>) =>
    guard(async () => {
      const { name, source } = await read();
      if (!source) throw new Error('No readable project files were found in that drop.');
      await build('Map this existing product and what it already does.', 'project', name, source);
    })();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const { items } = e.dataTransfer;
    if (hero && items.length > 0) {
      // Entries are only readable during the drop event itself.
      const reading = readDrop(items);
      importFiles(() => reading);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (hero) setDragging(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && speech.trim() && !busy) generate();
  };

  const hero = !busy && placed === null && nodeCount === 0;
  const requirements = project?.plan.requirements ?? [];
  const status =
    busy === 'reading'
      ? 'Reading what you said'
      : busy === 'mapping' && drawing
        ? DRAWING[drawing]
        : busy === 'mapping'
          ? 'Thinking through the plan'
          : placed !== null
            ? DRAWING[tab]
            : null;

  return (
    <div
      className="app"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging && <div className="drop-target">Drop your project to map it</div>}
      {project && previewing && (
        <Preview
          project={project}
          onDrafting={setDrafting}
          onUpdated={setProject}
          onError={setError}
        />
      )}

      {project && !previewing && (
        <BoardCanvas
          key={`${project.id}-${tab}-${revision}`}
          name={tab}
          board={project.plan.boards[tab]}
          projectId={project.id}
          onFlush={flushSave}
          fresh={fresh.current[tab]}
          live={live}
          onChange={(board) => onBoardChange(tab, board)}
          onProgress={(next) => {
            setPlaced(next);
            if (next === null) fresh.current = { ...fresh.current, [tab]: [] };
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
                className={!previewing && t.name === tab ? 'active' : ''}
                onClick={() => {
                  setTab(t.name);
                  setPreviewing(false);
                }}
                disabled={busy !== null || placed !== null || drafting}
              >
                {t.label}
                <span>{project.plan.boards[t.name].nodes.length + streamed[t.name]}</span>
              </button>
            ))}
            <button
              className={previewing ? 'active' : ''}
              onClick={() => setPreviewing(true)}
              disabled={busy !== null || placed !== null}
            >
              Preview
            </button>
          </nav>
        )}

        {project && (
          <div className="actions">
            {!hero && (
              <span className="save">
                {saveState === 'failed' ? 'Save failed' : saveState === 'saving' ? 'Saving' : 'Saved'}
              </span>
            )}
            <button className="new-project" onClick={startNew}>
              + New project
            </button>
          </div>
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

      {(requirements.length > 0 || questions.length > 0) && !hero && !previewing && (
        <aside className="heard">
          {openQuestions.length > 0 && (
            <>
              <h3>A few questions</h3>
              <ul>
                {openQuestions.slice(0, QUESTIONS_SHOWN).map((q) => (
                  <QuestionCard key={q.id} question={q} onAnswer={(a) => answerQuestion(q.id, a)} />
                ))}
              </ul>
              <button
                className="primary"
                onClick={useAnswers}
                disabled={!openQuestions.some((q) => q.answer) || busy !== null || placed !== null}
              >
                Use my answers
              </button>
            </>
          )}
          {decisions.length > 0 && (
            <>
              <h3>Decided</h3>
              <ul>
                {decisions.map((q) => (
                  <li key={q.id} className="req-decision">
                    <span>{q.topic}</span>
                    {q.answer}
                  </li>
                ))}
              </ul>
            </>
          )}
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

      <section className={`dock${hero ? ' hero' : ''}`} hidden={previewing}>
        {hero && (
          <div className="hero-copy">
            <h1>Say what you want to build.</h1>
            <p>
              Talk it through and watch the plan draw itself. Already built something? Drop the
              project folder here, or{' '}
              <label className="folder-link">
                choose a folder
                <input
                  type="file"
                  multiple
                  hidden
                  {...{ webkitdirectory: '' }}
                  onChange={(e) => {
                    const { files } = e.target;
                    if (files?.length) importFiles(() => readPicked(files));
                  }}
                />
              </label>
              .
            </p>
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
            {nodeCount > 0 && (
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
            )}
            <button
              className="primary"
              onClick={generate}
              disabled={!speech.trim() || busy !== null || recording || placed !== null}
            >
              {busy === 'reading' || busy === 'mapping' ? 'Building…' : 'Build it'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
