export type RequestSession = {
  id: string;
  user?: { id: string } | null;
  getToken(): Promise<string | null>;
};
export type RequestAuthState = {
  loaded: boolean;
  session: RequestSession | null | undefined;
  generation: number;
};

// The real Clerk SDK supplies the token; the API verifies it and resolves DB RBAC.
export function createSessionTokenGetter(read: () => RequestAuthState) {
  return async (): Promise<string | null> => {
    const captured = { ...read() };
    if (!captured.loaded) throw new Error('Authentication is still loading.');
    if (!captured.session) return null;
    const session = captured.session;
    const sessionId = session.id;
    const userId = session.user?.id;
    const token = await session.getToken();
    const current = read();
    if (!current.loaded || current.generation !== captured.generation ||
        current.session?.id !== sessionId || current.session?.user?.id !== userId) {
      throw new Error('The authentication session changed before request dispatch.');
    }
    if (!token) throw new Error('The active session has no authentication token.');
    return token;
  };
}
