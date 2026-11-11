import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailReady,requestSupabaseCode,verifySupabaseCode} from '../src/email-signin.js';

const env={SUPABASE_URL:'https://ref.supabase.co/',SUPABASE_ANON_KEY:'publishable-key'};

function capture(responseFor) {
  const calls=[];
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    return responseFor(url,options);
  };
  return calls;
}

test('Supabase Auth is used when a project URL and key are configured',async t=>{
  assert.equal(emailReady(env),true);
  assert.equal(emailReady({}),false);
  assert.equal(emailReady({RESEND_API_KEY:'key'}),true);
  const restore=globalThis.fetch;
  t.after(()=>{globalThis.fetch=restore;});
  const calls=capture(()=>new Response('{}',{status:200}));
  await requestSupabaseCode(env,'owner@example.test');
  assert.equal(calls[0].url,'https://ref.supabase.co/auth/v1/otp');
  assert.equal(calls[0].options.headers.apikey,'publishable-key');
  assert.deepEqual(JSON.parse(calls[0].options.body),{email:'owner@example.test',create_user:true});
  await verifySupabaseCode(env,'owner@example.test','123456');
  assert.equal(calls[1].url,'https://ref.supabase.co/auth/v1/verify');
  assert.deepEqual(JSON.parse(calls[1].options.body),{type:'email',email:'owner@example.test',token:'123456'});
});

test('Supabase failures surface as retryable delivery errors and rejected codes',async t=>{
  const restore=globalThis.fetch;
  t.after(()=>{globalThis.fetch=restore;});
  capture(()=>new Response('{"msg":"email rate limit exceeded"}',{status:429}));
  await assert.rejects(requestSupabaseCode(env,'owner@example.test'),/EMAIL_DELIVERY_UNAVAILABLE/);
  await assert.rejects(verifySupabaseCode(env,'owner@example.test','123456'),/EMAIL_DELIVERY_UNAVAILABLE/);
  await assert.rejects(verifySupabaseCode(env,'owner@example.test','not-a-code'),/INVALID_EMAIL_CODE/);
});
