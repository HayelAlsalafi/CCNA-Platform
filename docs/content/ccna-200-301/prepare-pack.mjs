import {portableRoot} from '../../../tools/workspace-root.mjs';
// Offline file preparation only: no network, DB driver, credentials or SQL.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const directory = path.dirname(fileURLToPath(import.meta.url));
export const headers = [
  "topicId",
  "text",
  "difficulty",
  ...Array.from({ length: 10 }, (_, i) => "option" + String.fromCharCode(65 + i)),
  "correctOption",
  "explanation",
  "referenceNotes",
  "blueprintId",
  "objectiveCodes",
  "primaryObjectiveCode",
];
export function readPack() {
  const curriculum = JSON.parse(
    readFileSync(path.join(directory, "source/curriculum.json"), "utf8"),
  );
  const questions = Array.from({ length: 6 }, (_, i) =>
    JSON.parse(
      readFileSync(path.join(directory, "source/questions-d" + (i + 1) + ".json"), "utf8"),
    ),
  ).flat();
  return { ...curriculum, questions };
}
const fail = (message) => {
  throw Error(message);
};
const unique = (values) => new Set(values).size === values.length;
export function checkPack(p) {
  if (p.domains.length !== 6 || p.topics.length !== 24 || p.questions.length !== 60)
    fail("Expected six domains, 24 topics and 60 questions.");
  if (p.domains.reduce((n, d) => n + d.weightPercent, 0) !== 100) fail("Weights must total 100.");
  if (
    !unique(p.topics.map((t) => t.slug)) ||
    !unique(p.topics.map((t) => t.key)) ||
    !unique(p.questions.map((q) => q.id))
  )
    fail("Pack identifiers must be unique.");
  const codes = p.domains.flatMap((d) => d.objectives.map((o) => o[0]));
  if (!unique(codes)) fail("Objective codes must be unique.");
  for (const d of p.domains) {
    if (
      p.topics.filter((t) => t.domain === d.code).length !== 4 ||
      p.questions.filter((q) => q.objective.split(".")[0] + ".0" === d.code).length !== 10
    )
      fail("Each domain needs four topics and ten questions.");
  }
  for (const t of p.topics) {
    if (
      !p.domains.some((d) => d.code === t.domain) ||
      !t.objectives.every((c) => codes.includes(c) && c.split(".")[0] + ".0" === t.domain)
    )
      fail("Topic mapping is unsupported.");
    if (!p.questions.some((q) => q.topic === t.key)) fail("Every topic needs practice content.");
  }
  for (const q of p.questions) {
    const t = p.topics.find((t) => t.key === q.topic);
    if (!t || !t.objectives.includes(q.objective) || !codes.includes(q.objective))
      fail("Unsupported question mapping: " + q.id);
    if (
      !["EASY", "MEDIUM", "HARD"].includes(q.difficulty) ||
      q.distractors.length !== 3 ||
      !unique([q.correct, ...q.distractors].map((v) => v.trim().toLowerCase()))
    )
      fail("Invalid choices/difficulty: " + q.id);
    if (!q.text.trim() || q.explanation.length < 70)
      fail("Meaningful text/explanation required: " + q.id);
  }
  return {
    topics: 24,
    questions: 60,
    objectives: codes.length,
    coveredObjectives: new Set(p.questions.map((q) => q.objective)).size,
    difficulty: Object.fromEntries(
      ["EASY", "MEDIUM", "HARD"].map((d) => [
        d,
        p.questions.filter((q) => q.difficulty === d).length,
      ]),
    ),
  };
}
export function choices(q, index) {
  const correct = index % 4,
    remaining = [...q.distractors];
  return Array.from({ length: 4 }, (_, i) => ({
    optionKey: String.fromCharCode(65 + i),
    text: i === correct ? q.correct : remaining.shift(),
    isCorrect: i === correct,
  }));
}
export function topicBodies(p) {
  return p.topics.map((t, i) => ({
    slug: t.slug,
    name: p.domains.find((d) => d.code === t.domain).name + ": " + t.title,
    description:
      t.description +
      " Practice activity: " +
      t.lab +
      " CCNA v1.1 domain " +
      t.domain +
      "; objectives " +
      t.objectives.join(", ") +
      ". Pack: " +
      p.packId +
      ".",
    displayOrder: 7001 + i,
    status: "DISABLED",
  }));
}
export function bindingsTemplate(p) {
  return {
    packId: p.packId,
    blueprintId: null,
    domainIds: Object.fromEntries(p.domains.map((d) => [d.code, null])),
    topicIds: Object.fromEntries(p.topics.map((t) => [t.slug, null])),
  };
}
function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...keys].sort().join("|")
  )
    fail("Unexpected/missing binding keys: " + label);
}
export function validateBindings(p, b) {
  exactKeys(b, ["packId", "blueprintId", "domainIds", "topicIds"], "root");
  if (b.packId !== p.packId) fail("Binding packId differs from this reviewed pack.");
  exactKeys(
    b.domainIds,
    p.domains.map((d) => d.code),
    "domains",
  );
  exactKeys(
    b.topicIds,
    p.topics.map((t) => t.slug),
    "topics",
  );
  const entries = [
    ["blueprintId", b.blueprintId],
    ...Object.entries(b.domainIds),
    ...Object.entries(b.topicIds),
  ];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const [key, value] of entries)
    if (typeof value !== "string" || !uuid.test(value))
      fail("Supply a real Admin UUID for binding: " + key);
  if (!unique(entries.map(([, v]) => v.toLowerCase())))
    fail("Repeated binding UUID; review copied identifiers.");
  return b;
}
export function taxonomyBodies(p, b = null) {
  const blueprintId = b?.blueprintId ?? "__BIND_BLUEPRINT_200_301_V1_1__";
  return {
    blueprint: { ...p.blueprint, sourceUrl: p.sourceUrl, verifiedAt: p.verifiedAt },
    domains: p.domains.map((d, i) => ({
      blueprintId,
      code: d.code,
      name: d.name,
      weightPercent: d.weightPercent,
      displayOrder: i + 1,
    })),
    objectives: p.domains.flatMap((d) =>
      d.objectives.map(([code, description], i) => ({
        blueprintId,
        domainId: b?.domainIds[d.code] ?? "__BIND_DOMAIN_" + d.code + "__",
        domainCode: d.code,
        code,
        description,
        displayOrder: i + 1,
      })),
    ),
  };
}
export function questionRecords(p, b = null) {
  return p.questions.map((q, i) => {
    const t = p.topics.find((t) => t.key === q.topic),
      options = choices(q, i),
      record = Object.fromEntries(headers.map((h) => [h, ""]));
    Object.assign(record, {
      topicId: b?.topicIds[t.slug] ?? "__BIND_TOPIC_" + t.key + "__",
      text: q.text,
      difficulty: q.difficulty,
      correctOption: options.find((o) => o.isCorrect).optionKey,
      explanation: q.explanation,
      referenceNotes:
        "Original practice item " +
        q.id +
        "; pack " +
        p.packId +
        "; CCNA 200-301 v1.1; domain " +
        t.domain +
        "; primary objective " +
        q.objective +
        "; " +
        p.sourceUrl,
      blueprintId: b?.blueprintId ?? "__BIND_BLUEPRINT_200_301_V1_1__",
      objectiveCodes: q.objective,
      primaryObjectiveCode: q.objective,
    });
    for (const o of options) record["option" + o.optionKey] = o.text;
    return record;
  });
}
export function csv(records) {
  const quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [headers, ...records.map((r) => headers.map((h) => r[h]))]
      .map((row) => row.map(quote).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
const write = (folder, name, value) => {
  const target = path.join(folder, name);
  if (existsSync(target)) fail("Refusing to overwrite: " + name);
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
};
export function prepare(p) {
  const summary = checkPack(p),
    data = taxonomyBodies(p),
    tick = String.fromCharCode(96);
  const outputs = [
    "blueprint.create.json",
    "domains.create.template.json",
    "objectives.create.template.json",
    "topics.create.json",
    "bindings.example.json",
    "questions.source.csv",
    "questions-review.md",
    "curriculum-plan.md",
    "planned-changes.json",
    "manifest.json",
  ];
  if (outputs.some((name) => existsSync(path.join(directory, name))))
    fail("Prepared files exist; review rather than overwrite.");
  write(directory, "blueprint.create.json", data.blueprint);
  write(directory, "domains.create.template.json", data.domains);
  write(directory, "objectives.create.template.json", data.objectives);
  write(directory, "topics.create.json", topicBodies(p));
  write(directory, "bindings.example.json", bindingsTemplate(p));
  write(directory, "questions.source.csv", csv(questionRecords(p)));
  const review = [
    "# Original CCNA v1.1 pilot questions",
    "",
    "Admin/editor review copy: contains answer keys. No live IDs or actual exam questions.",
    "",
  ];
  p.questions.forEach((q, i) => {
    const t = p.topics.find((t) => t.key === q.topic),
      options = choices(q, i);
    review.push(
      "## " + q.id + " - " + t.title,
      "",
      q.difficulty +
        " | Domain " +
        t.domain +
        " | Primary objective " +
        q.objective +
        " | Topic slug: " +
        tick +
        t.slug +
        tick,
      "",
      q.text,
      "",
      ...options.map((o) => "- **" + o.optionKey + ".** " + o.text),
      "",
      "**Correct: " + options.find((o) => o.isCorrect).optionKey + ".** " + q.explanation,
      "",
    );
  });
  write(directory, "questions-review.md", review.join("\n"));
  const plan = [
    "# CCNA 200-301 v1.1 pilot curriculum",
    "",
    "Original topics; no Official Cert Guide chapter attribution. Ten questions per domain is a balanced pilot, not an exam-weighted simulation.",
    "",
    "Source: [Cisco exam topics](" +
      p.sourceUrl +
      "). Version/codes/weights checked " +
      p.verifiedAt +
      ". Objective descriptions are local navigation summaries, not quotations.",
    "",
    "| Domain | Exam weight | Topics | Questions |",
    "| --- | ---: | ---: | ---: |",
    ...p.domains.map(
      (d) => "| " + d.code + " " + d.name + " | " + d.weightPercent + "% | 4 | 10 |",
    ),
    "",
    "Topic/objective links below are curriculum documentation; the existing database associates objectives with questions, not directly with topics. Topic descriptions retain these references.",
    "",
  ];
  for (const d of p.domains) {
    plan.push("## " + d.code + " " + d.name, "");
    for (const t of p.topics.filter((t) => t.domain === d.code))
      plan.push(
        "### " + t.key + ": " + t.title,
        "",
        "Slug: " + tick + t.slug + tick + "; objectives: " + t.objectives.join(", ") + ".",
        "",
        t.description,
        "",
        "Practice activity: " + t.lab,
        "",
        "Questions: " +
          p.questions
            .filter((q) => q.topic === t.key)
            .map((q) => q.id)
            .join(", ") +
          ".",
        "",
      );
    plan.push(
      "Objectives without a pilot question: " +
        (d.objectives
          .map((o) => o[0])
          .filter((c) => !p.questions.some((q) => q.objective === c))
          .join(", ") || "none") +
        ".",
      "",
    );
  }
  plan.push(
    "Difficulty: " +
      summary.difficulty.EASY +
      " easy, " +
      summary.difficulty.MEDIUM +
      " medium, " +
      summary.difficulty.HARD +
      " hard. " +
      summary.coveredObjectives +
      "/" +
      summary.objectives +
      " parent objectives have a question; this is not complete exam coverage.",
    "",
  );
  write(directory, "curriculum-plan.md", plan.join("\n"));
  write(directory, "planned-changes.json", {
    packId: p.packId,
    approvalRequired: true,
    newRecordsMaximum: {
      blueprints: 1,
      domains: 6,
      objectives: summary.objectives,
      topics: 24,
      questions: 60,
      questionOptions: 240,
      initialQuestionRevisions: 60,
      questionObjectiveMappings: 60,
    },
    creationStatuses: { blueprint: "DRAFT", topics: "DISABLED", questions: "DISABLED" },
    optionalPublicationOnlyForNewPackRecords: {
      blueprint: "ACTIVE",
      topics: "ACTIVE",
      questions: "ACTIVE",
      requiresExplicitApproval: true,
    },
    reusePolicy:
      "Reuse only verified exact natural-key matches unchanged; stop on conflicts/ambiguity.",
    legacyRecordChanges: [],
    deletions: [],
    migrations: [],
    grants: [],
  });
  const sourceNames = [
    "source/curriculum.json",
    ...Array.from({ length: 6 }, (_, i) => "source/questions-d" + (i + 1) + ".json"),
  ];
  write(directory, "manifest.json", {
    packId: p.packId,
    ...summary,
    hashes: Object.fromEntries(
      [...sourceNames, ...outputs.filter((n) => n !== "manifest.json")].map((n) => [
        n,
        createHash("sha256")
          .update(readFileSync(path.join(directory, n)))
          .digest("hex"),
      ]),
    ),
  });
  return summary;
}
export function bind(p, b, folder) {
  checkPack(p);
  validateBindings(p, b);
  verifyManifest();
  const data = taxonomyBodies(p, b);
  write(folder, "domains.create.json", data.domains);
  write(folder, "objectives.create.json", data.objectives);
  write(folder, "questions.import.csv", csv(questionRecords(p, b)));
  write(folder, "binding-receipt.json", {
    packId: p.packId,
    bindings: b,
    verification: "Offline shape check only; Admin preview verifies database membership.",
    sourceHashes: JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")).hashes,
  });
}
export function verifyManifest() {
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  for (const [name, expected] of Object.entries(manifest.hashes)) {
    if (name.includes("..") || path.isAbsolute(name)) fail("Unsafe manifest path.");
    if (
      createHash("sha256")
        .update(readFileSync(path.join(directory, name)))
        .digest("hex") !== expected
    )
      fail("Reviewed content changed: " + name);
  }
  return true;
}
function main() {
  const root = realpathSync(path.resolve(directory, "../../.."));
  if (
    root.replaceAll("\\", "/").toLowerCase() !== portableRoot.toLowerCase() ||
    realpathSync(process.cwd()).toLowerCase() !== root.toLowerCase()
  )
    fail("Run from the approved workspace.");
  const p = readPack(),
    [mode = "--check", bindingPath, ...extra] = process.argv.slice(2);
  if (extra.length) fail("Unexpected arguments.");
  if (mode === "--check" && !bindingPath)
    console.log(
      JSON.stringify({
        status: "PASS",
        ...checkPack(p),
        manifestVerified: existsSync(path.join(directory, "manifest.json"))
          ? verifyManifest()
          : false,
        databaseActions: 0,
      }),
    );
  else if (mode === "--prepare" && !bindingPath)
    console.log(JSON.stringify({ status: "PASS", ...prepare(p), databaseActions: 0 }));
  else if (mode === "--bind" && bindingPath) {
    const source = realpathSync(path.resolve(bindingPath));
    if (!source.toLowerCase().startsWith(directory.toLowerCase() + path.sep))
      fail("Bindings must remain in the content folder.");
    const b = JSON.parse(readFileSync(source, "utf8"));
    validateBindings(p, b);
    verifyManifest();
    const folder = path.join(directory, "bound", String(Date.now()));
    mkdirSync(folder, { recursive: true });
    bind(p, b, folder);
    console.log(JSON.stringify({ status: "PASS", output: folder, databaseActions: 0 }));
  } else fail("Use --check, --prepare, or --bind <bindings.json>; no execution mode exists.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
