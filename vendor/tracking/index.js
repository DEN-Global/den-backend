export const contractVersion = '1.0.0';
function authorized(actor, assignment, write = false) {
  if (!actor?.id || !actor.active || !assignment?.id || !['assigned', 'picked_up', 'in_transit'].includes(assignment.status)) throw new Error('Active assignment required');
  if (write ? actor.id !== assignment.riderId : ![assignment.riderId, assignment.consumerId].includes(actor.id)) throw new Error('Tracking access denied');
}
export function recordLocation(state = [], actor, assignment, input, now) {
  authorized(actor, assignment, true);
  const { id, latitude, longitude, accuracyMeters, recordedAt, simulated = false } = input;
  if (!Number.isSafeInteger(now) || now < 0 || !id || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10000 || !Number.isSafeInteger(recordedAt) || recordedAt > now + 30000 || recordedAt < now - 300000 || typeof simulated !== 'boolean') throw new Error('Invalid or stale location');
  const existing = state.find(point => point.id === id);
  if (existing) {
    if (existing.assignmentId !== assignment.id || existing.riderId !== actor.id || existing.latitude !== latitude || existing.longitude !== longitude || existing.recordedAt !== recordedAt || existing.accuracyMeters !== accuracyMeters || existing.simulated !== simulated) throw new Error('Location idempotency conflict');
    return state;
  }
  const last = state.filter(point => point.assignmentId === assignment.id).at(-1);
  if (last && recordedAt <= last.recordedAt) throw new Error('Out-of-order location');
  return [...state, { id, assignmentId: assignment.id, riderId: actor.id, latitude, longitude, accuracyMeters, recordedAt, receivedAt: now, simulated }];
}
export function latestLocation(state, actor, assignment, now) {
  authorized(actor, assignment);
  const point = state.filter(point => point.assignmentId === assignment.id).at(-1);
  if (!point) return { state: 'unavailable', point: null, eta: null };
  return { state: now - point.recordedAt > 120000 ? 'stale' : point.simulated ? 'simulated' : 'reported', point: structuredClone(point), eta: null };
}
