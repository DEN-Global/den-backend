import { execFileSync } from 'node:child_process';
import { openLocalDatabase } from '../src/local-database.js';
import { Pool } from 'pg';

const databaseId = process.env.DEN_D1_DATABASE_ID ?? '441d5779-a55c-40d8-9551-cecfc6a2326d';
const projectRef = 'xhqxadhkcadxnzvbkfwr';
const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error('Set SUPABASE_DATABASE_URL in this terminal; never commit or paste it into chat.');

const excluded = new Set([
  'den_schema_migrations', 'den_sessions', 'den_rate_buckets', 'den_email_signin_challenges',
  'den_registration_email_challenges', 'den_transaction_guards',
]);
const seeded = new Set(['den_roles', 'den_trade_state', 'den_countries', 'den_admin_role_templates']);
const local = openLocalDatabase();
let tables = local.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(row => row.name).filter(name => !excluded.has(name));
tables = tables.filter(name => name !== 'den_notifications').concat('den_notifications');
const quote = name => {
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error('Unexpected schema identifier.');
  return `"${name}"`;
};
const runSourceBatch = queries => {
  const stdout = execFileSync('cf', ['d1', 'query', databaseId, '--batch', JSON.stringify(queries.map(sql => ({ sql })))], {
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, DEN_D1_DATABASE_ID: databaseId, DEN_APP_ORIGIN: 'https://den-global.vercel.app', DEN_PRIMARY_ADMIN_ID: 'disabled-preview-admin', NO_COLOR: '1' },
  });
  return JSON.parse(stdout);
};
const sourceRows = new Map();
for (let start = 0; start < tables.length; start += 8) {
  const group = tables.slice(start, start + 8);
  const result = runSourceBatch(group.map(table => `SELECT * FROM ${quote(table)}`));
  if (!Array.isArray(result) || result.length !== group.length || result.some(item => item.success !== true)) throw new Error('Cloudflare returned an incomplete export batch. No destination data was written.');
  group.forEach((table, index) => sourceRows.set(table, result[index].results));
}

const pg = new Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 10000 });
let client;
try {
  client = await pg.connect();
  const populated = [];
  for (const table of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${quote(table)}`);
    const count = rows[0].n;
    if (!seeded.has(table) && count) populated.push(table);
  }
  if (populated.length) throw new Error(`Destination is not empty (${populated.join(', ')}). Import stopped before writing anything.`);

  await client.query('BEGIN');
  let copied = 0;
  for (const table of tables) {
    const rows = sourceRows.get(table) ?? [];
    if (!rows.length) continue;
    const info = localInfo(table);
    const primaryKey = info.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
    if (!primaryKey.length) throw new Error(`Missing primary key for ${table}.`);
    const columns = Object.keys(rows[0]);
    const names = columns.map(quote).join(', ');
    const conflict = primaryKey.map(quote).join(', ');
    const updates = columns.filter(column => !primaryKey.includes(column));
    for (let offset = 0; offset < rows.length; offset += 100) {
      const page = rows.slice(offset, offset + 100);
      const values = [];
      const groups = page.map(row => `(${columns.map(column => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      }).join(', ')})`);
      const action = updates.length
        ? `DO UPDATE SET ${updates.map(column => `${quote(column)}=EXCLUDED.${quote(column)}`).join(', ')}`
        : 'DO NOTHING';
      await client.query(`INSERT INTO ${quote(table)} (${names}) VALUES ${groups.join(', ')} ON CONFLICT (${conflict}) ${action}`, values);
      copied += page.length;
    }
  }
  await client.query("SELECT setval(pg_get_serial_sequence('public.den_audit_events','sequence'), COALESCE(MAX(sequence),1), MAX(sequence) IS NOT NULL) FROM public.den_audit_events");
  const mismatches = [];
  for (const table of tables) {
    const expected = (sourceRows.get(table) ?? []).length;
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${quote(table)}`);
    if (rows[0].n !== expected) mismatches.push(`${table}: expected ${expected}, got ${rows[0].n}`);
  }
  if (mismatches.length) throw new Error(`Import count check failed: ${mismatches.join('; ')}`);
  await client.query('COMMIT');
  console.log(`Imported and count-checked ${copied} rows across ${tables.length} DEN tables. Active sessions, rate counters, and one-time email challenges were intentionally not transferred.`);
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client?.release();
  await pg.end();
  local.close();
}

function localInfo(table) {
  return local.sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all();
}
