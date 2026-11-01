// Offline tests: fakes only. No PostgreSQL imports, connections or SQL execution.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { privateHba, protectedSession, bounded, assertContenderResult, runPrimaryRace } from "./safety.mjs";

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
const rules = privateHba(manifest.database, manifest.owner);
// Model documented first-match rules for this intentionally small fixed policy.
function authentication({ type = "host", user = manifest.owner, database = manifest.database, address = "127.0.0.1" } = {}, policy = rules) {
  for (const line of policy) {
    const [connection, databases, users, field, method] = line.split(" ");
    if (connection !== type || (users !== "all" && users !== user)) continue;
    if (databases === "all" ? database === "replication" : !databases.split(",").includes(database)) continue;
    if (type === "local") return field;
    if (field === "127.0.0.1/32" ? address !== "127.0.0.1" : field === "0.0.0.0/0" ? address.includes(":") : !address.includes(":")) continue;
    return method;
  }
  return "no-match";
}

for (const [name, connection, expected] of [
  ["exact owner and target on IPv4 loopback", {}, "trust"],
  ["exact owner on maintenance database", { database: "postgres" }, "trust"],
  ["unauthorized owner on IPv4 loopback", { user: "postgres" }, "reject"],
  ["unauthorized database", { database: "template1" }, "reject"],
  ["owner on another loopback address", { address: "127.0.0.2" }, "reject"],
  ["owner from non-loopback IPv4", { address: "192.0.2.1" }, "reject"],
  ["IPv6 loopback", { address: "::1" }, "reject"],
  ["IPv4-mapped IPv6", { address: "::ffff:127.0.0.1" }, "reject"],
  ["non-loopback IPv6", { address: "2001:db8::1" }, "reject"],
  ["local owner", { type: "local" }, "reject"],
  ["unauthorized local owner", { type: "local", user: "postgres" }, "reject"],
  ["local physical replication", { type: "local", database: "replication" }, "reject"],
  ["IPv4 physical replication", { database: "replication" }, "reject"],
  ["IPv6 physical replication", { database: "replication", address: "::1" }, "reject"],
]) test(`HBA: ${name}`, () => assert.equal(authentication(connection), expected));

test("first-match precedence permits the intended connection before catch-all rejection", () => {
  assert.equal(authentication(), "trust");
  assert.equal(authentication({}, ["host all all 0.0.0.0/0 reject", ...rules]), "reject");
  assert.equal(rules.filter((line) => line.endsWith(" trust")).length, 1);
});
test("unsafe HBA identifiers cannot add permissive records", () => {
  for (const value of ["all", "+admins", "owner\nhost all all 0.0.0.0/0 trust", "owner,postgres"]) {
    assert.throws(() => privateHba(manifest.database, value));
  }
});

test("harness retains the exact target and hash guards and checks HBA before driver loading", () => {
  const source = readFileSync(new URL("./rehearsal.mjs", import.meta.url), "utf8");
  assert(source.includes('assert.equal(manifest.host, "127.0.0.1")'));
  assert(source.includes('assert.equal(manifest.port, 55439)'));
  assert(source.includes(`assert.equal(manifest.database, "${manifest.database}")`));
  assert(source.includes(`assert.equal(manifest.owner, "${manifest.owner}")`));
  assert(source.includes('digest("hex"), input.sha256'));
  assert(source.indexOf("assert.deepEqual(hbaRules") < source.indexOf("const { Client }"));
  assert(source.includes("runPrimaryRace({ connect, observer: client, commitFirst"));
});

test("identity SQL removes the inet mask in PostgreSQL and preserves exact IPv4 verification", () => {
  const source = readFileSync(new URL("./rehearsal.mjs", import.meta.url), "utf8");
  const query = source.match(/session\.query\("(SELECT current_database\(\)[^"]+)"\)/)?.[1];
  assert(query, "Identity query must remain present");
  assert.match(query, /host\(inet_server_addr\(\)\) AS host/);
  assert.doesNotMatch(query, /inet_server_addr\(\)::text/);
  assert(source.includes("assert.equal(identity.host, manifest.host)"));
  assert(source.includes('assert.equal(manifest.host, "127.0.0.1")'));
});

const small = { connectMs: 50, queryMs: 50, observeMs: 35, releaseMs: 20, contenderMs: 50, closeMs: 15, pollMs: 1 };
const never = () => new Promise(() => {});
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fakeClient({ query = async () => ({}), end = async () => {} } = {}) {
  const client = { queries: [], destroyed: 0, ended: 0,
    connection: { stream: { destroy: () => { client.destroyed += 1; } } },
    query: (...args) => { client.queries.push(args); return query(...args); },
    end: () => { client.ended += 1; return end(); },
  };
  return client;
}

test("query deadline disconnects only the owned fake socket", async () => {
  const client = fakeClient({ query: never });
  const session = protectedSession(client, { ...small, queryMs: 5 });
  await assert.rejects(session.query("fake query"), { code: "REHEARSAL_DEADLINE" });
  assert.equal(client.destroyed, 1);
  await session.close();
});
test("closing a session cancels a hung query immediately and closes once", async () => {
  const client = fakeClient({ query: never });
  const session = protectedSession(client, small);
  const pending = session.query("fake query").then(() => null, (error) => error);
  const firstClose = session.close();
  assert.equal(firstClose, session.close());
  await firstClose;
  assert.equal((await pending).code, "REHEARSAL_CLOSED");
  assert.equal(client.ended, 1);
  await assert.rejects(session.query("late fake query"), { code: "REHEARSAL_CLOSED" });
});
test("a hung end is bounded after the owned socket is destroyed", async () => {
  const client = fakeClient({ end: never });
  const session = protectedSession(client, { ...small, closeMs: 5 });
  await assert.rejects(session.close(), { code: "REHEARSAL_DEADLINE" });
  assert(client.destroyed >= 1);
});
test("late promise rejections are consumed after a deadline", async () => {
  const operation = deferred();
  await assert.rejects(bounded(operation.promise, 5, "offline operation"), { code: "REHEARSAL_DEADLINE" });
  operation.reject(new Error("late failure"));
  await new Promise((resolve) => setImmediate(resolve));
});

for (const code of ["55P03", "57014", "REHEARSAL_DEADLINE", "REHEARSAL_CLOSED"]) {
  test(`timeout ${code} never counts as a uniqueness pass`, () => {
    for (const commitFirst of [true, false]) assert.throws(() => assertContenderResult({ code }, commitFirst), { code: "REHEARSAL_TIMEOUT_FAILURE" });
  });
}
test("only the expected uniqueness index is accepted after COMMIT", () => {
  assert.doesNotThrow(() => assertContenderResult({ code: "23505", constraint: "question_objectives_primary_uq" }, true));
  assert.throws(() => assertContenderResult({ code: "23505", constraint: "unrelated_index" }, true));
  assert.throws(() => assertContenderResult(null, true));
  assert.throws(() => assertContenderResult({ code: "23505", constraint: "question_objectives_primary_uq" }, false));
});

function raceFakes({ commitFirst = true, secondConnectFails = false, contenderHangs = false, observationHangs = false, releaseHangs = false, earlyError = null, closeHangs = false } = {}) {
  const blocked = deferred(); let connects = 0;
  const aRaw = fakeClient({ query: async (sql) => {
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      if (releaseHangs) return never();
      if (!contenderHangs && !earlyError) commitFirst ? blocked.reject({ code: "23505", constraint: "question_objectives_primary_uq" }) : blocked.resolve({});
    }
    return {};
  }, end: closeHangs ? never : undefined });
  const bRaw = fakeClient({ query: async (sql) => {
    if (sql.startsWith("SELECT pg_backend_pid")) return { rows: [{ pid: 123 }] };
    if (sql.startsWith("UPDATE")) { if (earlyError) throw earlyError; return blocked.promise; }
    return {};
  }, end: closeHangs ? never : undefined });
  // Track abandonment through the protected session wrapper, not a real driver.
  const a = protectedSession(aRaw, small), b = protectedSession(bRaw, small);
  const observer = { query: async (sql) => {
    if (sql.includes("pg_stat_activity")) { if (observationHangs) return never(); return { rows: [{ wait_event_type: "Lock" }] }; }
    return { rows: [{ objective_id: commitFirst ? "first" : "second" }] };
  } };
  const options = { observer, commitFirst, questionId: "question", blueprintId: "blueprint", firstObjectiveId: "first", secondObjectiveId: "second", limits: small,
    connect: async () => { connects += 1; if (connects === 2 && secondConnectFails) throw new Error("second connection failed"); return connects === 1 ? a : b; },
  };
  return { options, aRaw, bRaw };
}

for (const commitFirst of [true, false]) test(`offline race preserves first ${commitFirst ? "COMMIT" : "ROLLBACK"} outcome`, async () => {
  const fake = raceFakes({ commitFirst });
  await runPrimaryRace(fake.options);
  assert.equal(fake.aRaw.ended, 1); assert.equal(fake.bRaw.ended, 1);
  assert(fake.aRaw.queries.some(([sql]) => sql === (commitFirst ? "COMMIT" : "ROLLBACK")));
  assert(fake.bRaw.queries.some(([sql]) => sql === (commitFirst ? "ROLLBACK" : "COMMIT")));
});
test("second connection failure closes the already acquired first session", async () => {
  const fake = raceFakes({ secondConnectFails: true });
  await assert.rejects(runPrimaryRace(fake.options), /second connection failed/);
  assert.equal(fake.aRaw.ended, 1); assert.equal(fake.bRaw.ended, 0);
});
for (const setting of ["contenderHangs", "observationHangs", "releaseHangs"]) test(`${setting} fails with bounded worker teardown`, async () => {
  const fake = raceFakes({ [setting]: true });
  await assert.rejects(runPrimaryRace(fake.options));
  assert.equal(fake.aRaw.ended, 1); assert.equal(fake.bRaw.ended, 1);
  assert(fake.aRaw.destroyed > 0 && fake.bRaw.destroyed > 0);
});
test("early contender failure never bypasses observed-lock requirement", async () => {
  const fake = raceFakes({ earlyError: { code: "55P03" } });
  await assert.rejects(runPrimaryRace(fake.options));
  assert.equal(fake.aRaw.ended, 1); assert.equal(fake.bRaw.ended, 1);
});
test("cleanup attempts both closes even when both end operations hang", async () => {
  const fake = raceFakes({ closeHangs: true });
  await assert.rejects(runPrimaryRace(fake.options), AggregateError);
  assert.equal(fake.aRaw.ended, 1); assert.equal(fake.bRaw.ended, 1);
});
test("late connection acquisition closes the abandoned session", async () => {
  const late = deferred(); const client = fakeClient(); const session = protectedSession(client, small);
  await assert.rejects(runPrimaryRace({ ...raceFakes().options, connect: () => late.promise, limits: { ...small, connectMs: 5 } }), { code: "REHEARSAL_DEADLINE" });
  late.resolve(session);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.ended, 1);
});
