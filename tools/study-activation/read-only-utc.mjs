// Transaction-local rendering context only. No stored settings/data are changed.
import assert from 'node:assert/strict';
export async function withReadOnlyUtc(client, verify) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const settings=(await client.query("SELECT set_config('TimeZone','UTC',true) AS timezone,current_setting('transaction_read_only') AS read_only")).rows[0];
    assert.equal(settings?.timezone,'UTC');
    assert.equal(settings?.read_only,'on');
    return await verify();
  } finally {
    await client.query('ROLLBACK');
  }
}
