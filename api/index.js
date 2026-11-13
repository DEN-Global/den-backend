// Vercel serverless entry for the DEN platform API.
// Adapts the Node request to the platform's Fetch-style handler and supplies the
// PostgreSQL database plus the deployment configuration from the environment.
import { handleRequest } from '../src/app.js';
import { createPostgresDatabase } from '../src/postgres-database.js';

let database;
function getDatabase() {
  if (!database) {
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) throw new Error('SUPABASE_DATABASE_URL is not configured');
    database = createPostgresDatabase(connectionString);
  }
  return database;
}

async function readBody(request) {
  if (request.body !== undefined && request.body !== null) {
    if (Buffer.isBuffer(request.body)) return request.body;
    if (typeof request.body === 'string') return Buffer.from(request.body);
    return Buffer.from(JSON.stringify(request.body));
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  try {
    const protocol = request.headers['x-forwarded-proto'] ?? 'https';
    const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
    const url = new URL(request.url ?? '/', `${protocol}://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    const hasBody = !['GET', 'HEAD'].includes(request.method ?? 'GET');
    const body = hasBody ? await readBody(request) : undefined;
    const forwarded = new Request(url, {
      method: request.method ?? 'GET',
      headers,
      ...(body && body.length ? { body } : {}),
    });
    const result = await handleRequest(forwarded, {
      DB: getDatabase(),
      APP_ORIGIN: process.env.APP_ORIGIN ?? url.origin,
      MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
      PRIMARY_ADMIN_ID: process.env.PRIMARY_ADMIN_ID ?? '',
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
      DEN_SANDBOX_PAYMENTS: process.env.DEN_SANDBOX_PAYMENTS ?? 'false',
      FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
      FLUTTERWAVE_WEBHOOK_SECRET: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
      FLUTTERWAVE_FUNDING_ENABLED: process.env.FLUTTERWAVE_FUNDING_ENABLED,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      SIGNIN_EMAIL_FROM: process.env.SIGNIN_EMAIL_FROM,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    });
    response.statusCode = result.status;
    result.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') response.setHeader(key, value);
    });
    const cookies = typeof result.headers.getSetCookie === 'function' ? result.headers.getSetCookie() : [];
    if (cookies.length > 0) response.setHeader('set-cookie', cookies);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(JSON.stringify({ event: 'function.failed', message: String(error?.message ?? error) }));
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
  }
}
