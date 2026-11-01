import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// Offline only: all OS catalog/listener commands are mocked; no DB or server starts.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { taxonomyTables, assessTaxonomyPrivileges, taxonomyPrivileges } from "./upgrade.mjs";
import { serviceFailureInvariant } from "./policy.mjs";

const permissions = () =>
  taxonomyTables.map((name) => ({
    name,
    select: true,
    insert: true,
    update: true,
    delete: name === "question_objectives",
    truncate: false,
    references: false,
    trigger: false,
  }));
const other = { schema_usage: true, type_usage: true, code_usage: true, code_update: false };

test("actual taxonomy privilege reader accepts exactly the approved runtime grants", async () => {
  const calls = [];
  const result = await taxonomyPrivileges({
    query: async (sql, params) => {
      calls.push({ sql, params });
      assert(sql.trim().startsWith("SELECT"));
      assert.equal(params[0], "ccna_phase6a_app");
      return { rows: sql.includes("FROM pg_class") ? permissions() : [other] };
    },
  });
  assert.deepEqual(result, { ready: true, missing: [], unsafe: [] });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params[1], taxonomyTables);
});
for (const row of permissions())
  for (const key of ["select", "insert", "update", "delete", "truncate", "references", "trigger"])
    test("rejects missing or unauthorized taxonomy privilege " + row.name + ":" + key, () => {
      const rows = permissions();
      rows.find((r) => r.name === row.name)[key] = !row[key];
      const result = assessTaxonomyPrivileges(rows, other);
      assert.equal(result.ready, false);
      assert.deepEqual(row[key] ? result.missing : result.unsafe, [
        row.name + ":" + key.toUpperCase(),
      ]);
    });
for (const key of Object.keys(other))
  test("rejects taxonomy type/schema/sequence mismatch " + key, () => {
    assert.equal(
      assessTaxonomyPrivileges(permissions(), { ...other, [key]: !other[key] }).ready,
      false,
    );
  });
test("unknown or missing taxonomy privilege metadata fails closed", () => {
  assert.throws(() => assessTaxonomyPrivileges(permissions().slice(1), other), /inventory/);
  const rows = permissions();
  rows[0].select = "true";
  assert.throws(() => assessTaxonomyPrivileges(rows, other), /Unverified taxonomy privilege/);
});

const script = fileURLToPath(new URL("./verify-service.ps1", import.meta.url));
const quoted = (value) => "'" + value.replaceAll("'", "''") + "'";
function osFixture() {
  return {
    service: {
      State: "Running",
      ProcessId: 400,
      PathName:
        '"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe" runservice -N "postgresql-x64-18" -D "C:\\Program Files\\PostgreSQL\\18\\data" -w',
    },
    postgres: { Name: "postgres.exe", ParentProcessId: 400 },
    api: {
      Name: "node.exe",
      ExecutablePath: "C:\\Program Files\\nodejs\\node.exe",
      CommandLine:
        "\"C:\\Program Files\\nodejs\\node.exe\" \"" + workspaceRoot + "\\tools\\phase6a-local\\run.mjs\" api --start",
    },
    listeners: [
      { LocalPort: 5432, LocalAddress: "127.0.0.1", OwningProcess: 401 },
      { LocalPort: 3000, LocalAddress: "127.0.0.1", OwningProcess: 31536 },
    ],
  };
}
function verify(fixture) {
  const command = `$global:offlineRuntimeFixture = ${quoted(JSON.stringify(fixture))} | ConvertFrom-Json
function Get-CimInstance { param($Filter)
  if ($Filter -like 'Name=*') { return $global:offlineRuntimeFixture.service }
  if ($Filter -eq 'ProcessId=401') { return $global:offlineRuntimeFixture.postgres }
  if ($Filter -eq 'ProcessId=31536') {
    if ($global:offlineRuntimeFixture.privateFailure) { throw 'private credential sentinel' }
    return $global:offlineRuntimeFixture.api
  }
  throw 'Unexpected mocked process lookup'
}
function Get-NetTCPConnection { param($State) return $global:offlineRuntimeFixture.listeners }
function Get-Command { param($Name) if ($Name -ne 'node.exe') { throw 'Unexpected executable lookup' }; return [pscustomobject]@{Source='C:\\Program Files\\nodejs\\node.exe'} }
& ${quoted(script)} -CheckApi`;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
}
test("OS-only verifier accepts the exact guarded listener and command with mocked Windows APIs", () => {
  const result = verify(osFixture());
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
for (const [name, change, expected] of [
  [
    "missing process metadata",
    (f) => {
      f.api.ExecutablePath = null;
      f.api.CommandLine = null;
    },
    "api-process-metadata",
  ],
  [
    "another runtime",
    (f) => {
      f.api.CommandLine = "node other-api.mjs";
    },
    "api-process-identity",
  ],
  [
    "wrong executable",
    (f) => {
      f.api.ExecutablePath = "C:\\Other\\node.exe";
    },
    "api-process-identity",
  ],
  [
    "non-loopback API",
    (f) => {
      f.listeners[1].LocalAddress = "0.0.0.0";
    },
    "api-listener-identity",
  ],
  [
    "unexpected service",
    (f) => {
      f.service.State = "Stopped";
    },
    "postgres-service-identity",
  ],
  [
    "unreadable process",
    (f) => {
      f.privateFailure = true;
    },
    "api-process-inspection",
  ],
])
  test("OS verifier refuses " + name + " with only a safe invariant", () => {
    const fixture = osFixture();
    change(fixture);
    const result = verify(fixture);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(serviceFailureInvariant(result), expected);
    assert(!result.stderr.includes("private credential sentinel"));
    assert(!result.stderr.includes("other-api.mjs"));
  });
test("port/API-identity failures cannot keep the obsolete postgres-preflight stage", () => {
  const source = readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
  assert(source.includes("stage='api-port-availability'; await portsFree(3000)"));
  assert(source.includes("stage='api-service-identity'; serviceCheck(true)"));
  assert(source.includes("stage='frontend-port-availability'; await portsFree(8080)"));
  assert(source.includes("onStage:next=>{stage=next;}"));
});
