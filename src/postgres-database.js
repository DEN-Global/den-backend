// PostgreSQL adapter exposing the prepare/bind/first/all/run/batch interface the platform code is written against:
//   db.prepare(sql).bind(...args).first() / .all() / .run(), and db.batch([...]).
// Dialect differences are translated here so the domain modules stay unchanged and the
// local SQLite adapter remains the development path.
import pg from 'pg';

// SQLite stores millisecond timestamps as 64-bit integers. Read them back as JS numbers
// so arithmetic such as `sequence + 1` stays numeric instead of string concatenation.
pg.types.setTypeParser(20, value => (value === null ? null : Number(value)));
// SQLite hands JSON values back as text and the platform serialises them as-is,
// so keep json/jsonb as strings instead of pg's parsed objects.
pg.types.setTypeParser(114, value => value);
pg.types.setTypeParser(3802, value => value);

const MAX_ROWS = 5000;

export function translateSql(sql) {
  let translated = String(sql);
  // JSON access: json_extract(payload,'$.businessId') -> (payload::jsonb)->>'businessId'
  translated = translated.replace(
    /json_extract\(\s*([A-Za-z0-9_.]+)\s*,\s*'\$\.([A-Za-z0-9_]+)'\s*\)/g,
    "($1::jsonb)->>'$2'",
  );
  translated = translated.replace(/group_concat\(\s*([A-Za-z0-9_.]+)\s*\)/gi, "string_agg($1,',')");
  translated = translated.replace(/json_group_array\(/gi, 'jsonb_agg(');
  translated = translated.replace(/json_object\(/gi, 'jsonb_build_object(');
  // In `SET count=count+1` PostgreSQL cannot tell the target column from EXCLUDED,
  // so the counter update must name its table.
  translated = translated.replace(
    /ON CONFLICT\(key\) DO UPDATE SET count=count\+1/gi,
    'ON CONFLICT(key) DO UPDATE SET count=den_rate_buckets.count+1',
  );
  // SQLite's null-safe `x IS ?` has an explicit PostgreSQL spelling.
  translated = translated.replace(/([A-Za-z0-9_.]+)\s+IS\s+\?/g, '$1 IS NOT DISTINCT FROM ?');
  return numberPlaceholders(translated);
}

// Rewrites positional `?` placeholders to `$1..$n`, ignoring quoted literals.
export function numberPlaceholders(sql) {
  let out = '';
  let index = 0;
  let quoted = false;
  for (let i = 0; i < sql.length; i += 1) {
    const character = sql[i];
    if (character === "'") {
      if (quoted && sql[i + 1] === "'") { out += "''"; i += 1; continue; }
      quoted = !quoted;
      out += character;
      continue;
    }
    if (character === '?' && !quoted) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += character;
  }
  return out;
}

function isLocal(url) {
  return /^postgres(ql)?:\/\/[^/]*(localhost|127\.0\.0\.1)/.test(url);
}

export function createPostgresDatabase(connectionString, { pool: suppliedPool } = {}) {
  if (!connectionString && !suppliedPool) throw new Error('DATABASE_URL_REQUIRED');
  const pool = suppliedPool ?? new pg.Pool({
    connectionString,
    max: Number(process.env.DEN_DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 25_000,
    query_timeout: 20_000,
    ...(isLocal(connectionString) ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  // Do not let a closed pool crash the process on an idle error.
  pool.on('error', () => {});

  function prepare(sql) {
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        const rows = await execute(pool, this.sql, this.values);
        return rows[0] ?? null;
      },
      async all() {
        const rows = await execute(pool, this.sql, this.values);
        if (rows.length > MAX_ROWS) throw new Error('RESULT_SET_TOO_LARGE');
        return { results: rows };
      },
      async run() {
        return this._execute(pool);
      },
      async _execute(target) {
        const result = await target.query(translateSql(this.sql), this.values);
        return { success: true, meta: { changes: Number(result.rowCount ?? 0) } };
      },
    };
  }

  return {
    prepare,
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const statement of statements) results.push(await statement._execute(client));
        await client.query('COMMIT');
        return results;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
    pool,
  };
}

async function execute(pool, sql, values) {
  const result = await pool.query(translateSql(sql), values);
  return result.rows ?? [];
}
