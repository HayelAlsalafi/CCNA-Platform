import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
// Exact pre-existing private target only. No cluster/database creation or service changes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { privateHba } from './taxonomy-rehearsal/safety.mjs';
export const disposable = {
  database: 'ccna_drizzle_check_20261012_c08f12ad34b6',
  host: '127.0.0.1',
  port: 55440,
  user: 'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170',
  ssl: false,
  connectionTimeoutMillis: 5000,
  options:
    '-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=120000',
};
export function sterileEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(SYSTEMROOT|WINDIR|COMSPEC|PATH|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(
        k,
      ),
    ),
  );
}
export function protectOperatorFolder(folder, env = sterileEnvironment()) {
  const sid = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    env,
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  }).match(/S-1-[0-9-]+/)?.[0];
  assert(sid, 'Cannot identify backup owner');
  execFileSync(
    'icacls.exe',
    [folder, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
    { env, stdio: 'pipe', timeout: 15000, windowsHide: true },
  );
}
export async function withDisposableAccess(root, fn) {
  const canonical = (s) => s.replaceAll('\\', '/').toLowerCase();
  assert.equal(canonical(realpathSync(root)), portableRoot.toLowerCase());
  const existing = 'ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170',
    data = path.join(root, '.local/taxonomy-rehearsal', existing, 'data');
  assert.equal(canonical(realpathSync(data)), canonical(data));
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(data, '../owner.json'), 'utf8').replace(/^\uFEFF/, '')),
    {
      nonce: '8e6c4b9a2170',
      database: existing,
      owner: disposable.user,
      port: 55440,
      dataDirectory: data,
    },
  );
  const pid = readFileSync(path.join(data, 'postmaster.pid'), 'utf8').trim().split(/\r?\n/);
  assert.equal(canonical(pid[1]), canonical(data));
  assert.equal(Number(pid[3]), 55440);
  const env = sterileEnvironment(),
    listener = JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "$x=@(Get-NetTCPConnection -LocalPort 55440 -State Listen -ErrorAction Stop);if($x.Count -ne 1){throw 'Unexpected listener'};[pscustomobject]@{host=$x[0].LocalAddress;pid=$x[0].OwningProcess;exe=(Get-Process -Id $x[0].OwningProcess).Path}|ConvertTo-Json -Compress",
        ],
        { env, encoding: 'utf8', timeout: 15000, windowsHide: true },
      ),
    );
  assert.deepEqual(listener, { host: '127.0.0.1', pid: Number(pid[0]), exe: listener.exe });
  assert.equal(canonical(listener.exe), 'c:/program files/postgresql/18/bin/postgres.exe');
  assert.match(
    execFileSync(listener.exe, ['--version'], { env, encoding: 'utf8', timeout: 5000 }),
    /18\.6/,
  );
  const hba = path.join(data, 'pg_hba.conf'),
    original = readFileSync(hba),
    lines = privateHba(existing, disposable.user);
  assert.deepEqual(original.toString('utf8').trim().split(/\r?\n/), lines, 'Unexpected HBA policy');
  lines.splice(3, 0, `host ${disposable.database} ${disposable.user} 127.0.0.1/32 trust`);
  const changed = Buffer.from(lines.join('\n') + '\n');
  const reload = () =>
    execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe', ['-D', data, 'reload'], {
      env,
      stdio: 'pipe',
      timeout: 10000,
      windowsHide: true,
    });
  let installed = false;
  try {
    writeFileSync(hba, changed);
    installed = true;
    reload();
    return await fn({ data, env });
  } finally {
    if (installed) {
      assert(readFileSync(hba).equals(changed), 'Concurrent HBA change: refuse overwrite');
      writeFileSync(hba, original);
      reload();
      assert(readFileSync(hba).equals(original));
    }
  }
}
