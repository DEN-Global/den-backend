export const contractVersion = '1.0.0';
export function enqueue(state = [], { id, deduplicationKey, recipientId, type, resourceId, createdAt }) {
  if (![id, deduplicationKey, recipientId, type, resourceId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 200) || !Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('Invalid notification');
  const existing = state.find(item => item.id === id || item.deduplicationKey === deduplicationKey);
  if (existing) {
    if (existing.recipientId !== recipientId || existing.type !== type || existing.resourceId !== resourceId || existing.deduplicationKey !== deduplicationKey) throw new Error('Notification idempotency conflict');
    return state;
  }
  return [...state, { id, deduplicationKey, recipientId, type, resourceId, createdAt, readAt: null, delivery: 'in_app_only' }];
}
export function inbox(state, actor) {
  if (!actor?.id || !actor.active) throw new Error('Authentication required');
  return state.filter(item => item.recipientId === actor.id).map(item => ({ ...item }));
}
export function markRead(state, actor, id, now) {
  const accessible = inbox(state, actor).find(item => item.id === id);
  if (!accessible) throw new Error('Notification not found');
  if (!Number.isSafeInteger(now) || now < accessible.createdAt) throw new Error('Invalid read timestamp');
  return state.map(item => item.id === id ? { ...item, readAt: item.readAt ?? now } : item);
}
