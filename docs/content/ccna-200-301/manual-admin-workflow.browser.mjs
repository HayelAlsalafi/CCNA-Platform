// Operator-invoked only. No work runs on import. Uses existing protected Admin APIs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message) => {
  throw Error(message);
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const one = (rows, label) => {
  if (rows.length > 1) fail("Ambiguous " + label);
  return rows[0];
};
const match = (row, body, fields, label) => {
  if (fields.some((k) => row[k] !== body[k]))
    fail("Conflicting " + label + "; preserve it and stop.");
};

export function planSetup(p, catalog, topics, ownedTopicIds = []) {
  const blueprint = one(
    catalog.blueprints.filter(
      (b) => b.examCode === p.blueprint.examCode && b.version === p.blueprint.version,
    ),
    "blueprint",
  );
  if (blueprint) {
    match(blueprint, p.blueprint, ["title", "sourceUrl"], "blueprint");
    if (
      !["DRAFT", "ACTIVE"].includes(blueprint.status) ||
      !blueprint.verifiedAt ||
      !Number.isFinite(Date.parse(blueprint.verifiedAt))
    )
      fail("Existing blueprint is retired or unverified; stop.");
  }
  const domains = [],
    objectives = [],
    topicRows = [],
    labelDifferences = [];
  for (const body of p.domains) {
    const row = blueprint
      ? one(
          catalog.domains.filter((d) => d.blueprintId === blueprint.id && d.code === body.code),
          "domain " + body.code,
        )
      : null;
    if (row) match(row, body, ["code", "name", "weightPercent"], "domain " + body.code);
    domains.push({ body, row });
  }
  if (
    blueprint &&
    catalog.domains.some(
      (d) => d.blueprintId === blueprint.id && !p.domains.some((b) => b.code === d.code),
    )
  )
    fail("Unexpected blueprint domain; stop.");
  for (const body of p.objectives) {
    const parent = domains.find((d) => d.body.code === body.domainCode);
    const row = blueprint
      ? one(
          catalog.objectives.filter((o) => o.blueprintId === blueprint.id && o.code === body.code),
          "objective " + body.code,
        )
      : null;
    if (row) {
      if (
        !parent.row ||
        row.domainId !== parent.row.id ||
        row.domainCode !== body.domainCode ||
        !row.description?.trim()
      )
        fail("Conflicting objective binding: " + body.code);
      if (row.description !== body.description)
        labelDifferences.push({
          code: body.code,
          existing: row.description,
          pilot: body.description,
        });
    }
    objectives.push({ body, row });
  }
  for (const body of p.topics) {
    const row = one(
      topics.filter((t) => t.slug === body.slug),
      "topic " + body.slug,
    );
    if (row) {
      match(row, body, ["slug", "name", "description", "displayOrder"], "topic " + body.slug);
      if (row.status !== "ACTIVE" && !ownedTopicIds.includes(row.id))
        fail(
          "Existing DISABLED topic is not owned by this run: " +
            body.slug +
            ". Do not activate it automatically.",
        );
    }
    topicRows.push({ body, row });
  }
  return {
    blueprint,
    domains,
    objectives,
    topics: topicRows,
    labelDifferences,
    createCounts: {
      blueprints: blueprint ? 0 : 1,
      domains: domains.filter((x) => !x.row).length,
      objectives: objectives.filter((x) => !x.row).length,
      topics: topicRows.filter((x) => !x.row).length,
    },
  };
}
export function expectedQuestions(p, bindings) {
  return p.questions.map((q, i) => {
    const topic = p.topicMeta.find((t) => t.key === q.topic),
      correct = i % 4,
      remaining = [...q.distractors];
    return {
      pilotId: q.id,
      topicId: bindings.topicIds[topic.slug],
      text: q.text,
      difficulty: q.difficulty,
      type: "MULTIPLE_CHOICE_SINGLE",
      explanation: q.explanation,
      imageKey: null,
      referenceNotes:
        "Original practice item " +
        q.id +
        "; pack " +
        p.packId +
        "; CCNA 200-301 v1.1; domain " +
        topic.domain +
        "; primary objective " +
        q.objective +
        "; " +
        p.blueprint.sourceUrl,
      objective: q.objective,
      options: Array.from({ length: 4 }, (_, j) => ({
        optionKey: String.fromCharCode(65 + j),
        text: j === correct ? q.correct : remaining.shift(),
        isCorrect: j === correct,
      })),
    };
  });
}
export function assertQuestion(row, expected) {
  match(
    row,
    expected,
    ["topicId", "text", "difficulty", "type", "explanation", "imageKey", "referenceNotes"],
    "imported question " + row.id,
  );
  if (!["ACTIVE", "DISABLED"].includes(row.status) || row.options.length !== 4)
    fail("Unexpected imported question status/options.");
  for (const option of expected.options) {
    const actual = one(
      row.options.filter((o) => o.optionKey === option.optionKey),
      "answer option",
    );
    if (!actual || actual.text !== option.text || actual.isCorrect !== option.isCorrect)
      fail("Imported answers changed; stop.");
  }
}
export function createWorkflow(p, api, saveReceipt = () => {}, previous = null) {
  const receipt = previous
    ? clone(previous)
    : {
        format: 1,
        packId: p.packId,
        sourceDigest: p.sourceDigest,
        runId: String(Date.now()),
        startedAt: new Date().toISOString(),
        newBlueprintId: null,
        newTopicIds: [],
        newDomainIds: [],
        newObjectiveIds: [],
        importedQuestionIds: [],
        publishedQuestionIds: [],
        publishedTopicIds: [],
        bindings: null,
        pendingWrite: null,
      };
  if (
    receipt.packId !== p.packId ||
    receipt.sourceDigest !== p.sourceDigest ||
    receipt.format !== 1
  )
    fail("Receipt does not match this reviewed pack.");
  for (const key of [
    "newTopicIds",
    "newDomainIds",
    "newObjectiveIds",
    "importedQuestionIds",
    "publishedQuestionIds",
    "publishedTopicIds",
  ])
    if (
      !Array.isArray(receipt[key]) ||
      new Set(receipt[key]).size !== receipt[key].length ||
      receipt[key].some((id) => !UUID.test(id))
    )
      fail("Invalid receipt IDs.");
  if (receipt.newTopicIds.length > 24 || receipt.importedQuestionIds.length > 60)
    fail("Receipt exceeds approved scope.");
  let reviewed = null,
    preparedCatalog = null,
    preparedTopics = null,
    busy = false;
  const persist = () => saveReceipt(clone(receipt));
  const guarded = async (action) => {
    if (busy) fail("Another operator action is running.");
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  };
  async function readPlan() {
    const catalog = await api("/api/admin/taxonomy"),
      topics = await api("/api/admin/topics");
    return { catalog, topics, plan: planSetup(p, catalog, topics, receipt.newTopicIds) };
  }
  async function mutate(url, method, body) {
    receipt.pendingWrite = { url, method, body: clone(body) };
    persist();
    const result = await api(url, { method, body });
    return result;
  }
  function confirmed() {
    receipt.pendingWrite = null;
    persist();
  }
  function noUncertainWrite() {
    if (receipt.pendingWrite)
      fail(
        "An earlier write has uncertain completion. Download the receipt and review its pendingWrite in Admin; do not retry automatically.",
      );
  }
  function assertBindings() {
    if (
      !receipt.bindings ||
      !UUID.test(receipt.bindings.blueprintId) ||
      p.topics.some((t) => !UUID.test(receipt.bindings.topicIds[t.slug]))
    )
      fail("Complete setup before import/publication.");
  }
  function assertOwned(row) {
    const created = Date.parse(row?.createdAt),
      started = Date.parse(receipt.startedAt);
    if (!row || !Number.isFinite(created) || !Number.isFinite(started) || created < started - 60000)
      fail("Receipt record predates this run or lacks creation evidence; stop.");
  }
  async function inspect() {
    const state = await readPlan();
    if (receipt.bindings) {
      assertBindings();
      if (
        Object.values(state.plan.createCounts).some((n) => n !== 0) ||
        state.plan.blueprint?.id !== receipt.bindings.blueprintId ||
        state.plan.domains.some((d) => d.row?.id !== receipt.bindings.domainIds[d.body.code]) ||
        state.plan.topics.some((t) => t.row?.id !== receipt.bindings.topicIds[t.body.slug])
      )
        fail("Restored bindings differ from the current catalog; stop.");
      preparedCatalog = state.catalog;
      preparedTopics = state.topics;
    }
    reviewed = JSON.stringify(state);
    return clone({
      runId: receipt.runId,
      createCounts: state.plan.createCounts,
      reusedObjectiveDescriptions: state.plan.labelDifferences,
    });
  }
  async function createSetup({ reviewedReuse = false } = {}) {
    return guarded(async () => {
      noUncertainWrite();
      if (!reviewed) fail("Run inspect() and review its plan first.");
      const current = await readPlan();
      if (JSON.stringify(current) !== reviewed)
        fail("Catalog changed since inspect(); inspect again before writing.");
      if (current.plan.labelDifferences.length && !reviewedReuse)
        fail("Review differing existing objective descriptions before confirming reuse.");
      let blueprint = current.plan.blueprint;
      if (!blueprint) {
        blueprint = await mutate("/api/admin/taxonomy/blueprints", "POST", p.blueprint);
        if (!UUID.test(blueprint.id)) fail("Invalid blueprint response; stop.");
        match(
          blueprint,
          p.blueprint,
          ["examCode", "version", "title", "sourceUrl", "status"],
          "created blueprint",
        );
        receipt.newBlueprintId = blueprint.id;
        confirmed();
      }
      const domainIds = {},
        topicIds = {};
      for (const entry of current.plan.domains) {
        let row = entry.row;
        const body = { ...entry.body, blueprintId: blueprint.id };
        if (!row) {
          row = await mutate("/api/admin/taxonomy/domains", "POST", body);
          if (!UUID.test(row.id)) fail("Invalid domain response.");
          match(row, body, Object.keys(body), "created domain");
          receipt.newDomainIds.push(row.id);
          confirmed();
        }
        domainIds[body.code] = row.id;
      }
      for (const entry of current.plan.objectives) {
        if (entry.row) continue;
        const body = {
          ...entry.body,
          blueprintId: blueprint.id,
          domainId: domainIds[entry.body.domainCode],
        };
        const row = await mutate("/api/admin/taxonomy/objectives", "POST", body);
        if (!UUID.test(row.id)) fail("Invalid objective response.");
        match(row, body, Object.keys(body), "created objective");
        receipt.newObjectiveIds.push(row.id);
        confirmed();
      }
      for (const entry of current.plan.topics) {
        let row = entry.row;
        if (!row) {
          row = await mutate("/api/admin/topics", "POST", entry.body);
          if (!UUID.test(row.id)) fail("Invalid topic response.");
          match(row, entry.body, Object.keys(entry.body), "created topic");
          receipt.newTopicIds.push(row.id);
          confirmed();
        }
        topicIds[entry.body.slug] = row.id;
      }
      receipt.bindings = { packId: p.packId, blueprintId: blueprint.id, domainIds, topicIds };
      persist();
      const final = await readPlan();
      preparedCatalog = final.catalog;
      preparedTopics = final.topics;
      if (Object.values(final.plan.createCounts).some((n) => n !== 0))
        fail("Setup is incomplete; stop.");
      return {
        runId: receipt.runId,
        created: {
          blueprints: receipt.newBlueprintId ? 1 : 0,
          domains: receipt.newDomainIds.length,
          objectives: receipt.newObjectiveIds.length,
          topics: receipt.newTopicIds.length,
        },
        bindingsReady: true,
      };
    });
  }
  function snapshot() {
    assertBindings();
    if (!preparedCatalog || !preparedTopics)
      fail("Complete setup in this page before exporting catalog.");
    return {
      packId: p.packId,
      blueprints: preparedCatalog.blueprints.filter((b) => b.id === receipt.bindings.blueprintId),
      domains: preparedCatalog.domains.filter(
        (d) => d.blueprintId === receipt.bindings.blueprintId,
      ),
      objectives: preparedCatalog.objectives.filter(
        (o) => o.blueprintId === receipt.bindings.blueprintId,
      ),
      topics: preparedTopics.filter((t) => Object.values(receipt.bindings.topicIds).includes(t.id)),
    };
  }
  async function markImport() {
    noUncertainWrite();
    assertBindings();
    if (receipt.importedQuestionIds.length) fail("Import IDs already recorded; do not reimport.");
    receipt.importStartedAt = new Date().toISOString();
    persist();
    return { runId: receipt.runId, readyForUiImport: true };
  }
  async function readImported(ids) {
    assertBindings();
    const expected = expectedQuestions(p, receipt.bindings),
      found = [];
    for (const topicId of new Set(expected.map((q) => q.topicId))) {
      for (let offset = 0; offset <= 10000; offset += 100) {
        const page = await api(
          "/api/admin/questions?topicId=" +
            encodeURIComponent(topicId) +
            "&limit=100&offset=" +
            offset,
        );
        if (!Array.isArray(page.items) || !Number.isInteger(page.total))
          fail("Unexpected question-list response.");
        found.push(...page.items.filter((q) => ids.includes(q.id)));
        if (offset + page.items.length >= page.total) break;
        if (!page.items.length || offset === 10000)
          fail("Question pagination exceeded safe bound.");
      }
    }
    if (found.length !== ids.length || new Set(found.map((q) => q.id)).size !== ids.length)
      fail("Import IDs do not match the bound topics.");
    const used = new Set();
    for (const row of found) {
      const q = one(
        expected.filter((q) => q.topicId === row.topicId && q.text === row.text),
        "pilot question stem",
      );
      if (!q || used.has(q.pilotId)) fail("Question is not a unique reviewed pilot item.");
      assertQuestion(row, q);
      used.add(q.pilotId);
      const created = Date.parse(row.createdAt),
        started = Date.parse(receipt.importStartedAt);
      if (!Number.isFinite(created) || !Number.isFinite(started) || created < started - 60000)
        fail("Question predates this import; do not publish it.");
      const mappings = await api("/api/admin/taxonomy/questions/" + row.id + "/objectives");
      const objective = preparedCatalog?.objectives.find(
        (o) => o.blueprintId === receipt.bindings.blueprintId && o.code === q.objective,
      );
      if (
        !objective ||
        mappings.length !== 1 ||
        mappings[0].objectiveId !== objective.id ||
        mappings[0].blueprintId !== receipt.bindings.blueprintId ||
        mappings[0].isPrimary !== true
      )
        fail("Imported objective mapping differs from the reviewed CSV.");
    }
    return found;
  }
  async function recordImportedIds(ids) {
    return guarded(async () => {
      noUncertainWrite();
      if (
        !Array.isArray(ids) ||
        ids.length !== p.questions.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !UUID.test(id))
      )
        fail("Expected the exact unique IDs returned by the clean 60-row UI import.");
      if (
        receipt.importedQuestionIds.length &&
        JSON.stringify([...ids].sort()) !== JSON.stringify([...receipt.importedQuestionIds].sort())
      )
        fail("Do not replace recorded import IDs.");
      await readImported(ids);
      receipt.importedQuestionIds = [...ids];
      persist();
      return { verifiedImportedQuestions: ids.length };
    });
  }
  async function publish() {
    return guarded(async () => {
      noUncertainWrite();
      assertBindings();
      if (receipt.importedQuestionIds.length !== p.questions.length)
        fail("Record and verify the UI import IDs before publication.");
      const current = await readPlan();
      preparedCatalog = current.catalog;
      preparedTopics = current.topics;
      const questions = await readImported(receipt.importedQuestionIds);
      for (const row of questions) {
        if (row.status === "DISABLED") {
          const result = await mutate("/api/admin/questions/" + row.id, "PATCH", {
            status: "ACTIVE",
          });
          const expected = expectedQuestions(p, receipt.bindings).find(
            (q) => q.topicId === row.topicId && q.text === row.text,
          );
          assertQuestion(result, expected);
          if (result.id !== row.id || result.status !== "ACTIVE")
            fail("Question publication verification failed.");
          receipt.publishedQuestionIds.push(row.id);
          confirmed();
        }
      }
      for (const id of receipt.newTopicIds) {
        const row = one(
            current.topics.filter((t) => t.id === id),
            "created topic",
          ),
          body = p.topics.find((t) => t.slug === row?.slug);
        assertOwned(row);
        if (!row || !body || receipt.bindings.topicIds[body.slug] !== id)
          fail("Receipt topic binding changed.");
        match(row, body, ["slug", "name", "description", "displayOrder"], "pilot topic");
        if (row.status === "DISABLED") {
          const result = await mutate("/api/admin/topics/" + id, "PATCH", { status: "ACTIVE" });
          match(result, body, ["slug", "name", "description", "displayOrder"], "published topic");
          if (result.id !== id || result.status !== "ACTIVE")
            fail("Topic publication verification failed.");
          receipt.publishedTopicIds.push(id);
          confirmed();
        } else if (row.status !== "ACTIVE") fail("Unexpected topic status.");
      }
      if (receipt.newBlueprintId) {
        const bp = current.catalog.blueprints.find((b) => b.id === receipt.newBlueprintId);
        assertOwned(bp);
        if (bp?.id !== receipt.bindings.blueprintId) fail("Created blueprint binding changed.");
        match(
          bp,
          p.blueprint,
          ["examCode", "version", "title", "sourceUrl", "verifiedAt"],
          "created blueprint metadata",
        );
        if (bp.status === "DRAFT") {
          const result = await mutate("/api/admin/taxonomy/blueprints/" + bp.id, "PUT", {
            ...p.blueprint,
            status: "ACTIVE",
          });
          if (result.id !== bp.id || result.status !== "ACTIVE")
            fail("Blueprint activation verification failed.");
          confirmed();
        } else if (bp.status !== "ACTIVE") fail("Unexpected blueprint status.");
      }
      const final = await readPlan();
      preparedCatalog = final.catalog;
      preparedTopics = final.topics;
      const verified = await readImported(receipt.importedQuestionIds);
      if (
        verified.some((q) => q.status !== "ACTIVE") ||
        p.topics.some(
          (t) =>
            final.topics.find((row) => row.id === receipt.bindings.topicIds[t.slug])?.status !==
            "ACTIVE",
        )
      )
        fail("Final learner visibility verification failed.");
      return {
        runId: receipt.runId,
        activePilotQuestions: verified.length,
        activePilotTopics: p.topics.length,
        existingContentRecordsModified: 0,
      };
    });
  }
  return {
    inspect,
    createSetup,
    markImport,
    recordImportedIds,
    publish,
    snapshot,
    receipt: () => clone(receipt),
  };
}

export async function connect() {
  if (
    !["http://localhost:8080", "http://127.0.0.1:8080"].includes(location.origin) ||
    !location.pathname.startsWith("/admin")
  )
    fail("Run only in the local Admin page.");
  const clerk = window.Clerk,
    sessionId = clerk?.session?.id,
    userId = clerk?.user?.id;
  if (!sessionId || !userId || typeof clerk.session.getToken !== "function")
    fail("Sign in through the existing Clerk UI first.");
  const checkActor = () => {
    if (clerk.session?.id !== sessionId || clerk.user?.id !== userId)
      fail("Session changed; stop and reconnect.");
  };
  const api = async (url, { method = "GET", body } = {}) => {
    checkActor();
    if (
      !/^\/api\/(?:auth\/me|admin\/(?:access|taxonomy(?:\/.*)?|topics(?:\/[0-9a-f-]+)?|questions(?:[/?].*)?))$/.test(
        url,
      ) ||
      !["GET", "POST", "PATCH", "PUT"].includes(method)
    )
      fail("Unsupported Admin request.");
    let token = await clerk.session.getToken();
    checkActor();
    if (!token) fail("Session token unavailable.");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + token,
          "X-Admin-Session": sessionId,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      checkActor();
      if (!response.ok)
        fail(
          "Admin API " +
            method +
            " failed with HTTP " +
            response.status +
            ". Stop; no automatic retry.",
        );
      return await response.json();
    } finally {
      clearTimeout(timer);
      token = null;
    }
  };
  const me = await api("/api/auth/me"),
    access = await api("/api/admin/access");
  if (
    me.user?.role !== "ADMIN" ||
    me.user?.status !== "ACTIVE" ||
    access.allowed !== true ||
    access.role !== "ADMIN"
  )
    fail("Server did not grant active ADMIN access.");
  const base = new URL("./", import.meta.url).href;
  async function file(name, hash = null) {
    const response = await fetch(base + name, { cache: "no-store" });
    if (!response.ok) fail("Cannot read prepared file: " + name);
    const bytes = await response.arrayBuffer();
    if (hash) {
      const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (actual !== hash) fail("Prepared file hash changed: " + name);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const manifest = await file("manifest.json");
  if (
    manifest.packId !== "ccna-200-301-v1.1-sprint7-pilot-v1" ||
    manifest.topics !== 24 ||
    manifest.questions !== 60 ||
    manifest.objectives !== 53
  )
    fail("Wrong pilot manifest.");
  const reviewed = (name) =>
    file(name, manifest.hashes[name] ?? fail("File is not in the reviewed manifest."));
  const curriculum = await reviewed("source/curriculum.json");
  const p = {
    packId: manifest.packId,
    sourceDigest: JSON.stringify(manifest.hashes),
    blueprint: await reviewed("blueprint.create.json"),
    domains: await reviewed("domains.create.template.json"),
    objectives: await reviewed("objectives.create.template.json"),
    topics: await reviewed("topics.create.json"),
    topicMeta: curriculum.topics,
    questions: (
      await Promise.all(
        Array.from({ length: 6 }, (_, i) => reviewed("source/questions-d" + (i + 1) + ".json")),
      )
    ).flat(),
  };
  if (
    p.topics.length !== 24 ||
    p.domains.length !== 6 ||
    p.objectives.length !== 53 ||
    p.questions.length !== 60
  )
    fail("Wrong pack content counts.");
  const key = "ccna-sprint7-approved-receipt-v1",
    stored = sessionStorage.getItem(key),
    previous = stored ? JSON.parse(stored) : null;
  if (previous && previous.actorUserId !== userId)
    fail("Receipt belongs to another account; preserve it and stop.");
  const workflow = createWorkflow(
    p,
    api,
    (r) => sessionStorage.setItem(key, JSON.stringify({ ...r, actorUserId: userId })),
    previous,
  );
  function download(kind) {
    checkActor();
    const receipt = workflow.receipt();
    const value =
      kind === "bindings"
        ? receipt.bindings
        : kind === "catalog"
          ? workflow.snapshot()
          : kind === "receipt"
            ? { ...receipt, actorUserId: userId }
            : fail("Unknown export.");
    if (!value) fail("Complete setup before downloading bindings.");
    const filename = "sprint7-" + kind + "-" + receipt.runId + ".json",
      url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }),
      );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }
  function captureImportedIds() {
    if (location.pathname !== "/admin/import") fail("Use the completed Bulk import page.");
    const panel = document.querySelector(".import-success");
    const details =
      panel &&
      [...panel.querySelectorAll("details")].find(
        (d) => d.querySelector("summary")?.textContent?.trim() === "Imported question IDs",
      );
    if (!details) fail("No completed UI import result found.");
    return workflow.recordImportedIds(
      [...details.querySelectorAll("code")].map((node) => node.textContent.trim()),
    );
  }
  return { ...workflow, download, captureImportedIds };
}
