import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { practiceProgressMutationOptions, progressIdentity, sessionQueryKey, type ProgressIdentity } from '../lib/learning-progress-cache';
import { practiceResultHandler, practiceSessionKey } from '../lib/practice-session';
import { Link } from 'wouter';
import { ArrowRight, Check, CircleAlert, LockKeyhole, RefreshCw, Send, Target } from 'lucide-react';
import {
  getGetPracticeQuestionQueryKey,
  useGetPracticeQuestion,
  useListTopics,
  useSubmitPracticeAnswer,
} from '@workspace/api-client-react';
import type { PracticeAnswerResult, TopicSummary } from '@workspace/api-client-react';

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = candidate.status ?? candidate.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function OptionKey({ children }: { children: string }) {
  return <span className="practice-option-key">{children}</span>;
}

type WorkspaceProps = { isAuthLoaded: boolean; isSignedIn: boolean };

export function PracticeWorkspace(props: WorkspaceProps) {
  const identity = progressIdentity(useAuth());
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  // A new user, session, or sign-out gets entirely new answer/mutation state.
  return <PracticeSession key={practiceSessionKey(identity)} {...props} identity={identity} activeIdentity={activeIdentity} />;
}

function PracticeSession({ isAuthLoaded, isSignedIn, identity, activeIdentity }: WorkspaceProps & {
  identity: ProgressIdentity | null;
  activeIdentity: RefObject<ProgressIdentity | null>;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const topicsQuery = useListTopics();
  const topics = [...(topicsQuery.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const initialTopicId = new URLSearchParams(window.location.search).get('topicId') ?? '';
  const [topicId, setTopicId] = useState(initialTopicId);
  const [selection, setSelection] = useState<{ delivery: string; value: string } | null>(null);
  const [answer, setAnswer] = useState<{ delivery: string; value: PracticeAnswerResult } | null>(null);
  const [questionRefresh, setQuestionRefresh] = useState(0);
  const [loadingNextQuestion, setLoadingNextQuestion] = useState(false);
  const topic = topics.find((item) => item.id === topicId);
  const questionQuery = useGetPracticeQuestion(topicId, {
    query: {
      enabled: Boolean(topicId && topic && isAuthLoaded && isSignedIn && identity),
      queryKey: sessionQueryKey(getGetPracticeQuestionQueryKey(topicId), identity),
      gcTime: 0,
      placeholderData: () => undefined,
      retry: false,
    },
  });
  const queryClient = useQueryClient();
  const submitAnswer = useSubmitPracticeAnswer<unknown, ReturnType<typeof progressIdentity>>({
    mutation: practiceProgressMutationOptions(queryClient, identity),
  });
  // A disabled/missing topic or failed refresh must not expose retained query data.
  const question = topic && !questionQuery.isError ? questionQuery.data : undefined;
  const signature = JSON.stringify([topicId, questionRefresh, question ?? null]);
  // An A -> B -> A delivery still has a new lifetime; old callbacks stay stale.
  const lifetime = useRef({ signature, generation: 0 });
  if (lifetime.current.signature !== signature) {
    lifetime.current = { signature, generation: lifetime.current.generation + 1 };
  }
  const delivery = JSON.stringify([signature, lifetime.current.generation]);
  const activeDelivery = useRef(delivery);
  activeDelivery.current = delivery;
  const selectedOption = selection?.delivery === delivery ? selection.value : '';
  const result = answer?.delivery === delivery ? answer.value : null;
  const resetMutation = submitAnswer.reset;
  useEffect(() => { resetMutation(); }, [delivery, resetMutation]);
  const questionErrorStatus = statusCode(questionQuery.error);
  const submitErrorStatus = statusCode(submitAnswer.error);
  const isAccessError = questionErrorStatus === 401 || questionErrorStatus === 403 || submitErrorStatus === 401 || submitErrorStatus === 403;
  const isNotFound = questionErrorStatus === 404 || submitErrorStatus === 404;

  const chooseTopic = (nextTopicId: string) => {
    setTopicId(nextTopicId);
    setSelection(null);
    setAnswer(null);
    submitAnswer.reset();
    setQuestionRefresh(0);
  };

  const nextQuestion = async () => {
    setSelection(null);
    setAnswer(null);
    submitAnswer.reset();
    setQuestionRefresh((value) => value + 1);
    setLoadingNextQuestion(true);
    try {
      await questionQuery.refetch();
    } finally {
      setLoadingNextQuestion(false);
    }
  };

  const submit = () => {
    if (!identity || !question || !selectedOption || questionQuery.isFetching || result || submitAnswer.isPending) return;
    submitAnswer.mutate(
      { questionId: question.id, data: { optionKey: selectedOption } },
      { onSuccess: practiceResultHandler(identity, activeIdentity, mounted, value => {
        if (activeDelivery.current === delivery) setAnswer({ delivery, value });
      }) },
    );
  };

  const retryQuestion = () => {
    submitAnswer.reset();
    void questionQuery.refetch();
  };

  return (
    <section className="practice-workspace" aria-label="Practice session">
      <div className="practice-session-top">
        <div className="practice-session-label"><Target size={15} /> ONE QUESTION AT A TIME</div>
        {topic ? <span className="practice-topic-chip" data-testid="status-practice-topic">{topic.name}</span> : null}
      </div>

      <div className="practice-session-layout">
        <aside className="practice-picker">
          <label className="practice-select-label" htmlFor="practice-topic-select">Active topic</label>
          {topicsQuery.isLoading ? (
            <div className="practice-select-skeleton skeleton" aria-label="Loading active topics" data-testid="loading-practice-topics" />
          ) : topicsQuery.isError ? (
            <div className="practice-topic-load-error" role="alert" data-testid="error-practice-topics">
              <span>Topic catalog unavailable.</span>
              <button type="button" onClick={() => void topicsQuery.refetch()} data-testid="button-retry-practice-topics">Retry</button>
            </div>
          ) : topics.length === 0 ? (
            <div className="practice-no-topics" data-testid="empty-practice-topics">
              <strong>No active topics yet</strong>
              <span>The catalog is empty. Return when a topic has been published.</span>
            </div>
          ) : (
            <select
              id="practice-topic-select"
              value={topicId}
              disabled={submitAnswer.isPending || loadingNextQuestion}
              onChange={(event) => chooseTopic(event.target.value)}
              data-testid="select-practice-topic"
            >
              <option value="">Choose a topic</option>
              {topics.map((item: TopicSummary) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          <p className="practice-picker-note">Questions are drawn from the active catalog. Your answer is checked by the server.</p>
          <Link href="/topics" className="practice-map-link" data-testid="link-practice-topic-map">
            Browse topic map <ArrowRight size={14} />
          </Link>
        </aside>

        <div className="practice-question-area" aria-live="polite">
          {!isAuthLoaded ? (
            <div className="practice-state-card" data-testid="loading-practice-auth">
              <div className="skeleton" style={{ height: 13, width: 150 }} />
              <div className="skeleton" style={{ height: 24, width: '72%', marginTop: 22 }} />
              <div className="skeleton" style={{ height: 44, width: '100%', marginTop: 24 }} />
            </div>
          ) : !isSignedIn || !identity ? (
            <div className="practice-state-card practice-access-card" data-testid="state-practice-sign-in">
              <LockKeyhole size={22} />
              <div>
                <h2>Sign in to practice</h2>
                <p>Sign in to load a question from an active topic and submit your answer for server-side feedback.</p>
                <Link href="/sign-in" className="button-primary" data-testid="link-practice-sign-in">Sign in to continue <ArrowRight size={14} /></Link>
              </div>
            </div>
          ) : topicsQuery.isLoading ? (
            <div className="practice-state-card" aria-label="Loading active topics" data-testid="loading-practice-topic-selection">
              <div className="skeleton" style={{ height: 13, width: 150 }} />
              <div className="skeleton" style={{ height: 24, width: '72%', marginTop: 22 }} />
            </div>
          ) : topicsQuery.isError && topics.length === 0 ? (
            <div className="practice-state-card practice-error-card" role="alert" data-testid="error-practice-topic-selection">
              <CircleAlert size={22} />
              <div>
                <h2>Active topics could not be loaded.</h2>
                <p>Check your connection, then reload the active topic catalog.</p>
                <button type="button" className="button-quiet" onClick={() => void topicsQuery.refetch()} data-testid="button-retry-practice-topic-selection">
                  <RefreshCw size={14} /> Retry topics
                </button>
              </div>
            </div>
          ) : !topicId ? (
            <div className="practice-state-card practice-empty-prompt" data-testid="empty-practice-selection">
              <span className="practice-state-index">01</span>
              <h2>Choose your next signal.</h2>
              <p>Select an active topic to bring one question into focus. No scorekeeping, just recall.</p>
            </div>
          ) : !topic ? (
            <div className="practice-state-card practice-empty-prompt" data-testid="state-practice-topic-unavailable">
              <CircleAlert size={22} />
              <h2>That topic is no longer active.</h2>
              <p>Choose a topic from the current active catalog to continue.</p>
            </div>
          ) : questionQuery.isLoading || loadingNextQuestion || questionQuery.isFetching ? (
            <div className="practice-state-card" aria-label="Loading practice question" data-testid="loading-practice-question">
              <div className="skeleton" style={{ height: 11, width: 125 }} />
              <div className="skeleton" style={{ height: 26, width: '86%', marginTop: 22 }} />
              <div className="skeleton" style={{ height: 48, width: '100%', marginTop: 20 }} />
              <div className="skeleton" style={{ height: 48, width: '100%', marginTop: 9 }} />
            </div>
          ) : isAccessError ? (
            <div className="practice-state-card practice-access-card" role="alert" data-testid="error-practice-access">
              <LockKeyhole size={22} />
              <div>
                <h2>Access to practice was denied.</h2>
                <p>Your sign-in may have expired, or this account cannot use the practice service. Sign in again or ask an administrator to check access.</p>
                <Link href="/sign-in" className="button-primary" data-testid="link-practice-access-sign-in">Return to sign in <ArrowRight size={14} /></Link>
              </div>
            </div>
          ) : isNotFound ? (
            <div className="practice-state-card practice-empty-prompt" data-testid="empty-practice-questions">
              <Target size={23} />
              <h2>{submitErrorStatus === 404 ? 'This question is no longer active.' : 'No questions in this topic yet.'}</h2>
              <p>{submitErrorStatus === 404
                ? 'The question or topic is no longer available. Choose another active topic to continue.'
                : 'This active topic does not have a practice question available right now. Choose another topic or check back later.'}</p>
            </div>
          ) : questionQuery.isError ? (
            <div className="practice-state-card practice-error-card" role="alert" data-testid="error-practice-question">
              <CircleAlert size={22} />
              <div>
                <h2>The question could not be loaded.</h2>
                <p>Check your connection, then try again. Your session has not been recorded.</p>
                <button type="button" className="button-quiet" onClick={retryQuestion} data-testid="button-retry-practice-question"><RefreshCw size={14} /> Retry question</button>
              </div>
            </div>
          ) : question ? (
            <div className="practice-question-card" key={`${question.id}-${questionRefresh}`} data-testid="panel-practice-question">
              <div className="practice-question-meta">
                <span data-testid="text-question-code">{question.questionCode}</span>
                <span>{question.difficulty.toLowerCase()}</span>
                <span>{question.type === 'MULTIPLE_CHOICE_SINGLE' ? 'single answer' : question.type}</span>
              </div>
              <h2 className="practice-question-text" data-testid="text-practice-question">{question.text}</h2>
              <fieldset className="practice-options" disabled={Boolean(result || submitAnswer.isPending)}>
                <legend className="sr-only">Select one answer</legend>
                {question.options.map((option, index) => {
                  const selected = selectedOption === option.optionKey;
                  const isCorrectAnswer = result?.correctOption.optionKey === option.optionKey;
                  const isSubmittedWrong = Boolean(result && selected && !result.isCorrect);
                  return (
                    <label
                      className={`practice-option ${selected ? 'selected' : ''} ${isCorrectAnswer ? 'correct' : ''} ${isSubmittedWrong ? 'incorrect' : ''}`}
                      key={option.optionKey}
                      data-testid={`option-practice-${option.optionKey}`}
                    >
                      <input
                        type="radio"
                        name="practice-answer"
                        value={option.optionKey}
                        checked={selected}
                        onChange={() => setSelection({ delivery, value: option.optionKey })}
                        data-testid={`radio-practice-${option.optionKey}`}
                      />
                      <OptionKey>{String.fromCharCode(65 + index)}</OptionKey>
                      <span>{option.text}</span>
                      {isCorrectAnswer ? <Check className="practice-option-check" size={17} aria-label="Correct option" /> : null}
                    </label>
                  );
                })}
              </fieldset>

              {result ? (
                <div className={`practice-result ${result.isCorrect ? 'is-correct' : 'is-incorrect'}`} role="status" data-testid="result-practice-answer">
                  <div className="practice-result-heading">
                    {result.isCorrect ? <Check size={17} /> : <CircleAlert size={17} />}
                    <strong>{result.isCorrect ? 'Correct answer.' : 'Not quite.'}</strong>
                    <span>{result.correctOption.optionKey} is correct</span>
                  </div>
                  <p>{result.explanation}</p>
                </div>
              ) : null}

              {submitAnswer.isError && !isAccessError ? (
                <div className="practice-submit-error" role="alert" data-testid="error-practice-submit">
                  <span>We could not check that answer. Your selection is still here.</span>
                  <button type="button" onClick={submit} disabled={!selectedOption || submitAnswer.isPending} data-testid="button-retry-submit-answer">Try again</button>
                </div>
              ) : null}

              {submitAnswer.isPending ? <p className="practice-submit-status" role="status" data-testid="status-practice-submitting">Checking with the answer service…</p> : null}

              <div className="practice-question-actions">
                {result ? (
                  <button type="button" className="button-primary" onClick={() => void nextQuestion()} data-testid="button-next-question">
                    Next question <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={submit}
                    disabled={!selectedOption || submitAnswer.isPending}
                    data-testid="button-submit-answer"
                  >
                    <Send size={14} /> {submitAnswer.isPending ? 'Checking answer' : 'Submit answer'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="practice-state-card practice-empty-prompt" data-testid="empty-practice-question">
              <Target size={23} />
              <h2>Ready for a question.</h2>
              <p>Choose an active topic to begin your practice session.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
