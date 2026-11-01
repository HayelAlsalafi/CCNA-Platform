// Keep actual Drizzle migrations/services inside an already-open outer transaction.
// The outer transaction owns isolation; service begin/commit become savepoints.
import assert from "node:assert/strict";
export function transactionClient(client) {
  let active = false;
  return {
    query(query, params) {
      const text = (typeof query === "string" ? query : query.text).trim().toLowerCase();
      if (
        /^begin(?: isolation level (?:repeatable read|read committed|serializable))?(?: read only| read write)?$/.test(
          text,
        )
      ) {
        assert(!active, "Unexpected nested service transaction");
        active = true;
        return client.query("SAVEPOINT ccna_lesson_transaction");
      }
      if (text === "commit") {
        assert(active, "Unexpected commit");
        active = false;
        return client.query("RELEASE SAVEPOINT ccna_lesson_transaction");
      }
      if (text === "rollback") {
        assert(active, "Unexpected rollback");
        active = false;
        return client.query("ROLLBACK TO SAVEPOINT ccna_lesson_transaction");
      }
      return client.query(query, params);
    },
  };
}
