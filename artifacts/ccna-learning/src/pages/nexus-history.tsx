import { selectedKeys } from "../lib/answer-selection";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Target, Layers3, CheckCircle2, History } from "lucide-react";
import { nexusRequest, type NexusHistory, type NexusRun } from "@workspace/api-client-react";
import {
  useNexusAnalytics,
  useNexusIdentity,
  accuracy,
  recommendTopic,
  nexusError,
} from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { NetworkHero, LearningMetricCard, LearningAnalytics } from "../components/nexus-visuals";
import { QuestionContent } from "../components/question-content";
import { HistoryEntries } from "./practice-history";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../components/ui/sheet";
import { Skeleton } from "../components/ui/skeleton";
export function NexusHistory() {
  const identity = useNexusIdentity();
  return (
    <NexusHistoryActor key={identity ? identity.userId + ":" + identity.sessionId : "anonymous"} />
  );
}
function NexusHistoryActor() {
  const identity = useNexusIdentity(),
    [range, setRange] = useState("30"),
    analytics = useNexusAnalytics(range),
    data = analytics.data,
    [page, setPage] = useState(1),
    [pageSize, setSize] = useState(10),
    [search, setSearch] = useState(""),
    [settledSearch, setSettledSearch] = useState(""),
    [review, setReview] = useState<string | null>(() =>
      new URLSearchParams(window.location.search).get("review"),
    );
  useEffect(() => {
    const timeout = setTimeout(() => setSettledSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: settledSearch,
  });
  const sessions = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/sessions", params.toString()], identity),
    enabled: !!identity && !!data?.persistence,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => nexusRequest<NexusHistory>("sessions?" + params, { signal }),
  });
  const detail = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/session-review", review], identity),
    enabled: !!identity && !!review && !!data?.persistence,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      nexusRequest<NexusRun>("sessions/" + encodeURIComponent(review!), { signal }),
  });
  useEffect(() => {
    if (sessions.data && sessions.data.page !== page) setPage(sessions.data.page);
  }, [sessions.data?.page]);
  const next = data ? recommendTopic(data.topics) : null;
  return (
    <div className="nexus-page">
      <NetworkHero
        compact
        eyebrow="LEARNING INTELLIGENCE CENTER"
        title="Turn your history into direction."
        description="Understand your recorded answers, explore coverage, and revisit the original question revisions."
      />
      {!identity ? (
        <section className="nexus-panel">
          <h2>Your history is private</h2>
          <Link href="/sign-in" className="nexus-button">
            Sign in
          </Link>
        </section>
      ) : analytics.isPending ? (
        <Skeleton className="h-80" />
      ) : analytics.isError ? (
        <section role="alert" className="nexus-panel">
          <p>{nexusError(analytics.error)}</p>
          <button className="nexus-button" onClick={() => void analytics.refetch()}>
            Retry analytics
          </button>
        </section>
      ) : (
        data && (
          <>
            <div className="nexus-metrics">
              <LearningMetricCard
                label="Tracked sessions"
                value={data.persistence ? data.sessions.total : "Unavailable"}
                detail="Legacy answers are not regrouped into invented sessions"
                icon={<History size={18} />}
              />
              <LearningMetricCard
                label="Answers submitted"
                value={data.totals.attempts}
                detail="Your recorded submissions"
                icon={<CheckCircle2 size={18} />}
              />
              <LearningMetricCard
                label="Overall accuracy"
                value={
                  accuracy(data.totals.correct, data.totals.attempts) === null
                    ? "—"
                    : accuracy(data.totals.correct, data.totals.attempts) + "%"
                }
                detail={`${data.totals.correct}/${data.totals.attempts} correct`}
                icon={<Target size={18} />}
              />
              <LearningMetricCard
                label="Unique questions"
                value={data.totals.unique}
                detail="Distinct questions in your own history"
                icon={<Layers3 size={18} />}
              />
            </div>
            <LearningAnalytics data={data} range={range} onRange={setRange} />
            <div className="nexus-overview-bottom">
              <section className="nexus-panel">
                <span className="nexus-eyebrow">DOMAIN PERFORMANCE</span>
                <h2>Signals across the network</h2>
                <div className="nexus-domain-performance">
                  {data.domains.map((d) => (
                    <div key={d.id}>
                      <span>
                        <strong>{d.name}</strong>
                        <small>
                          {d.attempted}/{d.available} available questions covered · {d.attempts}{" "}
                          recorded answers{d.attempts < 5 ? " · small sample" : ""}
                        </small>
                      </span>
                      <strong>
                        {accuracy(d.correct, d.attempts) === null
                          ? "No answers"
                          : accuracy(d.correct, d.attempts) + "%"}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="nexus-muted">
                  {data.taxonomyBasis} {data.totals.unmapped} available questions and{" "}
                  {data.totals.unmappedAttempts} historical answers are unmapped under the current
                  taxonomy. Multi-domain associations can overlap.
                </p>
              </section>
              <section className="nexus-panel">
                <span className="nexus-eyebrow">REVISION PRIORITIES</span>
                <h2>Make your next answer count</h2>
                {next ? (
                  <>
                    <h3>{next.name}</h3>
                    <p>
                      {next.attempts >= 5 && next.correct / next.attempts < 0.7
                        ? "Below 70% accuracy after at least five answers."
                        : "Expand coverage of questions you have not yet attempted."}{" "}
                      {next.correct}/{next.attempts} correct; {next.available - next.attempted}{" "}
                      available questions not yet attempted.
                    </p>
                    <Link href={"/practice?topicId=" + next.id} className="nexus-button">
                      Practice this topic
                    </Link>
                  </>
                ) : (
                  <p>No eligible topic recommendation yet.</p>
                )}
                <p className="nexus-muted">
                  Recommendations use explicit coverage and accuracy rules. No AI, mastery or
                  exam-readiness score is inferred.
                </p>
                <Link href="/practice?mode=REVIEW_MISTAKES" className="nexus-text-link">
                  Review your latest mistakes →
                </Link>
              </section>
            </div>
            <section className="nexus-panel">
              <div className="nexus-section-heading">
                <div>
                  <span className="nexus-eyebrow">PRACTICE SESSIONS</span>
                  <h2>Your tracked challenges</h2>
                </div>
                {data.persistence && (
                  <input
                    type="search"
                    aria-label="Search practice sessions"
                    placeholder="Search mode or topic"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    maxLength={180}
                  />
                )}
              </div>
              {!data.persistence ? (
                <p>
                  Persistent session tracking awaits the separately approved additive upgrade.
                  Existing individual submissions remain below; no historical session IDs are
                  fabricated.
                </p>
              ) : sessions.isPending ? (
                <Skeleton className="h-40" />
              ) : sessions.isError ? (
                <div role="alert">
                  <p>{nexusError(sessions.error)}</p>
                  <button onClick={() => void sessions.refetch()}>Retry sessions</button>
                </div>
              ) : (
                sessions.data && (
                  <>
                    <div className="nexus-history-scroll">
                      <table className="nexus-history-table">
                        <caption className="sr-only">Your persisted practice sessions</caption>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Scope</th>
                            <th>Mode / status</th>
                            <th>Answers</th>
                            <th>Accuracy</th>
                            <th>Review</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.data.items.map((s) => (
                            <tr key={s.id}>
                              <td>{new Date(s.createdAt).toLocaleString()}</td>
                              <td>{s.topics || "CCNA practice"}</td>
                              <td>
                                {s.mode.replaceAll("_", " ")}
                                <br />
                                {s.status}
                              </td>
                              <td>
                                {s.answered}/{s.questionCount}{s.removedCount ? ` (${s.removedCount} removed by Admin)` : ""}
                              </td>
                              <td>
                                {accuracy(s.correct, s.answered) === null
                                  ? "—"
                                  : accuracy(s.correct, s.answered) + "%"}
                                <small> ({s.answered} answers)</small>
                              </td>
                              <td>
                                <button className="nexus-text-link" onClick={() => setReview(s.id)}>
                                  Review session
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!sessions.data.items.length && (
                        <p className="nexus-empty">No sessions match this search.</p>
                      )}
                    </div>
                    <div className="nexus-pagination">
                      <label>
                        Rows per page{" "}
                        <select
                          aria-label="Sessions per page"
                          value={pageSize}
                          onChange={(e) => {
                            setSize(Number(e.target.value));
                            setPage(1);
                          }}
                        >
                          {[10, 25, 50].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <span>
                        {sessions.data.total} sessions · Page {page}/
                        {Math.max(1, sessions.data.totalPages)}
                      </span>
                      <div>
                        <button
                          className="nexus-button secondary"
                          disabled={page === 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </button>
                        <button
                          className="nexus-button secondary"
                          disabled={page >= sessions.data.totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )
              )}
            </section>
            <section className="nexus-panel">
              <span className="nexus-eyebrow">INDIVIDUAL ANSWER HISTORY</span>
              <h2>Original submissions, preserved</h2>
              <p className="nexus-muted">
                Includes legacy and session-linked answers. These are individual records, not
                additional sessions. Verified revision snapshots preserve the question as delivered.
              </p>
              <HistoryEntries identity={identity} />
            </section>
          </>
        )
      )}
      <Sheet
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <SheetContent className="nexus-review">
          <SheetTitle>Session revision review</SheetTitle>
          <SheetDescription>
            Your own delivered question revisions and server-recorded feedback. Ungraded answers
            remain hidden.
          </SheetDescription>
          {!data?.persistence ? (
            <p>
              Session review requires the approved tracking upgrade. Individual answer history
              remains available.
            </p>
          ) : detail.isPending ? (
            <Skeleton className="h-40" />
          ) : detail.isError ? (
            <p role="alert">{nexusError(detail.error)}</p>
          ) : (
            detail.data && (
              <>
                <p>
                  {detail.data.mode} · {detail.data.status}
                </p>
                {detail.data.removedQuestions?.map(q=><p role="note" key={q.position}>{q.questionCode}: permanently deleted by an Admin. Its answer/history was removed; this session and unrelated questions remain.</p>)}
                {detail.data.canResume && (
                  <Link href={"/practice?resume=" + detail.data.id} className="nexus-button">
                    Resume session
                  </Link>
                )}
                {detail.data.questions.map((q, i) => (
                  <article key={q.deliveryId}>
                    <h3>
                      Question {i + 1} · {q.questionCode}
                    </h3>
                    <QuestionContent text={q.text} />
                    <ul>
                      {q.options.map((o) => (
                        <li key={o.optionKey}>
                          {o.optionKey}. {o.text}
                          {selectedKeys(q.selected).includes(o.optionKey)
                            ? " — Your selection"
                            : ""}
                        </li>
                      ))}
                    </ul>
                    {q.result ? (
                      <>
                        <p>
                          {q.result.isCorrect ? "Correct" : "Incorrect"} · Correct answer:{" "}
                          {(q.result.correctOptions ?? [q.result.correctOption])
                            .map((o) => o.optionKey + ". " + o.text)
                            .join("; ")}{" "}
                          ·
                        </p>
                        <QuestionContent text={q.result.explanation} />
                      </>
                    ) : (
                      <p>Not graded. No correct answer is disclosed.</p>
                    )}
                  </article>
                ))}
              </>
            )
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
