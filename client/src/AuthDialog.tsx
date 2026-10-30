import { useState, type FormEvent } from 'react';
import type { User } from '../../shared/plan';
import { api } from './api';
import { Modal } from './Modal';

export type AuthMode = 'signup' | 'login';

type Props = {
  mode: AuthMode;
  hasIdea: boolean;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onDone: (user: User) => void;
};

export function AuthDialog({ mode, hasIdea, onMode, onClose, onDone }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const signingUp = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      onDone((await api[mode](email, password)).user);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong');
      setSending(false);
    }
  };

  return (
    <Modal label={signingUp ? 'Create your account' : 'Log in'} onClose={onClose}>
      <form className="auth" onSubmit={submit}>
        <h2>{signingUp ? 'Create your account' : 'Welcome back'}</h2>
        {hasIdea && <p>Your idea is saved. It starts building as soon as you are in.</p>}
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            required
            minLength={signingUp ? 8 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && <small>At least 8 characters</small>}
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={sending}>
          {signingUp ? 'Create account' : 'Log in'}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            onMode(signingUp ? 'login' : 'signup');
            setError(null);
          }}
        >
          {signingUp ? 'I already have an account' : 'I need an account'}
        </button>
      </form>
    </Modal>
  );
}
