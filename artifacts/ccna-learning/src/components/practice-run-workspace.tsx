import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import {selectedKeys,toggleSelection,completeSelection,answerLabel} from "../lib/answer-selection";
import { useEffect, useRef, useState, type RefObject } from "react";
import {QuestionContent} from './question-content';
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Flag, ArrowLeft, ArrowRight, Send, Target } from "lucide-react";
import {
  adminContentRequest,
  getCurriculum,
  useListTopics,
  type PracticeQuestion,
  type PracticeAnswerResult,
} from "@workspace/api-client-react";
import {
  progressIdentity,
  sessionQueryKey,
  type ProgressIdentity,
} from "../lib/learning-progress-cache";
import { practiceSessionKey } from "../lib/practice-session";
import { practiceTotals, type PracticeItem } from "../lib/practice-run";
import "../practice-run.css";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
type Props = { isAuthLoaded: boolean; isSignedIn: boolean };
export function PracticeWorkspace(props: Props) {
  const identity = progressIdentity(useAuth()),
    activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  return (
    <PracticeSession
      key={practiceSessionKey(identity)}
      {...props}
      identity={identity}
      activeIdentity={activeIdentity}
    />
  );
}
function PracticeSession({
  isAuthLoaded,
  isSignedIn,
  identity,
  activeIdentity,
}: Props & {
  identity: ProgressIdentity | null;
  activeIdentity: RefObject<ProgressIdentity | null>;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const client = useQueryClient(),
    mounted = useRef(true),
    busy = useRef(false),
    generation = useRef(0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [topicId, setTopicId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("topicId") ?? ""),
  );
  const [count, setCount] = useState(1),
    [items, setItems] = useState<PracticeItem[]>([]),
    [position, setPosition] = useState(0);
  const [finished, setFinished] = useState(false),
    [finishConfirm, setFinishConfirm] = useState(false);
  const topicsQuery = useListTopics(),
    topics = topicsQuery.data ?? [],
    topic = topics.find((t) => t.id === topicId);
  const curriculum = useQuery({
    queryKey: sessionQueryKey(["/api/curriculum"], identity),
    queryFn: ({ signal }) => getCurriculum(signal),
    enabled: !!identity,
    retry: false,
    gcTime: 0,
  });
  const mappedTopic = curriculum.data?.topics.find((t) => t.id === topicId);
  const domain = curriculum.data?.domains.find((d) =>
    mappedTopic?.chapterIds.some((id) => id.startsWith(d.id + "-")),
  );
  const totals = practiceTotals(items),
    current = items[position];
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const accept = (callback: () => void) => {
    if (
      mounted.current &&
      identity &&
      activeIdentity.current &&
      practiceSessionKey(identity) === practiceSessionKey(activeIdentity.current)
    )
      callback();
  };
  const start = async () => {
    if (
      busy.current ||
      !identity ||
      !topic ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > topic.questionCount ||
      count > 100
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    const run = ++generation.current;
    try {
      const batch = await adminContentRequest<{ questions: PracticeQuestion[] }>(
        "/api/practice/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Practice-Session": identity.sessionId },
          body: JSON.stringify({ topicId, count }),
        },
      );
      accept(() => {
        if (run === generation.current) {
          setItems(
            batch.questions.map((question) => ({
              question,
              selected: "",
              flagged: false,
              result: null,
            })),
          );
          setPosition(0);
          setFinished(false);
        }
      });
    } catch {
      accept(() =>
        setError(
          "Practice could not start. Refresh the catalog and verify your sign-in; no partial session is assumed.",
        ),
      );
    } finally {
      accept(() => setPending(false));
      busy.current = false;
    }
  };
  const update = (fields: Partial<PracticeItem>) =>
    setItems((previous) =>
      previous.map((item, i) => (i === position ? { ...item, ...fields } : item)),
    );
  const submit = async () => {
    if (busy.current || !identity || !current || !completeSelection({...current.question,selected:current.selected}) || current.result || finished || !topic)
      return;
    busy.current = true;
    setPending(true);
    setError("");
    const delivery = current.question.deliveryId,
      run = generation.current,
      index = position;
    try {
      const answer = await adminContentRequest<PracticeAnswerResult>(
        `/api/practice/questions/${current.question.id}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Practice-Session": identity.sessionId },
          body: JSON.stringify({ optionKey: current.selected, deliveryId: delivery }),
        },
      );
      accept(() => {
        if (run === generation.current)
          setItems((previous) =>
            previous.map((item, i) =>
              i === index && item.question.deliveryId === delivery
                ? { ...item, result: answer }
                : item,
            ),
          );
      });
      await client.invalidateQueries({
        predicate: (q) =>
          ["/api/learning/progress", "/api/practice/history", "/api/dashboard/summary"].includes(
            String(q.queryKey[0]),
          ) &&
          (q.queryKey[0] === "/api/dashboard/summary" ||
            JSON.stringify(q.queryKey.at(-1)) === JSON.stringify(identity)),
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      accept(() =>
        setError(
          status === 409
            ? "This delivery expired or conflicts with an earlier submission. Accepted history is preserved. Finish this run and start a fresh session."
            : status === 404
              ? "This question or topic was archived and cannot accept a new answer."
              : "Answer was not confirmed. Your selection is preserved; retry the same answer or sign in again.",
        ),
      );
    } finally {
      accept(() => setPending(false));
      busy.current = false;
    }
  };
  const finish = () => {
    if (busy.current) return;
    if (totals.unanswered) setFinishConfirm(true);
    else setFinished(true);
  };
  const reset = () => {
    if (busy.current) return;
    generation.current++;
    setItems([]);
    setPosition(0);
    setFinished(false);
    setFinishConfirm(false);
    setError("");
  };
  if (!isAuthLoaded)
    return (
      <section className="practice-workspace" data-testid="loading-practice-auth">
        {translateUi("Loading your session…")}</section>
    );
  if (!isSignedIn || !identity)
    return (
      <section className="practice-workspace">
        <h2>{translateUi("Sign in to practice")}</h2>
        <Link href="/sign-in">{translateUi("Sign in to continue")}</Link>
      </section>
    );
  return (
    <section className="practice-workspace" aria-label={translateUi("Practice session")}>
      <div className="practice-session-top">
        <span className="practice-session-label">
          <Target size={15} /> {translateUi("CCNA PRACTICE")}</span>
        <span>{topic?.name ?? translateUi("Choose a topic")}</span>
      </div>
      {error && (
        <p role="alert" className="practice-submit-error" data-testid="error-practice-submit">
          <UiMessage text={error}/>
        </p>
      )}
      <AlertDialog open={finishConfirm} onOpenChange={setFinishConfirm}>
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{translateUi("Finish with unanswered questions?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {totals.unanswered} {translateUi("unanswered questions remain. Unsubmitted choices will not count as answers. Submitted attempts remain in your history.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi("Continue Practice")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFinished(true);
                setFinishConfirm(false);
              }}
            >
              {translateUi("Confirm Finish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!items.length ? (
        <div className="practice-setup practice-question-card">
          <h2>{translateUi("Build your practice session")}</h2>
          <p>
            {translateUi("Choose a topic and a finite question set. Answers are graded and saved by the server.")}</p>
          {topicsQuery.isError ? (
            <p role="alert">
              {translateUi("Topics unavailable.")}{" "}
              <button type="button" onClick={() => void topicsQuery.refetch()}>
                {translateUi("Retry")}</button>
            </p>
          ) : null}
          <label htmlFor="practice-topic-select">{translateUi("Topic")}</label>
          <select
            id="practice-topic-select"
            value={topicId}
            data-testid="select-practice-topic"
            disabled={pending || topicsQuery.isLoading}
            onChange={(e) => {
              setTopicId(e.target.value);
              setCount(1);
              setError("");
            }}
          >
            <option value="">{translateUi("Choose a topic")}</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p>
            {translateUi("Domain:")}{" "}{domain?.title ?? translateUi("Topic-specific practice")} ·{" "}
            <strong>{topic?.questionCount ?? 0} {translateUi("available questions")}</strong>
          </p>
          <label htmlFor="practice-count">
            {translateUi("Number of questions (maximum")}{" "}{Math.min(topic?.questionCount ?? 0, 100)})
          </label>
          <input
            id="practice-count"
            type="number"
            min={1}
            max={Math.min(topic?.questionCount ?? 0, 100)}
            value={count}
            disabled={pending}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            type="button"
            className="button-primary"
            data-testid="button-start-practice"
            disabled={
              pending ||
              !topic ||
              count < 1 ||
              count > topic.questionCount ||
              count > 100 ||
              !Number.isInteger(count)
            }
            onClick={() => void start()}
          >
            {pending ? translateUi("Preparing deliveries…") : translateUi("Start Practice")}
          </button>
          <button
            type="button"
            className="button-quiet"
            disabled={pending}
            onClick={() => void topicsQuery.refetch()}
          >
            {translateUi("Refresh available questions")}</button>
        </div>
      ) : finished ? (
        <div className="practice-question-card" data-testid="practice-results">
          <h2>{translateUi("Practice complete ·")}{" "}{totals.score}%</h2>
          <p>
            {totals.correct} {translateUi("correct ·")}{" "}{totals.incorrect} {translateUi("incorrect ·")}{" "}{totals.unanswered} {translateUi("unanswered ·")}{" "}{totals.total} {translateUi("total")}</p>
          <p>
            {translateUi("Submitted answers are saved in PostgreSQL. Unsubmitted selections are counted as unanswered. This run's navigation is temporary and is cleared on reload or sign-out.")}</p>
          <ol className="practice-review">
            {items.map((item) => (
              <li key={item.question.deliveryId}>
                <h3><QuestionContent text={item.question.text}/></h3>
                <p>
                  {translateUi("Your answer:")}{" "}{answerLabel(item.selected)} ·{" "}
                  {item.result ? (item.result.isCorrect ? translateUi("Correct") : translateUi("Incorrect")) : translateUi("Unanswered")}
                </p>
                {item.result ? (
                  <>
                    <p>
                      {translateUi("Correct answer:")}{" "}{(item.result.correctOptions ?? [item.result.correctOption]).map(o=>o.optionKey+". "+o.text).join("; ")} —{" "}

                    </p>
                    <p><QuestionContent text={item.result.explanation}/></p>
                  </>
                ) : (
                  <p>{translateUi("No answer was submitted; no answer key is revealed.")}</p>
                )}
              </li>
            ))}
          </ol>
          <Link href="/practice/history">{translateUi("View saved practice history")}</Link>
          <button type="button" className="button-primary" onClick={reset}>
            {translateUi("New practice session")}</button>
        </div>
      ) : !topic && !topicsQuery.isLoading ? (
        <div className="practice-state-card" data-testid="state-practice-topic-unavailable">
          <h2>{translateUi("This topic is no longer active.")}</h2>
          <p>{translateUi("Accepted history is preserved. Finish this run to review submitted answers.")}</p>
          <button onClick={finish}>{translateUi("Finish Practice")}</button>
        </div>
      ) : (
        <>
          <div className="practice-run-summary">
            <strong>
              {translateUi("Question")}{" "}{position + 1} {translateUi("of")}{" "}{items.length}
            </strong>
            <span>{translateUi("Progress:")}{" "}{totals.progress}%</span>
            <progress aria-label={translateUi("Answered progress")} max={items.length} value={totals.answered} />
            <span>
              {totals.answered} {translateUi("answered ·")}{" "}{totals.unanswered} {translateUi("unanswered ·")}{" "}{totals.remaining}{" "}
              {translateUi("remaining ·")}{" "}{totals.flagged} {translateUi("flagged")}</span>
          </div>
          <div className="practice-session-layout">
            <nav className="practice-navigator" aria-label={translateUi("Question navigator")}>
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.question.deliveryId}
                  aria-current={i === position ? "step" : undefined}
                  aria-label={translateUi("Question {value0}, {value1}{value2}", {value0: String(i + 1), value1: String(item.result ? "answered" : "unanswered"), value2: String(item.flagged ? translateUi(", flagged") : "")})}
                  disabled={pending}
                  onClick={() => setPosition(i)}
                  className={`practice-nav-item ${i === position ? "current" : ""} ${item.result ? "answered" : "unanswered"} ${item.flagged ? "flagged" : ""}`}
                >
                  {i + 1}
                  {item.flagged ? " ⚑" : ""}
                </button>
              ))}
              <p>{translateUi("Filled: answered · Outline: unanswered · ⚑: flagged")}</p>
            </nav>
            <div className="practice-question-card" data-testid="panel-practice-question">
              <div className="practice-question-meta">
                <span>{current.question.questionCode}</span>
                <span><UiMessage text={current.question.difficulty}/></span>
              </div>
              <h2 className="practice-question-text" data-testid="text-practice-question">
                <QuestionContent text={current.question.text}/>
              </h2>
              <fieldset className="practice-options" disabled={pending || !!current.result}>
                <legend>{current.question.type === "MULTIPLE_CHOICE_MULTIPLE" ? translateUi("Choose {value0} answers", {value0: String(current.question.requiredSelectionCount)}) : translateUi("Select one answer")}</legend>
                {current.question.options.map((option) => (
                  <label
                    key={option.optionKey}
                    className={`practice-option ${selectedKeys(current.selected).includes(option.optionKey) ? "selected" : ""} ${(current.result?.correctOptions ?? (current.result ? [current.result.correctOption] : [])).some(o=>o.optionKey === option.optionKey) ? "correct" : ""}`}
                  >
                    <input
                      type={current.question.type === "MULTIPLE_CHOICE_MULTIPLE" ? "checkbox" : "radio"}
                      name="practice-answer"
                      value={option.optionKey}
                      checked={selectedKeys(current.selected).includes(option.optionKey)}
                      onChange={() => update({selected:toggleSelection(current.selected,option.optionKey,current.question.type === "MULTIPLE_CHOICE_MULTIPLE",current.question.requiredSelectionCount) ?? ""})}
                    />
                    <span className="practice-option-key">{option.optionKey}</span>
                    <span><QuestionContent text={option.text}/></span>
                  </label>
                ))}
              </fieldset>
              {current.result && (
                <div className="practice-result" data-testid="result-practice-answer">
                  <strong>
                    {current.result.isCorrect ? translateUi("Correct answer") : translateUi("Incorrect answer")}
                  </strong>
                  <p><QuestionContent text={current.result.explanation}/></p>
                </div>
              )}
              <div className="practice-question-actions">
                <button
                  className="button-quiet"
                  disabled={pending || position === 0}
                  onClick={() => setPosition((i) => i - 1)}
                >
                  <ArrowLeft size={14} /> {translateUi("Previous Question")}</button>
                <button
                  className="button-quiet"
                  disabled={pending || position === items.length - 1}
                  data-testid="button-next-question"
                  onClick={() => setPosition((i) => i + 1)}
                >
                  {translateUi("Next Question")}{" "}<ArrowRight size={14} />
                </button>
                <button
                  className="button-quiet"
                  disabled={pending}
                  aria-pressed={current.flagged}
                  onClick={() => update({ flagged: !current.flagged })}
                >
                  <Flag size={14} /> {current.flagged ? translateUi("Unflag") : translateUi("Flag for Review")}
                </button>
                <button
                  className="button-primary"
                  data-testid="button-submit-answer"
                  disabled={pending || !completeSelection({...current.question,selected:current.selected}) || !!current.result || !topic}
                  onClick={() => void submit()}
                >
                  <Send size={14} /> {pending ? translateUi("Checking…") : translateUi("Submit Answer")}
                </button>
                <button className="button-quiet" disabled={pending} onClick={finish}>
                  {translateUi("Finish Practice")}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
