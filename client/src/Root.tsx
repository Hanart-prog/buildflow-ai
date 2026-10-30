import { useEffect, useState } from 'react';
import type { User } from '../../shared/plan';
import { api, setSessionExpired } from './api';
import { App } from './App';
import { Landing } from './Landing';

export function Root() {
  // Undefined until the server says whether this browser is logged in.
  const [user, setUser] = useState<User | null | undefined>();
  // What a visitor asked to build before they had an account.
  const [idea, setIdea] = useState<string>();

  useEffect(() => {
    setSessionExpired(() => setUser(null));
    api
      .me()
      .then((me) => setUser(me.user))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return null;
  if (!user) {
    return (
      <Landing
        onDone={(next, startIdea) => {
          setIdea(startIdea);
          setUser(next);
        }}
      />
    );
  }
  return <App key={user.id} user={user} idea={idea} onLogout={() => setUser(null)} />;
}
