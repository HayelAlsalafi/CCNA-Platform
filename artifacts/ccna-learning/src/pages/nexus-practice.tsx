import {
  selectedKeys,
  toggleSelection,
  completeSelection,
  answerLabel,
} from "../lib/answer-selection";
import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Flag, ListChecks, Copy, Check } from "lucide-react";
import {
  nexusRequest,
  customFetch,
  type NexusAvailability,
  type NexusRun,
  type NexusQuestion,
} from "@workspace/api-client-react";
import {
  useNexusAnalytics,
  useNexusIdentity,
  useNexusLifetime,
  nexusError,
  accuracy,
} from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { NetworkHero } from "../components/nexus-visuals";
import { QuestionContent } from "../components/question-content";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../components/ui/alert-dialog";
import "./nexus-practice.css";

export function NexusPractice() {
  const identity = useNexusIdentity();
  return (
    <NexusPracticeActor key={identity ? identity.userId + ":" + identity.sessionId : "anonymous"} />
  );
}
function NexusPracticeActor() {
  const life = useNexusLifetime(),
    identity = life.identity,
    cache = useQueryClient(),
    analytics = useNexusAnalytics();
  const [, navigate] = useLocation(),
    pendingNavigation = useRef<string | null>(null),
    operation = useRef(false);
  const initial = new URLSearchParams(window.location.search);
  const [domainId, setDomain] = useState(initial.get("domainId") || ""),
    [topicId, setTopic] = useState(initial.get("topicId") || ""),
    [difficulty, setDifficulty] = useState(""),
    [mode, setMode] = useState(
      initial.get("mode") === "REVIEW_MISTAKES" ? "REVIEW_MISTAKES" : "PRACTICE",
    ),
    [count, setCount] = useState(10);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [run, setRun] = useState<NexusRun | null>(null),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<"finish" | "abandon" | null>(null),
    [nav, setNav] = useState(false),
    [copied, setCopied] = useState(false);
  const filters = {
    ...(domainId ? { domainId } : {}),
    ...(topicId ? { topicId } : {}),
    ...(difficulty ? { difficulty } : {}),
    mode,
  };
  const query = new URLSearchParams(filters).toString();
  const available = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/availability", query], identity),
    enabled: !!identity && !run,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => nexusRequest<NexusAvailability>("availability?" + query, { signal }),
  });
  const refresh = () => {
    void cache.invalidateQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith("/api/nexus/") ||
        String(q.queryKey[0]).includes("/api/learning/progress") ||
        String(q.queryKey[0]).includes("/api/practice/history"),
    });
  };
  const headers = {
    "Content-Type": "application/json",
    "X-Practice-Session": identity?.sessionId || "",
  };
  async function action(fn: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    const current = life.capture();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (current()) setError(nexusError(e));
    } finally {
      operation.current = false;
      if (current()) setBusy(false);
    }
  }
  useEffect(() => {
    const id = initial.get("resume");
    if (!identity || !id) return;
    const current = life.capture(),
      abort = new AbortController();
    setBusy(true);
    nexusRequest<NexusRun>("sessions/" + encodeURIComponent(id), { signal: abort.signal })
      .then((r) => {
        if (current()) {
          if (r.canResume) {
            setRun(r);
            setIndex(
              r.questions.findIndex((q) => !q.result) >= 0
                ? r.questions.findIndex((q) => !q.result)
                : 0,
            );
          } else
            setError(
              "This session cannot resume: it is completed, expired, or belongs to a different sign-in. Review it in Learning Intelligence.",
            );
        }
      })
      .catch((e) => {
        if (current() && !abort.signal.aborted) setError(nexusError(e));
      })
      .finally(() => {
        if (current()) setBusy(false);
      });
    return () => abort.abort();
  }, [identity?.userId, identity?.sessionId]);
  useEffect(() => {
    if (!run || run.status !== "ACTIVE") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [run?.status]);
  useEffect(() => {
    if (!run || run.status !== "ACTIVE") return;
    const intercept = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.origin !== window.location.origin ||
        (anchor.pathname === window.location.pathname && anchor.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      pendingNavigation.current = anchor.pathname + anchor.search;
      setConfirm("abandon");
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [run?.status]);
  const updateFilter = (fn: () => void) => {
    fn();
    setRequestId(crypto.randomUUID());
  };
  async function start() {
    await action(async () => {
      const current = life.capture();
      const result = await nexusRequest<NexusRun>("sessions", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...filters, count, requestId }),
      });
      if (current()) {
        setRun(result);
        setPendingFinal(false);
        setPendingGrades(new Set());
        setIndex(0);
        refresh();
      }
    });
  }
  async function selection(q: NexusQuestion, key: string | null, flagged = q.flagged) {
    await action(async () => {
      const current = life.capture();
      if (run?.id)
        await nexusRequest("sessions/" + run.id + "/selection", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ questionId: q.id, optionKey: key, flagged }),
        });
      if (current())
        setRun((r) =>
          r
            ? {
                ...r,
                questions: r.questions.map((item) =>
                  item.id === q.id ? { ...item, selected: key, flagged } : item,
                ),
              }
            : r,
        );
    });
  }
  const [pendingFinal, setPendingFinal] = useState(false),
    [pendingGrades, setPendingGrades] = useState<Set<string>>(() => new Set());
  async function grade(q: NexusQuestion) {
    if (!completeSelection(q) || !run) return;
    await action(async () => {
      const current = life.capture();
      setPendingGrades((ids) => new Set([...ids, q.deliveryId]));
      try {
        if (run.id) {
          await nexusRequest("sessions/" + run.id + "/answer", {
            method: "POST",
            headers,
            body: JSON.stringify({ questionId: q.id }),
          });
          const result = await nexusRequest<NexusRun>("sessions/" + run.id);
          if (current()) setRun(result);
        } else {
          const result = await customFetch<NonNullable<NexusQuestion["result"]>>(
            "/api/practice/questions/" + q.id + "/answer",
            {
              method: "POST",
              headers,
              body: JSON.stringify({ optionKey: q.selected, deliveryId: q.deliveryId }),
            },
          );
          if (current())
            setRun((r) =>
              r
                ? {
                    ...r,
                    questions: r.questions.map((item) =>
                      item.id === q.id ? { ...item, result, submitted: true } : item,
                    ),
                  }
                : r,
            );
        }
        if (current()) refresh();
      } catch (e) {
        if (
          current() &&
          (e as { name?: string; status?: number }).name === "ApiError" &&
          (e as { status?: number }).status === 400
        )
          setPendingGrades((ids) => {
            const next = new Set(ids);
            next.delete(q.deliveryId);
            return next;
          });
        throw e;
      }
    });
  }
  async function finish() {
    setConfirm(null);
    await action(async () => {
      if (!run) return;
      const current = life.capture();
      setPendingFinal(true);
      try {
        if (run.id) {
          const result = await nexusRequest<NexusRun>("sessions/" + run.id + "/finish", {
            method: "POST",
            headers,
          });
          if (current()) setRun(result);
        } else {
          const result = await nexusRequest<NexusRun>("submissions", {
            method: "POST",
            headers,
            body: JSON.stringify({
              answers: run.questions.map((q) => ({
                questionId: q.id,
                deliveryId: q.deliveryId,
                optionKey: q.selected,
                flagged: q.flagged,
              })),
            }),
          });
          if (current())
            setRun({
              ...result,
              mode: run.mode,
              questions: result.questions.map((q) => ({
                ...q,
                domains:
                  run.questions.find((item) => item.deliveryId === q.deliveryId)?.domains || [],
              })),
            });
        }
        if (current()) refresh();
      } catch (e) {
        if (
          current() &&
          (e as { name?: string; status?: number }).name === "ApiError" &&
          (e as { status?: number }).status === 400
        )
          setPendingFinal(false);
        throw e;
      }
    });
  }
  async function abandon() {
    const leaveHref = pendingNavigation.current;
    pendingNavigation.current = null;
    setConfirm(null);
    await action(async () => {
      if (run?.id)
        await nexusRequest("sessions/" + run.id + "/abandon", { method: "POST", headers });
      const current = life.capture();
      if (current()) {
        setRun(null);
        setPendingFinal(false);
        setPendingGrades(new Set());
        setIndex(0);
        setRequestId(crypto.randomUUID());
        refresh();
        if (leaveHref) navigate(leaveHref);
      }
    });
  }
  const q = run?.questions[index],
    answered = run?.questions.filter((q) => completeSelection(q)).length || 0;
  const navigator = run && (
    <>
      <h3>Question navigator</h3>
      <div className="nexus-question-nav">
        {run.questions.map((item, i) => (
          <button
            key={item.deliveryId}
            disabled={busy}
            aria-current={i === index}
            aria-label={`Question ${i + 1}, ${item.result ? "submitted" : item.selected ? "selected" : "unanswered"}${item.flagged ? ", flagged" : ""}`}
            className={
              (item.result ? "answered" : item.selected ? "selected" : "") +
              (item.flagged ? " flagged" : "")
            }
            onClick={() => {
              setIndex(i);
              setNav(false);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="nexus-muted">
        {answered}/{run.questions.length} selected · {run.questions.filter((q) => q.flagged).length}{" "}
        flagged. Green: submitted. Blue: selected. Flag: review.
      </p>
    </>
  );
  return (
    <div className="nexus-page ccna-practice">
      <NetworkHero
        compact
        eyebrow="NETWORK CHALLENGE ARENA"
        title="Train with a clear signal."
        description="Real questions. Revision-bound delivery. Server-authoritative feedback."
      />
      {!identity ? (
        <section className="nexus-panel">
          <h2>Sign in to start practice</h2>
          <Link href="/sign-in" className="nexus-button">
            Sign in
          </Link>
        </section>
      ) : (
        <>
          {error && (
            <div role="alert" className="nexus-error">
              {error}
            </div>
          )}
          {error && pendingFinal && (
            <p className="nexus-panel" role="status">
              Final submission is unconfirmed. Choices are locked so a retry uses the same answers.
              Retry Finish &amp; Submit or review your recorded answer history; no success is
              assumed.
            </p>
          )}
          {!run ? (
            <div className="nexus-builder">
              <section className="nexus-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">SESSION BUILDER</span>
                    <h2>Choose your challenge</h2>
                  </div>
                </div>
                <div className="nexus-fields">
                  <label className="nexus-field">
                    Domain
                    <select
                      value={domainId}
                      onChange={(e) =>
                        updateFilter(() => {
                          setDomain(e.target.value);
                          setTopic("");
                        })
                      }
                    >
                      <option value="">All mapped and unmapped domains</option>
                      {analytics.data?.domains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nexus-field">
                    Topic
                    <select
                      value={topicId}
                      onChange={(e) => updateFilter(() => setTopic(e.target.value))}
                    >
                      <option value="">All available topics</option>
                      {available.data?.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.available})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nexus-field">
                    Difficulty
                    <select
                      value={difficulty}
                      onChange={(e) => updateFilter(() => setDifficulty(e.target.value))}
                    >
                      <option value="">Mixed difficulty</option>
                      {["EASY", "MEDIUM", "HARD"].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="nexus-field">
                    Mode
                    <select
                      value={mode}
                      onChange={(e) =>
                        updateFilter(() => {
                          setMode(e.target.value);
                          setTopic("");
                        })
                      }
                    >
                      <option value="LEARN">Learn · immediate feedback</option>
                      <option value="PRACTICE">Practice · grade at finish</option>
                      <option value="REVIEW_MISTAKES">
                        Review Mistakes · your latest incorrect answers
                      </option>
                    </select>
                  </label>
                  <label className="nexus-field">
                    Number of questions
                    <input
                      type="number"
                      min={1}
                      max={Math.min(100, available.data?.available || 1)}
                      value={count}
                      onChange={(e) => updateFilter(() => setCount(Number(e.target.value)))}
                    />
                    <small>Maximum 100, limited to actual availability.</small>
                  </label>
                  <div className="nexus-field">
                    Question availability
                    <strong aria-live="polite">
                      {available.isPending
                        ? "Checking…"
                        : (available.data?.available ?? "Unavailable")}
                    </strong>
                    {available.isError && (
                      <button onClick={() => void available.refetch()}>Retry availability</button>
                    )}
                  </div>
                </div>
                <p className="nexus-muted">
                  Practice keeps every answer editable until final submission. Learn and guided
                  Review Mistakes are explicit immediate-feedback modes: checked answers become
                  immutable.
                </p>
                <p className="nexus-muted">
                  Review Mistakes uses only your latest incorrect answer for each currently
                  available question. No other learner's history is accessed.
                </p>
                {available.data && !available.data.persistence && (
                  <p className="nexus-muted">
                    Session tracking upgrade pending approval. Answers are still stored
                    individually; this run cannot resume after leaving. Finish submits all selected
                    deliveries atomically. Session resume and grouped history require the tracking
                    upgrade.
                  </p>
                )}
              </section>
              <aside className="nexus-preview">
                <span className="nexus-eyebrow">CHALLENGE PREVIEW</span>
                <h2>{mode.replaceAll("_", " ")}</h2>
                <p>
                  {analytics.data?.domains.find((d) => d.id === domainId)?.name ||
                    "Across the available CCNA catalog"}
                  <br />
                  {available.data?.topics.find((t) => t.id === topicId)?.name ||
                    "Mixed networking concepts"}
                  <br />
                  {count} questions · {difficulty || "mixed difficulty"}
                </p>
                <p>
                  {mode === "PRACTICE"
                    ? "Navigate and flag questions, then finish for server grading."
                    : "Submit each choice to receive its original revision explanation."}
                </p>
                <button
                  className="nexus-button"
                  disabled={
                    busy ||
                    available.isFetching ||
                    !available.data ||
                    count < 1 ||
                    count > Math.min(100, available.data.available) ||
                    !Number.isInteger(count)
                  }
                  onClick={() => void start()}
                >
                  {busy ? "Starting…" : "Start Practice"} <ArrowRight size={16} />
                </button>
              </aside>
            </div>
          ) : run.status === "CONTENT_DELETED" ? (<div role="alert">An Admin permanently deleted content from this session. Unrelated history remains. Start a new run.</div>) : run.status === "COMPLETED" ? (
            <section className="nexus-panel nexus-results">
              <span className="nexus-eyebrow">SESSION RESULTS</span>
              <h2>Challenge complete</h2>
              <div className="nexus-result-grid">
                <div>
                  <strong>
                    {accuracy(
                      run.questions.filter((q) => q.result?.isCorrect).length,
                      run.questions.filter((q) => q.result).length,
                    )}
                    %
                  </strong>
                  Server-graded accuracy
                </div>
                <div>
                  <strong>
                    {run.questions.filter((q) => q.result?.isCorrect).length}/{run.questions.length}
                  </strong>
                  Correct answers
                </div>
                <div>
                  <strong>{run.questions.filter((q) => q.flagged).length}</strong>Flagged for review
                </div>
              </div>
              <p>
                All {run.questions.filter((q) => q.result).length} graded answers were returned by
                the server.{" "}
                {run.id
                  ? "This session is stored for review."
                  : "This run remains in individual-answer history."}
              </p>
              <h3>Topic breakdown</h3>
              {Array.from(new Set(run.questions.map((q) => q.topic.id))).map((id) => {
                const group = run.questions.filter((q) => q.topic.id === id);
                return (
                  <p key={id}>
                    {group[0].topic.name}: {group.filter((q) => q.result?.isCorrect).length}/
                    {group.length} correct
                  </p>
                );
              })}
              <h3>Domain breakdown</h3>
              {Array.from(new Set(run.questions.flatMap((q) => q.domains.map((d) => d.id)))).map(
                (id) => {
                  const group = run.questions.filter((q) => q.domains.some((d) => d.id === id));
                  return (
                    <p key={id}>
                      {group[0].domains.find((d) => d.id === id)?.name}:{" "}
                      {group.filter((q) => q.result?.isCorrect).length}/{group.length} correct
                    </p>
                  );
                },
              )}
              <p className="nexus-muted">
                A question can belong to multiple domains; domain totals may overlap. Unmapped
                questions are not assigned automatically.
              </p>
              {run.questions
                .filter((q) => !q.result?.isCorrect || q.flagged)
                .map((item, i) => (
                  <details key={item.deliveryId}>
                    <summary>
                      {item.flagged ? "Flagged · " : ""}
                      {item.result?.isCorrect ? "Correct" : "Incorrect"} · {item.questionCode} ·{" "}
                      {item.topic.name}
                    </summary>
                    <QuestionContent text={item.text} />
                    <p>Your answer: {answerLabel(item.selected)}</p>
                    <p>
                      Correct:{" "}
                      {(
                        item.result?.correctOptions ??
                        (item.result ? [item.result.correctOption] : [])
                      )
                        .map((o) => o.optionKey + ". " + o.text)
                        .join("; ")}{" "}
                      ·{" "}
                    </p>
                    <QuestionContent text={item.result?.explanation || ""} />
                  </details>
                ))}
              <div className="nexus-workspace-controls">
                <button
                  className="nexus-button"
                  onClick={() => {
                    setRun(null);
                    setPendingFinal(false);
                    setPendingGrades(new Set());
                    setMode("REVIEW_MISTAKES");
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  Retry Mistakes
                </button>
                <Link href="/" className="nexus-button secondary">
                  Return to Overview
                </Link>
              </div>
            </section>
          ) : (
            q && (
              <>
                <div className="practice-session-progress" role="group" aria-label="Practice session progress">
                  <div className="practice-progress-heading">
                    <span>Session progress</span>
                    <strong>
                      {answered} of {run.questions.length} answered
                    </strong>
                  </div>
                  <div
                    className="practice-progress-track"
                    role="progressbar"
                    aria-label="Questions answered"
                    aria-valuemin={0}
                    aria-valuemax={run.questions.length}
                    aria-valuenow={answered}
                  >
                    <span
                      style={{
                        width: `${(answered / run.questions.length) * 100}%`,
                      }}
                    />
                  </div>
                  <small>
                    Question {index + 1} of {run.questions.length}
                  </small>
                </div>
                <div className="nexus-section-heading practice-session-heading">
                  <div>
                    <h2>
                      {run.mode.replaceAll("_", " ")} · Question {index + 1}/{run.questions.length}
                    </h2>
                    <p className="nexus-muted">
                      {answered} selected · {run.questions.filter((q) => q.result).length} submitted
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="nexus-button secondary nexus-mobile-navigator"
                      onClick={() => setNav(true)}
                      aria-label="Open question navigator"
                    >
                      <ListChecks size={18} />
                    </button>
                    <button
                      className="nexus-button secondary"
                      disabled={busy}
                      onClick={() => setConfirm("abandon")}
                    >
                      Leave session
                    </button>
                    {index === run.questions.length - 1 && (
                      <button
                        className="nexus-button"
                        disabled={busy || answered !== run.questions.length}
                        onClick={() => setConfirm("finish")}
                      >
                        Finish & Submit
                      </button>
                    )}
                  </div>
                </div>
                {index === run.questions.length - 1 && answered !== run.questions.length && (
                  <div className="nexus-panel" role="status">
                    <p>
                      {run.questions.length - answered} questions are unanswered. Review them before
                      final submission.
                    </p>
                    <button
                      className="nexus-button secondary"
                      onClick={() =>
                        setIndex(run.questions.findIndex((q) => !completeSelection(q)))
                      }
                    >
                      Go to first unanswered question
                    </button>
                  </div>
                )}
                <div className="nexus-workspace">
                  <section className="nexus-panel">
                    <div className="nexus-question-head">
                      <span>
                        {q.questionCode} · {q.topic.name}
                      </span>
                      <span>{q.difficulty}</span>
                    </div>
                    <div className="nexus-question-text">
                      <QuestionContent text={q.text} />
                    </div>
                    {q.text.includes("```") && (
                      <button
                        className="nexus-text-link"
                        onClick={() => {
                          void navigatorClipboard(q.text)
                            .then(() => setCopied(true))
                            .catch(() =>
                              setError(
                                "Clipboard unavailable. Select the CLI text to copy it manually.",
                              ),
                            );
                        }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                        {copied ? "Copied" : "Copy question / CLI text"}
                      </button>
                    )}
                    <fieldset
                      disabled={
                        busy ||
                        pendingFinal ||
                        pendingGrades.has(q.deliveryId) ||
                        !!q.result ||
                        !!q.submitted
                      }
                    >
                      <legend>
                        {q.type === "MULTIPLE_CHOICE_MULTIPLE"
                          ? `Choose ${q.requiredSelectionCount} answers`
                          : "Choose one answer"}
                      </legend>
                      <div className="nexus-options">
                        {q.options.map((option) => (
                          <label className="nexus-option" key={option.optionKey}>
                            <input
                              type={q.type === "MULTIPLE_CHOICE_MULTIPLE" ? "checkbox" : "radio"}
                              name={"answer-" + q.deliveryId}
                              checked={selectedKeys(q.selected).includes(option.optionKey)}
                              onChange={() =>
                                void selection(
                                  q,
                                  toggleSelection(
                                    q.selected,
                                    option.optionKey,
                                    q.type === "MULTIPLE_CHOICE_MULTIPLE",
                                    q.requiredSelectionCount,
                                  ),
                                )
                              }
                            />
                            <strong>{option.optionKey}</strong>
                            <QuestionContent text={option.text} />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {q.result && (
                      <div
                        className={
                          "nexus-answer-feedback" + (q.result.isCorrect ? "" : " incorrect")
                        }
                        role="status"
                      >
                        <h3>{q.result.isCorrect ? "Correct connection" : "Review this concept"}</h3>
                        <p>
                          Correct answer:{" "}
                          {(q.result.correctOptions ?? [q.result.correctOption])
                            .map((o) => o.optionKey + ". " + o.text)
                            .join("; ")}{" "}
                          ·{" "}
                        </p>
                        <QuestionContent text={q.result.explanation} />
                      </div>
                    )}
                    <div className="nexus-workspace-controls">
                      <button
                        className="nexus-button secondary"
                        disabled={busy || index === 0}
                        onClick={() => {
                          setIndex((i) => i - 1);
                          setCopied(false);
                        }}
                      >
                        <ArrowLeft size={15} />
                        Previous
                      </button>
                      <button
                        className="nexus-text-link"
                        disabled={busy}
                        aria-pressed={q.flagged}
                        onClick={() => void selection(q, q.selected, !q.flagged)}
                      >
                        <Flag size={15} />
                        {q.flagged ? "Unflag" : "Flag for review"}
                      </button>
                      {run.mode !== "PRACTICE" && !q.result && (
                        <button
                          className="nexus-button"
                          disabled={busy || !completeSelection(q)}
                          onClick={() => void grade(q)}
                        >
                          {run.mode === "LEARN"
                            ? "Check answer (Learn mode)"
                            : "Check answer (guided review)"}
                        </button>
                      )}
                      <button
                        className="nexus-button secondary"
                        disabled={busy || index === run.questions.length - 1}
                        onClick={() => {
                          setIndex((i) => i + 1);
                          setCopied(false);
                        }}
                      >
                        Next Question
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                  <aside className="nexus-panel nexus-desktop-navigator">{navigator}</aside>
                </div>
                <Sheet open={nav} onOpenChange={setNav}>
                  <SheetContent className="practice-navigation-sheet">
                    <SheetTitle>Question navigation</SheetTitle>
                    <SheetDescription>
                      Jump between questions; selected answers remain saved.
                    </SheetDescription>
                    {navigator}
                  </SheetContent>
                </Sheet>
              </>
            )
          )}
        </>
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            pendingNavigation.current = null;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirm === "finish"
              ? "Finish and grade this session?"
              : "Leave this unfinished session?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "finish"
              ? "The server grades selected answers using their delivered question revisions. Submitted answers cannot be changed."
              : "Submitted answers remain in your history. Leaving marks a persisted session abandoned; an untracked run cannot resume."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep studying</AlertDialogCancel>
            <AlertDialogAction onClick={() => void (confirm === "finish" ? finish() : abandon())}>
              {confirm === "finish" ? "Finish & Submit" : "Leave session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
async function navigatorClipboard(text: string) {
  await window.navigator.clipboard.writeText(text);
}
