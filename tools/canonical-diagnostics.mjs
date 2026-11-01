import { createHash } from "node:crypto";
// Only metadata assertion deltas. Driver errors, row data and connection objects
// are never accepted by this formatter.
export function metadataDiagnostic(error) {
  if (
    error?.constructor?.name === "LocalRuntimeError" ||
    /^(Nexus|Learning) invariant:/.test(error?.message ?? "")
  )
    return { invariant: error.message.slice(0, 300) };
  if (error?.code !== "ERR_ASSERTION") return undefined;
  const safe = (value) =>
    typeof value === "string"
      ? /^[a-zA-Z0-9_(). ,:\[\]-]{1,100}$/.test(value)
        ? value
        : { sha256: createHash("sha256").update(value).digest("hex"), length: value.length }
      : ["boolean", "number"].includes(typeof value) || value === null
        ? value
        : value === undefined
          ? "MISSING"
          : "STRUCTURE";
  const differences = [];
  function walk(a, b, path) {
    if (differences.length >= 12 || Object.is(a, b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk(a[key], b[key], path + "." + key);
    } else differences.push({ field: path, actual: safe(a), expected: safe(b) });
  }
  walk(error.actual, error.expected, "metadata");
  return {
    invariant: error.message.split("\n")[0].slice(0, 160),
    source: (error.stack ?? "")
      .split("\n")
      .filter((line) => /tools[\\/].+\.mjs:\d+/.test(line))
      .slice(0, 3)
      .map((line) => line.trim()),
    differences,
  };
}
