import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTradeState, changeTradeState, authorizeTrade, assignInternationalRole, authorizeFacility, warehouseCommission } from '../src/policy.js';
const now = Date.parse('2026-11-04T12:00:00Z');
const actor = { adminLevel: 'primary_super_admin', id: 'primary', authenticated: true, authenticatedAt: now, mfaVerified: true, tenantId: 'business-a', permissions: ['trade.book', 'trade.history', 'trade.continue', 'trade.continue_locked', 'roles.assign'] };
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

import { authorizeAdminChange, progressiveCommission, authorizeAutomaticCollection } from '../src/policy.js';
test('primary protects its own account and controls lesser super admins',()=>{
  assert.equal(authorizeAdminChange({actor,primaryAdminId:'primary',target:{id:'lesser',adminLevel:'lesser_super_admin'},requestedLevel:'lesser_super_admin',now}),true);
  fails(()=>authorizeAdminChange({actor,primaryAdminId:'primary',target:{id:'primary'},requestedLevel:'ordinary',now}),'PRIMARY_ACCOUNT_PROTECTED');
});
test('lesser super admins manage ordinary admins but cannot promote or alter peers',()=>{
  const lesser={...actor,id:'lesser',adminLevel:'lesser_super_admin'};
  const request={actor:lesser,primaryAdminId:'primary',target:{id:'staff',adminLevel:'ordinary'},requestedLevel:'ordinary',now};
  assert.equal(authorizeAdminChange(request),true);
  fails(()=>authorizeAdminChange({...request,requestedLevel:'lesser_super_admin'}),'SUPER_ACCOUNT_PROTECTED');
  fails(()=>authorizeAdminChange({...request,target:{id:'peer',adminLevel:'lesser_super_admin'}}),'SUPER_ACCOUNT_PROTECTED');
});
test('ordinary admins cannot assign international roles despite an accidental permission',()=>fails(()=>assignInternationalRole({actor:{...actor,adminLevel:'ordinary'},state:transition().state,targetId:'staff',role:'warehouse_admin'}),'SUPER_ADMIN_REQUIRED'));
const schedule={status:'approved',approvedBy:'test-finance',brackets:[{upToMinor:10000,basisPoints:1000},{upToMinor:20000,basisPoints:500},{upToMinor:null,basisPoints:100}]};
test('progressive commission applies each rate only to its marginal portion',()=>{
  const result=progressiveCommission({amountMinor:30000,schedule});
  assert.equal(result.commissionMinor,1600);
  assert.deepEqual(result.breakdown.map(b=>b.portionMinor),[10000,10000,10000]);
});
test('progressive schedules reject unapproved and malformed brackets',()=>{
  fails(()=>progressiveCommission({amountMinor:1,schedule:{...schedule,status:'proposed'}}),'APPROVED_PRICING_REQUIRED');
  fails(()=>progressiveCommission({amountMinor:1,schedule:{...schedule,brackets:[{upToMinor:100,basisPoints:10}]}}),'INVALID_BRACKETS');
});
const invoice={approved:true,automaticCollectionEnabled:true,disputed:false,onHold:false,status:'unpaid',issuedAt:now,notifiedAt:now,businessId:'business-a',currency:'NGN',amountMinor:1000};
const mandate={active:true,businessId:'business-a',currency:'NGN',limitMinor:1000,expiresAt:now+30*day};
const collect=(overrides={})=>authorizeAutomaticCollection({actor:{...actor,permissions:['finance.collect']},invoice,mandate,now:now+7*day,...overrides});
test('automatic collection requires seven full days and explicit enablement',()=>{
  assert.equal(collect(),true);
  fails(()=>collect({now:now+7*day-1}),'GRACE_PERIOD_ACTIVE');
  fails(()=>collect({invoice:{...invoice,automaticCollectionEnabled:false}}),'COLLECTION_NOT_APPROVED');
});
test('disputes, holds, and paid invoices block collection',()=>{
  for(const patch of [{disputed:true},{onHold:true},{status:'paid'}]) fails(()=>collect({invoice:{...invoice,...patch}}),'COLLECTION_BLOCKED');
});
test('mandate must be current, business scoped, currency matched and sufficient',()=>{
  fails(()=>collect({mandate:{...mandate,businessId:'other'}}),'VALID_MANDATE_REQUIRED');
  fails(()=>collect({mandate:{...mandate,currency:'USD'}}),'VALID_MANDATE_REQUIRED');
  fails(()=>collect({mandate:{...mandate,expiresAt:now}}),'MANDATE_EXPIRED');
  fails(()=>collect({mandate:{...mandate,limitMinor:999}}),'MANDATE_LIMIT_EXCEEDED');
});

import { validateAccountModes, authorizeCommunityJoin, authorizePrivateChatRoute } from '../src/policy.js';
test('consumer can pair with manager or rider, never both',()=>{
  for(const modes of [['consumer'],['consumer','manager'],['consumer','rider']]) assert.equal(validateAccountModes(modes),true);
  fails(()=>validateAccountModes(['consumer','manager','rider']),'MANAGER_RIDER_CONFLICT');
  fails(()=>validateAccountModes(['manager']),'CONSUMER_MODE_REQUIRED');
});
test('rider community cap is five distinct active memberships',()=>{
  const rider={...actor,modes:['consumer','rider']};
  const memberships=Array.from({length:5},(_,i)=>({userId:rider.id,communityId:`c${i}`,active:true}));
  fails(()=>authorizeCommunityJoin({actor:rider,communityId:'c6',memberships}),'COMMUNITY_LIMIT');
  assert.equal(authorizeCommunityJoin({actor:rider,communityId:'c6',memberships:memberships.slice(0,4)}),true);
  fails(()=>authorizeCommunityJoin({actor:rider,communityId:'c0',memberships}),'ALREADY_MEMBER');
});
test('consumer cannot privately message an organization through staff identities',()=>{
  for(const kind of ['manager','employee','dispatch']) fails(()=>authorizePrivateChatRoute({kinds:['consumer',kind],context:{type:'delivery',deliveryId:'d1'}}),'CONSUMER_ORGANIZATION_CHAT_FORBIDDEN');
});
test('delivery chat requires a delivery context',()=>{
  fails(()=>authorizePrivateChatRoute({kinds:['rider','consumer'],context:{type:'organization',organizationId:'o1'}}),'DELIVERY_CONTEXT_REQUIRED');
  assert.equal(authorizePrivateChatRoute({kinds:['rider','consumer'],context:{type:'delivery',deliveryId:'d1'}}),true);
});
test('team chats require organization context and unknown routes fail closed',()=>{
  assert.equal(authorizePrivateChatRoute({kinds:['manager','employee'],context:{type:'organization',organizationId:'o1'}}),true);
  fails(()=>authorizePrivateChatRoute({kinds:['consumer','consumer']}),'CHAT_ROUTE_NOT_ALLOWED');
});

test('delayed invoice notification does not shorten the grace period',()=>fails(()=>collect({invoice:{...invoice,notifiedAt:now+day}}),'GRACE_PERIOD_ACTIVE'));
