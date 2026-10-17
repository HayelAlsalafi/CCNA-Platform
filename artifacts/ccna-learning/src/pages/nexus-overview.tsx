import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { customFetch, type PracticeHistoryDetailsResponse } from "@workspace/api-client-react";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { useAuth, useUser } from "@clerk/react";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Layers3,
  RadioTower,
  Target,
} from "lucide-react";
import {
  useNexusAnalytics,
  accuracy,
  recommendTopic,
  useNexusIdentity,
  nexusError,
} from "../lib/nexus";
import { NetworkTopologyMap } from "../components/nexus-visuals";
import { YearlyActivity, SkillMatrix, useLearnerProgress } from "../components/learning-evidence";
import { Skeleton } from "../components/ui/skeleton";
import "./nexus-overview.css";

const overviewTabs = [
  { id: "glance", label: "At a glance", testId: "link-overview-at-a-glance" },
  { id: "topology", label: "Domain topology", testId: "link-overview-domain-topology" },
  { id: "activity", label: "Activity", testId: "link-overview-activity" },
  { id: "skills", label: "Skill evidence", testId: "link-overview-skill-evidence" },
  { id: "next", label: "Next steps", testId: "link-overview-next-steps" },
] as const;
type OverviewTabId = (typeof overviewTabs)[number]["id"];

function MetricReadout({
  index,
  label,
  value,
  detail,
  icon,
}: {
  index: string;
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="overview-readout" data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="overview-readout-head">
        <span className="overview-index">{index}</span>
        <span className="overview-readout-icon" aria-hidden="true">{icon}</span>
      </div>
      <span className="overview-readout-label">{label}</span>
      <strong className="overview-readout-value">{value}</strong>
      <small className="overview-readout-detail">{detail}</small>
    </article>
  );
}

function OverviewSkeleton() {
  return (
    <div className="overview-loading" aria-label="Loading learning metrics" role="status">
      <div className="overview-loading-readouts">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function NexusOverview() {
  const [activeTab, setActiveTab] = useState<OverviewTabId>("glance");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const progress = useLearnerProgress();
  const identity = useNexusIdentity();
  const auth = useAuth();
  const { user } = useUser();
  const query = useNexusAnalytics();
  const data = query.data;
  const next = data ? recommendTopic(data.topics) : null;
  const name = identity && user?.id === identity.userId ? user.firstName || "learner" : "learner";
  const recent = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/recent-answers"], identity),
    enabled: !!identity && !!data && !data.sessions.items.length,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      customFetch<PracticeHistoryDetailsResponse>(
        "/api/practice/history?limit=5&includeDetails=true",
        { signal, credentials: "same-origin", cache: "no-store" },
      ),
  });
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % overviewTabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + overviewTabs.length) % overviewTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = overviewTabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(overviewTabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={
        "nexus-page ccna-overview" +
        (auth.isLoaded && identity && data && !query.isPending && !query.isError
          ? " has-overview-tabs"
          : "")
      }
    >
      <header className="overview-masthead">
        <div className="overview-masthead-copy">
          <div className="overview-kicker">
            <span className="overview-kicker-mark"><RadioTower size={15} /></span>
            <span>CCNA NEXUS <i aria-hidden="true">/</i> FIELD NOTES 01</span>
          </div>
          <h1>{identity ? `Welcome back, ${name}.` : "Connect your next network skill."}</h1>
          <p>Build a clearer understanding of networks, one deliberate challenge at a time.</p>
          <div className="overview-actions">
            {data?.resume && (
              <>
                <Link
                  href={"/practice?resume=" + data.resume.id}
                  className="overview-primary-action"
                  data-testid="link-dashboard-resume-session"
                >
                  Continue session <ArrowUpRight size={15} />
                </Link>
                <Link
                  href="/practice"
                  className="overview-secondary-action"
                  data-testid="link-dashboard-start-practice"
                >
                  Start new practice <ArrowRight size={16} />
                </Link>
              </>
            )}
            {!data?.resume && (
              <Link
                href="/practice"
                className="overview-primary-action"
                data-testid="link-dashboard-start-practice"
              >
                Start practice <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <div className="overview-network-figure" aria-hidden="true">
          <div className="overview-figure-caption"><span>NETWORK / 200—301</span><span>01—06</span></div>
          <svg viewBox="0 0 440 220" role="presentation">
            <path className="overview-circuit-line" d="M28 44h94l56 54h88l64-62h80M28 176h94l56-78h88l64 69h80M178 98V24M266 98v89" />
            <path className="overview-circuit-line faint" d="M122 44v132M330 36v141" />
            <circle cx="178" cy="98" r="33" className="overview-circuit-halo" />
            <circle cx="178" cy="98" r="22" className="overview-circuit-node main" />
            <circle cx="122" cy="44" r="8" className="overview-circuit-node" />
            <circle cx="122" cy="176" r="8" className="overview-circuit-node" />
            <circle cx="266" cy="98" r="8" className="overview-circuit-node" />
            <circle cx="330" cy="36" r="8" className="overview-circuit-node" />
            <circle cx="330" cy="167" r="8" className="overview-circuit-node" />
            <circle cx="406" cy="44" r="5" className="overview-circuit-terminal" />
            <circle cx="406" cy="176" r="5" className="overview-circuit-terminal" />
            <path className="overview-router-mark" d="M168 98h20m-10-10v20m-16-16 6 6-6 6m32-12-6 6 6 6" />
          </svg>
          <div className="overview-figure-foot"><span>LEARNING INSTRUMENT</span><span>RECORDED EVIDENCE ONLY</span></div>
        </div>
        <span className="overview-hero-stamp" aria-hidden="true">N</span>
      </header>

      {!auth.isLoaded ? (
        <div className="overview-state-panel" role="status">
          <Skeleton className="h-32" />
        </div>
      ) : !identity ? (
        <section className="overview-state-panel overview-access-panel">
          <span className="overview-state-icon"><Compass size={19} /></span>
          <div>
            <span className="overview-eyebrow">YOUR WORKSPACE</span>
            <h2>Your learning network starts with you</h2>
            <p>Sign in to see your own progress, domain coverage and recorded practice.</p>
          </div>
          <Link href="/sign-in" className="overview-primary-action" data-testid="link-dashboard-sign-in">
            Sign in <ArrowRight size={16} />
          </Link>
        </section>
      ) : query.isPending ? (
        <OverviewSkeleton />
      ) : query.isError ? (
        <section className="overview-state-panel overview-error-panel" role="alert">
          <span className="overview-state-icon"><Activity size={19} /></span>
          <div>
            <span className="overview-eyebrow">CONNECTION INTERRUPTED</span>
            <h2>Learning data could not load</h2>
            <p>{nexusError(query.error)}</p>
          </div>
          <button
            className="overview-primary-action"
            onClick={() => void query.refetch()}
            data-testid="button-dashboard-retry-analytics"
          >
            Retry <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        data && (
          <>
            <nav className="overview-section-nav" aria-label="Overview sections">
              <span className="overview-section-nav-label">ON THIS PAGE</span>
              <div
                className="overview-tabs"
                role="tablist"
                aria-label="Dashboard sections"
                aria-orientation="horizontal"
              >
                {overviewTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    ref={(element) => {
                      tabRefs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`overview-tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls={`overview-panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    className={activeTab === tab.id ? "is-active" : ""}
                    data-testid={tab.testId}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Link
                href="/topics"
                className="overview-curriculum-nav-link"
                data-testid="link-dashboard-curriculum-nav"
              >
                Browse curriculum <ArrowUpRight size={13} />
              </Link>
            </nav>

            <div className="overview-tab-panels">
              <div
                className="overview-tab-panel"
                id="overview-panel-glance"
                role="tabpanel"
                aria-labelledby="overview-tab-glance"
                tabIndex={0}
                hidden={activeTab !== "glance"}
              >
            <section className="overview-readings" aria-label="Recorded learning at a glance">
              <div className="overview-readings-intro">
                <span className="overview-eyebrow">SIGNALS, NOT ASSUMPTIONS</span>
                <h2>Recorded<br />to date</h2>
                <p>Only submitted answers count here.</p>
              </div>
              <MetricReadout
                index="01"
                label="Answers submitted"
                value={data.totals.attempts}
                detail="Persisted learner submissions"
                icon={<CheckCircle2 size={17} />}
              />
              <MetricReadout
                index="02"
                label="Overall accuracy"
                value={accuracy(data.totals.correct, data.totals.attempts) === null
                  ? "—"
                  : accuracy(data.totals.correct, data.totals.attempts) + "%"}
                detail={`${data.totals.correct} correct of ${data.totals.attempts}`}
                icon={<Target size={17} />}
              />
              <MetricReadout
                index="03"
                label="Unique questions"
                value={data.totals.unique}
                detail={`${data.totals.available} questions currently available`}
                icon={<Layers3 size={17} />}
              />
              <MetricReadout
                index="04"
                label="Recent activity"
                value={data.totals.lastActivity
                  ? new Date(data.totals.lastActivity).toLocaleDateString()
                  : "Not yet"}
                detail="Last recorded answer"
                icon={<Activity size={17} />}
              />
            </section>
            <footer className="overview-footnote">
              <span><RadioTower size={13} /> CCNA 200-301 / NEXUS</span>
              <span>Progress reflects saved evidence. It does not infer mastery or exam readiness.</span>
            </footer>
              </div>

              <div
                className="overview-tab-panel"
                id="overview-panel-topology"
                role="tabpanel"
                aria-labelledby="overview-tab-topology"
                tabIndex={0}
                hidden={activeTab !== "topology"}
              >
                <div className="overview-module overview-topology">
                  <NetworkTopologyMap domains={data.domains} />
                </div>
              </div>

              <div
                className="overview-tab-panel"
                id="overview-panel-activity"
                role="tabpanel"
                aria-labelledby="overview-tab-activity"
                tabIndex={0}
                hidden={activeTab !== "activity"}
              >
                <div className="overview-module overview-activity">
                  <YearlyActivity />
                </div>
              </div>

              <div
                className="overview-tab-panel"
                id="overview-panel-skills"
                role="tabpanel"
                aria-labelledby="overview-tab-skills"
                tabIndex={0}
                hidden={activeTab !== "skills"}
              >
                <div className="overview-module overview-skills">
                {progress.data ? (
                  <SkillMatrix data={progress.data} />
                ) : progress.isError ? (
                  <section className="nexus-panel overview-progress-error" role="alert">
                    <span className="nexus-eyebrow">SKILL EVIDENCE</span>
                    <h2>Skill evidence could not load</h2>
                    <p>{nexusError(progress.error)}</p>
                    <button
                      onClick={() => void progress.refetch()}
                      className="nexus-button secondary"
                      data-testid="button-dashboard-retry-skill-evidence"
                    >
                      Retry skill evidence
                    </button>
                  </section>
                ) : (
                  <div className="overview-progress-loading" role="status" aria-label="Loading skill evidence">
                    <Skeleton className="h-64" />
                  </div>
                )}
                </div>
              </div>

              <div
                className="overview-tab-panel"
                id="overview-panel-next"
                role="tabpanel"
                aria-labelledby="overview-tab-next"
                tabIndex={0}
                hidden={activeTab !== "next"}
              >
            <div className="overview-bottom-grid">
              <section className="nexus-panel overview-journey-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">LEARNING JOURNEY</span>
                    <h2>Your next connection</h2>
                  </div>
                  <span className="overview-panel-index">ROUTE / 01</span>
                </div>
                <ol className="nexus-learning-path">
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>Recorded learning</strong>
                      <p>
                        {data.totals.attempts} answers across {data.totals.unique} unique questions.{" "}
                        <Link href="/practice/history" data-testid="link-dashboard-review-evidence">
                          Review your evidence
                        </Link>
                      </p>
                    </div>
                  </li>
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>{next?.name ?? "Explore the curriculum"}</strong>
                      <p>
                        {next
                          ? `${next.available - next.attempted} available questions not yet attempted.`
                          : "No eligible recommendation is currently available."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>Suggested next activity</strong>
                      <p>
                        Prioritize a topic below 70% accuracy only after at least five answers;
                        otherwise expand unattempted available-question coverage. This transparent
                        rule is not an AI score or a mastery claim.
                      </p>
                      {next && (
                        <Link href={"/practice?topicId=" + next.id} className="nexus-text-link">
                          Practice this topic <ArrowRight size={15} />
                        </Link>
                      )}
                    </div>
                  </li>
                </ol>
                <Link
                  href="/topics"
                  className="overview-curriculum-link"
                  data-testid="link-dashboard-curriculum-journey"
                >
                  Explore the full curriculum <ArrowUpRight size={15} />
                </Link>
              </section>

              <section className="nexus-panel overview-recent-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">RECENT LEARNING</span>
                    <h2>{data.persistence ? "Practice sessions" : "Recorded answer activity"}</h2>
                  </div>
                  <Link
                    href="/practice/history"
                    className="overview-view-all"
                    data-testid="link-dashboard-view-history"
                  >
                    View all <ArrowRight size={14} />
                  </Link>
                </div>
                {data.sessions.items.length ? (
                  <ul className="nexus-recent-list">
                    {data.sessions.items.map((session) => (
                      <li key={session.id}>
                        <div>
                          <strong>{session.topics || "CCNA practice"}</strong>
                          <small>
                            {new Date(session.createdAt).toLocaleDateString()} ·{" "}
                            {session.mode.replaceAll("_", " ")} · {session.answered}/{session.questionCount} answered
                          </small>
                        </div>
                        <Link
                          href={"/practice/history?review=" + session.id}
                          data-testid={`link-dashboard-review-session-${session.id}`}
                        >
                          Review <ArrowUpRight size={13} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="overview-answer-fallback">
                    <p>
                      {data.persistence
                        ? "No tracked sessions yet. Recent individual submissions:"
                        : "Recent individual submissions. Persistent sessions require the separately approved additive upgrade."}
                    </p>
                    {recent.isPending ? (
                      <p role="status">Loading recent answers…</p>
                    ) : recent.isError ? (
                      <div className="overview-recent-error" role="alert">
                        <p>Recent answers could not load.</p>
                        <button
                          onClick={() => void recent.refetch()}
                          data-testid="button-dashboard-retry-recent-answers"
                        >
                          Retry recent answers
                        </button>
                      </div>
                    ) : recent.data?.items.length ? (
                      <ul className="nexus-recent-list">
                        {recent.data.items.map((answer) => (
                          <li key={answer.id}>
                            <div>
                              <strong>{answer.topicName || "Individual answer"}</strong>
                              <small>
                                {new Date(answer.submittedAt).toLocaleString()} ·{" "}
                                {answer.questionCode || "Legacy record"} ·{" "}
                                {answer.isCorrect ? "Correct" : "Incorrect"}
                              </small>
                            </div>
                            <Link
                              href="/practice/history"
                              data-testid={`link-dashboard-review-answer-${answer.id}`}
                            >
                              Review <ArrowUpRight size={13} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No submitted answers yet.</p>
                    )}
                  </div>
                )}
                <p className="nexus-muted overview-taxonomy-note">
                  {data.totals.unmapped} available questions lack active v1.1 taxonomy mappings.
                  They are not assigned to a domain automatically.
                </p>
              </section>
            </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
