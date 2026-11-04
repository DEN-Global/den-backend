export const contractVersion = '1.0.0';
/** Actor and order must come from authenticated server state, never request-supplied roles. */
export function authorizeChannel(actor, channel, order) {
  if (!actor?.id || !actor.active || !channel?.id) throw new Error('Authentication required');
  if (channel.type === 'public_review') return true;
  if (channel.type === 'manager_team') {
    if (!actor.organizationId || actor.organizationId !== channel.organizationId || !['manager', 'employee'].includes(actor.role)) throw new Error('Team access denied');
    return true;
  }
  if (!order || order.id !== channel.orderId || !['assigned', 'ready', 'picked_up', 'in_transit'].includes(order.status)) throw new Error('Active order required');
  if (channel.type === 'rider_consumer' && [order.riderId, order.consumerId].includes(actor.id)) return true;
  if (channel.type === 'manager_rider' && (actor.id === order.riderId || (actor.role === 'manager' && actor.organizationId === order.organizationId))) return true;
  throw new Error('Private consumer–organization communication prohibited');
}
export function appendMessage(state = [], actor, channel, order, { id, text, createdAt }) {
  authorizeChannel(actor, channel, order);
  if (!id || typeof text !== 'string' || !text.trim() || text.length > 4000 || !Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error('Invalid message');
  const existing = state.find(message => message.id === id);
  if (existing) {
    if (existing.senderId !== actor.id || existing.channelId !== channel.id || existing.text !== text.trim()) throw new Error('Message idempotency conflict');
    return state;
  }
  return [...state, { id, channelId: channel.id, senderId: actor.id, text: text.trim(), createdAt, contractVersion }];
}
export function readMessages(state, actor, channel, order) {
  authorizeChannel(actor, channel, order);
  return state.filter(message => message.channelId === channel.id);
}
