import { useI18n } from '../i18n';
import {selectedKeys,answerLabel} from "../lib/answer-selection";
import { useEffect, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  History,
  LockKeyhole,
  RefreshCw,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import { useGetPracticeHistoryWithDetails, type PracticeHistoryDetailsResponse } from '@workspace/api-client-react';
import { progressIdentity, type ProgressIdentity } from '../lib/learning-progress-cache';
import { clearHistoryCache, historyQueryOptions } from '../lib/practice-history-cache';
import { historyPaginationReducer, initialHistoryPagination } from '../lib/history-pagination';

const PAGE_SIZE = 20;
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function SubmissionDate({ value }: { value: string }) {
  const { t: translateUi } = useI18n();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (
    <span>{translateUi("Date unavailable")}</span>
  ) : (
    <time dateTime={value}>{dateFormatter.format(date)}</time>
  );
}

function SignInRequired() {
  const { t: translateUi } = useI18n();
  return (
    <div
      className="practice-state-card practice-access-card"
      data-testid="history-sign-in-required"
    >
      <LockKeyhole size={24} aria-hidden="true" />
      <div>
        <h2>{translateUi("Sign in to see your practice history.")}</h2>
        <p>{translateUi("Your submitted answers will appear here after you sign in.")}</p>
        <Link href="/sign-in" className="button-primary">
          {translateUi("Sign in")}{" "}<ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

type HistoryItem = PracticeHistoryDetailsResponse['items'][number];
export function HistoricalReview({ item }: { item: HistoryItem }) {
  const { t: translateUi } = useI18n();
  if (!item.review || item.historicalContentStatus !== 'VERIFIED_SNAPSHOT') return (
    <p data-testid="history-legacy-unavailable">{translateUi("Original question content is unavailable for this legacy attempt. Its recorded score is preserved; the labels shown are current catalog labels.")}</p>
  );
  const review = item.review;
  return <details data-testid="history-revision-review">
    <summary>{translateUi("Review submitted question")}</summary>
    <p>{review.text}</p>
    <p>{review.difficulty.toLowerCase()}{translateUi(": single answer")}</p>
    <ul>{review.options.map(option => <li key={option.optionKey}>
      <strong>{option.optionKey}</strong> {option.text}
      {selectedKeys(item.selectedOptionKey).includes(option.optionKey) ? translateUi("- Your answer") : ''}
      {(review.correctOptions ?? [review.correctOption]).some(o=>o.optionKey === option.optionKey) ? translateUi("- Correct answer") : ''}
    </li>)}</ul>
    <p>{review.explanation}</p>
    {review.referenceNotes ? <p>{translateUi("Reference:")}{" "}{review.referenceNotes}</p> : null}
    {review.imageKey ? <p>{translateUi("Image reference:")}{" "}{review.imageKey}</p> : null}
  </details>;
}

export function HistoryEntries({ identity }: { identity: ProgressIdentity }) {
  const { t: translateUi } = useI18n();
  const client = useQueryClient();
  useEffect(() => {
    clearHistoryCache(client, identity, true);
    return () => clearHistoryCache(client, identity, false);
  }, [client, identity.userId, identity.sessionId]);
  const [pagination, dispatch] = useReducer(historyPaginationReducer, initialHistoryPagination);
  const cursor = pagination[pagination.length - 1];
  const params = { limit: PAGE_SIZE, includeDetails: true, ...(cursor ? { cursor } : {}) };
  const query = useGetPracticeHistoryWithDetails(params, historyQueryOptions(params, identity));
  const items = query.data?.items ?? [];
  const nextCursor = query.data?.nextCursor;
  const status = query.error?.status;
  const isAccessError = query.isError && (status === 401 || status === 403);
  const page = pagination.length;

  if (isAccessError) {
    return (
      <div
        className="practice-state-card practice-access-card"
        role="alert"
        data-testid="error-history-access"
      >
        <LockKeyhole size={24} aria-hidden="true" />
        <div>
          <h2>
            {status === 401
              ? translateUi("Your session could not be verified.")
              : translateUi("Access to practice history was denied.")}
          </h2>
          <p>
            {status === 401
              ? translateUi("Sign in again, then retry loading your practice history.")
              : translateUi("This account cannot access practice history. Ask an administrator to check your account access.")}
          </p>
          {status === 401 ? (
            <Link href="/sign-in" className="button-primary">
              {translateUi("Return to sign in")}{" "}<ArrowRight size={15} />
            </Link>
          ) : null}
          <button
            type="button"
            className="button-quiet"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {translateUi("Retry access check")}</button>
        </div>
      </div>
    );
  }

  return (
    <section
      className="history-panel"
      aria-label={translateUi("Submitted practice answers")}
      aria-busy={query.isFetching}
    >
      <div className="history-toolbar">
        <span className="practice-session-label">
          <History size={15} aria-hidden="true" /> {translateUi("NEWEST FIRST")}</span>
        <span className="history-note">{translateUi("Submission dates use your local time")}</span>
      </div>
      {query.isLoading ? (
        <div
          className="practice-state-card history-state"
          role="status"
          data-testid="loading-practice-history"
        >
          <p>{translateUi("Loading your practice history…")}</p>
          {[1, 2, 3].map((row) => (
            <div key={row} className="skeleton history-loading-row" aria-hidden="true" />
          ))}
        </div>
      ) : query.isError ? (
        <div
          className="practice-state-card practice-error-card history-state"
          role="alert"
          data-testid="error-practice-history"
        >
          <CircleAlert size={24} aria-hidden="true" />
          <div>
            <h2>{translateUi("Practice history could not be loaded.")}</h2>
            <p>
              {status === 400
                ? translateUi("This page cursor is no longer usable. Return to the newest attempts.")
                : translateUi("Check your connection, then try again.")}
            </p>
            <button
              type="button"
              className="button-quiet"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              data-testid="button-retry-history"
            >
              <RefreshCw size={15} /> {translateUi("Retry history")}</button>
            {page > 1 ? (
              <button
                type="button"
                className="button-quiet"
                disabled={query.isFetching}
                onClick={() => dispatch({ type: 'reset' })}
              >
                {translateUi("Newest attempts")}</button>
            ) : null}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div
          className="practice-state-card history-state history-empty"
          data-testid="empty-practice-history"
        >
          <History size={25} aria-hidden="true" />
          <h2>{page === 1 ? translateUi("No practice attempts yet.") : translateUi("No more attempts on this page.")}</h2>
          <p>
            {page === 1
              ? translateUi("Submit an answer in Practice to start building your history.")
              : translateUi("Return to the previous page to review your earlier results.")}
          </p>
          <Link href="/practice" className="button-primary">
            {translateUi("Start practicing")}{" "}<ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <table className="history-table" data-testid="table-practice-history">
          <caption className="sr-only">{translateUi("Your practice attempts, newest first. Page")}{" "}{page}.</caption>
          <thead>
            <tr>
              <th scope="col">{translateUi("Question Code")}</th>
              <th scope="col">{translateUi("Topic Name")}</th>
              <th scope="col">{translateUi("Selected answer")}</th>
              <th scope="col">{translateUi("Result")}</th>
              <th scope="col">{translateUi("Submitted")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} data-testid="row-practice-history">
                <td data-label="Question Code">
                  <code>{item.questionCode?.trim() || translateUi("Question unavailable")}</code>
                </td>
                <td data-label="Topic Name">
                  <span>{item.topicName?.trim() || translateUi("Topic unavailable")}</span>
                </td>
                <td data-label="Selected answer">
                  <span className="history-answer">{answerLabel(item.selectedOptionKey)}</span>
                  <HistoricalReview item={item} />
                </td>
                <td data-label="Result">
                  <span
                    className={
                      item.isCorrect ? 'history-result correct' : 'history-result incorrect'
                    }
                  >
                    {item.isCorrect ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <X size={14} aria-hidden="true" />
                    )}
                    {item.isCorrect ? translateUi("Correct") : translateUi("Incorrect")}
                  </span>
                </td>
                <td data-label="Submitted">
                  <SubmissionDate value={item.submittedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="history-pagination" aria-label={translateUi("Practice history pagination")}>
        <p role="status" aria-live="polite">
          {query.isFetching
            ? translateUi("Loading attempts…")
            : query.isError
              ? translateUi("Unable to load this page")
              : 'Page ' + page + ' · ' + items.length + ' attempts'}
        </p>
        <div className="history-pagination-actions">
          <button
            type="button"
            className="button-quiet"
            disabled={page === 1 || query.isFetching}
            onClick={() => dispatch({ type: 'previous' })}
            data-testid="button-history-previous"
          >
            <ArrowLeft size={15} /> {translateUi("Previous")}</button>
          <button
            type="button"
            className="button-quiet"
            disabled={!nextCursor || query.isFetching || query.isError}
            onClick={() => nextCursor && dispatch({ type: 'next', cursor: nextCursor })}
            data-testid="button-history-next"
          >
            {translateUi("Next")}{" "}<ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function PracticeHistoryPage() {
  const { t: translateUi } = useI18n();
  const auth = useAuth();
  const identity = progressIdentity(auth);
  return (
    <div className="page-wrap practice-history-page">
      <header className="page-head reveal">
        <div>
          <div className="eyebrow">{translateUi("Practice / your learning record")}</div>
          <h1 className="page-heading">{translateUi("Practice history")}</h1>
          <p className="page-lead">
            {translateUi("Review your submitted answers and see where your recall is getting stronger.")}</p>
        </div>
        <Link href="/practice" className="button-primary">
          {translateUi("Keep practicing")}{" "}<ArrowRight size={15} />
        </Link>
      </header>
      <div className="header-rule" />
      {!auth.isLoaded ? (
        <div
          className="practice-state-card history-state"
          role="status"
          data-testid="loading-history-auth"
        >
          {translateUi("Checking your identity…")}</div>
      ) : !identity ? (
        <SignInRequired />
      ) : (
        <HistoryEntries key={identity.userId + ':' + identity.sessionId} identity={identity} />
      )}
    </div>
  );
}
