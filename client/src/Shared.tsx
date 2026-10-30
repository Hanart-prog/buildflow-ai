import { useEffect, useRef, useState } from 'react';
import type { BoardName, SharedPlan } from '../../shared/plan';
import { api } from './api';
import { BoardCanvas } from './BoardCanvas';
import type { LiveBoard } from './liveBuild';

const TABS: { name: BoardName; label: string }[] = [
  { name: 'system', label: 'System' },
  { name: 'features', label: 'Features' },
  { name: 'roadmap', label: 'Roadmap' },
];

export function Shared({ shareId }: { shareId: string }) {
  const [shared, setShared] = useState<SharedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardName>('system');
  const [jump, setJump] = useState<string | undefined>();
  const live = useRef<LiveBoard | null>(null);

  useEffect(() => {
    api.shared(shareId).then(setShared, (e: Error) => setError(e.message));
  }, [shareId]);

  if (error) return <div className="shared-missing">{error}</div>;
  if (!shared) return null;

  return (
    <div className="app">
      <BoardCanvas
        key={`${tab}-${jump}`}
        name={tab}
        board={shared.plan.boards[tab]}
        plan={shared.plan}
        readOnly
        selectId={jump}
        fresh={[]}
        live={live}
        onJump={(board, id) => {
          setTab(board);
          setJump(id);
        }}
        onChange={() => {}}
        onProgress={() => {}}
      />
      <header className="topbar">
        <div className="pill identity">
          <span className="brand">BuildFlow</span>
          <span className="shared-name">{shared.name}</span>
        </div>
        <nav className="pill tabs">
          {TABS.map((t) => (
            <button
              key={t.name}
              className={t.name === tab ? 'active' : ''}
              onClick={() => {
                setTab(t.name);
                setJump(undefined);
              }}
            >
              {t.label}
              <span>{shared.plan.boards[t.name].nodes.length}</span>
            </button>
          ))}
        </nav>
        <div className="actions">
          <span className="save">View only</span>
        </div>
      </header>
    </div>
  );
}
