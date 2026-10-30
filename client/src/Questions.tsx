import { useState, type FormEvent } from 'react';
import type { Question } from '../../shared/plan';

type Props = {
  questions: Question[];
  busy: boolean;
  onAnswer: (id: string, answer: string) => void;
  onSkip: (id: string) => void;
  onDismiss: () => void;
  onClose: () => void;
  onApply: () => void;
};

export function Questions({ questions, busy, onAnswer, onSkip, onDismiss, onClose, onApply }: Props) {
  const [typed, setTyped] = useState('');
  const current = questions.find((q) => !q.answer);

  if (!current) {
    return (
      <aside className="rail-panel questions">
        <p>Thanks. Update the plan with your answers?</p>
        <footer>
          <button className="primary" onClick={onApply} disabled={busy}>
            Update the plan
          </button>
          <button className="quiet" onClick={onDismiss}>
            Not now
          </button>
        </footer>
      </aside>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    onAnswer(current.id, typed.trim());
    setTyped('');
  };

  return (
    <aside className="rail-panel questions">
      <header>
        <span>
          {current.topic} · {questions.indexOf(current) + 1} of {questions.length}
        </span>
        <button aria-label="Close questions" onClick={onClose}>
          ×
        </button>
      </header>
      <p>{current.text}</p>
      {current.options.length > 0 && (
        <div className="answers">
          {current.options.map((option) => (
            <button key={option} onClick={() => onAnswer(current.id, option)}>
              {option}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        <input
          aria-label={current.text}
          placeholder="Or say it your way"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="quiet" type="button" onClick={() => onSkip(current.id)}>
          Skip
        </button>
      </form>
    </aside>
  );
}
