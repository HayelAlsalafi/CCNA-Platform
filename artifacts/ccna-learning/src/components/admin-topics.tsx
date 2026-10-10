import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshCatalog } from '../lib/catalog-cache';
import { useAdminSession } from './admin-session-boundary';
import { adminQueryOptions, adminMutationOptions } from '../lib/admin-session';
import {
  useAdminListTopics,
  useAdminCreateTopic,
  useAdminUpdateTopic,
  useAdminDisableTopic,
  getAdminListTopicsQueryKey,
} from '@workspace/api-client-react';
import type { AdminTopic, AdminTopicStatus } from '@workspace/api-client-react';
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

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type FormState = { slug: string; name: string; description: string; displayOrder: string; status: AdminTopicStatus };
const emptyForm: FormState = { slug: '', name: '', description: '', displayOrder: '0', status: 'ACTIVE' };

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  const slug = f.slug.trim();
  if (slug.length < 2 || slug.length > 120) e.slug = 'Slug must be 2–120 characters.';
  else if (!SLUG_RE.test(slug)) e.slug = 'Use lowercase letters, numbers and single hyphens (e.g. ip-routing).';
  const name = f.name.trim();
  if (!name) e.name = 'Name is required.';
  else if (name.length > 180) e.name = 'Name must be at most 180 characters.';
  if (f.description.length > 2000) e.description = 'Description must be at most 2000 characters.';
  const order = Number(f.displayOrder);
  if (f.displayOrder.trim() === '' || !Number.isInteger(order) || order < 0) e.displayOrder = 'Display order must be a whole number ≥ 0.';
  return e;
}

function apiErrorMessage(err: unknown): string {
  const anyErr = err as { status?: number; data?: { error?: { code?: string; message?: string } } } | null;
  const apiErr = anyErr?.data?.error;
  if (anyErr?.status === 409) return apiErr?.message || 'A topic with this slug already exists.';
  if (anyErr?.status === 401) return 'Your session expired. Sign in again.';
  if (anyErr?.status === 403) return 'The server denied this admin action.';
  if (apiErr?.message) return apiErr.message;
  return 'The request failed. Please try again.';
}

const fieldStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff', font: 'inherit' } as const;
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 } as const;
const errStyle = { color: '#b84d35', fontSize: 12, marginTop: 4 } as const;

export function AdminTopicManager() {
  const session = useAdminSession();
  const qc = useQueryClient();
  const listQuery = useAdminListTopics(adminQueryOptions(getAdminListTopicsQueryKey(), session.identity));
  const createM = useAdminCreateTopic(adminMutationOptions('adminCreateTopic', session.identity));
  const updateM = useAdminUpdateTopic(adminMutationOptions('adminUpdateTopic', session.identity));
  const disableM = useAdminDisableTopic(adminMutationOptions('adminDisableTopic', session.identity));

  const [editing, setEditing] = useState<AdminTopic | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDisable, setToDisable] = useState<AdminTopic | null>(null);

  const refresh = (isCurrent: () => boolean) =>
    refreshCatalog(qc, session.identity, isCurrent);

  const startEdit = (t: AdminTopic) => {
    if (!session.isCurrent()) return;
    setEditing(t);
    setForm({ slug: t.slug, name: t.name, description: t.description, displayOrder: String(t.displayOrder), status: t.status });
    setErrors({}); setFormError(null); setNotice(null);
  };
  const reset = () => { if (!session.isCurrent()) return; setEditing(null); setForm(emptyForm); setErrors({}); setFormError(null); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!session.isCurrent()) return;
    const isCurrent = session.capture();
    setNotice(null); setFormError(null);
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { slug: form.slug.trim(), name: form.name.trim(), description: form.description.trim(), displayOrder: Number(form.displayOrder), status: form.status };
    try {
      if (editing) {
        await updateM.mutateAsync({ id: editing.id, data });
        if (!isCurrent()) return;
        setNotice(`Topic "${data.name}" updated.`);
      } else {
        await createM.mutateAsync({ data });
        if (!isCurrent()) return;
        setNotice(`Topic "${data.name}" created.`);
      }
      reset();
      await refresh(isCurrent);
    } catch (err) {
      if (isCurrent()) setFormError(apiErrorMessage(err));
    } finally {
      if (isCurrent()) { createM.reset(); updateM.reset(); }
    }
  };

  const confirmDisable = async () => {
    if (!session.isCurrent() || !toDisable) return;
    const isCurrent = session.capture();
    const t = toDisable;
    setToDisable(null); setNotice(null); setFormError(null);
    try {
      await disableM.mutateAsync({ id: t.id });
      if (!isCurrent()) return;
      setNotice(`Topic "${t.name}" disabled. It is now hidden from learners.`);
      if (editing?.id === t.id) reset();
      await refresh(isCurrent);
    } catch (err) {
      if (isCurrent()) setFormError(apiErrorMessage(err));
    } finally {
      if (isCurrent()) disableM.reset();
    }
  };

  const saving = createM.isPending || updateM.isPending;
  const topics = [...(listQuery.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <section style={{ display: 'grid', gap: 24, marginTop: 24 }} data-testid="admin-topic-manager">
      {notice && <div role="status" className="status-chip" data-testid="admin-topic-notice">{notice}</div>}

      <form onSubmit={submit} noValidate className="empty-card" style={{ textAlign: 'left', display: 'grid', gap: 14 }} data-testid="form-admin-topic">
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing ? `Edit topic: ${editing.name}` : 'Create a topic'}</h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label style={labelStyle} htmlFor="topic-name">Name</label>
            <input id="topic-name" style={fieldStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            {errors.name && <div style={errStyle}>{errors.name}</div>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="topic-slug">Slug</label>
            <input id="topic-slug" style={fieldStyle} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} aria-invalid={!!errors.slug} placeholder="ip-routing" />
            {errors.slug && <div style={errStyle}>{errors.slug}</div>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="topic-order">Display order</label>
            <input id="topic-order" type="number" min={0} step={1} style={fieldStyle} value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} aria-invalid={!!errors.displayOrder} />
            {errors.displayOrder && <div style={errStyle}>{errors.displayOrder}</div>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="topic-status">Status</label>
            <select id="topic-status" style={fieldStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminTopicStatus })}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="topic-description">Description</label>
          <textarea id="topic-description" rows={3} style={fieldStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-invalid={!!errors.description} />
          {errors.description && <div style={errStyle}>{errors.description}</div>}
        </div>
        {formError && <div role="alert" style={errStyle} data-testid="admin-topic-error">{formError}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="button-primary" disabled={saving} data-testid="button-save-topic">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create topic'}
          </button>
          {editing && <button type="button" className="button-quiet" onClick={reset} disabled={saving}>Cancel</button>}
        </div>
      </form>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>All topics</h2>
        {listQuery.isLoading ? (
          <div className="empty-card" data-testid="loading-admin-topics">Loading topics…</div>
        ) : listQuery.isError ? (
          <div className="error-card" role="alert" data-testid="error-admin-topics">
            <p>{apiErrorMessage(listQuery.error)}</p>
            <button type="button" className="button-quiet" onClick={() => { if (session.isCurrent()) void listQuery.refetch(); }}>Retry</button>
          </div>
        ) : topics.length === 0 ? (
          <div className="empty-card">No topics yet. Create the first one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }} data-testid="table-admin-topics">
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: 8 }}>Order</th><th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Slug</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--line)', opacity: t.status === 'DISABLED' ? 0.6 : 1 }}>
                    <td style={{ padding: 8 }}>{t.displayOrder}</td>
                    <td style={{ padding: 8 }}>{t.name}</td>
                    <td style={{ padding: 8, fontFamily: 'var(--app-font-mono)' }}>{t.slug}</td>
                    <td style={{ padding: 8 }}>{t.status}</td>
                    <td style={{ padding: 8, display: 'flex', gap: 8 }}>
                      <button type="button" className="button-quiet" onClick={() => startEdit(t)}>Edit</button>
                      {t.status === 'ACTIVE' && (
                        <button type="button" className="button-quiet" onClick={() => { if (session.isCurrent()) setToDisable(t); }} disabled={disableM.isPending}>Disable</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={!!toDisable} onOpenChange={(o) => { if (!o) setToDisable(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable “{toDisable?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The topic will be hidden from learners. It is not deleted and can be re-activated by editing its status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisable()} data-testid="button-confirm-disable">Disable topic</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
