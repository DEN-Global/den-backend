import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openLocalDatabase} from '../src/local-database.js';
import {handleRequest} from '../src/app.js';

async function setup(t) {
  const DB = openLocalDatabase();
  t.after(() => DB.close());
  const sent = [];
  const env = {
    DB,
    APP_ORIGIN: 'http://test',
    PRIMARY_ADMIN_ID: 'not-provisioned',
    SEND_SIGNIN_EMAIL: async message => { sent.push(message); },
  };
  const request = async (path, body) => {
    const response = await handleRequest(new Request('http://test' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin: 'http://test', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    return { status: response.status, data: await response.json(), response };
  };
  return { DB, env, sent, request };
}

const codeOf = message => message.text.match(/(?:code is|verification code is) (\d{6})/)[1];

test('registration requires the emailed code and then signs in with the password', async t => {
  const { request, sent } = await setup(t);
  assert.equal((await request('/api/auth/options')).data.registrationEmail, true);

  const withoutCode = await request('/api/auth/register', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026' });
  assert.equal(withoutCode.status, 400);
  assert.equal(withoutCode.data.error, 'EMAIL_VERIFICATION_REQUIRED');

  assert.equal((await request('/api/auth/register-code', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', phone: '+2348000000000', country: 'NG' })).status, 200);
  assert.equal(sent.length, 1);

  const wrong = codeOf(sent[0]) === '000000' ? '000001' : '000000';
  assert.equal((await request('/api/auth/register', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', emailCode: wrong })).status, 401);

  const created = await request('/api/auth/register', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', emailCode: codeOf(sent[0]) });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  // The code is single use.
  assert.equal((await request('/api/auth/register', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', emailCode: codeOf(sent[0]) })).status, 401);
  assert.equal((await request('/api/auth/login', { email: 'owner@example.test', password: 'registration-password-2026' })).status, 200);
});

test('a verification code is not sent for an address that already has an account', async t => {
  const { request, sent } = await setup(t);
  await request('/api/auth/register-code', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', phone: '+2348000000000', country: 'NG' });
  await request('/api/auth/register', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', emailCode: codeOf(sent[0]) });
  const before = sent.length;
  const again = await request('/api/auth/register-code', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', phone: '+2348000000000', country: 'NG' });
  assert.equal(again.status, 200);
  assert.equal(sent.length, before, 'no second email for an existing account');
});

test('email delivery stays disabled without a sender configured', async t => {
  const { request, env } = await setup(t);
  delete env.SEND_SIGNIN_EMAIL;
  assert.equal((await request('/api/auth/options')).data.emailCodes, false);
  assert.equal((await request('/api/auth/register-code', { email: 'owner@example.test', name: 'Owner', password: 'registration-password-2026', phone: '+2348000000000', country: 'NG' })).status, 503);
});
