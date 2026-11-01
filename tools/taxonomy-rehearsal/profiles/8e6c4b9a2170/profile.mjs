import {portableRoot,workspaceRoot} from "../../../workspace-root.mjs";
// Pure guards: no filesystem access, PostgreSQL imports, connections or mutation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const PROFILE_SHA256 = "53c4211a30e3ee41603dd91e6b78757020d14c1d3cd78cf5180b094ee5b968f8";
export const target = Object.freeze({
  status: "PREPARATION_ONLY", profileId: "8e6c4b9a2170",
  workspace: portableRoot, branch: "main",
  head: "03b14526aae448e49eacd602a43bfb0e355aca4d",
  postgresVersion: "18.6", postgresBin: "C:/Program Files/PostgreSQL/18/bin",
  host: "127.0.0.1", port: 55440,
  database: "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170",
  owner: "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170", nonce: "8e6c4b9a2170",
});
export const canonical = value => value.replaceAll("\\", "/").toLowerCase();

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function assertProfileIdentity(profile) {
  for (const [key, value] of Object.entries(target)) assert.equal(profile[key], value, `Profile mismatch: ${key}`);
  assert.deepEqual(Object.keys(profile).sort(), [...Object.keys(target), "inputs", "sourceInputs"].sort());
  assert.equal(profile.inputs.length, 11);
  assert.equal(profile.sourceInputs.length, 5);
}

export function decodeProfile(bytes) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), PROFILE_SHA256, "Immutable profile bytes changed; refuse execution");
  const profile = JSON.parse(bytes.toString("utf8"));
  assertProfileIdentity(profile);
  return freeze(profile);
}

export function validateSourceHashes(profile, readBytes) {
  assertProfileIdentity(profile);
  for (const entry of [...profile.inputs, ...profile.sourceInputs]) {
    assert.equal(createHash("sha256").update(readBytes(entry.path)).digest("hex"), entry.sha256, `Changed approved input: ${entry.path}`);
  }
}

export function assertRunIdentity(profile, { root, realRoot, dataDirectory, realDataDirectory, marker, pidLines, listener, executableVersion }) {
  assertProfileIdentity(profile);
  const expectedRoot = `${target.workspace}/.local/taxonomy-rehearsal/${target.database}`;
  assert.equal(canonical(root), canonical(expectedRoot));
  assert.equal(canonical(realRoot), canonical(expectedRoot));
  assert.equal(canonical(dataDirectory), canonical(`${expectedRoot}/data`));
  assert.equal(canonical(realDataDirectory), canonical(dataDirectory));
  assert.deepEqual(marker, { nonce: profile.nonce, database: profile.database, owner: profile.owner, port: profile.port, dataDirectory });
  const pid = Number(pidLines[0]);
  assert(Number.isSafeInteger(pid) && pid > 0);
  assert.equal(canonical(pidLines[1]), canonical(dataDirectory));
  assert.equal(Number(pidLines[3]), profile.port);
  assert.equal(pidLines[7], "ready");
  assert.equal(listener.Address, profile.host);
  assert.equal(listener.Pid, pid);
  assert.equal(canonical(listener.Executable), canonical(`${profile.postgresBin}/postgres.exe`));
  assert.equal(executableVersion, "postgres (PostgreSQL) 18.6");
}

export function connectionConfig(profile, database = profile.database, readOnly = false) {
  assertProfileIdentity(profile);
  assert([profile.database, "postgres"].includes(database), "Database override refused");
  assert.equal(typeof readOnly, "boolean");
  return { host: profile.host, port: profile.port, user: profile.owner, database,
    password: "unused-private-cluster-trust", ssl: false, sslnegotiation: "postgres", client_encoding: "UTF8",
    application_name: `taxonomy-rehearsal:${profile.nonce}`,
    options: `${readOnly ? "-c default_transaction_read_only=on " : ""}-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000`,
    connectionTimeoutMillis: 5000 };
}

export function assertServerIdentity(profile, identity, database, dataDirectory) {
  assertProfileIdentity(profile);
  assert([profile.database, "postgres"].includes(database));
  assert.equal(canonical(dataDirectory), canonical(`${target.workspace}/.local/taxonomy-rehearsal/${target.database}/data`));
  assert.equal(identity.database, database);
  assert.equal(identity.owner, profile.owner);
  assert.equal(canonical(identity.directory), canonical(dataDirectory));
  assert.equal(identity.host, profile.host);
  assert.equal(identity.port, profile.port);
  assert.equal(identity.version, 180006);
}
