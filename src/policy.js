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
  requirePolicy(['primary_super_admin', 'lesser_super_admin'].includes(actor.adminLevel), 'SUPER_ADMIN_REQUIRED');
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

/** Registry records and actor.adminLevel must be loaded from trusted storage. */
export function authorizeAdminChange({ actor, primaryAdminId, target, requestedLevel, now }) {
  authenticated(actor);
  requirePolicy(actor.mfaVerified === true, 'MFA_REQUIRED');
  const time = timestamp(now), authenticatedAt = timestamp(actor.authenticatedAt);
  requirePolicy(authenticatedAt <= time && time - authenticatedAt <= 300_000, 'FRESH_AUTH_REQUIRED');
  requirePolicy(['ordinary', 'lesser_super_admin'].includes(requestedLevel), 'INVALID_ADMIN_LEVEL');
  requirePolicy(target?.id && target.id !== primaryAdminId, 'PRIMARY_ACCOUNT_PROTECTED');
  requirePolicy(target.id !== actor.id, 'SELF_MODIFICATION_FORBIDDEN');
  if (actor.id === primaryAdminId && typeof primaryAdminId === 'string' && primaryAdminId.length > 0) return true;
  requirePolicy(actor.adminLevel === 'lesser_super_admin', 'SUPER_ADMIN_REQUIRED');
  requirePolicy(target.adminLevel === 'ordinary' && requestedLevel === 'ordinary', 'SUPER_ACCOUNT_PROTECTED');
  return true;
}

/** Ordered progressive brackets use cumulative exclusive upper bounds in minor units. */
export function progressiveCommission({ amountMinor, schedule }) {
  requirePolicy(Number.isSafeInteger(amountMinor) && amountMinor >= 0, 'INVALID_AMOUNT');
  requirePolicy(schedule?.status === 'approved' && Boolean(schedule.approvedBy), 'APPROVED_PRICING_REQUIRED');
  requirePolicy(Array.isArray(schedule.brackets) && schedule.brackets.length > 0, 'INVALID_BRACKETS');
  let lower = 0, numerator = 0n;
  const breakdown = [];
  for (let i = 0; i < schedule.brackets.length; i++) {
    const { upToMinor, basisPoints } = schedule.brackets[i];
    const final = i === schedule.brackets.length - 1;
    requirePolicy(final ? upToMinor === null : Number.isSafeInteger(upToMinor) && upToMinor > lower, 'INVALID_BRACKETS');
    requirePolicy(Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= 10_000, 'INVALID_RATE');
    const portionMinor = Math.max(0, Math.min(amountMinor, upToMinor ?? amountMinor) - lower);
    numerator += BigInt(portionMinor) * BigInt(basisPoints);
    breakdown.push({ portionMinor, basisPoints });
    lower = upToMinor;
  }
  return { commissionMinor: Number((numerator + 5000n) / 10_000n), breakdown };
}

/** Eligibility only; this function does not initiate a debit. */
export function authorizeAutomaticCollection({ actor, invoice, mandate, now }) {
  authenticated(actor);
  requirePolicy(actor.permissions?.includes('finance.collect'), 'FORBIDDEN');
  requirePolicy(invoice?.approved === true && invoice.automaticCollectionEnabled === true, 'COLLECTION_NOT_APPROVED');
  requirePolicy(invoice.disputed === false && invoice.onHold === false && invoice.status === 'unpaid', 'COLLECTION_BLOCKED');
  const time = timestamp(now);
  const issuedAt = timestamp(invoice.issuedAt), notifiedAt = timestamp(invoice.notifiedAt);
  requirePolicy(notifiedAt >= issuedAt && time >= notifiedAt + 7 * 86_400_000, 'GRACE_PERIOD_ACTIVE');
  requirePolicy(mandate?.active === true && mandate.businessId === invoice.businessId && mandate.currency === invoice.currency && Boolean(invoice.businessId), 'VALID_MANDATE_REQUIRED');
  requirePolicy(timestamp(mandate.expiresAt) > time, 'MANDATE_EXPIRED');
  requirePolicy(Number.isSafeInteger(invoice.amountMinor) && invoice.amountMinor > 0 && Number.isSafeInteger(mandate.limitMinor) && mandate.limitMinor >= invoice.amountMinor, 'MANDATE_LIMIT_EXCEEDED');
  return true;
}

/** Public account modes only; internal staff and admin memberships are separate. */
export function validateAccountModes(modes) {
  requirePolicy(Array.isArray(modes) && new Set(modes).size === modes.length && modes.every(m => ['consumer', 'manager', 'rider'].includes(m)), 'INVALID_ACCOUNT_MODES');
  requirePolicy(modes.includes('consumer'), 'CONSUMER_MODE_REQUIRED');
  requirePolicy(!(modes.includes('manager') && modes.includes('rider')), 'MANAGER_RIDER_CONFLICT');
  return true;
}
/** A passenger driver manages their own transport finances without store-manager mode. */
export function authorizeCommunityJoin({ actor, communityId, memberships }) {
  authenticated(actor);
  requirePolicy(actor.modes?.includes('rider'), 'RIDER_REQUIRED');
  validateAccountModes(actor.modes);
  requirePolicy(typeof communityId === 'string' && communityId.length > 0, 'INVALID_COMMUNITY');
  const active = new Set(memberships.filter(m => m.userId === actor.id && m.active === true).map(m => m.communityId));
  requirePolicy(!active.has(communityId), 'ALREADY_MEMBER');
  requirePolicy(active.size < 5, 'COMMUNITY_LIMIT');
  return true;
}
/** Trusted conversation membership is still required in addition to this routing policy. */
export function authorizePrivateChatRoute({ kinds, context }) {
  requirePolicy(Array.isArray(kinds) && kinds.length === 2, 'INVALID_PARTICIPANTS');
  const key = [...kinds].sort().join(':');
  requirePolicy(!kinds.includes('consumer') || !kinds.some(k => ['manager', 'employee', 'dispatch'].includes(k)), 'CONSUMER_ORGANIZATION_CHAT_FORBIDDEN');
  if (['consumer:rider','manager:rider','dispatch:rider'].includes(key)) {
    requirePolicy(context?.type === 'delivery' && typeof context.deliveryId === 'string' && context.deliveryId.length > 0, 'DELIVERY_CONTEXT_REQUIRED');
    return true;
  }
  if (['employee:manager','dispatch:manager','employee:employee','dispatch:employee'].includes(key)) {
    requirePolicy(context?.type === 'organization' && typeof context.organizationId === 'string' && context.organizationId.length > 0, 'ORGANIZATION_CONTEXT_REQUIRED');
    return true;
  }
  throw new PolicyError('CHAT_ROUTE_NOT_ALLOWED');
}
