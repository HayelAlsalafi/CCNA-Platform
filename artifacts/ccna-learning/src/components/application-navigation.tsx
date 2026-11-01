import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { ChevronUp, LogIn, LogOut, Settings } from "lucide-react";
import { progressIdentity, sessionQueryKey } from "../lib/learning-progress-cache";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";

// Account controls shared by desktop and mobile NEXUS navigation.
function useAccount() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const query = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });
  return { auth, identity, query };
}
export function AccountMenu({ basePath = "" }: { basePath?: string }) {
  const { auth, identity, query } = useAccount(),
    { user } = useUser(),
    { signOut, openUserProfile } = useClerk();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const actor = useRef("");
  actor.current = `${auth.userId ?? ""}:${auth.sessionId ?? ""}`;
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [auth.userId, auth.sessionId]);
  if (!auth.isLoaded || (auth.isSignedIn && !identity))
    return (
      <div className="sidebar-account" role="status">
        Checking identity…
      </div>
    );
  if (!auth.isSignedIn)
    return (
      <div className="sidebar-account">
        <p>Save your learning progress.</p>
        <Link href="/sign-in" className="account-sign-in">
          <LogIn size={18} /> Sign in
        </Link>
      </div>
    );
  const verifiedUser = user?.id === auth.userId ? user : null;
  const name =
    verifiedUser?.fullName ||
    verifiedUser?.username ||
    query.data?.user.displayName ||
    "Signed-in learner";
  const role = query.isError ? "Role unavailable" : (query.data?.user.role ?? "Checking role");
  const initials =
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "U";
  return (
    <div className="sidebar-account" data-testid="panel-auth-state">
      <DropdownMenu key={identity?.sessionId}>
        <DropdownMenuTrigger asChild>
          <button
            className="account-trigger"
            type="button"
            disabled={busy}
            aria-label={`Open account menu for ${name}`}
          >
            <span className="account-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="account-details">
              <strong>{name}</strong>
              <span>{role}</span>
            </span>
            <ChevronUp size={17} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="account-dropdown" align="start" side="top" sideOffset={10}>
          <DropdownMenuLabel>
            <strong>{name}</strong>
            <span className="account-menu-role">{role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {verifiedUser && typeof openUserProfile === "function" && (
            <DropdownMenuItem
              onSelect={() => {
                setError("");
                try {
                  openUserProfile();
                } catch {
                  setError("Account settings could not open. Try again.");
                }
              }}
            >
              <Settings aria-hidden="true" /> Account settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            data-testid="button-sign-out"
            onSelect={() => {
              const captured = actor.current;
              setBusy(true);
              setError("");
              void signOut({ redirectUrl: `${basePath}/` })
                .catch(() => {
                  if (actor.current === captured) setError("Sign out failed. Please try again.");
                })
                .finally(() => {
                  if (actor.current === captured) setBusy(false);
                });
            }}
          >
            <LogOut aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {query.isError && (
        <p className="account-message">
          Could not load your role.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="account-message">
          {error}
        </p>
      )}
    </div>
  );
}
