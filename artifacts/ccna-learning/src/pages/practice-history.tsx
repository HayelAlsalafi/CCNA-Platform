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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (
    <span>Date unavailable</span>
  ) : (
    <time dateTime={value}>{dateFormatter.format(date)}</time>
  );
}

function SignInRequired() {
  return (
    <div
      className="practice-state-card practice-access-card"
      data-testid="history-sign-in-required"
    >
      <LockKeyhole size={24} aria-hidden="true" />
      <div>
        <h2>Sign in to see your practice history.</h2>
        <p>Your submitted answers will appear here after you sign in.</p>
        <Link href="/sign-in" className="button-primary">
          Sign in <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

type HistoryItem = PracticeHistoryDetailsResponse['items'][number];
export function HistoricalReview({ item }: { item: HistoryItem }) {
  if (!item.review || item.historicalContentStatus !== 'VERIFIED_SNAPSHOT') return (
    <p data-testid="history-legacy-unavailable">Original question content is unavailable for this legacy attempt. Its recorded score is preserved; the labels shown are current catalog labels.</p>
  );
  const review = item.review;
  return <details data-testid="history-revision-review">
    <summary>Review submitted question</summary>
    <p>{review.text}</p>
    <p>{review.difficulty.toLowerCase()}: single answer</p>
    <ul>{review.options.map(option => <li key={option.optionKey}>
      <strong>{option.optionKey}</strong> {option.text}
      {item.selectedOptionKey === option.optionKey ? ' - Your answer' : ''}
      {review.correctOption.optionKey === option.optionKey ? ' - Correct answer' : ''}
    </li>)}</ul>
    <p>{review.explanation}</p>
    {review.referenceNotes ? <p>Reference: {review.referenceNotes}</p> : null}
    {review.imageKey ? <p>Image reference: {review.imageKey}</p> : null}
  </details>;
}

function HistoryEntries({ identity }: { identity: ProgressIdentity }) {
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
              ? 'Your session could not be verified.'
              : 'Access to practice history was denied.'}
          </h2>
          <p>
            {status === 401
              ? 'Sign in again, then retry loading your practice history.'
              : 'This account cannot access practice history. Ask an administrator to check your account access.'}
          </p>
          {status === 401 ? (
            <Link href="/sign-in" className="button-primary">
              Return to sign in <ArrowRight size={15} />
            </Link>
          ) : null}
          <button
            type="button"
            className="button-quiet"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry access check
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className="history-panel"
      aria-label="Submitted practice answers"
      aria-busy={query.isFetching}
    >
      <div className="history-toolbar">
        <span className="practice-session-label">
          <History size={15} aria-hidden="true" /> NEWEST FIRST
        </span>
        <span className="history-note">Submission dates use your local time</span>
      </div>
      {query.isLoading ? (
        <div
          className="practice-state-card history-state"
          role="status"
          data-testid="loading-practice-history"
        >
          <p>Loading your practice history…</p>
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
            <h2>Practice history could not be loaded.</h2>
            <p>
              {status === 400
                ? 'This page cursor is no longer usable. Return to the newest attempts.'
                : 'Check your connection, then try again.'}
            </p>
            <button
              type="button"
              className="button-quiet"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              data-testid="button-retry-history"
            >
              <RefreshCw size={15} /> Retry history
            </button>
            {page > 1 ? (
              <button
                type="button"
                className="button-quiet"
                disabled={query.isFetching}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Newest attempts
              </button>
            ) : null}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div
          className="practice-state-card history-state history-empty"
          data-testid="empty-practice-history"
        >
          <History size={25} aria-hidden="true" />
          <h2>{page === 1 ? 'No practice attempts yet.' : 'No more attempts on this page.'}</h2>
          <p>
            {page === 1
              ? 'Submit an answer in Practice to start building your history.'
              : 'Return to the previous page to review your earlier results.'}
          </p>
          <Link href="/practice" className="button-primary">
            Start practicing <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <table className="history-table" data-testid="table-practice-history">
          <caption className="sr-only">Your practice attempts, newest first. Page {page}.</caption>
          <thead>
            <tr>
              <th scope="col">Question Code</th>
              <th scope="col">Topic Name</th>
              <th scope="col">Selected answer</th>
              <th scope="col">Result</th>
              <th scope="col">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} data-testid="row-practice-history">
                <td data-label="Question Code">
                  <code>{item.questionCode?.trim() || 'Question unavailable'}</code>
                </td>
                <td data-label="Topic Name">
                  <span>{item.topicName?.trim() || 'Topic unavailable'}</span>
                </td>
                <td data-label="Selected answer">
                  <span className="history-answer">{item.selectedOptionKey}</span>
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
                    {item.isCorrect ? 'Correct' : 'Incorrect'}
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
      <div className="history-pagination" aria-label="Practice history pagination">
        <p role="status" aria-live="polite">
          {query.isFetching
            ? 'Loading attempts…'
            : query.isError
              ? 'Unable to load this page'
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
            <ArrowLeft size={15} /> Previous
          </button>
          <button
            type="button"
            className="button-quiet"
            disabled={!nextCursor || query.isFetching || query.isError}
            onClick={() => nextCursor && dispatch({ type: 'next', cursor: nextCursor })}
            data-testid="button-history-next"
          >
            Next <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function PracticeHistoryPage() {
  const auth = useAuth();
  const identity = progressIdentity(auth);
  return (
    <div className="page-wrap practice-history-page">
      <header className="page-head reveal">
        <div>
          <div className="eyebrow">Practice / your learning record</div>
          <h1 className="page-heading">Practice history</h1>
          <p className="page-lead">
            Review your submitted answers and see where your recall is getting stronger.
          </p>
        </div>
        <Link href="/practice" className="button-primary">
          Keep practicing <ArrowRight size={15} />
        </Link>
      </header>
      <div className="header-rule" />
      {!auth.isLoaded ? (
        <div
          className="practice-state-card history-state"
          role="status"
          data-testid="loading-history-auth"
        >
          Checking your identity…
        </div>
      ) : !identity ? (
        <SignInRequired />
      ) : (
        <HistoryEntries key={identity.userId + ':' + identity.sessionId} identity={identity} />
      )}
    </div>
  );
}
