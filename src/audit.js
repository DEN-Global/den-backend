import { PolicyError } from './policy.js';
const requireAudit = (condition, code) => { if (!condition) throw new PolicyError(code); };
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
export const auditGenesis = '0'.repeat(64);
export async function createAuditRecord({ sequence, actorId, action, occurredAt, payload, previousHash }) {
  requireAudit(Number.isSafeInteger(sequence) && sequence > 0, 'INVALID_AUDIT_SEQUENCE');
  requireAudit(typeof actorId === 'string' && actorId.length > 0 && typeof action === 'string' && action.length > 0, 'INVALID_AUDIT_ACTOR_ACTION');
  requireAudit(Number.isSafeInteger(occurredAt) && occurredAt >= 0, 'INVALID_AUDIT_TIME');
  requireAudit(typeof previousHash === 'string' && /^[a-f0-9]{64}$/.test(previousHash), 'INVALID_PREVIOUS_HASH');
  requireAudit(typeof payload === 'string', 'AUDIT_PAYLOAD_MUST_BE_JSON_STRING');
  try { JSON.parse(payload); } catch { throw new PolicyError('INVALID_AUDIT_PAYLOAD'); }
  const record = { sequence, actorId, action, occurredAt, payload, previousHash };
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record)));
  return { ...record, eventHash: hex(digest) };
}
/** Expected head comes from a separately trusted checkpoint, never the chain being verified. */
export async function verifyAuditChain(records, { expectedHead, expectedLength }) {
  requireAudit(Array.isArray(records) && records.length === expectedLength, 'AUDIT_LENGTH_MISMATCH');
  let previousHash = auditGenesis;
  for (let i=0; i<records.length; i++) {
    const record = records[i];
    requireAudit(record.sequence === i+1 && record.previousHash === previousHash, 'AUDIT_CHAIN_BROKEN');
    const computed = await createAuditRecord(record);
    requireAudit(computed.eventHash === record.eventHash, 'AUDIT_CONTENT_CHANGED');
    previousHash = computed.eventHash;
  }
  requireAudit(previousHash === expectedHead, 'AUDIT_HEAD_MISMATCH');
  return true;
}
