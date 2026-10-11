import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  adminAuthState, adminSessionKey, createAdminLifetime,
  removeAdminSessionData, removeOtherAdminData,
  type AdminIdentity, type AdminSessionScope,
} from '../lib/admin-session';

const AdminSessionContext = createContext<AdminSessionScope | null>(null);

// Lives inside Clerk even when the administrator route is not mounted.
export function AdminCacheGuard() {
  const auth = useAuth();
  const client = useQueryClient();
  useLayoutEffect(() => {
    const state = adminAuthState(auth);
    const identity = state.status === 'signed-in' ? state.identity : null;
    removeOtherAdminData(client, identity);
    return () => {
      if (identity) removeAdminSessionData(client, identity);
      else removeOtherAdminData(client, null);
    };
  }, [client, auth.isLoaded, auth.isSignedIn, auth.userId, auth.sessionId]);
  return null;
}

// The authoritative server access gate must admit the identity before mounting.
export function AdminSessionBoundary({ identity, children }: {
  identity: AdminIdentity;
  children: ReactNode;
}) {
  const active = useRef(identity);
  active.current = identity;
  return (
    <SessionLifetime key={adminSessionKey(identity)} identity={identity} active={active}>
      {children}
    </SessionLifetime>
  );
}

function SessionLifetime({ identity, active, children }: {
  identity: AdminIdentity;
  active: { current: AdminIdentity };
  children: ReactNode;
}) {
  const client = useQueryClient();
  const [lifetime] = useState(() => createAdminLifetime(identity, active));
  useLayoutEffect(() => {
    removeOtherAdminData(client, identity);
    lifetime.activate();
    return () => {
      lifetime.deactivate();
      removeAdminSessionData(client, identity);
    };
  }, [client, lifetime, identity.userId, identity.sessionId]);
  return <AdminSessionContext.Provider value={lifetime.scope}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error('Admin manager requires an authorized session boundary.');
  return session;
}
