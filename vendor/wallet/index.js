import { createHash } from 'node:crypto';
export const contractVersion = '1.0.0';
const fail = message => { throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Pure append-only journal. Persist returned state atomically with an idempotency uniqueness constraint. */
export function postJournal(state = { entries: [], keys: {} }, command) {
  const { idempotencyKey, reference, lines } = command;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200 || typeof reference !== 'string' || !reference || reference.length > 200 || !Array.isArray(lines) || lines.length < 2) fail('Journal identity and at least two lines required');
  const fingerprint = hash({ reference, lines });
  if (Object.hasOwn(state.keys, idempotencyKey)) {
    if (state.keys[idempotencyKey] !== fingerprint) fail('Idempotency conflict');
    return state;
  }
  const totals = new Map();
  for (const line of lines) {
    if (typeof line.accountId !== 'string' || !line.accountId || !/^[A-Z]{3}$/.test(line.currency) || !Number.isSafeInteger(line.amountMinor) || line.amountMinor === 0) fail('Invalid journal line');
    const total = (totals.get(line.currency) || 0) + line.amountMinor;
    if (!Number.isSafeInteger(total)) fail('Balance overflow');
    totals.set(line.currency, total);
  }
  if ([...totals.values()].some(value => value !== 0)) fail('Each currency must balance independently');
  const previousHash = state.entries.at(-1)?.hash || '0'.repeat(64);
  const entry = { sequence: state.entries.length + 1, reference, idempotencyKey, lines: structuredClone(lines), previousHash };
  entry.hash = hash(entry);
  return { entries: [...state.entries, entry], keys: { ...state.keys, [idempotencyKey]: fingerprint } };
}
export function verifyJournal(state, trustedHead) {
  let previous = '0'.repeat(64);
  for (let index = 0; index < state.entries.length; index++) {
    const { hash: digest, ...entry } = state.entries[index];
    if (entry.sequence !== index + 1 || entry.previousHash !== previous || hash(entry) !== digest) return false;
    previous = digest;
  }
  return trustedHead?.length === state.entries.length && trustedHead?.hash === previous;
}
export function balance(state, accountId, currency) {
  let amount = 0;
  for (const entry of state.entries) for (const line of entry.lines) if (line.accountId === accountId && line.currency === currency) {
    amount += line.amountMinor;
    if (!Number.isSafeInteger(amount)) fail('Balance overflow');
  }
  return amount;
}
export function requestWithdrawal() { fail('Withdrawals disabled: provider, settlement, compliance and approved policy required'); }
