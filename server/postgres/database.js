import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { AsyncLocalStorage } from "node:async_hooks";

pg.types.setTypeParser(20, Number);
export function connectDatabase(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  const context = new AsyncLocalStorage();
  function sql(source) {
    let result = source
      .replace(/\bINTEGER\b/gi, "BIGINT")
      .replace(/\bBLOB\b/gi, "BYTEA")
      .replace(/ORDER BY rowid DESC/gi, "ORDER BY created_at DESC,id DESC");
    if (/INSERT OR REPLACE INTO photos_v2/i.test(result))
      result =
        result.replace("INSERT OR REPLACE", "INSERT") +
        " ON CONFLICT(owner) DO UPDATE SET bytes=excluded.bytes";
    if (/INSERT OR IGNORE/i.test(result))
      result =
        result.replace("INSERT OR IGNORE", "INSERT") +
        " ON CONFLICT DO NOTHING";
    let index = 0;
    return result.replace(/\?/g, () => `$${++index}`);
  }
  const query = (text, values = []) =>
    (context.getStore() || pool).query(
      text,
      values.map((v) => (v instanceof Uint8Array ? Buffer.from(v) : v)),
    );
  return {
    prepare(source) {
      const text = sql(source);
      return {
        async get(...values) {
          return (await query(text, values)).rows[0];
        },
        async all(...values) {
          return (await query(text, values)).rows;
        },
        async run(...values) {
          return { changes: (await query(text, values)).rowCount };
        },
      };
    },
    async exec(source) {
      for (const statement of source
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !/^PRAGMA/i.test(s)))
        await query(sql(statement));
    },
    async transaction(fn) {
      if (context.getStore()) return fn();
      const client = await pool.connect();
      try {
        return await context.run(client, async () => {
          await client.query("BEGIN");
          try {
            // Serialize writes across serverless instances: duplicate decisions and reverse
            // likes must see committed state before testing mutuality.
            await client.query("SELECT pg_advisory_xact_lock(19870218)");
            const result = await fn();
            await client.query("COMMIT");
            return result;
          } catch (e) {
            await client.query("ROLLBACK");
            throw e;
          }
        });
      } finally {
        client.release();
      }
    },
    close() {
      return pool.end();
    },
  };
}
