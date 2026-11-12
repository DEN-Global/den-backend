import { Pool } from 'pg';

let pool;

function getPool(connectionString) {
  if (!connectionString) throw new Error('SUPABASE_DATABASE_URL_REQUIRED');
  if (!pool) pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 2, idleTimeoutMillis: 10000 });
  return pool;
}

export function postgresSql(sql) {
  const expanded = sql
    .replace(/json_extract\(\s*payload\s*,\s*'\$\.businessId'\s*\)/gi, "(payload::jsonb ->> 'businessId')")
    .replace(/group_concat\(([^)]+)\)/gi, "string_agg($1, ',')")
    .replace(/SUM\(\s*([\w.]+)\s*=\s*('[^']*')\s*\)/gi, 'SUM(($1=$2)::int)');
  let result = '', index = 0, parameter = 0, quote = null;
  while (index < expanded.length) {
    const char = expanded[index];
    if (quote) {
      result += char;
      if (char === quote && expanded[index + 1] === quote) { result += expanded[++index]; }
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (char === '?') {
      result += `$${++parameter}`;
    } else {
      result += char;
    }
    index++;
  }
  return result.replace(/\bIS\s+(\$\d+)/gi, 'IS NOT DISTINCT FROM $1');
}

export function createPostgresDatabase(connectionString) {
  const pg = getPool(connectionString);
  const prepared = (sql, args = []) => {
    const query = postgresSql(sql);
    return {
      async first() { return (await pg.query(query, args)).rows[0] ?? null; },
      async all() { return { results: (await pg.query(query, args)).rows }; },
      async run() {
        const result = await pg.query(query, args);
        return { success: true, meta: { changes: result.rowCount ?? 0 } };
      },
      async _query(client) { return client.query(query, args); },
    };
  };
  return {
    prepare(sql) {
      let args = [];
      const statement = prepared(sql);
      return {
        bind(...values) { args = values; return this; },
        first() { return prepared(sql, args).first(); },
        all() { return prepared(sql, args).all(); },
        run() { return prepared(sql, args).run(); },
        _query(client) { return prepared(sql, args)._query(client); },
      };
    },
    async batch(statements) {
      const client = await pg.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const statement of statements) results.push(await statement._query(client));
        await client.query('COMMIT');
        return results.map(result => ({ success: true, meta: { changes: result.rowCount ?? 0 } }));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() { await pg.end(); pool = undefined; },
  };
}
