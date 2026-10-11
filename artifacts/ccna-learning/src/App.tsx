import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowRight, CircleAlert, CircleGauge, ClipboardCheck, History, Layers3, LockKeyhole, LogIn, LogOut, Network, Radar, ShieldCheck, Target, UserRound } from 'lucide-react';
import { useGetAdminAccess, useGetCurrentUser, useHealthCheck, getGetCurrentUserQueryKey, getGetAdminAccessQueryKey } from '@workspace/api-client-react';
import type { CurrentUser } from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AdminTopicManager } from '@/components/admin-topics';
import { AdminQuestionManager } from '@/components/admin-questions';
import { ClerkRequestAuth } from '@/components/clerk-request-auth';
import { AdminCacheGuard, AdminSessionBoundary } from '@/components/admin-session-boundary';
import { adminAuthState } from '@/lib/admin-session';
import { PracticeWorkspace } from '@/components/practice-workspace';
import { PracticeHistoryPage } from '@/pages/practice-history';
import { Dashboard, TopicsPage } from '@/pages/learning-progress';
import { ExamSimulatorPage } from '@/pages/exam-simulator';
import { LearningProgressCacheGuard } from '@/components/learning-progress-cache-guard';
import { progressIdentity, sessionQueryKey } from '@/lib/learning-progress-cache';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
// publishableKeyFromHost() fabricates a "clerk.<host>" key when no key is given,
// which would hide a missing configuration. Only use it when a key is set.
const configuredClerkKey: string | undefined = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
const clerkPubKey = configuredClerkKey
  ? publishableKeyFromHost(window.location.hostname, configuredClerkKey)
  : undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

// No bypass: without a publishable key the app shows a configuration screen
// instead of crashing or rendering unauthenticated "fake" access.
function MissingClerkConfig() {
  return (
    <main role="alert" style={{ maxWidth: 560, margin: '15vh auto', padding: 24, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Authentication is not configured</h1>
      <p style={{ marginBottom: 12 }}>
        This app uses Clerk for sign-in. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> for the web app, and
        <code> CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> for the API server, then restart.
      </p>
      <p>See <code>docs/development/clerk-setup.md</code>.</p>
    </main>
  );
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#ef744c',
    colorForeground: '#1b2638',
    colorMutedForeground: '#45546a',
    colorDanger: '#b84d35',
    colorBackground: '#fbfaf6',
    colorInput: '#ffffff',
    colorInputForeground: '#1b2638',
    colorNeutral: '#ded8cb',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '0.5rem',
  },
};

const navItems = [
  { href: '/', label: 'Overview', icon: CircleGauge, exact: true },
  { href: '/topics', label: 'Topic map', icon: Layers3 },
  { href: '/practice', label: 'Practice', icon: Target, exact: true },
  { href: '/exam', label: 'Exam simulator', icon: ClipboardCheck, exact: true },
  { href: '/practice/history', label: 'Practice History', icon: History },
  { href: '/admin', label: 'Admin access', icon: ShieldCheck },
];

function isActivePath(location: string, href: string, exact?: boolean) {
  return exact ? location === href : location.startsWith(href);
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Network />
    </span>
  );
}

function AuthPanel() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const identity = progressIdentity({ isLoaded, isSignedIn, userId, sessionId });
  const { user } = useUser();
  const { signOut } = useClerk();
  const currentUserQuery = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });

  if (!isLoaded || (isSignedIn && !identity)) {
    return <div className="auth-panel auth-panel-muted">Checking identity…</div>;
  }

  if (!isSignedIn) {
    return (
      <div className="auth-panel">
        <div className="auth-panel-label">Learning workspace</div>
        <p className="auth-panel-copy">Sign in to keep your study identity connected.</p>
        <Link href="/sign-in" className="auth-panel-action" data-testid="link-sign-in">
          <LogIn size={14} /> Sign in
        </Link>
      </div>
    );
  }

  const currentUser = currentUserQuery.data?.user;
  const displayName =
    currentUser?.displayName ||
    (user?.id === userId ? user?.fullName || user?.primaryEmailAddress?.emailAddress : null) ||
    'Signed-in learner';

  return (
    <div className="auth-panel" data-testid="panel-auth-state">
      <div className="auth-panel-label">Signed in</div>
      <div className="auth-panel-user">
        <span className="auth-avatar"><UserRound size={14} /></span>
        <span className="auth-panel-name">{displayName}</span>
      </div>
      <div className="auth-panel-role">{currentUser?.role ?? 'Loading role'}</div>
      <button
        type="button"
        className="auth-panel-action auth-panel-button"
        onClick={() => void signOut({ redirectUrl: `${basePath || ''}/` })}
        data-testid="button-sign-out"
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}

function SharedShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const health = useHealthCheck();
  const isHealthy = health.data?.status?.toLowerCase() === 'ok' || health.data?.status?.toLowerCase() === 'healthy';

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link href="/" className="brand" data-testid="link-brand-home">
          <BrandMark />
          <span>
            <span className="brand-name">CCNA / foundation</span>
            <span className="brand-sub">signal desk · v0.2</span>
          </span>
        </Link>
        <div className="side-kicker">Learning workspace</div>
        <nav>
          <ul className="nav-list">
            {navItems.map(({ href, label, icon: Icon, exact }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`nav-link ${isActivePath(location, href, exact) ? 'active' : ''}`}
                  data-testid={`link-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="nav-icon" />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <AuthPanel />
        <div className="side-foot">
          <div className="health-panel" data-testid="panel-health-status">
            <div className="health-label"><span>API link</span><span>live</span></div>
            <div className="health-state">
              <span className={`health-dot ${health.isError ? 'down' : ''}`} />
              <span data-testid="status-health">{health.isLoading ? 'Checking service' : isHealthy ? 'Service operational' : 'Awaiting status'}</span>
            </div>
          </div>
          <p className="side-note">A quiet place to close the gaps between now and exam day.</p>
        </div>
      </aside>
      <header className="mobile-top">
        <Link href="/" className="mobile-brand" data-testid="link-mobile-brand">
          <BrandMark />
          <span>CCNA / foundation</span>
        </Link>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={isActivePath(location, href, exact) ? 'active' : ''}
              aria-label={label}
              data-testid={`link-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon />
            </Link>
          ))}
        </nav>
      </header>
      <main className="main-area">{children}</main>
    </div>
  );
}

function PageHeader({ eyebrow, title, lead, action }: { eyebrow: string; title: string; lead: string; action?: ReactNode }) {
  return (
    <header className="page-head reveal">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-heading">{title}</h1>
        <p className="page-lead">{lead}</p>
      </div>
      {action}
    </header>
  );
}

function PracticePage() {
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Practice / foundation mode" title="Practice with a clean signal." lead="Bring one question into focus. Choose deliberately, submit for server-checked feedback, then move on when you are ready." />
      <div className="practice-frame">
        <section className="practice-hero reveal reveal-1">
          <div className="eyebrow" style={{ color: '#f5916f' }}>Recall / in sequence</div>
          <h2>Make the concept answer back.</h2>
          <p>Work through active CCNA topics one prompt at a time. The question stays neutral until you submit; the answer service returns the result and explanation.</p>
          <a href="#practice-session" className="button-primary" data-testid="link-enter-practice"><Target size={15} /> Choose a topic <ArrowRight size={15} /></a>
        </section>
        <div className="practice-info reveal reveal-2">
          <div className="practice-info-card"><div className="practice-info-number">01</div><div className="practice-info-title">Select a domain</div><p className="practice-info-copy">Stay with one active topic long enough to retrieve what you know.</p></div>
          <div className="practice-info-card"><div className="practice-info-number">02</div><div className="practice-info-title">Commit an answer</div><p className="practice-info-copy">No correctness hints appear before the answer is checked.</p></div>
          <div className="practice-info-card"><div className="practice-info-number">03</div><div className="practice-info-title">Read the reasoning</div><p className="practice-info-copy">Use the server-returned explanation to close the loop.</p></div>
        </div>
        <div id="practice-session"><PracticeWorkspace isAuthLoaded={isLoaded} isSignedIn={Boolean(isSignedIn)} /></div>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="auth-page">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="auth-page">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

export function AdminPage() {
  const [location] = useLocation();
  const questionsPage = location === '/admin/questions';
  const auth = useAuth();
  const { isLoaded, isSignedIn } = auth;
  const authState = adminAuthState(auth);
  const identity = authState.status === 'signed-in' ? authState.identity : null;
  const currentUserQuery = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });
  const currentUser = currentUserQuery.data?.user;
  const adminAccessQuery = useGetAdminAccess({
    query: {
      queryKey: sessionQueryKey(getGetAdminAccessQueryKey(), identity),
      enabled: Boolean(identity) && currentUser?.role === 'ADMIN',
      retry: false,
      gcTime: 0,
    },
  });

  if (!isLoaded || (isSignedIn && (!identity || currentUserQuery.isLoading))) {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / restricted surface" title="Checking access." lead="The server is verifying your authentication and application role before showing this surface." />
        <div className="empty-card" data-testid="loading-admin-access"><div className="skeleton" style={{ height: 14, width: 180, margin: '0 auto' }} /></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / sign in required" title="Admin tools are restricted." lead="Sign in first. The server will verify your application role before granting access." />
        <section className="admin-boundary">
          <div className="admin-message reveal reveal-1">
            <LockKeyhole color="var(--signal)" size={23} />
            <h2>Authentication required.</h2>
            <p>This route does not grant access by itself. Sign in through Clerk, then return here for a server-side authorization check.</p>
            <Link href="/sign-in" className="button-primary" data-testid="link-admin-sign-in"><LogIn size={15} /> Sign in</Link>
          </div>
          <div className="boundary-mark reveal reveal-2" aria-label="Admin tools placeholder" data-testid="panel-admin-placeholder">
            <div className="boundary-diagram" aria-hidden="true"><span className="orbit-dot one" /><span className="orbit-dot two" /><span className="orbit-dot three" /><div className="boundary-circle"><div className="boundary-core"><LockKeyhole /></div></div></div>
          </div>
        </section>
      </div>
    );
  }

  if (currentUserQuery.isError || !currentUser) {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / session issue" title="We could not verify your account." lead="Your Clerk session may have expired, or the local user bridge could not be loaded." />
        <div className="error-card" data-testid="error-admin-session"><CircleAlert size={26} color="var(--signal)" aria-hidden="true" /><h2 className="error-title">Session verification failed</h2><p className="error-copy">Sign out and sign in again to retry the server-side check.</p></div>
      </div>
    );
  }

  if (currentUser.role !== 'ADMIN') {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / forbidden" title="This surface is for administrators." lead="Your account is authenticated, but it does not have the ADMIN role in the application database." />
        <section className="admin-boundary">
          <div className="admin-message reveal reveal-1">
            <ShieldCheck color="var(--signal)" size={23} />
            <h2>Access denied.</h2>
            <p>Frontend route visibility is not the security control. The API also rejects this account with HTTP 403 when it calls the admin boundary.</p>
            <Link href="/" className="button-primary" data-testid="link-return-dashboard"><ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} /> Return to overview</Link>
          </div>
          <div className="boundary-mark reveal reveal-2" aria-label="Forbidden admin tools placeholder" data-testid="panel-admin-forbidden">
            <div className="boundary-diagram" aria-hidden="true"><span className="orbit-dot one" /><span className="orbit-dot two" /><span className="orbit-dot three" /><div className="boundary-circle"><div className="boundary-core"><LockKeyhole /></div></div></div>
          </div>
        </section>
      </div>
    );
  }

  if (!identity || adminAccessQuery.isPending) {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / restricted surface" title="Checking administrator access." lead="The server is confirming the ADMIN policy for this authenticated account." />
        <div className="empty-card" data-testid="loading-admin-policy"><div className="skeleton" style={{ height: 14, width: 220, margin: '0 auto' }} /></div>
      </div>
    );
  }

  if (adminAccessQuery.isError || adminAccessQuery.data?.allowed !== true) {
    return (
      <div className="page-wrap">
        <PageHeader eyebrow="Boundary / authorization error" title="The server did not grant admin access." lead="The UI does not assume that a role label is enough; it also checks the protected API boundary." />
        <div className="error-card" data-testid="error-admin-policy"><CircleAlert size={26} color="var(--signal)" aria-hidden="true" /><h2 className="error-title">Authorization check failed</h2><p className="error-copy">Try again after confirming your account is active.</p><button className="button-quiet" onClick={() => void adminAccessQuery.refetch()} data-testid="button-retry-admin"><Radar size={15} /> Retry access check</button></div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={questionsPage ? 'Admin / question management' : 'Admin / topic management'}
        title={questionsPage ? 'Manage questions.' : 'Manage topics.'}
        lead={questionsPage
          ? 'Create, edit, filter and disable single-answer multiple-choice questions. The server verifies every action.'
          : 'Create, edit and disable curriculum topics. Every action is re-checked by the server-side ADMIN policy.'}
        action={questionsPage
          ? <Link href="/admin" className="button-primary" data-testid="link-admin-topics">Manage topics <ArrowRight size={15} /></Link>
          : <Link href="/admin/questions" className="button-primary" data-testid="link-admin-questions">Manage questions <ArrowRight size={15} /></Link>}
      />
      <AdminSessionBoundary key={questionsPage ? 'questions' : 'topics'} identity={identity}>
        {questionsPage ? <AdminQuestionManager /> : <AdminTopicManager />}
      </AdminSessionBoundary>

    </div>
  );
}

function NotFound() {
  return (
    <div className="route-not-found">
      <div>
        <div className="eyebrow">404 / route not found</div>
        <h1>That path is not in the map.</h1>
        <p>Return to the learning workspace and pick a known route.</p>
        <Link href="/" className="button-primary" data-testid="link-not-found-home"><ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} /> Back to overview</Link>
      </div>
    </div>
  );
}

function Router() {
  const [location, setLocation] = useLocation();
  const stripBase = (to: string) => (basePath && to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to);
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl || undefined}
      appearance={clerkAppearance}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
    <ClerkRequestAuth>
    <LearningProgressCacheGuard />
    <AdminCacheGuard />
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/sign-in/*?"><SignInPage /></Route>
        <Route path="/sign-up/*?"><SignUpPage /></Route>
        <Route path="/"><SharedShell><Dashboard /></SharedShell></Route>
        <Route path="/topics"><SharedShell><TopicsPage /></SharedShell></Route>
        <Route path="/practice/history"><SharedShell><PracticeHistoryPage /></SharedShell></Route>
        <Route path="/exam"><SharedShell><ExamSimulatorPage /></SharedShell></Route>
        <Route path="/practice"><SharedShell><PracticePage /></SharedShell></Route>
        <Route path="/admin/questions"><SharedShell><AdminPage /></SharedShell></Route>
        <Route path="/admin"><SharedShell><AdminPage /></SharedShell></Route>
        <Route><NotFound /></Route>
      </Switch>
    </ErrorBoundary>
    </ClerkRequestAuth>
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          {clerkPubKey ? <Router /> : <MissingClerkConfig />}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
