import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditRecord,verifyAuditChain,auditGenesis } from '../src/audit.js';
async function fixture() {
  const first=await createAuditRecord({sequence:1,actorId:'primary',action:'trade.activate',occurredAt:1,payload:'{"countries":["NG"]}',previousHash:auditGenesis});
  const second=await createAuditRecord({sequence:2,actorId:'primary',action:'trade.relock',occurredAt:2,payload:'{}',previousHash:first.eventHash});
  return [first,second];
}
test('audit chain verifies against a separately trusted checkpoint',async()=>{
  const records=await fixture();assert.equal(await verifyAuditChain(records,{expectedLength:2,expectedHead:records[1].eventHash}),true);
});
test('audit verification detects modified event content',async()=>{
  const records=await fixture();const head=records[1].eventHash;records[0].actorId='other';
  await assert.rejects(()=>verifyAuditChain(records,{expectedLength:2,expectedHead:head}),/AUDIT_CONTENT_CHANGED/);
});
test('audit verification detects deletion and tail truncation',async()=>{
  const records=await fixture();
  await assert.rejects(()=>verifyAuditChain(records.slice(0,1),{expectedLength:2,expectedHead:records[1].eventHash}),/AUDIT_LENGTH_MISMATCH/);
});
test('audit verification detects a rewritten chain against original checkpoint',async()=>{
  const records=await fixture();
  const changed=await createAuditRecord({...records[1],actorId:'other'});
  await assert.rejects(()=>verifyAuditChain([records[0],changed],{expectedLength:2,expectedHead:records[1].eventHash}),/AUDIT_HEAD_MISMATCH/);
});
