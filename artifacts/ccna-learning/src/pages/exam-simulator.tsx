import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
﻿import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  examRequest,
  type ExamRun,
  type ExamAvailability,
  type ExamHistory,
} from "@workspace/api-client-react";
import { useNexusIdentity, useNexusLifetime, nexusError } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { QuestionContent } from "../components/question-content";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../components/ui/alert-dialog";
import { ExamConfiguration } from "./exam-configuration";
import { History, ClipboardList } from "lucide-react";
import "./exam-workspace.css";
export function ExamSimulatorPage() {
  const identity = useNexusIdentity();
  return <ExamActor key={identity ? identity.userId + ":" + identity.sessionId : "anonymous"} />;
}
export const ExamSimulator = ExamSimulatorPage;
export default ExamSimulatorPage;
function ExamActor() {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi, message, number, date } = useI18n();
  const life = useNexusLifetime(),
    identity = life.identity,
    cache = useQueryClient();
  const [, navigate] = useLocation(),
    search = useSearch();
  const id = new URLSearchParams(search).get("session");
  const [domains, setDomains] = useState<string[]>([]),
    [chapters, setChapters] = useState<string[]>([]),
    [count, setCount] = useState(10),
    [customMinutes, setMinutes] = useState<number | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [index, setIndex] = useState(0),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<{ keys: string[]; flagged: boolean } | null>(null);
  const filters = new URLSearchParams({
    domainIds: domains.join(","),
    chapterIds: chapters.join(","),
  }).toString();
  const availability = useQuery({
    queryKey: sessionQueryKey(["/api/exams/availability", filters], identity),
    enabled: !!identity,
    queryFn: ({ signal }) => examRequest<ExamAvailability>("/availability?" + filters, { signal }),
    retry: false,
    gcTime: 0,
  });
  // Practice pacing only; active exam timing continues to use the server clock.
  const minutes = customMinutes ?? (Number.isInteger(count) && count >= 1 && count <= 100
    ? Math.max(5, Math.round(count * 120 / 100)) : NaN);
  const runKey = sessionQueryKey(["/api/exams", id], identity);
  const runQuery = useQuery({
    queryKey: runKey,
    enabled: !!identity && !!id,
    queryFn: ({ signal }) => examRequest<ExamRun>("/" + id, { signal }),
    retry: false,
    gcTime: 0,
  });
  const history = useQuery({
    queryKey: sessionQueryKey(["/api/exams/history", page], identity),
    enabled: !!identity && availability.data?.ready === true,
    queryFn: ({ signal }) => examRequest<ExamHistory>("?page=" + page, { signal }),
    retry: false,
    gcTime: 0,
  });
  const run = runQuery.data,
    current = run?.questions[index],
    active = run?.status === "ACTIVE";
  const [tick, setTick] = useState(Date.now());
  const anchor = useMemo(
    () => ({ client: Date.now(), server: new Date(run?.serverNow ?? 0).getTime() }),
    [run?.serverNow],
  );
  const remaining = run
    ? Math.max(
        0,
        Math.ceil(
          (new Date(run.deadlineAt).getTime() - anchor.server - (tick - anchor.client)) / 1000,
        ),
      )
    : 0;
  const attemptedExpiry = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    setIndex(0);
    setDraft(null);
    setError("");
    attemptedExpiry.current = null;
  }, [id]);
  useEffect(() => {
    const question = Number(new URLSearchParams(search).get("question") ?? 1);
    if (Number.isSafeInteger(question) && question > 0 && run?.questions.length)
      setIndex(Math.min(question - 1, run.questions.length - 1));
  }, [search, run?.questions.length]);
  useEffect(() => {
    if (!busy && !draft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    const navigateAway = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && !window.confirm("An answer is not yet confirmed saved. Leave this exam?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", navigateAway, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigateAway, true);
    };
  }, [busy, draft]);
  async function perform(fn: () => Promise<ExamRun>) {
    const valid = life.capture();
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (!valid()) return;
      cache.setQueryData(sessionQueryKey(["/api/exams", result.id], identity), result);
      setDraft(null);
      setTick(Date.now());
      await cache.invalidateQueries({ queryKey: ["/api/exams/history"] });
      return result;
    } catch (e) {
      if (valid()) setError(nexusError(e));
      return undefined;
    } finally {
      if (valid()) setBusy(false);
    }
  }
  const headers = { "X-Practice-Session": identity?.sessionId ?? "" };
  async function submit() {
    if (!id) return;
    setConfirm(false);
    await perform(() =>
      examRequest<ExamRun>("/" + id + "/submit", { method: "POST", headers, body: "{}" }),
    );
  }
  useEffect(() => {
    if (
      run &&
      active &&
      (remaining === 0 || run.needsFinalization) &&
      !busy &&
      !draft &&
      !run.contentRemoved &&
      attemptedExpiry.current !== run.id
    ) {
      attemptedExpiry.current = run.id;
      void submit();
    }
  }, [remaining, active, run?.needsFinalization, busy, !!draft, run?.contentRemoved]);
  async function save(keys: string[], flagged: boolean) {
    if (!id || !current || busy) return;
    setDraft({ keys, flagged });
    await perform(() =>
      examRequest<ExamRun>("/" + id + "/items/" + current.deliveryId, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          selectedOptionKeys: keys,
          flagged,
          expectedVersion: current.answerVersion,
        }),
      }),
    );
  }
  async function start() {
    const result = await perform(() =>
      examRequest<ExamRun>("", {
        method: "POST",
        headers,
        body: JSON.stringify({
          requestId,
          questionCount: count,
          durationMinutes: minutes,
          domainIds: domains,
          chapterIds: chapters,
        }),
      }),
    );
    if (result) {
      navigate("/exam?session=" + result.id);
      setRequestId(crypto.randomUUID());
    }
  }
  const answered = run?.questions.filter((q) => q.selectedOptionKeys?.length).length ?? 0;
  const selections = draft?.keys ?? current?.selectedOptionKeys ?? [];
  const flagged = draft?.flagged ?? current?.flagged ?? false;
  const frozen = busy || remaining === 0 || !!run?.needsFinalization || !!run?.contentRemoved;
  const numberValid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= Math.min(100, availability.data?.available ?? 0) &&
    Number.isInteger(minutes) &&
    minutes >= 5 &&
    minutes <= 180;
  function chooseIndex(next: number) {
    if (!busy && !draft && id) {
      const position = Math.min(Math.max(next, 0), (run?.questions.length ?? 1) - 1);
      setIndex(position);
      navigate("/exam?session=" + id + "&question=" + (position + 1));
    }
  }
  function newExam() {
    navigate("/exam");
    setDraft(null);
    setError("");
  }
  if (!identity)
    return (
      <div className="nexus-page">
        <h1>{translateUi("Exam Simulator")}</h1>
        <section className="nexus-panel">
          <h2>{translateUi("Sign in to save exams")}</h2>
          <p>{translateUi("Your exam, answers and results belong to your authenticated account.")}</p>
          <Link href="/sign-in" className="nexus-button">
            {translateUi("Sign in")}</Link>
        </section>
      </div>
    );
  return (
    <div className="nexus-page exam-workspace">
      <header className="exam-page-header">
        <span className="nexus-eyebrow">{translateUi("CCNA 200-301 / EXAM WORKSPACE")}</span>
        <h1>{translateUi("Exam Simulator")}</h1>
        <p>
          {translateUi("Equal-weight practice scoring. Complete correct-answer sets earn one point. This is not Cisco exam scoring.")}</p>
      </header>
      {error && (
        <div role="alert" className="nexus-panel exam-error">
          {message(error)}{" "}
          {id && (
            <button
              disabled={busy}
              className="nexus-button secondary"
              onClick={() => {
                void runQuery.refetch();
              }}
            >
              {translateUi("Refresh recorded exam")}</button>
          )}
        </div>
      )}
      {id && runQuery.isPending ? (
        <section role="status" className="nexus-panel">
          {translateUi("Loading your recorded exam...")}</section>
      ) : id && runQuery.isError ? (
        <section className="nexus-panel" role="alert">
          <h2>{translateUi("Exam could not load")}</h2>
          <p>{message(nexusError(runQuery.error))}</p>
          <button className="nexus-button" onClick={() => void runQuery.refetch()}>
            {translateUi("Retry")}</button>
          <button className="nexus-button secondary" onClick={newExam}>
            {translateUi("Exam setup")}</button>
        </section>
      ) : !run || !id ? (
        <ExamConfiguration
          availability={availability.data}
          pending={availability.isPending}
          fetching={availability.isFetching}
          error={availability.isError ? nexusError(availability.error) : undefined}
          retry={() => void availability.refetch()}
          count={count} minutes={minutes} domains={domains} chapters={chapters}
          filter={filter} setFilter={setFilter}
          automaticTiming={customMinutes === null} restoreAutomaticTiming={() => { setMinutes(null); setRequestId(crypto.randomUUID()); }}
          setCount={setCount} setMinutes={setMinutes}
          setDomains={setDomains} setChapters={setChapters}
          changed={() => setRequestId(crypto.randomUUID())}
          numberValid={numberValid} busy={busy} start={() => void start()}
          historyTotal={history.isSuccess && availability.data?.ready ? history.data.total : undefined}
        />
      ) : null}
      {run && id && active && (
        <section className="nexus-panel">
          <div className="exam-session-toolbar">
            <h2>
              {translateUi('Question {current} of {total}', {current:number(index+1),total:number(run.questionCount)})}
            </h2>
            <span role="timer" aria-label={translateUi("Time remaining")}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
            <span role="status">
              {busy
                ? translateUi("Saving...")
                : draft
                  ? translateUi("Answer not saved — retry or refresh")
                  : translateUi("Recorded on server")}
            </span>
          </div>
          {run.contentRemoved ? (
            <div role="alert">
              <h3>{translateUi("Exam content removed")}</h3>
              <p>
                {translateUi("An administrator permanently removed selected content. This exam cannot be graded. Other records remain intact.")}</p>
              <button className="nexus-button" onClick={newExam}>
                {translateUi("Set up another exam")}</button>
            </div>
          ) : (
            <>
              {(remaining === 0 || run.needsFinalization) && (
                <p role="alert">
                  {translateUi("Time has expired. Answers are locked. Only answers already saved on the server will be graded.")}{" "}
                  <button disabled={busy} onClick={() => void submit()}>
                    {translateUi("Finalize expired exam")}</button>
                </p>
              )}
              <div className="exam-taking-grid">
                <nav aria-label={translateUi("Exam question navigation")} className="exam-position-grid">
                  {run.questions.map((q, n) => (
                    <button
                      key={q.deliveryId}
                      disabled={busy || !!draft}
                      aria-current={index === n ? "step" : undefined}
                      aria-label={translateUi("Question {value0}{value1}{value2}", {value0: String(n + 1), value1: String(q.selectedOptionKeys?.length ? translateUi(", answered") : translateUi(", unanswered")), value2: String(q.flagged ? translateUi(", marked for review") : "")})}
                      onClick={() => chooseIndex(n)}
                    >
                      {n + 1}
                      {q.flagged ? " ⚑" : ""}
                      {q.selectedOptionKeys?.length ? " •" : ""}
                    </button>
                  ))}
                </nav>
                {current && (
                  <article>
                    <p>
                      {current.mapping?.chapter.code} — {current.mapping?.chapter.title}
                    </p>
                    <p>{current.questionCode}</p>
                    <h3>
                      <QuestionContent text={current.text ?? ""} />
                    </h3>
                    <fieldset disabled={frozen}>
                      <legend>
                        {current.type === "MULTIPLE_CHOICE_MULTIPLE"
                          ? translateUi('Choose {count} answers', {count:number(current.requiredSelectionCount ?? 0)})
                          : translateUi("Choose one answer")}
                      </legend>
                      {current.options?.map((o) => (
                        <label className="exam-option" key={o.optionKey}>
                          <input
                            type={
                              current.type === "MULTIPLE_CHOICE_MULTIPLE" ? "checkbox" : "radio"
                            }
                            name={current.deliveryId}
                            checked={selections.includes(o.optionKey)}
                            disabled={
                              !!draft ||
                              (!selections.includes(o.optionKey) &&
                                current.type === "MULTIPLE_CHOICE_MULTIPLE" &&
                                selections.length === (current.requiredSelectionCount ?? 0))
                            }
                            onChange={() =>
                              void save(
                                current.type === "MULTIPLE_CHOICE_MULTIPLE"
                                  ? selections.includes(o.optionKey)
                                    ? selections.filter((x) => x !== o.optionKey)
                                    : [...selections, o.optionKey]
                                  : [o.optionKey],
                                flagged,
                              )
                            }
                          />
                          <strong>{o.optionKey}</strong> <QuestionContent text={o.text} />
                        </label>
                      ))}
                    </fieldset>
                    <div className="exam-actions-row">
                      <button
                        className="nexus-button secondary"
                        disabled={frozen || !!draft}
                        aria-pressed={flagged}
                        onClick={() => void save(selections, !flagged)}
                      >
                        {flagged ? translateUi("Unmark review") : translateUi("Mark for review")}
                      </button>
                      <button
                        className="nexus-button secondary"
                        disabled={frozen || !!draft || !selections.length}
                        onClick={() => void save([], flagged)}
                      >
                        {translateUi("Clear answer")}</button>
                    </div>
                    {draft && (
                      <div role="alert">
                        <p>{translateUi("Your local selection is retained but not confirmed saved.")}</p>
                        <button
                          disabled={frozen}
                          className="nexus-button"
                          onClick={() => void save(draft.keys, draft.flagged)}
                        >
                          {translateUi("Retry saving")}</button>
                        <button
                          disabled={busy}
                          className="nexus-button secondary"
                          onClick={() => {
                            setDraft(null);
                            void runQuery.refetch();
                          }}
                        >
                          {translateUi("Discard local change and reload")}</button>
                      </div>
                    )}
                    <div className="exam-actions-row">
                      <button
                        disabled={index === 0 || busy || !!draft}
                        onClick={() => chooseIndex(index - 1)}
                      >
                        {translateUi("Previous")}</button>
                      <button
                        disabled={index === run.questions.length - 1 || busy || !!draft}
                        onClick={() => chooseIndex(index + 1)}
                      >
                        {translateUi("Next")}</button>
                    </div>
                  </article>
                )}
              </div>
              <div className="exam-actions-row">
                <span>
                  {answered} {translateUi("answered /")}{" "}{run.questionCount - answered} {translateUi("unanswered")}</span>
                <button
                  className="nexus-button"
                  disabled={busy || !!draft}
                  onClick={() => setConfirm(true)}
                >
                  {translateUi("Submit exam")}</button>
                <button
                  className="nexus-button secondary"
                  disabled={busy || !!draft}
                  onClick={newExam}
                >
                  {translateUi("Leave and resume later")}</button>
              </div>
            </>
          )}
        </section>
      )}
      {run && id && !active && (
        <section className="nexus-panel">
          <h2>{run.status === "EXPIRED" ? translateUi("Expired exam results") : translateUi("Exam results")}</h2>
          {run.contentRemoved && (
            <p role="status">
              {translateUi("Review is partially redacted after controlled content deletion. Original aggregate score is retained.")}</p>
          )}
          <div className="exam-score-grid">
            {[
              ["Score", run.result ? run.result.percentage.toFixed(1) + "%" : "Unavailable"],
              ["Correct", run.result?.correct],
              ["Incorrect", run.result?.incorrect],
              ["Unanswered", run.result?.unanswered],
              ["Questions", run.result?.total],
              [
                "Time",
                run.result
                  ? Math.floor(run.result.completionSeconds / 60) +
                    "m " +
                    (run.result.completionSeconds % 60) +
                    "s"
                  : "Unavailable",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <span><UiMessage text={String(label)}/></span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <h3>{translateUi("Results by domain")}</h3>
          <Breakdown rows={run.result?.domains ?? []} />
          <h3>{translateUi("Results by chapter")}</h3>
          <Breakdown rows={run.result?.chapters ?? []} />
          <h3>{translateUi("Answer review")}</h3>
          {run.questions.map((q) => (
            <details key={q.deliveryId}>
              <summary>
                {q.position + 1}. {q.questionCode} — {q.removed ? translateUi("Removed") : q.result?.outcome}
              </summary>
              {q.removed ? (
                <p>{translateUi("This content was removed through the controlled Admin workflow.")}</p>
              ) : (
                <>
                  <h4>
                    <QuestionContent text={q.text ?? ""} />
                  </h4>
                  <p>{translateUi("Your answer:")}{" "}{q.selectedOptionKeys?.join(", ") || translateUi("Unanswered")}</p>
                  <p>
                    {translateUi("Correct:")}{" "}
                    {(
                      q.review?.correctOptions ??
                      (q.review?.correctOption ? [q.review.correctOption] : [])
                    )
                      .map((o) => o.optionKey + ": " + o.text)
                      .join("; ")}
                  </p>
                  <QuestionContent text={q.review?.explanation ?? ""} />
                </>
              )}
            </details>
          ))}
          <button className="nexus-button" onClick={newExam}>
            {translateUi("Set up another exam")}</button>
        </section>
      )}
      <section className="nexus-panel exam-history" aria-labelledby="exam-history-title">
        <h2 id="exam-history-title"><History size={20} aria-hidden="true" /> {translateUi("Your exam history")}</h2>
        {history.isPending ? (
          <div className="exam-history-empty" role="status">
            <ClipboardList size={28} aria-hidden="true" />
            <h3>{availability.data?.ready ? translateUi("Loading your exam history") : translateUi("Your exam history will appear here")}</h3>
            <p>{availability.data?.ready ? translateUi("Retrieving your saved exams...") : translateUi("History is available after the exam migration.")}</p>
          </div>
        ) : history.isError ? (
          <p role="alert">
            <UiMessage text={nexusError(history.error)}/>{" "}
            <button onClick={() => void history.refetch()}>{translateUi("Retry history")}</button>
          </p>
        ) : !history.data?.items.length ? (
          <div className="exam-history-empty"><ClipboardList size={28} aria-hidden="true" /><h3>{translateUi("No exams yet")}</h3><p>{translateUi("Your submitted and active exams will appear here.")}</p></div>
        ) : (
          <>
            <div className="exam-history-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{translateUi("Started")}</th>
                    <th>{translateUi("Status")}</th>
                    <th>{translateUi("Questions")}</th>
                    <th>{translateUi("Score")}</th>
                    <th>{translateUi("Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{date(s.startedAt,{dateStyle:'medium',timeStyle:'short'})}</td>
                      <td>
                        <UiMessage text={s.status}/>
                        {s.contentRemoved ? translateUi("/ content removed") : ""}
                      </td>
                      <td>{s.questionCount}</td>
                      <td>{s.result ? s.result.percentage.toFixed(1) + "%" : translateUi("Not submitted")}</td>
                      <td>
                        <Link href={"/exam?session=" + s.id}>
                          {s.status === "ACTIVE" ? translateUi("Resume") : translateUi("Review")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="exam-actions-row">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                {translateUi("Previous history page")}</button>
              <span>
                {translateUi("Page")}{" "}{history.data.page} {translateUi("of")}{" "}{history.data.totalPages}
              </span>
              <button disabled={page >= history.data.totalPages} onClick={() => setPage(page + 1)}>
                {translateUi("Next history page")}</button>
            </div>
          </>
        )}
      </section>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>{translateUi("Submit this exam permanently?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {run ? run.questionCount - answered : 0} {translateUi("questions have no saved answer. Nonempty incomplete answer sets earn no credit. Answers cannot be changed after submission.")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi("Continue exam")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>
              {translateUi("Submit and grade saved answers")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function Breakdown({
  rows,
}: {
  rows: {
    id: string;
    name?: string;
    title?: string;
    total: number;
    correct: number;
    incorrect: number;
    unanswered: number;
  }[];
}) {
  const { t: translateUi } = useI18n();
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>
          {r.name ?? r.title}: {r.correct}/{r.total} {translateUi("correct;")}{" "}{r.incorrect} {translateUi("incorrect;")}{" "}
          {r.unanswered} {translateUi("unanswered")}</li>
      ))}
    </ul>
  );
}
