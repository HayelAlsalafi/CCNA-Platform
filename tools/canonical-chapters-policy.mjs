import {readEvidenceFileSync as readFileSync} from './workspace-root.mjs';
// Inert reviewed sources and exact chapter privileges. No connections on import.
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
export const canonicalMigration = Object.freeze([
  "0011_canonical_book_chapters",
  1792195200000,
  "27dd0aaa98728d0bcc20ba07b1e5ce92bc6f914a5f04549d503f61ddb2699316",
]);
const pins = {
  "tools/canonical-chapters-original-approval.json":"6bcdefc3636b8cb3ff23f96f49743a3e3121720630220765c1ec91293eb84c7f",
  "lib/db/drizzle/proposed/0011_canonical_book_chapters.sql":
    "27dd0aaa98728d0bcc20ba07b1e5ce92bc6f914a5f04549d503f61ddb2699316",
  "lib/db/drizzle/proposed/meta/0011_snapshot.json":
    "519f040d8459b102df6806eaa16b6bdb2bbc4e59a260aa1c3e664fd41d7d94a6",
  "lib/db/drizzle/proposed/meta/0011_journal.json":
    "ae86f9e15f717c331e51cc3d8a9cf99535fe73caf48b4238df1c388318c843ac",
  "lib/ccna-book-chapters.ts": "1a41cb7c97017482624509c112f14bda134fa776d505b061c128fbd10e28e554",
  "lib/canonical-chapters.json": "27f1517e545a1e46978ccb08f524be40d5b8214b4513dc55c68332185b230ddc",
  "tools/canonical-chapters-plan.json":
    "48927e5ad6ba275f6ec2f4a6d7ef4827b8a596cad9c80e7379db7ac71ac44381",
};
export function canonicalSources(root) {
  for (const [relative, hash] of Object.entries(pins))
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(root, relative)))
        .digest("hex"),
      hash,
      "Canonical source drift: " + relative,
    );
  for (const relative of ["0011_canonical_book_chapters.sql", "meta/0011_snapshot.json"]) {
    const official = path.join(root, "lib/db/drizzle", relative),
      proposed = path.join(root, "lib/db/drizzle/proposed", relative);
    if (existsSync(official))
      assert(
        readFileSync(official).equals(readFileSync(proposed)),
        "Official canonical migration differs from reviewed proposal",
      );
  }
  return {
    catalog: JSON.parse(readFileSync(path.join(root, "lib/canonical-chapters.json"), "utf8")),
    snapshot: JSON.parse(
      readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0011_snapshot.json"), "utf8"),
    ),
    journal: JSON.parse(
      readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0011_journal.json"), "utf8"),
    ),
    plan: JSON.parse(readFileSync(path.join(root, "tools/canonical-chapters-plan.json"), "utf8")),
  };
}
export function canonicalSnapshot(root) {
  return canonicalSources(root).snapshot;
}
export async function assertCanonicalPrivileges(client, role = "ccna_phase6a_app") {
  const rows = (
    await client.query(
      `SELECT has_table_privilege($1,'public.curriculum_chapters','SELECT') AS select,has_table_privilege($1,'public.curriculum_chapters','INSERT') AS insert,has_table_privilege($1,'public.curriculum_chapters','UPDATE') AS update,has_table_privilege($1,'public.curriculum_chapters','DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege($1,'public.curriculum_chapters','REFERENCES') AS unsafe,EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access FROM pg_class c WHERE c.oid='public.curriculum_chapters'::regclass`,
      [role],
    )
  ).rows;
  assert.deepEqual(
    rows,
    [{ select: true, insert: true, update: true, unsafe: false, public_access: false }],
    "Canonical chapter runtime grants differ",
  );
}
