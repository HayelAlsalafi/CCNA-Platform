import { it, expect, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import {
  inspectImage,
  LocalLessonMedia,
  uploadLessonMedia,
  readLessonMedia,
  mediaLimit,
} from "./lesson-media";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
  "base64",
);
it("checks image signature, matching MIME, size and bounded dimensions", () => {
  expect(inspectImage(png, "image/png")).toMatchObject({ extension: "png", width: 1, height: 1 });
  expect(() => inspectImage(png, "image/jpeg")).toThrow();
  expect(() => inspectImage(Buffer.from('<svg onload="alert(1)"/>'), "image/png")).toThrow();
  expect(() => inspectImage(Buffer.alloc(mediaLimit + 1), "image/png")).toThrow();
  const huge = Buffer.from(png);
  huge.writeUInt32BE(9000, 16);
  expect(() => inspectImage(huge, "image/png")).toThrow();
});
it("stores opaque exclusive objects, rejects traversal and retains shared files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ccna-study-media-")),
    key = "11111111-1111-4111-8111-111111111111.png";
  try {
    const store = new LocalLessonMedia(root);
    await store.put(key, png);
    expect(await store.get(key)).toEqual(png);
    await expect(store.put(key, png)).rejects.toThrow();
    await expect(store.get("../outside.png")).rejects.toThrow();
    await expect(store.put("lesson.html", png)).rejects.toThrow();
    expect(await readFile(path.join(root, key))).toEqual(png);
    await writeFile(path.join(root, "not-media"), "unchanged");
  } finally {
    expect(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep)).toBe(true);
    await rm(root, { recursive: true });
  }
});
it("blocks upload before storage writes when unapproved media table is absent", async () => {
  const db = { execute: vi.fn(async () => ({ rows: [{ ready: false }] })) };
  await expect(
    uploadLessonMedia("11111111-1111-4111-8111-111111111111", png, "image/png", db as never),
  ).rejects.toMatchObject({ status: 503, code: "MEDIA_NOT_READY" });
  expect(db.execute).toHaveBeenCalledTimes(1);
});
it("requires a visible published reference for learner media access", async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: vi.fn(async (statement) => {
      const q = new PgDialect().sqlToQuery(statement);
      calls.push(q);
      return { rows: q.sql.includes("to_regclass") ? [{ ready: true }] : [] };
    }),
  };
  await expect(
    readLessonMedia("11111111-1111-4111-8111-111111111111", false, db as never),
  ).rejects.toMatchObject({ status: 404 });
  const q = calls[1];
  expect(q.sql).toContain("r.id=l.published_revision_id");
  expect(q.sql).toContain("jsonb_path_exists");
  expect(q.sql).toContain("t.status='ACTIVE'");
  expect(q.params).toContain(false);
});
