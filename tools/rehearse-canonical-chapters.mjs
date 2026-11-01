import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Restored backup -> proposed reset -> assertions -> ROLLBACK. No application connection.
import assert from "node:assert/strict";
import { realpathSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { canonicalSources } from "./canonical-chapters-policy.mjs";
import { verifyResetBackup, resetCanonicalTransaction } from "./canonical-chapters-reset.mjs";
import { restoreBackupProof } from "./question-bank-restore.mjs";
import { metadataDiagnostic } from "./canonical-diagnostics.mjs";
const root = realpathSync(process.cwd());
assert.equal(root.toLowerCase(), portableRoot.toLowerCase());
assert.equal(
  execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
  "main",
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
);
assert.equal(process.argv.length, 2, "No target overrides accepted");
const { plan } = canonicalSources(root);
verifyResetBackup(root, plan);
try {
  const result = await restoreBackupProof(
    root,
    plan.backup.path,
    path.join(path.dirname(plan.backup.path), "restore-proof.json"),
    async (client) => {
      const reset = await resetCanonicalTransaction(client, root, {
        owner: "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170",
        privateRehearsal: true,
      });
      // Probe both FK and canonical binding guards without leaving failed transactions.
      async function rejects(sql, args, code, constraint) {
        await client.query("SAVEPOINT chapter_guard_probe");
        let error;
        try {
          await client.query(sql, args);
        } catch (e) {
          error = e;
        }
        await client.query("ROLLBACK TO SAVEPOINT chapter_guard_probe");
        await client.query("RELEASE SAVEPOINT chapter_guard_probe");
        assert.equal(error?.code, code, "Expected canonical constraint SQLSTATE " + code);
        assert.equal(error?.constraint, constraint, "Expected exact canonical constraint binding");
      }
      const sources = canonicalSources(root),
        c = sources.catalog.chapters[0],
        d = sources.plan.catalog.domains[0];
      await rejects(
        "UPDATE public.curriculum_chapters SET domain_code=$1 WHERE id=$2",
        ["2.0", c.topicId],
        "23514",
        "curriculum_chapters_canonical_ck",
      );
      await rejects(
        "DELETE FROM public.topics WHERE id=$1",
        [c.topicId],
        "23001",
        "curriculum_chapters_id_topics_id_fk",
      );
      await rejects(
        "INSERT INTO public.curriculum_chapters(id,blueprint_id,domain_id,domain_code,code,volume,chapter_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
        ["11111111-1111-4111-8111-111111111111", d.blueprint_id, d.id, d.code, c.code, "V1", 1],
        "23514",
        "curriculum_chapters_canonical_ck",
      );
      return { ...reset, canonicalBindingChecks: true, topicRestrictVerified: true };
    },
  );
  writeFileSync(
    path.join(root, ".local/canonical-metadata/rehearsal.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(
    JSON.stringify({
      stage: "isolated-reset-rehearsal",
      passed: false,
      sqlState: error?.code === "ERR_ASSERTION" ? undefined : error?.code,
      invariant: metadataDiagnostic(error),
      applicationConnections: 0,
    }),
  );
  process.exitCode = 1;
}
