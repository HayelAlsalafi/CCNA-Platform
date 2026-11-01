import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
// Fixed private target. No connection or mutation on import.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { privateHba } from "../taxonomy-rehearsal/safety.mjs";
import { sterileEnvironment } from "../question-bank-disposable-access.mjs";
export const isolated = Object.freeze({
  host: "127.0.0.1",
  port: 55440,
  database: "ccna_study_0014_rehearsal_20261028_c61edf950aa5",
  owner: "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170",
  systemIdentifier: "7695735287099484548",
});
export const backupRelative =
  ".local/question-bank-upgrade/study-2026-10-28T13-00-40.345Z-fab6cddb-244f-4569-a35b-be3b582e25f7/study-backup.json";
export const backupHash = "adbf25e98a8f9473251a86d1c8e2e5fcd2b1ad77c345b6d0c26e92458193eaf8";
export const bin = "C:/Program Files/PostgreSQL/18/bin/";
export function privateConnection(database) {
  assert(
    ["postgres", isolated.database].includes(database),
    "Only private maintenance/new disposable DB permitted",
  );
  return {
    host: isolated.host,
    port: isolated.port,
    database,
    user: isolated.owner,
    password: async () => {
      throw Error("Private authentication unexpectedly requested a password");
    },
    ssl: false,
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    options:
      "-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=120000",
    application_name: "ccna-study-0014-isolated",
  };
}
export function runningPrivate(root) {
  const normal = (p) => p.replaceAll("\\", "/").toLowerCase();
  assert.equal(normal(realpathSync(root)), portableRoot.toLowerCase());
  const cluster = path.join(
      root,
      ".local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170",
    ),
    data = path.join(cluster, "data"),
    env = sterileEnvironment();
  assert.equal(normal(realpathSync(data)), normal(data));
  const marker = JSON.parse(
    readFileSync(path.join(cluster, "owner.json"), "utf8").replace(/^\uFEFF/, ""),
  );
  assert.deepEqual(marker, {
    nonce: "8e6c4b9a2170",
    database: "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170",
    owner: isolated.owner,
    port: 55440,
    dataDirectory: data,
  });
  const pid = readFileSync(path.join(data, "postmaster.pid"), "utf8").trim().split(/\r?\n/);
  assert.equal(normal(pid[1]), normal(data));
  assert.equal(Number(pid[3]), 55440);
  const listener = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$x=@(Get-NetTCPConnection -LocalPort 55440 -State Listen -ErrorAction Stop);if($x.Count -ne 1){throw 'Unexpected listener'};[pscustomobject]@{host=$x[0].LocalAddress;pid=$x[0].OwningProcess;exe=(Get-Process -Id $x[0].OwningProcess).Path}|ConvertTo-Json -Compress",
      ],
      { env, encoding: "utf8", timeout: 15000, windowsHide: true },
    ),
  );
  assert.equal(listener.host, "127.0.0.1");
  assert.equal(listener.pid, Number(pid[0]));
  assert.equal(normal(listener.exe), normal(bin + "postgres.exe"));
  assert.equal(
    createHash("sha256").update(readFileSync(listener.exe)).digest("hex"),
    "8b8bf5d400487159e3e117053d3f5a89fad0c740b310a3ac69e5720ce4f818e1",
  );
  assert.equal(
    execFileSync(listener.exe, ["--version"], { env, encoding: "utf8", timeout: 5000 }).trim(),
    "postgres (PostgreSQL) 18.6",
  );
  const control = execFileSync(bin + "pg_controldata.exe", ["-D", data], {
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(
    control.match(/^Database system identifier:\s*(\d+)/m)?.[1],
    isolated.systemIdentifier,
  );
  assert.deepEqual(
    readFileSync(path.join(data, "postgresql.auto.conf"), "utf8").trim().split(/\r?\n/),
    ["listen_addresses = '127.0.0.1'", "port = 55440", "ssl = off", "unix_socket_directories = ''"],
  );
  const hba = path.join(data, "pg_hba.conf"),
    original = readFileSync(hba),
    lines = privateHba(marker.database, isolated.owner);
  assert.deepEqual(original.toString("utf8").trim().split(/\r?\n/), lines);
  return { data, env, listener, hba, original, lines };
}
export async function withPrivateTarget(root, action) {
  const state = runningPrivate(root),
    lines = [...state.lines];
  lines.splice(3, 0, `host ${isolated.database} ${isolated.owner} 127.0.0.1/32 trust`);
  const changed = Buffer.from(lines.join("\n") + "\n");
  const reload = () =>
    execFileSync(bin + "pg_ctl.exe", ["-D", state.data, "reload"], {
      env: state.env,
      stdio: "pipe",
      timeout: 10000,
      windowsHide: true,
    });
  let installed = false;
  try {
    writeFileSync(state.hba, changed);
    installed = true;
    reload();
    return await action(state);
  } finally {
    if (installed) {
      assert(readFileSync(state.hba).equals(changed), "Concurrent HBA change; do not overwrite");
      writeFileSync(state.hba, state.original);
      reload();
      assert(readFileSync(state.hba).equals(state.original));
    }
  }
}
export async function assertPrivateIdentity(client, database, data) {
  const row = (
    await client.query(
      "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,(pg_control_system()).system_identifier::text AS system",
    )
  ).rows[0];
  assert.deepEqual(row, {
    database,
    owner: isolated.owner,
    host: isolated.host,
    port: isolated.port,
    directory: data.replaceAll("\\", "/"),
    version: 180006,
    system: isolated.systemIdentifier,
  });
  assert.equal(
    (
      await client.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0].owner,
    isolated.owner,
  );
  return row;
}
