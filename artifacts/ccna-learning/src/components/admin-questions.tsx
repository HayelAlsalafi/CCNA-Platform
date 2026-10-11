import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshCatalog } from '../lib/catalog-cache';
import { useAdminSession } from './admin-session-boundary';
import { adminQueryOptions, adminMutationOptions } from '../lib/admin-session';
import {
  getAdminListQuestionsQueryKey,
  getAdminListTopicsQueryKey,
  useAdminCreateQuestion,
  useAdminDisableQuestion,
  useAdminListQuestions,
  useAdminListTopics,
  useAdminUpdateQuestion,
} from '@workspace/api-client-react';
import type {
  AdminListQuestionsParams,
  AdminQuestion,
  AdminQuestionCreate,
  AdminQuestionDifficulty,
  AdminQuestionStatus,
  AdminQuestionUpdate,
  AdminTopic,
} from '@workspace/api-client-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 20;
const difficulties: AdminQuestionDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const statuses: AdminQuestionStatus[] = ['ACTIVE', 'DISABLED'];

type FormOption = { optionKey: string; text: string; isCorrect: boolean };
type FormState = {
  topicId: string;
  difficulty: AdminQuestionDifficulty;
  text: string;
  explanation: string;
  referenceNotes: string;
  status: AdminQuestionStatus;
  options: FormOption[];
};

function newForm(): FormState {
  return {
    topicId: '',
    difficulty: 'MEDIUM',
    text: '',
    explanation: '',
    referenceNotes: '',
    status: 'ACTIVE',
    options: ['A', 'B', 'C', 'D'].map((optionKey) => ({ optionKey, text: '', isCorrect: false })),
  };
}

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.topicId) errors.topicId = 'Choose a topic.';
  const text = form.text.trim();
  if (!text) errors.text = 'Question text is required.';
  else if (text.length > 10_000) errors.text = 'Question text must be at most 10,000 characters.';
  if (form.explanation.length > 10_000) errors.explanation = 'Explanation must be at most 10,000 characters.';
  if (form.referenceNotes.length > 10_000) errors.referenceNotes = 'Reference and notes must be at most 10,000 characters.';

  if (form.options.length < 2 || form.options.length > 10) {
    errors.options = 'Add between 2 and 10 answer options.';
  } else {
    const keys = form.options.map((option) => option.optionKey.trim().toUpperCase());
    if (keys.some((key) => !key || key.length > 8) || new Set(keys).size !== keys.length) {
      errors.options = 'Option keys must be present, unique, and no longer than 8 characters.';
    } else if (form.options.filter((option) => option.isCorrect).length !== 1) {
      errors.options = 'Mark exactly one option as correct.';
    } else if (form.options.some((option) => !option.text.trim())) {
      errors.options = 'Every option needs answer text.';
    } else if (form.options.some((option) => option.text.trim().length > 4_000)) {
      errors.options = 'Each answer option must be at most 4,000 characters.';
    }
  }
  return errors;
}

function apiErrorMessage(error: unknown): string {
  const requestError = error as { status?: number; data?: { error?: { message?: string } } } | null;
  const message = requestError?.data?.error?.message;
  if (requestError?.status === 401) return 'Your session expired. Sign in again.';
  if (requestError?.status === 403) return 'The server denied this admin action.';
  return message || 'The request failed. Please try again.';
}

const fieldStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  background: '#fff',
  font: 'inherit',
} as const;
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 } as const;
const errorStyle = { color: '#b84d35', fontSize: 12, marginTop: 4 } as const;
const cellStyle = { padding: 8, verticalAlign: 'top' } as const;

function nextOptionKey(options: FormOption[]): string {
  const used = new Set(options.map((option) => option.optionKey.toUpperCase()));
  for (let code = 65; code <= 90; code += 1) {
    const key = String.fromCharCode(code);
    if (!used.has(key)) return key;
  }
  let index = 1;
  while (used.has(`OPT-${index}`)) index += 1;
  return `OPT-${index}`;
}

export function AdminQuestionManager() {
  const session = useAdminSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [topicFilter, setTopicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminQuestionStatus | ''>('');
  const [difficultyFilter, setDifficultyFilter] = useState<AdminQuestionDifficulty | ''>('');
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [form, setForm] = useState<FormState>(newForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDisable, setToDisable] = useState<AdminQuestion | null>(null);

  const params: AdminListQuestionsParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(topicFilter ? { topicId: topicFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
  };
  const listQuery = useAdminListQuestions(params,
    adminQueryOptions(getAdminListQuestionsQueryKey(params), session.identity));
  const topicsQuery = useAdminListTopics(
    adminQueryOptions(getAdminListTopicsQueryKey(), session.identity));
  const createMutation = useAdminCreateQuestion(adminMutationOptions('adminCreateQuestion', session.identity));
  const updateMutation = useAdminUpdateQuestion(adminMutationOptions('adminUpdateQuestion', session.identity));
  const disableMutation = useAdminDisableQuestion(adminMutationOptions('adminDisableQuestion', session.identity));
  const topics = [...(topicsQuery.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const questions = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const offset = listQuery.data?.offset ?? page * PAGE_SIZE;
  const hasNext = offset + questions.length < total;

  useEffect(() => {
    if (listQuery.data && page > 0 && listQuery.data.total <= page * PAGE_SIZE) {
      setPage(Math.max(0, Math.ceil(listQuery.data.total / PAGE_SIZE) - 1));
    }
  }, [listQuery.data, page]);

  const refreshAffectedViews = (isCurrent: () => boolean) =>
    refreshCatalog(queryClient, session.identity, isCurrent);

  const resetForm = () => {
    if (!session.isCurrent()) return;
    setEditing(null);
    setForm(newForm());
    setErrors({});
    setFormError(null);
  };

  const startEdit = (question: AdminQuestion) => {
    if (!session.isCurrent()) return;
    setEditing(question);
    setForm({
      topicId: question.topicId,
      difficulty: question.difficulty,
      text: question.text,
      explanation: question.explanation,
      referenceNotes: question.referenceNotes ?? '',
      status: question.status,
      options: [...question.options]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(({ optionKey, text, isCorrect }) => ({ optionKey, text, isCorrect })),
    });
    setErrors({});
    setFormError(null);
    setNotice(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session.isCurrent()) return;
    const isCurrent = session.capture();
    setNotice(null);
    setFormError(null);
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const fields = {
      topicId: form.topicId,
      text: form.text.trim(),
      type: 'MULTIPLE_CHOICE_SINGLE' as const,
      difficulty: form.difficulty,
      explanation: form.explanation.trim(),
      referenceNotes: form.referenceNotes.trim() || null,
      status: form.status,
      options: form.options.map((option) => ({
        optionKey: option.optionKey.trim(),
        text: option.text.trim(),
        isCorrect: option.isCorrect,
      })),
    };

    try {
      if (editing) {
        const data: AdminQuestionUpdate = fields;
        await updateMutation.mutateAsync({ id: editing.id, data });
        if (!isCurrent()) return;
        setNotice(`Question ${editing.questionCode} updated.`);
      } else {
        const data: AdminQuestionCreate = fields;
        await createMutation.mutateAsync({ data });
        if (!isCurrent()) return;
        setNotice('Question created.');
      }
      resetForm();
      await refreshAffectedViews(isCurrent);
    } catch (error) {
      if (isCurrent()) setFormError(apiErrorMessage(error));
    } finally {
      if (isCurrent()) { createMutation.reset(); updateMutation.reset(); }
    }
  };

  const confirmDisable = async () => {
    if (!session.isCurrent() || !toDisable) return;
    const isCurrent = session.capture();
    const question = toDisable;
    setToDisable(null);
    setFormError(null);
    setNotice(null);
    try {
      await disableMutation.mutateAsync({ id: question.id });
      if (!isCurrent()) return;
      if (editing?.id === question.id) resetForm();
      setNotice(`Question ${question.questionCode} disabled. It has not been deleted.`);
      await refreshAffectedViews(isCurrent);
    } catch (error) {
      if (isCurrent()) setFormError(apiErrorMessage(error));
    } finally {
      if (isCurrent()) disableMutation.reset();
    }
  };

  const addOption = () => {
    if (form.options.length >= 10) return;
    setForm((current) => ({
      ...current,
      options: [...current.options, { optionKey: nextOptionKey(current.options), text: '', isCorrect: false }],
    }));
  };

  const removeOption = (index: number) => {
    if (form.options.length <= 2) return;
    setForm((current) => {
      const removedWasCorrect = current.options[index].isCorrect;
      const options = current.options.filter((_, optionIndex) => optionIndex !== index);
      if (removedWasCorrect && !options.some((option) => option.isCorrect)) {
        options[0] = { ...options[0], isCorrect: true };
      }
      return { ...current, options };
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <section style={{ display: 'grid', gap: 24, marginTop: 24 }} data-testid="admin-question-manager">
      {notice && <div role="status" className="status-chip" data-testid="admin-question-notice">{notice}</div>}
      {formError && <div role="alert" className="error-card" style={{ textAlign: 'left' }} data-testid="admin-question-error">{formError}</div>}

      <form onSubmit={submit} noValidate className="empty-card" style={{ textAlign: 'left', display: 'grid', gap: 14 }} data-testid="form-admin-question">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {editing ? `Edit question ${editing.questionCode}` : 'Create a question'}
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 13 }}>
            Question type: <strong>MULTIPLE_CHOICE_SINGLE</strong>. Codes are generated by the server and cannot be changed.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div>
            <label style={labelStyle} htmlFor="question-topic">Topic</label>
            <select
              id="question-topic"
              style={fieldStyle}
              value={form.topicId}
              onChange={(event) => setForm({ ...form, topicId: event.target.value })}
              aria-invalid={!!errors.topicId}
              disabled={topicsQuery.isLoading}
            >
              <option value="">Choose a topic</option>
              {topics.map((topic: AdminTopic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}{topic.status === 'DISABLED' ? ' (disabled)' : ''}
                </option>
              ))}
            </select>
            {errors.topicId && <div style={errorStyle}>{errors.topicId}</div>}
            {topicsQuery.isLoading && <div style={errorStyle}>Loading topics…</div>}
            {topicsQuery.isError && (
              <div style={errorStyle} role="alert">
                Could not load topics. <button type="button" className="button-quiet" onClick={() => { if (session.isCurrent()) void topicsQuery.refetch(); }}>Retry</button>
              </div>
            )}
            {!topicsQuery.isLoading && !topicsQuery.isError && topics.length === 0 && (
              <div style={errorStyle}>Add a topic before creating a question.</div>
            )}
          </div>
          <div>
            <label style={labelStyle} htmlFor="question-difficulty">Difficulty</label>
            <select
              id="question-difficulty"
              style={fieldStyle}
              value={form.difficulty}
              onChange={(event) => setForm({ ...form, difficulty: event.target.value as AdminQuestionDifficulty })}
            >
              {difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="question-status">Status</label>
            <select
              id="question-status"
              style={fieldStyle}
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as AdminQuestionStatus })}
            >
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="question-text">Question text</label>
          <textarea
            id="question-text"
            rows={4}
            maxLength={10_000}
            style={fieldStyle}
            value={form.text}
            onChange={(event) => setForm({ ...form, text: event.target.value })}
            aria-invalid={!!errors.text}
          />
          {errors.text && <div style={errorStyle}>{errors.text}</div>}
        </div>

        <fieldset style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 14, display: 'grid', gap: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 700, padding: '0 5px' }}>Answer options</legend>
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 12 }}>Choose exactly one correct answer. Add 2–10 options.</p>
          {form.options.map((option, index) => (
            <div key={option.optionKey} style={{ display: 'grid', gridTemplateColumns: 'auto 42px minmax(0, 1fr) auto', alignItems: 'center', gap: 9 }}>
              <input
                type="radio"
                name="correct-answer"
                aria-label={`Mark option ${option.optionKey} as correct`}
                checked={option.isCorrect}
                onChange={() => setForm({
                  ...form,
                  options: form.options.map((item, optionIndex) => ({ ...item, isCorrect: optionIndex === index })),
                })}
              />
              <span style={{ fontFamily: 'var(--app-font-mono)', fontSize: 12 }}>{option.optionKey}</span>
              <input
                aria-label={`Option ${option.optionKey} text`}
                maxLength={4_000}
                style={fieldStyle}
                value={option.text}
                onChange={(event) => setForm({
                  ...form,
                  options: form.options.map((item, optionIndex) => optionIndex === index ? { ...item, text: event.target.value } : item),
                })}
                aria-invalid={!!errors.options}
              />
              <button type="button" className="button-quiet" onClick={() => removeOption(index)} disabled={form.options.length <= 2}>
                Remove
              </button>
            </div>
          ))}
          {errors.options && <div style={errorStyle} role="alert">{errors.options}</div>}
          <div><button type="button" className="button-quiet" onClick={addOption} disabled={form.options.length >= 10}>Add option</button></div>
        </fieldset>

        <div>
          <label style={labelStyle} htmlFor="question-explanation">Explanation</label>
          <textarea
            id="question-explanation"
            rows={3}
            maxLength={10_000}
            style={fieldStyle}
            value={form.explanation}
            onChange={(event) => setForm({ ...form, explanation: event.target.value })}
            aria-invalid={!!errors.explanation}
          />
          {errors.explanation && <div style={errorStyle}>{errors.explanation}</div>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="question-reference-notes">Reference / notes</label>
          <textarea
            id="question-reference-notes"
            rows={3}
            maxLength={10_000}
            style={fieldStyle}
            value={form.referenceNotes}
            onChange={(event) => setForm({ ...form, referenceNotes: event.target.value })}
            aria-invalid={!!errors.referenceNotes}
          />
          {errors.referenceNotes && <div style={errorStyle}>{errors.referenceNotes}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="button-primary" disabled={saving || topics.length === 0} data-testid="button-save-question">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create question'}
          </button>
          {editing && <button type="button" className="button-quiet" onClick={resetForm} disabled={saving}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>All questions</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label style={labelStyle} htmlFor="filter-question-topic">Topic</label>
              <select id="filter-question-topic" style={fieldStyle} value={topicFilter} onChange={(event) => { setTopicFilter(event.target.value); setPage(0); }}>
                <option value="">All topics</option>
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="filter-question-status">Status</label>
              <select id="filter-question-status" style={fieldStyle} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as AdminQuestionStatus | ''); setPage(0); }}>
                <option value="">All statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="filter-question-difficulty">Difficulty</label>
              <select id="filter-question-difficulty" style={fieldStyle} value={difficultyFilter} onChange={(event) => { setDifficultyFilter(event.target.value as AdminQuestionDifficulty | ''); setPage(0); }}>
                <option value="">All difficulties</option>
                {difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
              </select>
            </div>
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="empty-card" data-testid="loading-admin-questions">Loading questions…</div>
        ) : listQuery.isError ? (
          <div className="error-card" role="alert" data-testid="error-admin-questions">
            <p>{apiErrorMessage(listQuery.error)}</p>
            <button type="button" className="button-quiet" onClick={() => { if (session.isCurrent()) void listQuery.refetch(); }}>Retry</button>
          </div>
        ) : questions.length === 0 ? (
          <div className="empty-card" data-testid="empty-admin-questions">
            {total === 0 && !topicFilter && !statusFilter && !difficultyFilter
              ? 'No questions yet. Create the first one above.'
              : 'No questions match these filters.'}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', fontSize: 14 }} data-testid="table-admin-questions">
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                    <th style={cellStyle}>Code</th>
                    <th style={cellStyle}>Question</th>
                    <th style={cellStyle}>Topic</th>
                    <th style={cellStyle}>Difficulty</th>
                    <th style={cellStyle}>Status</th>
                    <th style={cellStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.id} style={{ borderBottom: '1px solid var(--line)', opacity: question.status === 'DISABLED' ? 0.65 : 1 }}>
                      <td style={{ ...cellStyle, fontFamily: 'var(--app-font-mono)', whiteSpace: 'nowrap' }}>{question.questionCode}</td>
                      <td style={{ ...cellStyle, minWidth: 240, maxWidth: 440, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{question.text}</td>
                      <td style={cellStyle}>{topics.find((topic) => topic.id === question.topicId)?.name ?? 'Unknown topic'}</td>
                      <td style={cellStyle}>{question.difficulty}</td>
                      <td style={cellStyle}>{question.status}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="button-quiet" onClick={() => startEdit(question)}>Edit</button>
                          {question.status === 'ACTIVE' && (
                            <button type="button" className="button-quiet" onClick={() => { if (session.isCurrent()) setToDisable(question); }} disabled={disableMutation.isPending}>
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="filter-note">Showing {offset + 1}–{offset + questions.length} of {total}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="button-quiet" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>
                  Previous
                </button>
                <button type="button" className="button-quiet" onClick={() => setPage((current) => current + 1)} disabled={!hasNext}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={!!toDisable} onOpenChange={(open) => { if (!open) setToDisable(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable question {toDisable?.questionCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              This question will be hidden from learners. It will not be deleted and can be reactivated by editing its status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisable()} data-testid="button-confirm-disable-question">
              Disable question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
