import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, BookOpen, ChevronRight, Layers3, X } from "lucide-react";
import {
  getCurriculum,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useGetLearningProgress,
  adminContentRequest,
  type CurriculumSummary,
  type CurriculumMappingReport,
  type LearningTopicProgress,
} from "@workspace/api-client-react";
import {
  progressIdentity,
  sessionQueryKey,
  learningProgressOptions,
} from "../lib/learning-progress-cache";
import "../curriculum.css";

export function CurriculumView({
  data,
  progress,
  admin = false,
  onSelectChapter,
}: {
  data: CurriculumSummary;
  progress?: LearningTopicProgress[];
  admin?: boolean;
  onSelectChapter?: () => void;
}) {
  const [domainId, setDomainId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const domain = data.domains.find((d) => d.id === domainId);
  const chapters = domain?.sections.flatMap((s) => s.chapters) ?? [];
  const chapter = chapters.find((c) => c.id === chapterId);
  const chapterTotal = data.domains.reduce(
    (total, item) =>
      total + item.sections.reduce((sectionTotal, section) => sectionTotal + section.chapters.length, 0),
    0,
  );
  const activeTopicTotal = data.topics.filter((topic) => topic.status === "ACTIVE").length;
  const topics = data.topics.filter(
    (t) => t.status === "ACTIVE" && t.chapterIds.includes(chapterId ?? ""),
  );
  const close = () => {
    setDomainId(null);
    setChapterId(null);
    selectedButton.current?.focus();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && domainId) close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [domainId]);
  return (
    <>
      <section className="curriculum-map" aria-labelledby="curriculum-map-title">
        <div className="curriculum-map-heading">
          <div>
            <span className="curriculum-kicker">THE DOMAIN REGISTER</span>
            <h2 id="curriculum-map-title">Six domains. One field guide.</h2>
          </div>
          <p>Choose a domain to trace its sections, chapters and active learning topics.</p>
        </div>
        <div className="curriculum-register" role="group" aria-label="Curriculum at a glance">
          <div className="curriculum-register-item">
            <span className="curriculum-register-index">01 / SCOPE</span>
            <strong>{String(data.domains.length).padStart(2, "0")}</strong>
            <span className="curriculum-register-label">CCNA domains</span>
          </div>
          <div className="curriculum-register-item">
            <span className="curriculum-register-index">02 / STRUCTURE</span>
            <strong>{chapterTotal}</strong>
            <span className="curriculum-register-label">chapters</span>
          </div>
          <div className="curriculum-register-item">
            <span className="curriculum-register-index">03 / CATALOG</span>
            <strong>{activeTopicTotal}</strong>
            <span className="curriculum-register-label">active topics</span>
          </div>
        </div>
        <div className="curriculum-grid" role="group" aria-label="Six CCNA domains">
          {data.domains.map((d) => {
            const domainChapters = d.sections.flatMap((s) => s.chapters);
            const domainTopics = data.topics.filter(
              (t) =>
                t.status === "ACTIVE" &&
                t.chapterIds.some((id) => domainChapters.some((c) => c.id === id)),
            );
            return (
              <button
                key={d.id}
                type="button"
                className="curriculum-domain"
                aria-expanded={domainId === d.id}
                aria-controls={domainId === d.id ? "curriculum-panel" : undefined}
                onClick={(event) => {
                  selectedButton.current = event.currentTarget;
                  if (domainId === d.id) close();
                  else {
                    setDomainId(d.id);
                    setChapterId(null);
                  }
                }}
              >
                <span className="curriculum-domain-top">
                  <span className="curriculum-domain-label">DOMAIN {d.number}</span>
                  <span className="curriculum-domain-mark" aria-hidden="true">
                    {String(d.number).padStart(2, "0")}
                  </span>
                </span>
                <span className="curriculum-domain-title">{d.title}</span>
                <span className="curriculum-domain-description">{d.description}</span>
                <span className="curriculum-domain-meta">
                  <span>
                    <strong>{domainChapters.length}</strong> chapters
                  </span>
                  <span>
                    <strong>{domainTopics.length}</strong> active topics
                  </span>
                  <span>
                    <strong>{domainTopics.reduce((n, t) => n + t.questionCount, 0)}</strong>{" "}
                    published questions
                  </span>
                </span>
                <span className="curriculum-domain-open">
                  {domainId === d.id ? "Domain open" : "Explore domain"}
                  <ChevronRight size={15} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {domain ? (
        <section
          id="curriculum-panel"
          className="curriculum-panel"
          aria-label={domain.title + " chapters"}
        >
          <header className="curriculum-panel-header">
            <div className="curriculum-panel-title">
              <span className="curriculum-kicker">DOMAIN {domain.number} / CHAPTER INDEX</span>
              <h2>{domain.title}</h2>
            </div>
            <button
              type="button"
              className="curriculum-collapse"
              aria-label="Collapse domain"
              onClick={close}
            >
              <X size={15} aria-hidden="true" /> <span>Collapse</span>
            </button>
          </header>
          <div className="curriculum-panel-body">
            <nav className="curriculum-chapters" aria-label="Sections and chapters">
              <div className="curriculum-chapter-index">
                <span>CONTENTS</span>
                <span>{chapters.length} CHAPTERS</span>
              </div>
              {domain.sections.map((s) => (
                <section key={s.id} className="curriculum-section">
                  <h3>{s.title}</h3>
                  {s.chapters.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      aria-pressed={chapterId === c.id}
                      onClick={() => {
                        setChapterId(c.id);
                        onSelectChapter?.();
                      }}
                    >
                      <span className="curriculum-chapter-number">
                        {String(chapters.findIndex((item) => item.id === c.id) + 1).padStart(
                          2,
                          "0",
                        )}
                      </span>
                      <span className="curriculum-chapter-name">{c.title}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </section>
              ))}
            </nav>
            <article className="curriculum-details" aria-live="polite">
              {chapter ? (
                <>
                  <div className="curriculum-detail-heading">
                    <span className="curriculum-kicker">CHAPTER / LEARNING NAVIGATION</span>
                    <h3>{chapter.title}</h3>
                    <p>{chapter.description}</p>
                  </div>
                  <div className="curriculum-detail-summary">
                    <span>
                      <BookOpen size={15} aria-hidden="true" />
                      {topics.reduce((n, t) => n + t.questionCount, 0)} published questions
                    </span>
                    <span className="curriculum-labs-status">Labs coming soon</span>
                  </div>
                  {!topics.length ? (
                    <div className="curriculum-empty curriculum-empty-topics">
                      <span className="curriculum-empty-index">NO ACTIVE TOPICS</span>
                      <h4>No topics available yet</h4>
                      <p>No questions available yet</p>
                      <button disabled className="curriculum-action-quiet">
                        Start Practice
                      </button>
                    </div>
                  ) : (
                    <ul className="curriculum-topic-list">
                      {topics.map((t, index) => {
                        const metric = progress?.find((p) => p.topicId === t.id);
                        return (
                          <li key={t.id}>
                            <div className="curriculum-topic-head">
                              <span className="curriculum-topic-index">
                                TOPIC {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="curriculum-topic-question-count">
                                {t.questionCount} published questions
                              </span>
                            </div>
                            <h4>{t.name}</h4>
                            <p>{t.description}</p>
                            <div className="curriculum-topic-meta">
                              <span className="curriculum-coverage-label">QUESTION COVERAGE</span>
                              <span>
                                {metric ? (
                                  <span className="curriculum-coverage-readout">
                                    <meter
                                      className="curriculum-coverage-meter"
                                      min={0}
                                      max={100}
                                      value={metric.coveragePercent}
                                      aria-label={"Question coverage for " + t.name}
                                    />
                                    <span>
                                      {metric.coveredQuestionCount} of {metric.availableQuestionCount}{" "}
                                      available questions attempted ({metric.coveragePercent}% coverage)
                                    </span>
                                  </span>
                                ) : (
                                  "Learning progress unavailable"
                                )}
                              </span>
                            </div>
                            <div className="curriculum-actions">
                              {t.questionCount > 0 ? (
                                <Link
                                  className="curriculum-action-primary"
                                  href={"/practice?topicId=" + encodeURIComponent(t.id)}
                                >
                                  Start Practice <ArrowRight size={14} aria-hidden="true" />
                                </Link>
                              ) : (
                                <>
                                  <span>No questions available yet</span>
                                  <button disabled className="curriculum-action-quiet">
                                    Start Practice
                                  </button>
                                </>
                              )}
                              {admin ? (
                                <Link
                                  className="curriculum-action-quiet"
                                  href={"/admin/questions?topicId=" + encodeURIComponent(t.id)}
                                >
                                  View Questions
                                </Link>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="curriculum-footnote">
                    Coverage describes how many available questions have been attempted; it is not
                    accuracy or mastery. Chapters organize learning. Official exam objectives remain
                    separate in exam taxonomy. Shared topics may appear in more than one chapter;
                    domain counts count each topic once.
                  </p>
                </>
              ) : (
                <div className="curriculum-empty curriculum-chapter-prompt">
                  <span className="curriculum-empty-glyph" aria-hidden="true">
                    <Layers3 size={22} />
                  </span>
                  <span className="curriculum-empty-index">CHAPTER NAVIGATION</span>
                  <h3>Select a chapter</h3>
                  <p>Explore topics and start practice without leaving the six-domain overview.</p>
                </div>
              )}
            </article>
          </div>
        </section>
      ) : (
        <p className="curriculum-hint">
          <span aria-hidden="true" />
          Select a domain to open its chapter index.
        </p>
      )}
    </>
  );
}

function MappingReview() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/admin/curriculum/mapping"], identity),
    queryFn: ({ signal }) =>
      adminContentRequest<CurriculumMappingReport>("/api/admin/curriculum/mapping", { signal }),
    enabled: Boolean(identity) && open,
    retry: false,
    gcTime: 0,
  });
  return (
    <details className="curriculum-review" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="curriculum-review-summary-copy">
          <span className="curriculum-kicker">ADMINISTRATOR / READ ONLY</span>
          <strong>Unmapped Topics / Admin review</strong>
        </span>
        <span className="curriculum-review-toggle">Open report</span>
      </summary>
      {open &&
        (query.isPending ? (
          <p role="status" className="curriculum-review-state">
            Loading mapping report…
          </p>
        ) : query.isError ? (
          <p role="alert" className="curriculum-review-state">
            Mapping report unavailable.{" "}
            <button type="button" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        ) : query.data ? (
          <>
            <div className="curriculum-review-report">
              <p className="curriculum-review-totals">
                <strong>{query.data.mapped.length}</strong> mapped
                <span aria-hidden="true">/</span>
                <strong>{query.data.unmapped.length}</strong> unmapped
                <span aria-hidden="true">/</span>
                <strong>{query.data.ambiguous.length}</strong> ambiguous
              </p>
              <p className="curriculum-review-readonly">No records are modified here.</p>
              {[...query.data.unmapped, ...query.data.ambiguous].map((t) => (
                <div key={t.id} className="curriculum-review-row">
                  <div className="curriculum-review-row-heading">
                    <strong>{t.name}</strong>
                    <span>{t.status}</span>
                  </div>
                  <code>
                    {t.id} / {t.slug}
                  </code>
                  <p>{t.reason}</p>
                  <Link href="/admin/topics">
                    Review in topic management <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          </>
        ) : null)}
    </details>
  );
}
export function CurriculumExplorer() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/curriculum"], identity),
    queryFn: ({ signal }) => getCurriculum(signal),
    enabled: Boolean(identity),
    retry: false,
    gcTime: 0,
  });
  const account = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });
  const [wantProgress, setWantProgress] = useState(false);
  const options = learningProgressOptions(identity ?? { userId: "", sessionId: "" });
  const progress = useGetLearningProgress({
    ...options,
    query: {
      ...options.query,
      enabled: Boolean(identity) && wantProgress,
      retry: false,
      gcTime: 0,
    },
  });
  const admin =
    account.data?.user.role === "ADMIN" &&
    account.data?.user.status === "ACTIVE" &&
    !account.isError;
  // Only request learner metrics when a chapter is selected, not on each expansion.
  return (
    <div className="page-wrap curriculum-page">
      <header className="curriculum-header">
        <div className="curriculum-masthead-copy">
          <div className="curriculum-kicker">
            <span className="curriculum-kicker-mark" aria-hidden="true">
              <Layers3 size={14} />
            </span>
            LEARN / CCNA 200-301
          </div>
          <h1>
            The <em>curriculum</em>
            <br />
            in context.
          </h1>
          <p>Six domains. A clear path through networking.</p>
          {query.data?.counts && identity && !query.isError ? (
            <p className="curriculum-catalog-counts">
              <strong>{query.data.counts.mappedQuestions}</strong> mapped published questions
              <span aria-hidden="true">/</span>
              <strong>{query.data.counts.availableQuestions}</strong> available across active topics
            </p>
          ) : null}
        </div>
        <div className="curriculum-masthead-figure" aria-hidden="true">
          <div className="curriculum-figure-caption">
            <span>NETWORK STUDIES</span>
            <span>200—301 / FIELD MAP</span>
          </div>
          <svg viewBox="0 0 460 220" role="presentation">
            <path className="curriculum-circuit-line" d="M22 123h82l37-38h78l42 42h79l35-37h63" />
            <path className="curriculum-circuit-line is-faint" d="M58 36h79l30 30h74l38-38h101" />
            <path className="curriculum-circuit-line is-faint" d="M43 186h91l34-34h72l40 32h109" />
            <path className="curriculum-circuit-line" d="M130 86v-20m89 61v42m121-42V80m-178-3v-28m85 5h36" />
            <circle className="curriculum-circuit-ring" cx="104" cy="123" r="11" />
            <circle className="curriculum-circuit-node" cx="104" cy="123" r="4" />
            <circle className="curriculum-circuit-ring is-teal" cx="219" cy="127" r="18" />
            <circle className="curriculum-circuit-node is-copper" cx="219" cy="127" r="7" />
            <circle className="curriculum-circuit-ring" cx="340" cy="127" r="11" />
            <circle className="curriculum-circuit-node" cx="340" cy="127" r="4" />
            <circle className="curriculum-circuit-node is-copper" cx="58" cy="36" r="3" />
            <circle className="curriculum-circuit-node" cx="380" cy="28" r="3" />
            <circle className="curriculum-circuit-node" cx="43" cy="186" r="3" />
            <circle className="curriculum-circuit-node is-copper" cx="399" cy="184" r="3" />
            <text x="219" y="132" textAnchor="middle">IP</text>
            <text x="20" y="112">ROUTING</text>
            <text x="354" y="116">SWITCHING</text>
          </svg>
          <div className="curriculum-figure-footer">
            <span>LEARNING NAVIGATION</span>
            <span>EDITION {query.data?.version ?? "—"}</span>
          </div>
        </div>
      </header>
      <div className="curriculum-header-rule" aria-hidden="true" />
      {!auth.isLoaded ? (
        <div role="status" className="curriculum-state curriculum-auth-state">
          <span className="curriculum-state-mark" aria-hidden="true" />
          <p>Checking your identity…</p>
        </div>
      ) : !identity ? (
        <div className="curriculum-state curriculum-access-state">
          <div className="curriculum-state-index">ACCESS / 01</div>
          <div>
            <span className="curriculum-kicker">YOUR LEARNING MAP</span>
            <h2>Sign in to explore your curriculum</h2>
            <p>Your six-domain learning navigation is ready when you are.</p>
            <Link className="curriculum-action-primary" href="/sign-in">
              Sign in <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : query.isPending ? (
        <div role="status" className="curriculum-state curriculum-loading-state">
          <div className="curriculum-state-index">LOADING / CURRICULUM</div>
          <div className="curriculum-loading-skeletons" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Loading curriculum…</p>
        </div>
      ) : query.isError ? (
        <div role="alert" className="curriculum-state curriculum-error-state">
          <div className="curriculum-state-index">CATALOG / UNAVAILABLE</div>
          <div>
            <span className="curriculum-kicker">CONNECTION INTERRUPTED</span>
            <h2>Curriculum could not be loaded</h2>
            <p>Check your session and connection, then retry.</p>
            <button
              type="button"
              className="curriculum-action-quiet"
              onClick={() => void query.refetch()}
            >
              Retry curriculum
            </button>
          </div>
        </div>
      ) : query.data ? (
        <CurriculumView
          key={"curriculum:" + identity.userId + ":" + identity.sessionId}
          data={query.data}
          progress={progress.isError ? undefined : progress.data?.topics}
          admin={admin}
          onSelectChapter={() => setWantProgress(true)}
        />
      ) : null}
      {identity && admin ? (
        <MappingReview key={"review:" + identity.userId + ":" + identity.sessionId} />
      ) : null}
    </div>
  );
}
