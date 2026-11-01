// No module-load I/O. No driver imports or connection creation; callers supply sessions.
import assert from "node:assert/strict";

export function privateHba(database, owner) {
  for (const value of [database, owner]) assert(/^[a-z][a-z0-9_]{0,62}$/.test(value) && !["all", "replication", "sameuser", "samerole"].includes(value), "Unsafe HBA identifier");
  return [
    "local all all reject",
    "local replication all reject",
    `host ${database},postgres ${owner} 127.0.0.1/32 trust`,
    "host all all 0.0.0.0/0 reject",
    "host replication all 0.0.0.0/0 reject",
    "host all all ::/0 reject",
    "host replication all ::/0 reject",
  ];
}

export const raceLimits = Object.freeze({ connectMs: 7000, queryMs: 17000, observeMs: 2500,
  releaseMs: 3000, contenderMs: 12000, closeMs: 1500, pollMs: 25 });

function failure(code, message) { return Object.assign(new Error(message), { code }); }

export function bounded(operation, milliseconds, label, { signal, onTimeout = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      callback(value);
    };
    const aborted = () => finish(reject, failure("REHEARSAL_CLOSED", `${label}: session closed`));
    // Handlers remain attached even on timeout/abort, consuming any late rejection.
    Promise.resolve(operation).then((value) => finish(resolve, value), (error) => finish(reject, error));
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(() => {
      try { onTimeout(); } catch { /* The deadline remains the primary failure. */ }
      finally { finish(reject, failure("REHEARSAL_DEADLINE", `${label}: exceeded ${milliseconds}ms`)); }
    }, milliseconds);
  });
}

export function disconnect(client) {
  // Close only this client's socket; never terminate another backend or a server.
  client.connection?.stream?.destroy();
}

export function protectedSession(client, limits = raceLimits) {
  const lifecycle = new AbortController();
  let closing;
  return {
    query(...args) {
      return bounded(Promise.resolve().then(() => {
        if (lifecycle.signal.aborted) throw failure("REHEARSAL_CLOSED", "Query on closed session");
        return client.query(...args);
      }), limits.queryMs, "query", { signal: lifecycle.signal, onTimeout: () => disconnect(client) });
    },
    close() {
      if (!closing) {
        // Abort pending wrappers and destroy the socket BEFORE awaiting end().
        // Disconnecting releases this session's transaction locks on the server.
        lifecycle.abort();
        disconnect(client);
        closing = bounded(Promise.resolve().then(() => client.end()), limits.closeMs, "session close",
          { onTimeout: () => disconnect(client) }).finally(() => disconnect(client));
      }
      return closing;
    },
  };
}

export function assertContenderResult(error, commitFirst) {
  if (error?.code === "55P03" || error?.code === "57014" || error?.code === "REHEARSAL_DEADLINE" || error?.code === "REHEARSAL_CLOSED") {
    throw failure("REHEARSAL_TIMEOUT_FAILURE", `Contender did not prove uniqueness: ${error.code}`);
  }
  if (commitFirst) {
    assert.equal(error?.code, "23505", "Committed winner must cause a genuine uniqueness violation");
    assert.equal(error?.constraint, "question_objectives_primary_uq");
  } else assert.equal(error, null, "Rolled-back winner must permit the contender");
}

export async function runPrimaryRace({ connect, observer, commitFirst, questionId, blueprintId,
  firstObjectiveId, secondObjectiveId, limits = raceLimits }) {
  let a, b, pending, outcome, problem;
  const cancellation = new AbortController();
  async function acquire(label) {
    let abandoned = false;
    const operation = Promise.resolve().then(connect).then(async (session) => {
      if (abandoned) {
        // The real connector also bounds/owns its in-progress client. If it
        // returns late, never leave the newly returned session open.
        await bounded(session.close(), limits.closeMs, `${label} late close`);
        throw failure("REHEARSAL_DEADLINE", `${label} arrived after its deadline`);
      }
      return session;
    });
    try { return await bounded(operation, limits.connectMs, label, { onTimeout: () => { abandoned = true; } }); }
    catch (error) { abandoned = true; throw error; }
  }
  try {
    a = await acquire("first connection");
    b = await acquire("second connection");
    await a.query("BEGIN"); await b.query("BEGIN");
    const bPid = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await a.query("UPDATE question_objectives SET is_primary=true WHERE question_id=$1 AND objective_id=$2", [questionId, firstObjectiveId]);
    pending = bounded(b.query("UPDATE question_objectives SET is_primary=true WHERE question_id=$1 AND objective_id=$2", [questionId, secondObjectiveId]),
      limits.contenderMs, "contender promotion", { signal: cancellation.signal, onTimeout: () => { void b.close().catch(() => {}); } })
      .then(() => { outcome = { error: null }; }, (error) => { outcome = { error }; });
    let blocked = false;
    const deadline = performance.now() + limits.observeMs;
    while (performance.now() < deadline) {
      assert(!outcome, `Contender settled before a lock was observed: ${outcome?.error?.code ?? "success"}`);
      // Observer queries are autocommit, so pg_stat_activity is not cached.
      const state = await bounded(observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [bPid]),
        Math.max(1, deadline - performance.now()), "lock observation");
      if (state.rows[0]?.wait_event_type === "Lock") { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, Math.min(limits.pollMs, Math.max(1, deadline - performance.now()))));
    }
    assert(blocked, "Lock observation deadline exceeded; no concurrency result established");
    assert(!outcome, "Contender settled before the first transaction was released");
    await bounded(a.query(commitFirst ? "COMMIT" : "ROLLBACK"), limits.releaseMs, "first transaction release");
    await pending;
    assertContenderResult(outcome.error, commitFirst);
    await b.query(commitFirst ? "ROLLBACK" : "COMMIT");
    const rows = (await observer.query("SELECT objective_id FROM question_objectives WHERE question_id=$1 AND blueprint_id=$2 AND is_primary", [questionId, blueprintId])).rows;
    assert.deepEqual(rows, [{ objective_id: commitFirst ? firstObjectiveId : secondObjectiveId }]);
  } catch (error) { problem = error; }
  finally {
    cancellation.abort();
    // Both closes start before either is awaited. Never wait for the blocked
    // contender before disconnecting the lock holder; no cleanup ROLLBACK queue.
    const cleanup = await Promise.allSettled([a, b].filter(Boolean).map((session) =>
      bounded(Promise.resolve().then(() => session.close()), limits.closeMs, "race session close")));
    if (pending) await pending; // cancellation makes this wrapper settle promptly
    const failures = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (failures.length) problem = new AggregateError([...(problem ? [problem] : []), ...failures], "Race/session cleanup failed");
  }
  if (problem) throw problem;
}
