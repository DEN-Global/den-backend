// Applies migrations/postgres/*.sql in filename order.
// Uses SUPABASE_DATABASE_URL (session or transaction pooler) when present, otherwise
// SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN through the Supabase Management API.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = new URL('../migrations/postgres/', import.meta.url);

function files() {
  return readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

// Single-quoted SQL literal, used because the Management API accepts one statement string.
function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function viaManagementApi(ref, token, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`management API failed (${response.status}): ${body}`);
  return body ? JSON.parse(body) : [];
}

export async function applyMigrations({ databaseUrl, projectRef, accessToken, log = console.log } = {}) {
  let client, run;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    pg.types.setTypeParser(20, value => Number(value));
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    run = async sql => (await client.query(sql)).rows;
  } else {
    if (!projectRef || !accessToken) throw new Error('Provide SUPABASE_DATABASE_URL or SUPABASE_PROJECT_REF with SUPABASE_ACCESS_TOKEN');
    run = sql => viaManagementApi(projectRef, accessToken, sql);
  }
  try {
    await run('CREATE TABLE IF NOT EXISTS den_schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    const applied = new Map((await run('SELECT name,checksum FROM den_schema_migrations')).map(row => [row.name, row.checksum]));
    for (const name of files()) {
      const sql = readFileSync(new URL(name, directory), 'utf8');
      const hash = checksum(sql);
      if (applied.has(name)) {
        if (applied.get(name) !== hash) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
        log(`skip ${name}`);
        continue;
      }
      log(`apply ${name}`);
      try {
        await run(sql);
      } catch (error) {
        throw new Error(`MIGRATION_FAILED:${name}: ${error.message}`);
      }
      await run(`INSERT INTO den_schema_migrations(name,checksum) VALUES(${literal(name)},${literal(hash)})`);
      applied.set(name, hash);
    }
  } finally {
    if (client) await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await applyMigrations({
    databaseUrl: process.env.SUPABASE_DATABASE_URL,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  });
}
