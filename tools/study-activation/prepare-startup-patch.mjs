// Produces an unapplied source patch; never edits the actual launcher or journal.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = process.cwd(),
  base = ".local/study-startup-candidate";
const replace = (s, a, b) => {
  assert(s.includes(a), "Reviewed startup source boundary missing");
  return s.replace(a, b);
};
for (const name of ["policy.mjs", "upgrade.mjs", "run.mjs"]) {
  const relative = "tools/phase6a-local/" + name,
    old = readFileSync(relative, "utf8");
  let next = old;
  if (name === "policy.mjs") {
    next =
      "import {studyMigration,assertStudyProposal} from '../study-activation/proposal.mjs';\n" +
      next;
    next = replace(
      next,
      "const reviewed=journal.entries.length===13?",
      "const reviewed=journal.entries.length===14?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonMigration,studyMigration]:journal.entries.length===13?",
    );
    next = replace(
      next,
      "if(reviewed.length===13){if(lessonOnly)assertLessonSource(root);else assertExamSource(root);}",
      "if(reviewed.length===13){if(lessonOnly)assertLessonSource(root);else assertExamSource(root);}\n  if(reviewed.length===14){assertLessonSource(root);assertStudyProposal(root);}",
    );
    next = replace(
      next,
      "if(inventory===13){if(isLessonChain(migrationManifest(policy.root)))expectedTables.push('lessons','lesson_revisions');else expectedTables.push('exam_sessions','exam_session_items');}",
      "if(inventory===13){if(isLessonChain(migrationManifest(policy.root)))expectedTables.push('lessons','lesson_revisions');else expectedTables.push('exam_sessions','exam_session_items');}\n      if(inventory===14)expectedTables.push('lessons','lesson_revisions','lesson_annotations','lesson_progress','lesson_media');",
    );
  }
  if (name === "upgrade.mjs") {
    next = "import {assertStudyProposal} from '../study-activation/proposal.mjs';\n" + next;
    next = replace(
      next,
      "  return result;\n}",
      "  if(journal.entries.length===14)result[1]=assertStudyProposal(root).snapshot;\n  return result;\n}",
    );
  }
  if (name === "run.mjs") {
    next =
      "import {assertStudyPrivileges,assertStudyPolicies} from '../study-activation/proposed-runtime-guard.mjs';\n" +
      next;
    next = replace(
      next,
      "if(count===13){if(lessonOnly){await assertLessonPrivileges(client);await assertLessonRevisionGuard(client,root);}else await assertExamPrivileges(client);}",
      "if(count===13){if(lessonOnly){await assertLessonPrivileges(client);await assertLessonRevisionGuard(client,root);}else await assertExamPrivileges(client);}\n  if(count===14){await assertLessonPrivileges(client);await assertLessonRevisionGuard(client,root);await assertStudyPrivileges(client,'ccna_phase6a_app');await assertStudyPolicies(client);}",
    );
  }
  for (const [side, text] of [
    ["old", old],
    ["new", next],
  ]) {
    const file = path.join(base, side, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  execFileSync(process.execPath, ["--check", path.join(base, "new", relative)], {
    stdio: "pipe",
    windowsHide: true,
  });
}
let patch;
try {
  patch = execFileSync("git", ["diff", "--no-index", "--", base + "/old", base + "/new"], {
    encoding: "utf8",
    windowsHide: true,
  });
} catch (e) {
  assert.equal(e.status, 1);
  patch = e.stdout;
}
patch = patch.replaceAll("a/" + base + "/old/", "a/").replaceAll("b/" + base + "/new/", "b/");
writeFileSync("tools/study-activation/proposed-startup-0014.patch", patch);
console.log(
  JSON.stringify({
    patchPrepared: true,
    launcherFilesModified: 0,
    syntaxChecks: 3,
    databaseConnections: 0,
  }),
);
