/** Domain policies only. Actors must come from a trusted server authentication adapter. */
export const internationalRoles = Object.freeze([
  'global_shipping_admin', 'international_trade_admin', 'warehouse_admin',
]);
export class PolicyError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requirePolicy = (condition, code) => { if (!condition) throw new PolicyError(code); };
const timestamp = value => {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  requirePolicy(Number.isFinite(parsed) && parsed >= 0, 'INVALID_TIMESTAMP');
  return parsed;
};
function authenticated(actor) {
  requirePolicy(actor?.authenticated === true && typeof actor.id === 'string' && actor.id.length > 0, 'UNAUTHENTICATED');
}
export function initialTradeState() {
  return { enabled: false, countries: [], revision: 0, changedAt: null, changedBy: null };
}
/** Persist this transition and its audit event atomically using expectedRevision. */
export function changeTradeState({ actor, primaryAdminId, current, enabled, countries, now, expectedRevision }) {
  authenticated(actor);
  requirePolicy(typeof primaryAdminId === 'string' && primaryAdminId.length > 0 && actor.id === primaryAdminId, 'PRIMARY_ADMIN_ONLY');
  const time = timestamp(now);
  requirePolicy(actor.mfaVerified === true, 'MFA_REQUIRED');
  const authTime = timestamp(actor.authenticatedAt);
  requirePolicy(authTime <= time && time - authTime <= 300_000, 'FRESH_AUTH_REQUIRED');
  requirePolicy(expectedRevision === current.revision, 'REVISION_CONFLICT');
  requirePolicy(typeof enabled === 'boolean', 'INVALID_FLAG');
  requirePolicy(Array.isArray(countries) && countries.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)), 'INVALID_COUNTRIES');
  const next = { enabled, countries: [...new Set(countries)].sort(), revision: current.revision + 1, changedAt: time, changedBy: actor.id };
  return { state: next, audit: { action: enabled ? 'trade.activate' : 'trade.relock', actorId: actor.id, at: time, previousRevision: current.revision, revision: next.revision, countries: next.countries } };
}
export function authorizeTrade({ actor, state, country, action, shipment }) {
  authenticated(actor);
  requirePolicy(['book', 'pay', 'operate', 'history', 'continue'].includes(action), 'UNKNOWN_ACTION');
  requirePolicy(actor.permissions?.includes(`trade.${action}`), 'FORBIDDEN');
  if (['history', 'continue'].includes(action)) {
    requirePolicy(shipment && shipment.tenantId === actor.tenantId && Boolean(actor.tenantId), 'TENANT_FORBIDDEN');
    if (action === 'continue') requirePolicy(shipment.status === 'in_progress' && actor.permissions.includes('trade.continue_locked'), 'CONTROLLED_CONTINUATION_REQUIRED');
    return true;
  }
  requirePolicy(state?.enabled === true, 'TRADE_LOCKED');
  requirePolicy(state.countries.includes(country), 'COUNTRY_DISABLED');
  return true;
}
export function assignInternationalRole({ actor, targetId, role, state }) {
  authenticated(actor);
  requirePolicy(actor.permissions?.includes('roles.assign'), 'FORBIDDEN');
  requirePolicy(state?.enabled === true, 'TRADE_LOCKED');
  requirePolicy(internationalRoles.includes(role), 'UNKNOWN_ROLE');
  requirePolicy(typeof targetId === 'string' && targetId.length > 0, 'INVALID_TARGET');
  return { targetId, role };
}
const facilityPermissions = Object.freeze({
  warehouse_manager: ['receive', 'inventory', 'pack', 'dispatch', 'audit', 'staff'],
  receiving_officer: ['receive'], inventory_officer: ['inventory'],
  packing_officer: ['pack'], dispatch_officer: ['dispatch'], warehouse_auditor: ['audit'],
});
export function authorizeFacility({ actor, facility, memberships, action }) {
  authenticated(actor);
  requirePolicy(facility?.tenantId && actor.tenantId === facility.tenantId, 'TENANT_FORBIDDEN');
  requirePolicy(Object.values(facilityPermissions).some(p => p.includes(action)), 'UNKNOWN_ACTION');
  const allowed = memberships.some(m => m.userId === actor.id && m.facilityId === facility.id && m.tenantId === facility.tenantId && m.active === true && facilityPermissions[m.role]?.includes(action));
  requirePolicy(allowed, 'FACILITY_FORBIDDEN');
  return true;
}
/** All monetary inputs/outputs are integer minor units; no provisional billing. */
export function warehouseCommission({ amountMinor, currency, country, approvedAt, transactionAt, rules }) {
  requirePolicy(Number.isSafeInteger(amountMinor) && amountMinor >= 0, 'INVALID_AMOUNT');
  requirePolicy(typeof currency === 'string' && /^[A-Z]{3}$/.test(currency), 'INVALID_CURRENCY');
  requirePolicy(typeof country === 'string' && /^[A-Z]{2}$/.test(country), 'INVALID_COUNTRY');
  const activation = timestamp(approvedAt), at = timestamp(transactionAt);
  requirePolicy(at >= activation, 'BUSINESS_NOT_ACTIVE');
  const freeUntil = activation + 30 * 86_400_000;
  if (at < freeUntil) return { commissionMinor: 0, reason: 'BUSINESS_COMMISSION_HOLIDAY', freeUntil, ruleId: null };
  const eligible = rules.filter(r => r.status === 'approved' && r.service === 'warehouse' && r.currency === currency && r.country === country && timestamp(r.effectiveFrom) <= at && (r.effectiveTo == null || timestamp(r.effectiveTo) > at));
  requirePolicy(eligible.length === 1, eligible.length ? 'AMBIGUOUS_PRICING' : 'APPROVED_PRICING_REQUIRED');
  const rule = eligible[0];
  requirePolicy(typeof rule.id === 'string' && rule.id.length > 0 && typeof rule.approvedBy === 'string' && rule.approvedBy.length > 0, 'INVALID_APPROVAL');
  requirePolicy(Number.isInteger(rule.basisPoints) && rule.basisPoints >= 0 && rule.basisPoints <= 10_000, 'INVALID_RATE');
  const result = (BigInt(amountMinor) * BigInt(rule.basisPoints) + 5000n) / 10_000n;
  return { commissionMinor: Number(result), reason: 'APPROVED_RULE', freeUntil, ruleId: rule.id };
}
