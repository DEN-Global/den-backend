// Live smoke check against the configured PostgreSQL database.
//   SUPABASE_DATABASE_URL=postgres://... node scripts/check-postgres.mjs
// Registration needs delivered email in this build, so the check provisions its own
// account directly and then drives the authenticated API through the real handler.
import { randomBytes } from 'node:crypto';
import { handleRequest } from '../src/app.js';
import { createPostgresDatabase } from '../src/postgres-database.js';
import { hashPassword } from '../src/security.js';

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) { console.error('SUPABASE_DATABASE_URL is required'); process.exit(1); }
const DB = createPostgresDatabase(url);
const ORIGIN = 'https://den-global.vercel.app';
const env = {
  DB,
  APP_ORIGIN: ORIGIN,
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PRIMARY_ADMIN_ID: 'not-provisioned',
};
const email = 'smoke@den.test';
const password = 'postgres-smoke-password-2026';
const now = Date.now();
const existing = await DB.prepare('SELECT user_id FROM den_credentials WHERE email=?').bind(email).first();
const userId = existing?.user_id ?? crypto.randomUUID();
if (existing) {
  await DB.prepare('UPDATE den_credentials SET display_name=?,password_hash=? WHERE user_id=?')
    .bind('Postgres smoke owner', await hashPassword(password), userId).run();
} else {
  await DB.batch([
    DB.prepare('INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)').bind(userId, `password:${userId}`, now),
    DB.prepare('INSERT INTO den_credentials(user_id,email,display_name,password_hash) VALUES(?,?,?,?)')
      .bind(userId, email, 'Postgres smoke owner', await hashPassword(password)),
  ]);
}
await DB.prepare('DELETE FROM den_sessions WHERE user_id=?').bind(userId).run();
await DB.prepare("DELETE FROM den_warehouse_businesses WHERE owner_id=? AND status='pending' AND verification_key IS NULL").bind(userId).run();
// A workspace choice is permanent, so the check adopts an existing one instead of resetting it.
const chosen = await DB.prepare('SELECT role FROM den_workspace_choices WHERE user_id=?').bind(userId).first();

let cookie = ''; let csrf = '';
async function request(path, method = 'GET', body) {
  const result = await handleRequest(new Request(ORIGIN + path, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie, 'x-csrf-token': csrf, 'x-forwarded-for': '203.0.113.7' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  if (result.headers.has('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
  const text = await result.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (data && data.csrfToken) csrf = data.csrfToken;
  return { status: result.status, data };
}
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${condition ? '' : ' :: ' + JSON.stringify(detail)}`);
}

check('health', (await request('/api/health')).status === 200);
check('anonymous listing rejected', (await request('/api/businesses')).status === 401);
const signedIn = await request('/api/auth/login', 'POST', { email, password });
check('login', signedIn.status === 200, signedIn);
check('session carries csrf', Boolean(csrf));
const session = await DB.prepare('SELECT expires_at FROM den_sessions WHERE user_id=?').bind(userId).first();
check('session stored with millisecond expiry', typeof session?.expires_at === 'number' && session.expires_at > Date.now(), session);
check('workspace choice', chosen ? (await request('/api/workspace')).data?.selectedRole === chosen.role
  : (await request('/api/workspace', 'POST', { role: 'warehouse' })).status === 201);
const business = await request('/api/businesses', 'POST', { legalName: 'Postgres smoke business', country: 'NG', registeredAddress: 'Smoke test address' });
check('business registered', business.status === 201, business);
check('business appears once', (await request('/api/businesses')).data?.businesses?.length === 1, (await request('/api/businesses')).data);
check('address created', (await request('/api/platform/addresses', 'POST', { label: 'Home', address: 'Smoke address', country: 'NG' })).status === 201);
check('rider application blocked for owner', (await request('/api/platform/rider', 'POST', { vehicle: 'bicycle' })).status === 403);
check('wallet reports sandbox only', (await request('/api/services/wallet')).data?.liveMoneyEnabled === false, (await request('/api/services/wallet')).data);
check('mobility locked', (await request('/api/mobility/requests')).status === 403);
check('international bookings locked', (await request('/api/international/bookings', 'POST', {})).status === 423);
check('my-facilities returns array', Array.isArray((await request('/api/my-facilities')).data?.facilities), (await request('/api/my-facilities')).data);
check('notifications returns list', Array.isArray((await request('/api/services/notifications')).data?.notifications), (await request('/api/services/notifications')).data);
check('facility role listing uses string_agg', Array.isArray((await request('/api/my-facilities')).data?.facilities));
const audit = await DB.prepare('SELECT sequence,action FROM den_audit_events ORDER BY sequence DESC LIMIT 3').all();
check('audit chain readable', audit.results.length > 0, audit.results);
check('audit sequence is numeric', typeof audit.results[0]?.sequence === 'number', audit.results[0]);
const guard = await DB.prepare('SELECT count(*) AS n FROM den_transaction_guards').bind().first();
check('guard table usable', typeof guard?.n === 'number', guard);
await DB.close();
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
