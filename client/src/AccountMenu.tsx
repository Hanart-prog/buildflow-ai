import { useCallback, useState } from 'react';
import type { User } from '../../shared/plan';
import { useDismiss } from './useDismiss';

type Props = { user: User; disabled: boolean; onLogout: () => void };

export function AccountMenu({ user, disabled, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []));

  return (
    <div className="account" ref={menu}>
      <button
        aria-label="Account"
        aria-expanded={open}
        title={user.email}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      >
        {user.email[0]}
      </button>
      {open && (
        <div className="project-menu account-menu">
          <p>{user.email}</p>
          <button onClick={onLogout}>Log out</button>
        </div>
      )}
    </div>
  );
}
