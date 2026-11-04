import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTradeState, changeTradeState, authorizeTrade, assignInternationalRole, authorizeFacility, warehouseCommission } from '../src/policy.js';
const now = Date.parse('2026-11-04T12:00:00Z');
const actor = { id: 'primary', authenticated: true, authenticatedAt: now, mfaVerified: true, tenantId: 'business-a', permissions: ['trade.book', 'trade.history', 'trade.continue', 'trade.continue_locked', 'roles.assign'] };
const transition = (overrides={}) => changeTradeState({ actor, primaryAdminId: 'primary', current: initialTradeState(), enabled: true, countries: ['NG'], now, expectedRevision: 0, ...overrides });
const fails = (fn, code) => assert.throws(fn, e => e.code === code);
test('international trade starts locked and booking is denied', () => {
  assert.equal(initialTradeState().enabled, false);
  fails(()=>authorizeTrade({actor,state:initialTradeState(),country:'NG',action:'book'}),'TRADE_LOCKED');
});
test('other super admins cannot unlock', () => fails(()=>transition({actor:{...actor,id:'other',roles:['super_admin']}}),'PRIMARY_ADMIN_ONLY'));
test('missing primary identity fails closed', () => fails(()=>transition({primaryAdminId:''}),'PRIMARY_ADMIN_ONLY'));
test('MFA is mandatory', () => fails(()=>transition({actor:{...actor,mfaVerified:false}}),'MFA_REQUIRED'));
test('stale or future authentication is rejected', () => {
  for(const time of [now-300_001, now+1]) fails(()=>transition({actor:{...actor,authenticatedAt:time}}),'FRESH_AUTH_REQUIRED');
});
test('state transition detects concurrent changes', () => fails(()=>transition({expectedRevision:4}),'REVISION_CONFLICT'));
test('activation records actor and audit without granting roles', () => {
  const result=transition(); assert.equal(result.audit.actorId,'primary'); assert.equal(result.state.revision,1); assert.equal(result.state.roles,undefined);
});
test('country activation is enforced', () => fails(()=>authorizeTrade({actor,state:transition().state,country:'GH',action:'book'}),'COUNTRY_DISABLED'));
test('lock preserves scoped history and controlled continuation', () => {
  for(const action of ['history','continue']) assert.equal(authorizeTrade({actor,state:initialTradeState(),action,shipment:{tenantId:'business-a',status:'in_progress'}}),true);
  fails(()=>authorizeTrade({actor,state:initialTradeState(),action:'history',shipment:{tenantId:'other'}}),'TENANT_FORBIDDEN');
});
test('specialized role assignment requires unlocked trade',()=>fails(()=>assignInternationalRole({actor,targetId:'staff',role:'warehouse_admin',state:initialTradeState()}),'TRADE_LOCKED'));
const facility={id:'f1',tenantId:'business-a'};
const membership={userId:'primary',tenantId:'business-a',facilityId:'f1',active:true,role:'receiving_officer'};
test('warehouse access is limited to facility and assigned operation',()=>{
  assert.equal(authorizeFacility({actor,facility,memberships:[membership],action:'receive'}),true);
  fails(()=>authorizeFacility({actor,facility:{...facility,id:'f2'},memberships:[membership],action:'receive'}),'FACILITY_FORBIDDEN');
  fails(()=>authorizeFacility({actor,facility,memberships:[membership],action:'dispatch'}),'FACILITY_FORBIDDEN');
});
test('cross tenant and inactive memberships are rejected',()=>{
  fails(()=>authorizeFacility({actor,facility:{...facility,tenantId:'other'},memberships:[membership],action:'receive'}),'TENANT_FORBIDDEN');
  fails(()=>authorizeFacility({actor,facility,memberships:[{...membership,active:false}],action:'receive'}),'FACILITY_FORBIDDEN');
});
const day=86_400_000;
const rule={id:'approved-example',approvedBy:'finance-test',status:'approved',service:'warehouse',country:'NG',currency:'NGN',basisPoints:500,effectiveFrom:now};
const quote=(overrides={})=>warehouseCommission({amountMinor:10000,currency:'NGN',country:'NG',approvedAt:now,transactionAt:now+30*day,rules:[rule],...overrides});
test('holiday ends exactly at 30 days from business approval',()=>{
  assert.equal(quote({transactionAt:now+30*day-1}).commissionMinor,0);
  assert.equal(quote().commissionMinor,500);
});
test('pre-activation transactions are rejected',()=>fails(()=>quote({transactionAt:now-1}),'BUSINESS_NOT_ACTIVE'));
test('provisional, absent, expired and wrong-country rates cannot bill',()=>{
  for(const rules of [[],[{...rule,status:'proposed'}],[{...rule,country:'GH'}],[{...rule,effectiveTo:now+day}]]) fails(()=>quote({rules}),'APPROVED_PRICING_REQUIRED');
});
test('overlapping prices require resolution',()=>fails(()=>quote({rules:[rule,{...rule,id:'duplicate'}]}),'AMBIGUOUS_PRICING'));
test('money rejects fractions and uses exact half-up rounding',()=>{
  fails(()=>quote({amountMinor:1.5}),'INVALID_AMOUNT');
  assert.equal(quote({amountMinor:10}).commissionMinor,1);
  assert.equal(quote({amountMinor:Number.MAX_SAFE_INTEGER}).commissionMinor,450359962737050);
});
