import { useState } from 'react';
import { buildPrompt, planMarkdown } from '../../shared/exportPlan';
import type { Project } from '../../shared/plan';
import { api } from './api';

type Props = { project: Project; onFlush: () => Promise<void>; onError: (message: string) => void };

const fileName = (name: string) => `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'plan'}.md`;

export function ExportMenu({ project, onFlush, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shareId, setShareId] = useState(project.shareId);

  const copy = async (text: string, done: string) => {
    await navigator.clipboard.writeText(text);
    setNote(done);
  };

  const attempt = (action: () => Promise<void>) => async () => {
    try {
      await onFlush();
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That did not work');
    }
  };

  const download = attempt(async () => {
    const url = URL.createObjectURL(new Blob([planMarkdown(project.name, project.plan)], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(project.name);
    link.click();
    URL.revokeObjectURL(url);
    setNote('Downloaded');
  });

  const copyPrompt = attempt(() => copy(buildPrompt(project.name, project.plan), 'Prompt copied'));

  const share = attempt(async () => {
    const { shareId: id } = await api.share(project.id);
    setShareId(id);
    await copy(`${window.location.origin}/share/${id}`, 'Link copied');
  });

  const unshare = attempt(async () => {
    await api.unshare(project.id);
    setShareId(null);
    setNote('Link turned off');
  });

  return (
    <div className="export">
      <button
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setNote(null);
        }}
      >
        Export
      </button>
      {open && (
        <div className="export-menu">
          <button onClick={download}>Download Markdown</button>
          <button onClick={copyPrompt}>Copy prompt for a coding tool</button>
          <button onClick={share}>{shareId ? 'Copy view-only link' : 'Create view-only link'}</button>
          {shareId && <button onClick={unshare}>Turn off link</button>}
          {note && <p role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}
