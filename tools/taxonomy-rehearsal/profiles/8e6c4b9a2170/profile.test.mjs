// Offline only. Pure guards, source inspection, and inert CLI modes; no driver.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decodeProfile, target, assertProfileIdentity, validateSourceHashes,
  assertRunIdentity, assertServerIdentity, connectionConfig } from "./profile.mjs";
import { privateHba } from "../../safety.mjs";

const workspace = fileURLToPath(new URL("../../../..", import.meta.url));
const manifestBytes = readFileSync(new URL("./manifest.json", import.meta.url));
const profile = decodeProfile(manifestBytes);
const original = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
const readSource = relative => readFileSync(new URL(relative, new URL("../../../../", import.meta.url)));
const source = readFileSync(new URL("./rehearsal.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const originalSource = readFileSync(new URL("../../rehearsal.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const entrypoint = "tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs";

test("new profile has the approved exact identity, with every original SQL/metadata pin unchanged", () => {
  assertProfileIdentity(profile);
  assert.deepEqual(profile.inputs, original.inputs);
  for (const key of ["port", "database", "owner", "nonce"]) assert.notEqual(profile[key], original[key]);
  assert.equal(profile.host, "127.0.0.1");
  validateSourceHashes(profile, readSource);
});

test("profile and nested source pins are immutable in memory", () => {
  assert(Object.isFrozen(profile) && Object.isFrozen(profile.inputs) && Object.isFrozen(profile.inputs[0]));
  assert(Object.isFrozen(profile.sourceInputs) && Object.isFrozen(profile.sourceInputs[0]));
  assert.throws(() => { profile.port = 55439; }, TypeError);
  assert.throws(() => { profile.inputs[0].sha256 = "wrong"; }, TypeError);
  assert.throws(() => { profile.sourceInputs.push({}); }, TypeError);
});

test("any changed manifest bytes fail the immutable profile hash guard", () => {
  const altered = JSON.parse(manifestBytes);
  altered.port = original.port;
  assert.throws(() => decodeProfile(Buffer.from(JSON.stringify(altered))), /Immutable profile bytes changed/);
  assert.throws(() => decodeProfile(Buffer.concat([manifestBytes, Buffer.from("\n")])), /Immutable profile bytes changed/);
});

for (const key of Object.keys(target)) test(`identity mismatch for ${key} is refused`, () => {
  const altered = { ...profile, [key]: key === "port" ? 55439 : "wrong" };
  assert.throws(() => assertProfileIdentity(altered), /Profile mismatch/);
});

for (const entry of [...profile.inputs, ...profile.sourceInputs]) test(`changed pinned source is refused: ${entry.path}`, () => {
  assert.throws(() => validateSourceHashes(profile, relative => relative === entry.path ? Buffer.from("changed") : readSource(relative)), /Changed approved input/);
});

function runIdentity() {
  const root = `${profile.workspace}/.local/taxonomy-rehearsal/${profile.database}`;
  const dataDirectory = `${root}/data`;
  return { root, realRoot: root, dataDirectory, realDataDirectory: dataDirectory,
    marker: { nonce: profile.nonce, database: profile.database, owner: profile.owner, port: profile.port, dataDirectory },
    pidLines: ["12345",dataDirectory,"0","55440","","127.0.0.1","","ready"],
    listener: { Address: "127.0.0.1", Pid: 12345, Executable: `${profile.postgresBin}/postgres.exe` },
    executableVersion: "postgres (PostgreSQL) 18.6" };
}
test("exact new run/marker/PID/executable identity is accepted", () => assertRunIdentity(profile, runIdentity()));
for (const [name, change] of [
  ["original run directory", s => { s.root = s.root.replace(profile.database, original.database); }],
  ["junction redirects root", s => { s.realRoot = "C:/redirected"; }],
  ["junction redirects data", s => { s.realDataDirectory = "C:/redirected/data"; }],
  ["original marker", s => { s.marker.nonce = original.nonce; s.marker.port = original.port; }],
  ["extra marker field", s => { s.marker.extra = true; }],
  ["original postmaster port", s => { s.pidLines[3] = "55439"; }],
  ["original postmaster directory", s => { s.pidLines[1] = s.dataDirectory.replace(profile.database, original.database); }],
  ["invalid PID", s => { s.pidLines[0] = "0"; }],
  ["PID mismatch", s => { s.listener.Pid = 43232; }],
  ["IPv6 listener", s => { s.listener.Address = "::1"; }],
  ["wrong executable", s => { s.listener.Executable = "C:/wrong/postgres.exe"; }],
  ["wrong executable version", s => { s.executableVersion = "postgres (PostgreSQL) 18.5"; }],
  ["not ready postmaster", s => { s.pidLines[7] = "starting"; }],
]) test(`run guard refuses ${name}`, () => {
  const state = runIdentity(); change(state);
  assert.throws(() => assertRunIdentity(profile, state));
});

test("connection configuration cannot fall back to environment URLs or the original target", () => {
  const config = connectionConfig(profile);
  assert.deepEqual([config.host,config.port,config.user,config.database], [profile.host,55440,profile.owner,profile.database]);
  assert.equal(config.password, "unused-private-cluster-trust"); assert.equal(config.ssl, false);
  assert.equal(config.sslnegotiation, "postgres"); assert(!("connectionString" in config));
  assert.match(connectionConfig(profile,"postgres",true).options, /default_transaction_read_only=on/);
  for (const name of [original.database,"application_database","template1",""]) {
    assert.throws(() => connectionConfig(profile,name), /Database override refused/);
  }
});

function serverIdentity() {
  return { database: profile.database, owner: profile.owner, directory: runIdentity().dataDirectory,
    host: profile.host, port: profile.port, version: 180006 };
}
test("new server identity is accepted for the exact target and private maintenance database", () => {
  const identity = serverIdentity();
  assertServerIdentity(profile,identity,profile.database,identity.directory);
  assertServerIdentity(profile,{...identity,database:"postgres"},"postgres",identity.directory);
});
for (const [key,value] of [["database",original.database],["owner",original.owner],["directory","C:/wrong/data"],["host","127.0.0.2"],["port",55439],["version",180005]]) {
  test(`server ${key} mismatch refuses any continuation`, () => {
    const identity = serverIdentity(); identity[key] = value;
    assert.throws(() => assertServerIdentity(profile,identity,profile.database,runIdentity().dataDirectory));
  });
}

test("new HBA allows only the new owner and target, with explicit first-match rejections", () => {
  const rules = privateHba(profile.database,profile.owner);
  assert.equal(rules[2],`host ${profile.database},postgres ${profile.owner} 127.0.0.1/32 trust`);
  assert(!rules.join("\n").includes(original.database)); assert(!rules.join("\n").includes(original.owner));
  assert.deepEqual(rules.slice(0,2),["local all all reject","local replication all reject"]);
  assert.deepEqual(rules.slice(3),["host all all 0.0.0.0/0 reject","host replication all 0.0.0.0/0 reject","host all all ::/0 reject","host replication all ::/0 reject"]);
});

test("full assertion body is identical to the corrected original harness", () => {
  const body = s => s.slice(s.indexOf("    const client = await connect();"));
  assert(body(source).length > 9000);
  assert.equal(body(source),body(originalSource));
  assert.equal((body(source).match(/\], "23001", /g) ?? []).length,4);
  assert.equal((body(source).match(/\], "23503", /g) ?? []).length,4);
  assert(source.includes("runPrimaryRace({ connect, observer: client, commitFirst"));
});

test("plan mode proves target separation and lists all nine groups without loading pg", () => {
  const output = execFileSync(process.execPath,[entrypoint,"--plan"],{cwd:workspace,encoding:"utf8"});
  const plan = JSON.parse(output);
  assert.equal(plan.databaseOperations,0); assert.equal(plan.port,55440); assert.equal(plan.database,profile.database);
  assert.equal(plan.owner,profile.owner); assert.equal(plan.assertionGroups.length,9);
  assert.equal(plan.validatedInputs,11); assert.equal(plan.validatedSourceInputs,5); assert.equal(plan.manifestImmutable,true);
  assert.equal(source.slice(0,source.indexOf("} else {\n  // Do not load")).includes('const { Client }'),false);
  const printed = execFileSync(process.execPath,[entrypoint,"--print-hba"],{cwd:workspace,encoding:"utf8"}).trim().split(/\r?\n/);
  assert.deepEqual(printed,privateHba(profile.database,profile.owner));
});

test("arbitrary arguments, resume and cleanup modes refuse before any database branch", () => {
  for (const args of [["--cleanup-disposable"],["--resume"],["--plan","--database",original.database],["--host=127.0.0.1"]]) {
    const result = spawnSync(process.execPath,[entrypoint,...args],{cwd:workspace,encoding:"utf8"});
    assert.notEqual(result.status,0); assert.match(result.stderr,/Use exactly one supported mode/);
  }
});

test("creation script defaults to inert plan mode and admits no target overrides or cleanup", () => {
  const script = readFileSync(new URL("./create-environment.ps1", import.meta.url), "utf8");
  assert(script.includes("param([switch]$Create)"));
  const gate = script.indexOf("if (-not $Create) { $taxonomyPlanOutput; return }");
  assert(gate > 0);
  for (const operation of ["Get-NetTCPConnection", "New-Item", "initdb.exe", "pg_ctl.exe", "createdb.exe", "--verify-maintenance", "--verify-empty"]) assert(script.indexOf(operation) > gate);
  assert(script.includes("--host=127.0.0.1 --port=55440"));
  assert(script.includes("--username=$taxonomyOwner --owner=$taxonomyOwner --maintenance-db=postgres --template=template0 --no-password $taxonomyDatabase"));
  assert(script.indexOf("--verify-maintenance") < script.indexOf("createdb.exe"));
  assert(script.indexOf("if (Test-Path -LiteralPath $taxonomyRoot)") < script.indexOf("New-Item"));
  assert(script.indexOf("Where-Object LocalPort -eq 55440") < script.indexOf("New-Item"));
  assert(!script.includes("55439") && !script.includes(original.database));
  assert.doesNotMatch(script,/Remove-Item|Stop-Service|Restart-Service|DROP DATABASE|--execute-disposable|--cleanup-disposable/);
});
