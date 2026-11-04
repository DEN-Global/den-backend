export const contractVersion = '1.0.0';
const transitions = { created: ['authorized', 'failed'], authorized: ['captured', 'voided'], captured: ['refunded'], failed: [], voided: [], refunded: [] };
export function createSandboxPayment({ id, orderId, payerId, amountMinor, currency, purpose, method, due }) {
  if (!id || !orderId || !payerId || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid payment');
  if (!['product', 'delivery'].includes(purpose) || !['digital', 'cash'].includes(method)) throw new Error('Invalid payment purpose or method');
  if (purpose === 'product' && (method !== 'digital' || due !== 'ordering')) throw new Error('Products require digital payment at ordering');
  if (purpose === 'delivery' && due !== 'arrival') throw new Error('Delivery payment is due on arrival');
  return { id, orderId, payerId, amountMinor, currency, purpose, method, due, mode: 'sandbox', status: 'created', version: 0, events: [], receipts: [] };
}
/** Invoke only after trusted provider adapter verification. Sandbox is explicitly labeled. */
export function applySandboxEvent(payment, { eventId, status, expectedVersion, orderId, amountMinor, currency, cashConfirmation }) {
  if (payment.mode !== 'sandbox') throw new Error('Live money unsupported');
  if (payment.events.some(event => event.eventId === eventId)) {
    const existing = payment.events.find(event => event.eventId === eventId);
    if (existing.status !== status || existing.orderId !== orderId || existing.amountMinor !== amountMinor || existing.currency !== currency) throw new Error('Event idempotency conflict');
    return payment;
  }
  if (!eventId || expectedVersion !== payment.version) throw new Error('Stale payment version');
  if (orderId !== payment.orderId || amountMinor !== payment.amountMinor || currency !== payment.currency) throw new Error('Provider amount/order mismatch');
  if (!transitions[payment.status]?.includes(status)) throw new Error('Invalid payment transition');
  if (payment.method === 'cash' && status === 'captured' && !cashConfirmation) throw new Error('Separate verified cash confirmation required');
  const event = { eventId, status, orderId, amountMinor, currency };
  const receipt = status === 'captured' ? [{ paymentId: payment.id, orderId, purpose: payment.purpose, amountMinor, currency, method: payment.method, sandbox: true, withdrawableDigitalCredit: payment.method === 'digital' }] : [];
  return { ...payment, version: payment.version + 1, status, events: [...payment.events, event], receipts: [...payment.receipts, ...receipt] };
}
export function orderReceipts(payments, orderId, actorId) {
  const scoped = payments.filter(payment => payment.orderId === orderId);
  if (!scoped.length || scoped.some(payment => payment.payerId !== actorId)) throw new Error('Receipt access denied');
  return { orderId, sandbox: true, receipts: scoped.flatMap(payment => payment.receipts) };
}
