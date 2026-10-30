import { useCallback, useState } from 'react';
import type { ProjectSummary } from '../../shared/plan';
import { useDismiss } from './useDismiss';

type Props = {
  projects: ProjectSummary[];
  current: ProjectSummary | null;
  disabled: boolean;
  onOpen: (id: string) => void;
  onDelete: () => void;
};

export function ProjectMenu({ projects, current, disabled, onOpen, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []));

  return (
    <div className="projects" ref={menu}>
      <button aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={disabled}>
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
              onClick={() => {
                setOpen(false);
                if (p.id !== current?.id) onOpen(p.id);
              }}
            >
              {p.name}
            </button>
          ))}
          {current && (
            <button
              className="danger"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Delete this project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
