import { useAuth } from '@clerk/react';
import { CurriculumExplorer } from './curriculum';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Layers3,
  LockKeyhole,
  Radar,
  Target,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  getListTopicsQueryKey,
  useGetLearningProgress,
  useListTopics,
} from '@workspace/api-client-react';
import type { LearningTopicProgress, TopicSummary } from '@workspace/api-client-react';
import {
  learningProgressOptions,
  progressIdentity,
  type ProgressIdentity,
} from '../lib/learning-progress-cache';

const percent = (value: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) + '%';

function CoverageBar({ topic }: { topic: LearningTopicProgress }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={topic.topicName + ' current coverage'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={topic.coveragePercent}
    >
      <div className="progress-value" style={{ width: percent(topic.coveragePercent) }} />
    </div>
  );
}

function TopicCard({
  topic,
  metadata,
  index,
  count,
}: {
  topic: LearningTopicProgress;
  metadata?: TopicSummary;
  index: number;
  count: number;
}) {
  const available = topic.status === 'ACTIVE' && topic.availableQuestionCount > 0;
  return (
    <article id={metadata?.slug} className="topic-card" data-testid={'card-topic-' + topic.topicId}>
      <div className="topic-top">
        <span className="topic-index">
          {String(index + 1).padStart(2, '0')} / {count}
        </span>
        <span className="topic-accuracy">
          {topic.status === 'DISABLED' ? 'Historical / disabled' : 'Active topic'}
        </span>
      </div>
      <h3 className="topic-name">{topic.topicName}</h3>
      <p className="topic-description">
        {metadata?.description ||
          (topic.status === 'DISABLED'
            ? 'Your historical attempts are retained for this disabled topic.'
            : 'Practice available questions and follow your current coverage.')}
      </p>
      <dl className="topic-progress-metrics">
        <div>
          <dt>Attempts</dt>
          <dd>{topic.totalAttempts}</dd>
        </div>
        <div>
          <dt>Correct attempts</dt>
          <dd>{topic.correctAttempts}</dd>
        </div>
        <div>
          <dt>Unique historical questions</dt>
          <dd>{topic.uniqueQuestionsAttempted}</dd>
        </div>
        <div>
          <dt>Answer accuracy</dt>
          <dd>{percent(topic.accuracy)}</dd>
        </div>
      </dl>
      <div className="topic-bottom">
        <div className="topic-stats">
          <span>Current coverage</span>
          <strong>{percent(topic.coveragePercent)}</strong>
        </div>
        <CoverageBar topic={topic} />
        <p className="topic-coverage-count">
          {topic.coveredQuestionCount} of {topic.availableQuestionCount} currently available
          questions covered
        </p>
        {available ? (
          <Link
            href={'/practice?topicId=' + encodeURIComponent(topic.topicId)}
            className="topic-practice-link"
            data-testid={'link-practice-topic-' + topic.topicId}
          >
            Start practice <ArrowRight size={13} />
          </Link>
        ) : (
          <p className="topic-unavailable">
            {topic.status === 'DISABLED'
              ? 'Practice unavailable for this disabled topic.'
              : 'No available questions in this topic.'}
          </p>
        )}
      </div>
    </article>
  );
}

function TopicGrid({
  topics,
  catalog,
}: {
  topics: LearningTopicProgress[];
  catalog: TopicSummary[];
}) {
  return (
    <div className="topic-grid" data-testid="grid-topics">
      {topics.map((topic, index) => (
        <TopicCard
          key={topic.topicId}
          topic={topic}
          metadata={catalog.find((item) => item.id === topic.topicId)}
          index={index}
          count={topics.length}
        />
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="quick-row" data-testid={'metric-' + label.toLowerCase().replace(/\s+/g, '-')}>
      <span className="quick-label">{label}</span>
      <span className="quick-value">{value}</span>
    </div>
  );
}

function ProgressContents({
  identity,
  view,
}: {
  identity: ProgressIdentity;
  view: 'dashboard' | 'topics';
}) {
  const query = useGetLearningProgress(learningProgressOptions(identity));
  // Catalog statistics are deliberately ignored; this query supplies only
  // public descriptions/slugs, and a failure never replaces real progress.
  const catalogQuery = useListTopics({
    query: { queryKey: getListTopicsQueryKey(), retry: false },
  });
  const catalog = catalogQuery.data ?? [];
  const retry = () => {
    void query.refetch();
  };

  if (query.isError) {
    const status = query.error?.status;
    const access = status === 401 || status === 403;
    return (
      <div
        className="error-card"
        role="alert"
        data-testid={'error-learning-progress-' + (status ?? 'network')}
      >
        {access ? (
          <LockKeyhole size={26} aria-hidden="true" />
        ) : (
          <CircleAlert size={26} aria-hidden="true" />
        )}
        <h2 className="error-title">
          {status === 401
            ? 'Your session could not be verified.'
            : status === 403
              ? 'Access to learning progress was denied.'
              : 'Learning progress could not be loaded.'}
        </h2>
        <p className="error-copy">
          {status === 401
            ? 'Sign in again to load your own progress.'
            : status === 403
              ? 'Ask an administrator to check your account access.'
              : 'Check your connection, then try again.'}
        </p>
        {status === 401 ? (
          <Link href="/sign-in" className="button-primary">
            Return to sign in <ArrowRight size={15} />
          </Link>
        ) : null}
        <button type="button" className="button-quiet" disabled={query.isFetching} onClick={retry}>
          <Radar size={15} /> Retry progress
        </button>
      </div>
    );
  }
  if (query.isPending || !query.data) {
    return (
      <div className="loading-grid" role="status" data-testid="loading-learning-progress">
        <p>Loading your learning progress…</p>
        {[1, 2, 3].map((item) => (
          <div className="loading-card" key={item}>
            <div className="skeleton" style={{ height: 100 }} />
          </div>
        ))}
      </div>
    );
  }

  const { summary, topics } = query.data;
  const active = topics.filter((topic) => topic.status === 'ACTIVE');
  const historical = topics.filter((topic) => topic.status === 'DISABLED');
  const focus = active.find((topic) => topic.availableQuestionCount > 0);

  return (
    <div aria-busy={query.isFetching}>
      {query.isFetching ? (
        <p className="progress-refresh-note" role="status">
          Updating your learning progress…
        </p>
      ) : null}
      {summary.totalAttempts === 0 ? (
        <div className="progress-notice" data-testid="empty-learning-attempts">
          <BookOpen size={20} aria-hidden="true" />
          <div>
            <h2>No practice attempts yet.</h2>
            <p>
              Submit an answer in Practice to start your learning record. Coverage includes correct
              and incorrect answers.
            </p>
          </div>
        </div>
      ) : null}
      {summary.availableQuestionCount === 0 ? (
        <p className="progress-notice" data-testid="empty-available-questions">
          No questions are currently available. Historical attempts and accuracy are retained.
        </p>
      ) : null}
      {view === 'dashboard' ? (
        <>
          <section className="dashboard-grid reveal reveal-1" aria-label="Learning summary">
            <div className="summary-banner" data-testid="panel-dashboard-summary">
              <div className="summary-kicker">Your historical learning record</div>
              <h2 className="summary-title">
                <em>{summary.totalAttempts}</em> practice attempts recorded.
              </h2>
              <div className="summary-meta">
                <div className="summary-meta-item">
                  <span className="summary-meta-label">Overall answer accuracy</span>
                  <span className="summary-meta-value">{percent(summary.overallAccuracy)}</span>
                </div>
                <div className="summary-meta-item">
                  <span className="summary-meta-label">Current coverage</span>
                  <span className="summary-meta-value">{percent(summary.coveragePercent)}</span>
                </div>
                <div className="summary-meta-item">
                  <span className="summary-meta-label">Active topics</span>
                  <span className="summary-meta-value">{active.length}</span>
                </div>
              </div>
              <p className="summary-coverage-note">
                {summary.coveredQuestionCount} of {summary.availableQuestionCount} currently
                available questions covered. Coverage measures practice, not correctness.
              </p>
            </div>
            <div className="quick-card progress-totals" aria-label="Practice totals">
              <h2 className="card-kicker">Practice totals</h2>
              <Metric label="Total attempts" value={summary.totalAttempts} />
              <Metric label="Correct attempts" value={summary.correctAttempts} />
              <Metric
                label="Unique historical questions"
                value={summary.uniqueQuestionsAttempted}
              />
              <Metric
                label="Currently available questions"
                value={summary.availableQuestionCount}
              />
            </div>
          </section>
          <div className="section-head reveal reveal-2">
            <h2 className="section-title">Next practice topic</h2>
            <Link href="/topics" className="section-link" data-testid="link-view-all-topics">
              View curriculum <ChevronRight size={14} />
            </Link>
          </div>
          {focus ? (
            <section className="focus-layout reveal reveal-2">
              <div className="focus-card" data-testid="panel-focus-topic">
                <div className="focus-copy">
                  <div className="focus-label">Continue practicing</div>
                  <h3 className="focus-name">{focus.topicName}</h3>
                  <p className="focus-desc">
                    {catalog.find((item) => item.id === focus.topicId)?.description ||
                      'Practice the questions currently available in this topic.'}
                  </p>
                  <Link
                    href={'/practice?topicId=' + encodeURIComponent(focus.topicId)}
                    className="topic-practice-link"
                  >
                    Start practice <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="focus-progress">
                  <div className="progress-label">
                    <span>Current coverage</span>
                    <span>{percent(focus.coveragePercent)}</span>
                  </div>
                  <CoverageBar topic={focus} />
                </div>
              </div>
              <div className="quick-card">
                <Metric label="Topic attempts" value={focus.totalAttempts} />
                <Metric label="Topic correct attempts" value={focus.correctAttempts} />
                <div className="quick-row">
                  <span className="quick-label">Topic answer accuracy</span>
                  <span className="quick-value">{percent(focus.accuracy)}</span>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="topics-toolbar">
          <span className="catalog-count">
            {String(active.length).padStart(2, '0')} ACTIVE TOPICS · FOUNDATION SCOPE
          </span>
          <span className="filter-note">Coverage and answer accuracy measure different things</span>
        </div>
      )}
      <div className="section-head">
        <h2 className="section-title">Active topics</h2>
        <span className="filter-note">{active.length} mapped</span>
      </div>
      {active.length ? (
        <TopicGrid topics={active} catalog={catalog} />
      ) : (
        <div className="empty-card" data-testid="empty-active-topics">
          <Layers3 size={26} aria-hidden="true" />
          <h2 className="empty-title">No active topics.</h2>
          <p className="empty-copy">The current curriculum has no active topics.</p>
        </div>
      )}
      {historical.length ? (
        <section aria-label="Historical topics">
          <div className="section-head">
            <h2 className="section-title">Historical topics</h2>
            <span className="filter-note">Disabled · your history only</span>
          </div>
          <TopicGrid topics={historical} catalog={catalog} />
        </section>
      ) : null}
    </div>
  );
}

function LearningPage({ view }: { view: 'dashboard' | 'topics' }) {
  const auth = useAuth();
  const identity = progressIdentity(auth);
  const checking = !auth.isLoaded || Boolean(auth.isSignedIn && !identity);
  return (
    <div className="page-wrap">
      <header className="page-head reveal">
        <div>
          <div className="eyebrow">
            {view === 'dashboard' ? 'Learning / your progress' : 'Curriculum / your topic map'}
          </div>
          <h1 className="page-heading">
            {view === 'dashboard' ? 'See the next right move.' : 'Topic map'}
          </h1>
          <p className="page-lead">
            Your historical attempts and accuracy, alongside coverage of the questions available
            now.
          </p>
        </div>
        <Link href="/practice" className="button-primary" data-testid="link-start-practice">
          <Target size={15} /> Start practice <ArrowRight size={15} />
        </Link>
      </header>
      <div className="header-rule" />
      {checking ? (
        <div className="practice-state-card" role="status" data-testid="loading-progress-auth">
          Checking your identity…
        </div>
      ) : !identity ? (
        <div
          className="practice-state-card practice-access-card"
          data-testid="progress-sign-in-required"
        >
          <LockKeyhole size={24} aria-hidden="true" />
          <div>
            <h2>Sign in to see your learning progress.</h2>
            <p>Your dashboard and topic coverage are private to your account.</p>
            <Link href="/sign-in" className="button-primary">
              Sign in <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      ) : (
        <ProgressContents
          key={identity.userId + ':' + identity.sessionId}
          identity={identity}
          view={view}
        />
      )}
    </div>
  );
}

export function Dashboard() {
  return <LearningPage view="dashboard" />;
}
export function TopicsPage() {
  return <CurriculumExplorer />;
}
