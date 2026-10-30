import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../../shared/plan';

type Props = {
  projects: ProjectSummary[];
  current: ProjectSummary | null;
  disabled: boolean;
  onOpen: (id: string) => void;
  onDelete: () => void;
};

export function ProjectMenu({ projects, current, disabled, onOpen, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
