import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
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
import { NetworkTopologyMap, LearningAnalytics } from "../components/nexus-visuals";
import { CommandCenterInsights, SkillEvidenceSummary, recommendationReason } from "../components/command-center-insights";
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
      <span className="overview-readout-label"><UiMessage text={String(label)}/></span>
      <strong className="overview-readout-value">{value}</strong>
      <small className="overview-readout-detail">{detail}</small>
    </article>
  );
}

function OverviewSkeleton() {
  const { t: translateUi } = useI18n();
  return (
    <div className="overview-loading" aria-label={translateUi("Loading learning metrics")} role="status">
      <div className="overview-loading-readouts">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function NexusOverview() {
  const { t: translateUi, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<OverviewTabId>("glance");
  const [range, setRange] = useState("30");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const progress = useLearnerProgress();
  const identity = useNexusIdentity();
  const auth = useAuth();
  const { user } = useUser();
  const query = useNexusAnalytics();
  const activityQuery = useNexusAnalytics(range);
  const data = query.data;
  const next = data ? recommendTopic(data.topics) : null;
  const name = identity && user?.id === identity.userId ? user.firstName || translateUi("learner") : translateUi("learner");
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
    const forward=dir==='rtl'?-1:1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + forward + overviewTabs.length) % overviewTabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - forward + overviewTabs.length) % overviewTabs.length;
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
            <span>CCNA NEXUS <i aria-hidden="true">/</i> {translateUi("FIELD NOTES 01")}</span>
          </div>
          <h1>{identity ? translateUi("Welcome back, {value0}.", {value0: String(name)}) : translateUi("Connect your next network skill.")}</h1>
          <p>{translateUi("Build a clearer understanding of networks, one deliberate challenge at a time.")}</p>
          <div className="overview-actions">
            {data?.resume && (
              <>
                <Link
                  href={"/practice?resume=" + data.resume.id}
                  className="overview-primary-action"
                  data-testid="link-dashboard-resume-session"
                >
                  {translateUi("Continue session")}{" "}<ArrowUpRight size={15} />
                </Link>
                <Link
                  href="/practice"
                  className="overview-secondary-action"
                  data-testid="link-dashboard-start-practice"
                >
                  {translateUi("Start new practice")}{" "}<ArrowRight size={16} />
                </Link>
              </>
            )}
            {!data?.resume && (
              <Link
                href="/practice"
                className="overview-primary-action"
                data-testid="link-dashboard-start-practice"
              >
                {translateUi("Start practice")}{" "}<ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <div className="overview-network-figure" aria-hidden="true">
          <div className="overview-figure-caption"><span>{translateUi("NETWORK / 200—301")}</span><span>01—06</span></div>
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
          <div className="overview-figure-foot"><span>{translateUi("LEARNING INSTRUMENT")}</span><span>{translateUi("RECORDED EVIDENCE ONLY")}</span></div>
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
            <span className="overview-eyebrow">{translateUi("YOUR WORKSPACE")}</span>
            <h2>{translateUi("Your learning network starts with you")}</h2>
            <p>{translateUi("Sign in to see your own progress, domain coverage and recorded practice.")}</p>
          </div>
          <Link href="/sign-in" className="overview-primary-action" data-testid="link-dashboard-sign-in">
            {translateUi("Sign in")}{" "}<ArrowRight size={16} />
          </Link>
        </section>
      ) : query.isPending ? (
        <OverviewSkeleton />
      ) : query.isError ? (
        <section className="overview-state-panel overview-error-panel" role="alert">
          <span className="overview-state-icon"><Activity size={19} /></span>
          <div>
            <span className="overview-eyebrow">{translateUi("CONNECTION INTERRUPTED")}</span>
            <h2>{translateUi("Learning data could not load")}</h2>
            <p><UiMessage text={nexusError(query.error)}/></p>
          </div>
          <button
            className="overview-primary-action"
            onClick={() => void query.refetch()}
            data-testid="button-dashboard-retry-analytics"
          >
            {translateUi("Retry")}{" "}<ArrowRight size={16} />
          </button>
        </section>
      ) : (
        data && (
          <>
            <nav className="overview-section-nav" aria-label={translateUi("Overview sections")}>
              <span className="overview-section-nav-label">{translateUi("ON THIS PAGE")}</span>
              <div
                className="overview-tabs"
                role="tablist"
                aria-label={translateUi("Dashboard sections")}
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
                    <UiMessage text={tab.label}/>
                  </button>
                ))}
              </div>
              <Link
                href="/topics"
                className="overview-curriculum-nav-link"
                data-testid="link-dashboard-curriculum-nav"
              >
                {translateUi("Browse curriculum")}{" "}<ArrowUpRight size={13} />
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
            <section className="overview-readings" aria-label={translateUi("Recorded learning at a glance")}>
              <div className="overview-readings-intro">
                <span className="overview-eyebrow">{translateUi("SIGNALS, NOT ASSUMPTIONS")}</span>
                <h2>{translateUi("Recorded")}<br />{translateUi("to date")}</h2>
                <p>{translateUi("Only submitted answers count here.")}</p>
              </div>
              <MetricReadout
                index="01"
                label={translateUi("Answers submitted")}
                value={data.totals.attempts}
                detail="Persisted learner submissions"
                icon={<CheckCircle2 size={17} />}
              />
              <MetricReadout
                index="02"
                label={translateUi("Overall accuracy")}
                value={accuracy(data.totals.correct, data.totals.attempts) === null
                  ? "—"
                  : accuracy(data.totals.correct, data.totals.attempts) + "%"}
                detail={`${data.totals.correct} correct of ${data.totals.attempts}`}
                icon={<Target size={17} />}
              />
              <MetricReadout
                index="03"
                label={translateUi("Unique questions")}
                value={data.totals.unique}
                detail={`${data.totals.available} questions currently available`}
                icon={<Layers3 size={17} />}
              />
              <MetricReadout
                index="04"
                label={translateUi("Recent activity")}
                value={data.totals.lastActivity
                  ? new Date(data.totals.lastActivity).toLocaleDateString()
                  : "Not yet"}
                detail="Last recorded answer"
                icon={<Activity size={17} />}
              />
            </section>
            <CommandCenterInsights data={data} />
            <footer className="overview-footnote">
              <span><RadioTower size={13} /> CCNA 200-301 / NEXUS</span>
              <span>{translateUi("Progress reflects saved evidence. It does not infer mastery or exam readiness.")}</span>
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
                  {activityQuery.isError ? <section className="nexus-panel" role="alert"><h2>{translateUi("Recent trend could not load")}</h2><p><UiMessage text={nexusError(activityQuery.error)}/></p><button className="nexus-button secondary" onClick={() => void activityQuery.refetch()}>{translateUi("Retry recent trend")}</button></section> : activityQuery.data ? <LearningAnalytics data={activityQuery.data} range={range} onRange={setRange} /> : <section className="nexus-panel" role="status" aria-label={translateUi("Loading recent trend")}><Skeleton className="h-40" /></section>}
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
                  <>
                    <SkillEvidenceSummary data={progress.data} />
                    <SkillMatrix data={progress.data} />
                  </>
                ) : progress.isError ? (
                  <section className="nexus-panel overview-progress-error" role="alert">
                    <span className="nexus-eyebrow">{translateUi("SKILL EVIDENCE")}</span>
                    <h2>{translateUi("Skill evidence could not load")}</h2>
                    <p><UiMessage text={nexusError(progress.error)}/></p>
                    <button
                      onClick={() => void progress.refetch()}
                      className="nexus-button secondary"
                      data-testid="button-dashboard-retry-skill-evidence"
                    >
                      {translateUi("Retry skill evidence")}</button>
                  </section>
                ) : (
                  <div className="overview-progress-loading" role="status" aria-label={translateUi("Loading skill evidence")}>
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
                    <span className="nexus-eyebrow">{translateUi("LEARNING JOURNEY")}</span>
                    <h2>{translateUi("Your next connection")}</h2>
                  </div>
                  <span className="overview-panel-index">{translateUi("ROUTE / 01")}</span>
                </div>
                <ol className="nexus-learning-path">
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>{translateUi("Recorded learning")}</strong>
                      <p>
                        {data.totals.attempts} {translateUi("answers across")}{" "}{data.totals.unique} {translateUi("unique questions.")}{" "}
                        <Link href="/practice/history" data-testid="link-dashboard-review-evidence">
                          {translateUi("Review your evidence")}</Link>
                      </p>
                    </div>
                  </li>
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>{next?.name ?? translateUi("Explore the curriculum")}</strong>
                      <p>
                        {next
                          ? recommendationReason(next)
                          : data.totals.attempts ? translateUi("No topic currently meets the review or coverage rule. Explore the curriculum or try the Exam Simulator.") : translateUi("Start with the Learning Curriculum or Challenge Arena; no recorded practice is assumed.")}
                      </p>
                    </div>
                  </li>
                  <li>
                    <i aria-hidden="true" />
                    <div>
                      <strong>{translateUi("Suggested next activity")}</strong>
                      <p>
                        {translateUi("Prioritize a topic below 70% accuracy only after at least five answers; otherwise expand unattempted available-question coverage. This transparent rule is not an AI score or a mastery claim.")}</p>
                      {next && (
                        <Link href={"/practice?topicId=" + next.id} className="nexus-text-link">
                          {translateUi("Practice this topic")}{" "}<ArrowRight size={15} />
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
                  {translateUi("Explore the full curriculum")}{" "}<ArrowUpRight size={15} />
                </Link>
                <Link href="/exam" className="overview-curriculum-link">{translateUi("Open Exam Simulator")}{" "}<ArrowUpRight size={15} /></Link>
              </section>

              <section className="nexus-panel overview-recent-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">{translateUi("RECENT LEARNING")}</span>
                    <h2>{data.persistence ? translateUi("Practice sessions") : translateUi("Recorded answer activity")}</h2>
                  </div>
                  <Link
                    href="/practice/history"
                    className="overview-view-all"
                    data-testid="link-dashboard-view-history"
                  >
                    {translateUi("View all")}{" "}<ArrowRight size={14} />
                  </Link>
                </div>
                {data.sessions.items.length ? (
                  <ul className="nexus-recent-list">
                    {data.sessions.items.map((session) => (
                      <li key={session.id}>
                        <div>
                          <strong>{session.topics || translateUi("CCNA practice")}</strong>
                          <small>
                            <DateText value={session.createdAt} options={{dateStyle:'medium'}}/> ·{" "}
                            {session.mode.replaceAll("_", " ")} · {session.answered}/{session.questionCount} {translateUi("answered")}</small>
                        </div>
                        <Link
                          href={"/practice/history?review=" + session.id}
                          data-testid={`link-dashboard-review-session-${session.id}`}
                        >
                          {translateUi("Review")}{" "}<ArrowUpRight size={13} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="overview-answer-fallback">
                    <p>
                      {data.persistence
                        ? translateUi("No tracked sessions yet. Recent individual submissions:")
                        : translateUi("Recent individual submissions. Persistent sessions require the separately approved additive upgrade.")}
                    </p>
                    {recent.isPending ? (
                      <p role="status">{translateUi("Loading recent answers…")}</p>
                    ) : recent.isError ? (
                      <div className="overview-recent-error" role="alert">
                        <p>{translateUi("Recent answers could not load.")}</p>
                        <button
                          onClick={() => void recent.refetch()}
                          data-testid="button-dashboard-retry-recent-answers"
                        >
                          {translateUi("Retry recent answers")}</button>
                      </div>
                    ) : recent.data?.items.length ? (
                      <ul className="nexus-recent-list">
                        {recent.data.items.map((answer) => (
                          <li key={answer.id}>
                            <div>
                              <strong>{answer.topicName || translateUi("Individual answer")}</strong>
                              <small>
                                <DateText value={answer.submittedAt} options={{dateStyle:'medium',timeStyle:'short'}}/> ·{" "}
                                {answer.questionCode || translateUi("Legacy record")} ·{" "}
                                {answer.isCorrect ? translateUi("Correct") : translateUi("Incorrect")}
                              </small>
                            </div>
                            <Link
                              href="/practice/history"
                              data-testid={`link-dashboard-review-answer-${answer.id}`}
                            >
                              {translateUi("Review")}{" "}<ArrowUpRight size={13} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{translateUi("No submitted answers yet.")}</p>
                    )}
                  </div>
                )}
                <p className="nexus-muted overview-taxonomy-note">
                  {data.totals.unmapped} {translateUi("available questions lack active v1.1 taxonomy mappings. They are not assigned to a domain automatically.")}</p>
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
