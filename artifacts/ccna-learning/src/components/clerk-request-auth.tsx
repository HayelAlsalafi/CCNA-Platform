import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { createSessionTokenGetter } from '../lib/clerk-request-auth';

// Install request authentication before mounting components that start queries.
export function ClerkRequestAuth({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const { isLoaded } = useAuth();
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let generation = 0;
    let identity = `${clerk.session?.user?.id ?? ''}:${clerk.session?.id ?? ''}`;
    const unsubscribe = clerk.addListener(({ session }) => {
      const next = `${session?.user?.id ?? ''}:${session?.id ?? ''}`;
      if (next !== identity) { identity = next; generation++; }
    });
    const getter = createSessionTokenGetter(() => ({
      loaded: clerk.loaded,
      session: clerk.session,
      generation,
    }));
    // Shared cookies can briefly retain another session during live switching.
    // Bearer authentication uses only the real active session, including on reads.
    setAuthTokenGetter(getter, { credentials: 'omit' });
    setReady(true);
    return () => { unsubscribe(); setAuthTokenGetter(null); };
  }, [clerk]);
  return ready && isLoaded ? children : null;
}
