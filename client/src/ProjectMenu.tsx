import { useCallback, useState, type FormEvent } from 'react';
import type { ProjectSummary } from '../../shared/plan';
import { useDismiss } from './useDismiss';

type Props = {
  projects: ProjectSummary[];
  current: ProjectSummary | null;
  disabled: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

export function ProjectMenu({ projects, current, disabled, onOpen, onNew, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    setName(null);
  }, []);
  const menu = useDismiss<HTMLDivElement>(open, close);

  const run = (action: () => void) => () => {
    close();
    action();
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (name?.trim()) onRename(name.trim());
    close();
  };

  return (
    <div className="projects" ref={menu}>
      <button aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} disabled={disabled}>
        <span>{current?.name ?? 'Your projects'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="project-menu">
          {projects.map((p) => (
            <button
              key={p.id}
              className={p.id === current?.id ? 'active' : ''}
              onClick={run(() => {
                if (p.id !== current?.id) onOpen(p.id);
              })}
            >
              {p.name}
            </button>
          ))}
          {current && (
            <div className="project-actions">
              <button onClick={run(onNew)}>+ New project</button>
              {name === null ? (
                <button onClick={() => setName(current.name)}>Rename project</button>
              ) : (
                <form onSubmit={rename}>
                  <input
                    aria-label="Project name"
                    autoFocus
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </form>
              )}
              <button className="danger" onClick={run(onDelete)}>
                Delete project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
