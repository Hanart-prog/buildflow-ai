import { useState } from 'react';
import { buildPrompt } from '../../shared/exportPlan';
import type { Project } from '../../shared/plan';
import { Modal } from './Modal';

type Props = { project: Project; openQuestions: number; onClose: () => void };

// The way out of the plan: everything a coding tool needs, in one paste.
export function StartBuilding({ project, openQuestions, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const prompt = buildPrompt(project.name, project.plan);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  };

  return (
    <Modal label="Start building" className="start" onClose={onClose}>
      <h2>Start building</h2>
      <p>This prompt holds your whole plan. Paste it into a coding tool like Claude Code or Cursor and it can start from there.</p>
      {openQuestions > 0 && (
        <p className="start-note">
          {openQuestions} {openQuestions === 1 ? 'question is' : 'questions are'} still open. Answering first makes the
          plan sharper.
        </p>
      )}
      <pre tabIndex={0}>{prompt}</pre>
      <button className="primary" onClick={copy}>
        {copied ? 'Copied' : 'Copy prompt'}
      </button>
    </Modal>
  );
}
