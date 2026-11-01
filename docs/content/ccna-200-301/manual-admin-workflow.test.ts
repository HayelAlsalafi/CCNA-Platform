import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readPack, topicBodies, taxonomyBodies, directory } from "./prepare-pack.mjs";
import {
  connect,
  createWorkflow,
  expectedQuestions,
  planSetup,
} from "./manual-admin-workflow.browser.mjs";
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const authored = readPack(),
  tax = taxonomyBodies(authored);
const pack = {
  packId: authored.packId,
  sourceDigest: "offline-reviewed-fixture",
  blueprint: tax.blueprint,
  domains: tax.domains,
  objectives: tax.objectives,
  topics: topicBodies(authored),
  topicMeta: authored.topics,
  questions: authored.questions,
};
function fixture() {
  let counter = 2000,
    failAt = 0,
    writes = 0;
  const legacy = {
    id: uuid(900),
    slug: "legacy-unrelated",
    name: "Existing content",
    description: "keep",
    displayOrder: 0,
    status: "ACTIVE",
  };
  const catalog: any = { blueprints: [], domains: [], objectives: [] },
    topics: any[] = [legacy],
    questions: any[] = [];
  const calls: any[] = [];
  const api = async (url: string, { method = "GET", body }: any = {}) => {
    calls.push({ url, method, body });
    if (method === "GET") {
      if (url === "/api/admin/taxonomy") return structuredClone(catalog);
      if (url === "/api/admin/topics") return structuredClone(topics);
      if (url.startsWith("/api/admin/questions?")) {
        const query = new URL(url, "http://localhost:8080").searchParams;
        const rows = questions.filter((q) => q.topicId === query.get("topicId")),
          offset = Number(query.get("offset"));
        return { items: structuredClone(rows.slice(offset, offset + 100)), total: rows.length };
      }
      const mapping = url.match(/^\/api\/admin\/taxonomy\/questions\/([^/]+)\/objectives$/);
      if (mapping) {
        const q = questions.find((q) => q.id === mapping[1]);
        const o = catalog.objectives.find((o: any) => o.code === q.objective);
        return [{ objectiveId: o.id, blueprintId: o.blueprintId, isPrimary: true }];
      }
      throw Error("Unexpected offline API read");
    }
    if (++writes === failAt) throw Error("Offline simulated failure");
    if (method === "POST") {
      const row = { ...body, id: uuid(counter++), createdAt: new Date().toISOString() };
      if (url === "/api/admin/topics") topics.push(row);
      else catalog[url.split("/").at(-1)!].push(row);
      return structuredClone(row);
    }
    const id = url.split("/").at(-1);
    const rows = url.includes("/taxonomy/blueprints/")
      ? catalog.blueprints
      : url.includes("/topics/")
        ? topics
        : questions;
    const row = rows.find((r: any) => r.id === id);
    Object.assign(row, body);
    return structuredClone(row);
  };
  const workflow = createWorkflow(pack, api);
  return {
    workflow,
    catalog,
    topics,
    questions,
    calls,
    legacy,
    api,
    failWrite: (n: number) => {
      failAt = n;
    },
    addImported: () => {
      const data = expectedQuestions(pack, workflow.receipt().bindings).map(
        (q: any, i: number) => ({
          ...q,
          id: uuid(3000 + i),
          status: "DISABLED",
          createdAt: new Date().toISOString(),
        }),
      );
      questions.push(...data);
      return data.map((q: any) => q.id);
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it("inspect performs reads only; setup creates precisely 84 new records through supported POST APIs", async () => {
  const f = fixture();
  expect((await f.workflow.inspect()).createCounts).toEqual({
    blueprints: 1,
    domains: 6,
    objectives: 53,
    topics: 24,
  });
  expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  const result = await f.workflow.createSetup();
  expect(result.created).toEqual({ blueprints: 1, domains: 6, objectives: 53, topics: 24 });
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(84);
  expect(f.catalog.blueprints[0].status).toBe("DRAFT");
  expect(f.topics.filter((t) => t.id !== f.legacy.id).every((t) => t.status === "DISABLED")).toBe(
    true,
  );
  expect(f.legacy.status).toBe("ACTIVE");
});
it("reinspection safely reuses this run without duplicate creates", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(84);
});
it("conflicting slugs and preexisting disabled topics fail before writes", () => {
  const body = pack.topics[0],
    catalog = { blueprints: [], domains: [], objectives: [] };
  expect(() => planSetup(pack, catalog, [{ ...body, id: uuid(1), name: "Different" }])).toThrow(
    /Conflicting topic/,
  );
  expect(() => planSetup(pack, catalog, [{ ...body, id: uuid(1) }])).toThrow(
    /Existing DISABLED topic/,
  );
});
it("different objective labels require explicit operator review, without replacing them", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  f.catalog.objectives[0].description = "Existing reviewed description";
  const plan = await f.workflow.inspect();
  expect(plan.reusedObjectiveDescriptions).toHaveLength(1);
  await expect(f.workflow.createSetup()).rejects.toThrow(/Review differing/);
  await f.workflow.createSetup({ reviewedReuse: true });
  expect(f.catalog.objectives[0].description).toBe("Existing reviewed description");
});
it("changes after inspect and uncertain writes stop with no automatic retry", async () => {
  const f = fixture();
  await f.workflow.inspect();
  f.topics.push({ id: uuid(45), slug: "another-unrelated", status: "ACTIVE" });
  await expect(f.workflow.createSetup()).rejects.toThrow(/Catalog changed/);
  expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  const g = fixture();
  await g.workflow.inspect();
  g.failWrite(3);
  await expect(g.workflow.createSetup()).rejects.toThrow(/Offline simulated/);
  expect(g.workflow.receipt().pendingWrite).not.toBeNull();
  const writes = g.calls.filter((c) => c.method !== "GET").length;
  await expect(g.workflow.createSetup()).rejects.toThrow(/uncertain completion/);
  expect(g.calls.filter((c) => c.method !== "GET")).toHaveLength(writes);
});
it("only the exact returned new question IDs and new topics are published, then verified", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  await f.workflow.markImport();
  const ids = f.addImported();
  await f.workflow.recordImportedIds(ids);
  const result = await f.workflow.publish();
  expect(result.activePilotQuestions).toBe(60);
  expect(result.activePilotTopics).toBe(24);
  const patches = f.calls.filter((c) => c.method === "PATCH");
  expect(patches).toHaveLength(84);
  expect(
    patches.every((c) => Object.keys(c.body).join(",") === "status" && c.body.status === "ACTIVE"),
  ).toBe(true);
  expect(patches.some((c) => c.url.endsWith(f.legacy.id))).toBe(false);
  expect(f.legacy).toEqual({
    id: uuid(900),
    slug: "legacy-unrelated",
    name: "Existing content",
    description: "keep",
    displayOrder: 0,
    status: "ACTIVE",
  });
  await f.workflow.publish();
  expect(f.calls.filter((c) => c.method === "PATCH")).toHaveLength(84);
});
it("unknown, old or edited question IDs are never published", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  await f.workflow.markImport();
  const ids = f.addImported();
  f.questions[0].createdAt = "2020-01-01T00:00:00Z";
  await expect(f.workflow.recordImportedIds(ids)).rejects.toThrow(/predates/);
  f.questions[0].createdAt = new Date().toISOString();
  f.questions[0].options[0].text = "Edited answer";
  await expect(f.workflow.recordImportedIds(ids)).rejects.toThrow(/answers changed/);
  expect(f.calls.some((c) => c.method === "PATCH")).toBe(false);
});
it("snapshot resolves all 24 topic IDs and 53 objective IDs for offline validation", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  const snapshot = f.workflow.snapshot();
  expect(snapshot.topics).toHaveLength(24);
  expect(snapshot.objectives).toHaveLength(53);
  expect(snapshot.objectives.every((o: any) => o.id && o.domainId && o.blueprintId)).toBe(true);
});
it("reconnecting restores catalog IDs through reads only and refuses changed bindings", async () => {
  const f = fixture();
  await f.workflow.inspect();
  await f.workflow.createSetup();
  await f.workflow.markImport();
  const ids = f.addImported();
  const restored = createWorkflow(pack, f.api, () => {}, f.workflow.receipt());
  const writes = f.calls.filter((c) => c.method !== "GET").length;
  await restored.inspect();
  expect(restored.snapshot().objectives).toHaveLength(53);
  await restored.recordImportedIds(ids);
  expect(f.calls.filter((c) => c.method !== "GET")).toHaveLength(writes);
  const altered = f.workflow.receipt();
  altered.bindings.domainIds[pack.domains[0].code] = uuid(999);
  const invalid = createWorkflow(pack, f.api, () => {}, altered);
  await expect(invalid.inspect()).rejects.toThrow(/Restored bindings differ/);
  expect(f.calls.filter((c) => c.method !== "GET")).toHaveLength(writes);
});
it("browser connection rejects a non-ADMIN server response without mutation", async () => {
  vi.stubGlobal("location", { origin: "http://localhost:8080", pathname: "/admin" });
  vi.stubGlobal("window", {
    Clerk: {
      user: { id: "offline-user" },
      session: { id: "offline-session", getToken: async () => "offline-not-a-real-token" },
    },
  });
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/auth/me")
            ? { user: { role: "USER", status: "ACTIVE" } }
            : { allowed: false, role: "USER" },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(connect()).rejects.toThrow(/did not grant/);
  expect(fetch.mock.calls.every((c) => c[1]?.method === "GET")).toBe(true);
});
it("browser request refuses a changed Clerk session before sending credentials", async () => {
  vi.stubGlobal("location", { origin: "http://localhost:8080", pathname: "/admin" });
  const clerk: any = {
    user: { id: "offline-user" },
    session: {
      id: "offline-session",
      getToken: async () => {
        clerk.session.id = "changed";
        return "offline-not-a-real-token";
      },
    },
  };
  vi.stubGlobal("window", { Clerk: clerk });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(connect()).rejects.toThrow(/Session changed/);
  expect(fetch).not.toHaveBeenCalled();
});
