import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, claims: vi.fn() }));
vi.mock('@clerk/express', () => ({ getAuth: auth.claims }));
vi.mock('@workspace/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const name of ['from', 'where', 'values', 'set', 'onConflictDoNothing']) c[name] = () => c;
    c.limit = c.returning = async () => (auth.user ? [auth.user] : []);
    return c;
  };
  return {
    usersTable: { clerkUserId: 'clerk_user_id', id: 'id' },
    db: { select: chain, insert: chain, update: chain },
  };
});
const services = vi.hoisted(() => ({
  taxonomyCatalog: vi.fn(),
  saveTaxonomy: vi.fn(),
  questionAssignments: vi.fn(),
  replaceQuestionAssignments: vi.fn(),
  previewQuestionImport: vi.fn(),
  confirmQuestionImport: vi.fn(),
}));
vi.mock('../lib/taxonomy-admin', () => services);
vi.mock('../lib/canonical-chapters',()=>({saveChapter:vi.fn()}));
vi.mock('../lib/question-import', () => services);
import router from './admin-content';
import { parseApiBody } from '../middlewares/body-parsing';
let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;
beforeAll(async () => {
  const app = express();
  app.use(parseApiBody);
  app.use((req, _res, next) => {
    req.log = { error: vi.fn() } as never;
    next();
  });
  app.use('/api', router);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
function login(role: string | null, status = 'ACTIVE') {
  const now = new Date();
  auth.user = role
    ? {
        id: '11111111-1111-4111-8111-111111111111',
        clerkUserId: 'user_test',
        email: 'admin@example.invalid',
        displayName: 'Admin',
        role,
        status,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      }
    : null;
  auth.claims.mockReturnValue({
    userId: role ? 'user_test' : null,
    sessionId: 'session-test',
    sessionClaims: { email: 'admin@example.invalid', role: 'ADMIN' },
  });
}
const request = (method: string, path: string, body?: unknown, session = 'session-test') =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Session': session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  Object.values(services).forEach((f) => f.mockReset());
  login('ADMIN');
});
const routes: [string, string, unknown?][] = [
  ['GET', '/admin/taxonomy'],
  ['POST','/admin/taxonomy/chapters',{}],
  ['PUT','/admin/taxonomy/chapters/11111111-1111-4111-8111-111111111111',{}],
  ['POST', '/admin/taxonomy/blueprints', {}],
  ['PUT', '/admin/taxonomy/domains/11111111-1111-4111-8111-111111111111', {}],
  ['GET', '/admin/question-import/template.csv'],
  ['GET', '/admin/question-import/template.xlsx'],
  ['POST', '/admin/question-import/preview', {}],
  ['POST', '/admin/question-import/confirm', {}],
  ['PUT', '/admin/taxonomy/questions/11111111-1111-4111-8111-111111111111/objectives', {}],
];
describe('Admin content boundaries', () => {
  it.each(routes)('%s %s requires authentication', async (m, p, b) => {
    login(null);
    expect((await request(m, p, b)).status).toBe(401);
  });
  it.each(routes)('%s %s requires database ADMIN role despite token claims', async (m, p, b) => {
    login('USER');
    expect((await request(m, p, b)).status).toBe(403);
  });
  it('rejects disabled Admin accounts', async () => {
    login('ADMIN', 'DISABLED');
    expect((await request('GET', '/admin/taxonomy')).status).toBe(403);
  });
  it('rejects a changed session before any mutation', async () => {
    expect(
      (await request('POST', '/admin/question-import/confirm', {}, 'old-session')).status,
    ).toBe(409);
    expect(services.confirmQuestionImport).not.toHaveBeenCalled();
  });
  it('authenticates before parsing malformed upload JSON', async () => {
    login(null);
    const r = await fetch(base + '/admin/question-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(r.status).toBe(401);
  });
  it('authenticates before parsing even for case-insensitive route spellings', async () => {
    login(null);
    const r = await fetch(base + '/ADMIN/QUESTION-IMPORT/PREVIEW', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(r.status).toBe(401);
  });
  it('returns a JSON error for malformed authenticated upload bodies', async () => {
    const r = await fetch(base + '/admin/question-import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('INVALID_UPLOAD');
  });
  it('returns real downloadable CSV and XLSX templates under no-store', async () => {
    for (const ext of ['csv', 'xlsx']) {
      const r = await request('GET', `/admin/question-import/template.${ext}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      expect(r.headers.get('Content-Disposition')).toContain(`ccna-questions.${ext}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (ext === 'xlsx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
      else expect(bytes.toString()).toContain('chapterCode');
    }
  });
  it('binds preview and confirmation to verified identity', async () => {
    services.previewQuestionImport.mockResolvedValue({ summary: { accepted: 1 } });
    services.confirmQuestionImport.mockResolvedValue({ imported: 1 });
    await request('POST', '/admin/question-import/preview', {
      filename: 'q.csv',
      dataBase64: 'abc',
    });
    await request('POST', '/admin/question-import/confirm', { confirmed: true });
    expect(services.previewQuestionImport.mock.calls[0]?.[1]).toBe(
      '11111111-1111-4111-8111-111111111111:session-test',
    );
    expect(services.confirmQuestionImport.mock.calls[0]?.[1]).toBe(
      '11111111-1111-4111-8111-111111111111:session-test',
    );
  });
  it('does not disclose internal PostgreSQL errors', async () => {
    services.taxonomyCatalog.mockRejectedValue(new Error('private database credential'));
    const r = await request('GET', '/admin/taxonomy');
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('private database credential');
  });
});
