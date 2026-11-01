import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowRight, CircleAlert, LockKeyhole, LogIn, Radar, ShieldCheck, Target } from 'lucide-react';
import { useGetAdminAccess, useGetCurrentUser, getGetCurrentUserQueryKey, getGetAdminAccessQueryKey } from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AdminTopicManager } from '@/components/admin-topics';
import { AdminQuestionManager } from '@/components/admin-questions';
import { AdminTaxonomyManager } from '@/components/admin-taxonomy';
import { AdminQuestionImport } from '@/components/admin-question-import';
import { AdminLessonManager } from '@/components/admin-lessons';
import { LessonReader } from '@/pages/lesson-reader';
import { AdminOverview } from '@/components/admin-overview';
import { AdminPageHeader } from '@/components/admin-ui';
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
import { NexusAppShell } from '@/components/nexus-shell';
import { NexusOverview } from '@/pages/nexus-overview';
import { NexusPractice } from '@/pages/nexus-practice';
import { NexusHistory } from '@/pages/nexus-history';
import { LearnerProfile } from '@/pages/learner-profile';

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
  const path = location.split('?')[0];
  const questionsPage = path === '/admin/questions';
  const topicsPage = path === '/admin/topics';
  const taxonomyPage = location.split('?')[0] === '/admin/taxonomy';
  const importPage = path === '/admin/import';
  const lessonsPage = path === '/admin/lessons';
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
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / restricted surface" title="Checking access." lead="The server is verifying your authentication and application role before showing this surface." />
        <div className="empty-card" data-testid="loading-admin-access"><div className="skeleton" style={{ height: 14, width: 180, margin: '0 auto' }} /></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / sign in required" title="Admin tools are restricted." lead="Sign in first. The server will verify your application role before granting access." />
        <section className="admin-boundary">
          <div className="admin-message reveal reveal-1">
            <LockKeyhole color="var(--signal)" size={23} />
            <h2>Authentication required.</h2>
            <p>Sign in to access content management. Your account must have administrator access.</p>
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
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / session issue" title="We could not verify your account." lead="Your session may have expired. Retry, or sign in again." />
        <div className="error-card" data-testid="error-admin-session"><CircleAlert size={26} color="var(--signal)" aria-hidden="true" /><h2 className="error-title">Session verification failed</h2><p className="error-copy">Sign out and sign in again to retry the server-side check.</p></div>
      </div>
    );
  }

  if (currentUser.role !== 'ADMIN') {
    return (
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / forbidden" title="This surface is for administrators." lead="Your account does not have administrator access." />
        <section className="admin-boundary">
          <div className="admin-message reveal reveal-1">
            <ShieldCheck color="var(--signal)" size={23} />
            <h2>Access denied.</h2>
            <p>Contact your administrator if you need access to content management.</p>
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
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / restricted surface" title="Checking administrator access." lead="The server is confirming the ADMIN policy for this authenticated account." />
        <div className="empty-card" data-testid="loading-admin-policy"><div className="skeleton" style={{ height: 14, width: 220, margin: '0 auto' }} /></div>
      </div>
    );
  }

  if (adminAccessQuery.isError || adminAccessQuery.data?.allowed !== true) {
    return (
      <div className="page-wrap admin-page">
        <PageHeader eyebrow="Boundary / authorization error" title="The server did not grant admin access." lead="We could not confirm administrator access. Check your connection and try again." />
        <div className="error-card" data-testid="error-admin-policy"><CircleAlert size={26} color="var(--signal)" aria-hidden="true" /><h2 className="error-title">Authorization check failed</h2><p className="error-copy">Try again after confirming your account is active.</p><button className="button-quiet" onClick={() => void adminAccessQuery.refetch()} data-testid="button-retry-admin"><Radar size={15} /> Retry access check</button></div>
      </div>
    );
  }

  return (
    <div className="page-wrap admin-page">
      {!questionsPage&&!lessonsPage&&<AdminPageHeader title={taxonomyPage?'Exam taxonomy':importPage?'Import questions':topicsPage?'Curriculum topics':'Administration'} description={taxonomyPage?'Organize blueprint versions, domains and objectives. Associate questions through explicit review.':importPage?'Download a template, validate your file and review every row before importing drafts.':topicsPage?'Organize learning content and control topic visibility.':'A clear view of your learning content and the tools to manage it.'}/>}
      <AdminSessionBoundary key={path} identity={identity}>{lessonsPage?<AdminLessonManager/>:taxonomyPage?<AdminTaxonomyManager/>:importPage?<AdminQuestionImport/>:questionsPage?<AdminQuestionManager/>:topicsPage?<AdminTopicManager/>:<AdminOverview/>}</AdminSessionBoundary>
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

// One persistent shell surrounds the workspace switch. Route changes replace
// page content without remounting navigation or resetting its collapse state.
export function ApplicationRoutes() {
  const [location] = useLocation();
  return (
    <Switch>
      <Route path="/sign-in/*?"><SignInPage /></Route>
      <Route path="/sign-up/*?"><SignUpPage /></Route>
      <Route>
        <NexusAppShell basePath={basePath}>
          <ErrorBoundary resetKey={location}>
            <Switch>
              <Route path="/"><NexusOverview /></Route>
              <Route path="/profile"><LearnerProfile /></Route>
              <Route path="/topics"><TopicsPage /></Route>
              <Route path="/learn/chapters/:chapterId/lessons/:lessonId">{params => <LessonReader chapterId={params.chapterId} lessonId={params.lessonId} />}</Route>
              <Route path="/learn/chapters/:chapterId">{params => <LessonReader chapterId={params.chapterId} />}</Route>
              <Route path="/practice/history"><NexusHistory /></Route>
              <Route path="/exam"><ExamSimulatorPage /></Route>
              <Route path="/practice"><NexusPractice /></Route>
              <Route path="/admin/topics"><AdminPage /></Route>
              <Route path="/admin/questions"><AdminPage /></Route>
              <Route path="/admin/taxonomy"><AdminPage /></Route>
              <Route path="/admin/import"><AdminPage /></Route>
              <Route path="/admin/lessons"><AdminPage /></Route>
              <Route path="/admin"><AdminPage /></Route>
              <Route><NotFound /></Route>
            </Switch>
          </ErrorBoundary>
        </NexusAppShell>
      </Route>
    </Switch>
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
    <ErrorBoundary resetKey={location}><ApplicationRoutes /></ErrorBoundary>
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
