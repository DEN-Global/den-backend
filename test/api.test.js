import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { handleRequest } from '../src/app.js';
import { openLocalDatabase } from '../src/local-database.js';
import { hashPassword } from '../src/security.js';

const origin='http://localhost:8787';
async function fixture(t) {
 const DB=openLocalDatabase();t.after(()=>DB.close());let now=Date.parse('2026-11-04T12:00:00Z');
 const env={DB,APP_ORIGIN:origin,MFA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),PRIMARY_ADMIN_ID:'admin',CLOCK:{now:()=>now}};
 const hash=await hashPassword('very-long-test-password');
 for(const[id,address]of[['admin','admin@example.test'],['owner','owner@example.test'],['other','other@example.test'],['staff','staff@example.test']]){
  await DB.prepare('INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)').bind(id,id,now).run();
  await DB.prepare('INSERT INTO den_credentials(user_id,email,display_name,password_hash) VALUES(?,?,?,?)').bind(id,address,id,hash).run();
 }
 await DB.prepare("INSERT INTO den_admin_accounts VALUES('admin','primary_super_admin','[]')").run();
 const client=()=>({cookie:'',csrf:'',async request(path,method='GET',body,extra={}){
  const result=await handleRequest(new Request(origin+path,{method,headers:{origin,'content-type':'application/json',...(this.cookie?{cookie:this.cookie}:{}),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  const data=await result.json();if(result.headers.has('set-cookie'))this.cookie=result.headers.get('set-cookie').split(';')[0];if(data.csrfToken)this.csrf=data.csrfToken;
  return {status:result.status,data};
 },async login(address){const r=await this.request('/api/auth/login','POST',{email:address,password:'very-long-test-password'});assert.equal(r.status,200,JSON.stringify(r));return this;}});
 return {env,DB,client,advance(ms){now+=ms;},now:()=>now};
}
async function enroll(admin,f){
 const setup=await admin.request('/api/auth/mfa/setup','POST',{password:'very-long-test-password'});assert.equal(setup.status,200,JSON.stringify(setup));
 const totp=new TOTP({secret:Secret.fromBase32(setup.data.secret),digits:6,period:30,algorithm:'SHA1'});
 assert.equal((await admin.request('/api/auth/mfa/confirm','POST',{code:totp.generate({timestamp:f.now()})})).status,200);
 return totp;
}
async function business(owner){
 const r=await owner.request('/api/businesses','POST',{legalName:'Test Warehouse Business',country:'NG',registeredAddress:'Test registered address'});assert.equal(r.status,201,JSON.stringify(r));
 const id=r.data.id;
 const facility=await owner.request(`/api/businesses/${id}/facilities`,'POST',{name:'Lagos test facility',country:'NG',address:'Test facility address',capacityKg:1000,services:['storage','packing']});assert.equal(facility.status,201,JSON.stringify(facility));
 assert.equal((await owner.request(`/api/businesses/${id}/submit`,'POST',{})).status,200);
 return {id,facilityId:facility.data.id};
}
test('anonymous requests, CSRF and origin checks fail closed',async t=>{
 const f=await fixture(t),client=f.client();assert.equal((await client.request('/api/businesses')).status,401);
 await client.login('owner@example.test');const csrf=client.csrf;client.csrf='';assert.equal((await client.request('/api/businesses','POST',{})).status,403);client.csrf=csrf;
 assert.equal((await client.request('/api/businesses','POST',{}, {origin:'https://attacker.test'})).status,403);
});
test('registration never grants admin roles and logout revokes sessions',async t=>{
 const f=await fixture(t),client=f.client();const r=await client.request('/api/auth/register','POST',{email:'new@example.test',name:'New owner',password:'very-long-test-password',adminLevel:'primary_super_admin'});assert.equal(r.status,201);
 await client.login('new@example.test');const me=await client.request('/api/auth/me');assert.equal(me.data.user.adminLevel,null);
 assert.equal((await client.request('/api/auth/logout','POST',{})).status,200);assert.equal((await client.request('/api/auth/me')).status,401);
});
test('owner registers pending business and facility; other tenants and forged approvals are rejected',async t=>{
 const f=await fixture(t),owner=await f.client().login('owner@example.test'),other=await f.client().login('other@example.test');const b=await business(owner);
 assert.equal((await owner.request('/api/businesses')).data.businesses[0].first_approved_at,null);
 assert.equal((await other.request(`/api/businesses/${b.id}/facilities`)).status,404);
 assert.equal((await owner.request(`/api/admin/businesses/${b.id}/review`,'POST',{decision:'approved'})).status,403);
 assert.equal((await owner.request('/api/international/bookings','POST',{})).status,423);
 const bad=await owner.request(`/api/businesses/${b.id}/facilities`,'POST',{name:'bad',country:'NG',address:'x',capacityKg:-1,services:[]});assert.equal(bad.status,400);
});
test('MFA-backed admin approval, facility-scoped invitation and idempotent operational record work end to end',async t=>{
 const f=await fixture(t),owner=await f.client().login('owner@example.test'),admin=await f.client().login('admin@example.test'),staff=await f.client().login('staff@example.test');const b=await business(owner);
 assert.equal((await admin.request('/api/admin/businesses')).status,403);
 await enroll(admin,f);
 const review=await admin.request(`/api/admin/businesses/${b.id}/review`,'POST',{decision:'approved',verificationKey:'opaque-verified-test-business',reason:'Test verification completed'});assert.equal(review.status,200,JSON.stringify(review));
 assert.equal((await owner.request('/api/businesses')).data.businesses[0].first_approved_at,f.now());
 assert.equal((await admin.request(`/api/admin/facilities/${b.facilityId}/approve`,'POST',{reason:'Test facility review'})).status,200);
 const invite=await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['receiving_officer']});assert.equal(invite.status,201,JSON.stringify(invite));
 assert.equal((await staff.request('/api/invitations/accept','POST',{token:invite.data.token})).status,200);
 assert.equal((await staff.request('/api/invitations/accept','POST',{token:invite.data.token})).status,400);
 assert.equal((await staff.request('/api/my-facilities')).data.facilities.length,1);
 const payload={operation:'receive',packageReference:'TEST-PACKAGE-1',notes:'Package received intact'};
 const record=await staff.request(`/api/facilities/${b.facilityId}/records`,'POST',payload,{'idempotency-key':'test-receipt-1'});assert.equal(record.status,201,JSON.stringify(record));
 assert.equal((await staff.request(`/api/facilities/${b.facilityId}/records`,'POST',payload,{'idempotency-key':'test-receipt-1'})).data.replayed,true);
 assert.equal((await staff.request(`/api/facilities/${b.facilityId}/records`,'POST',{...payload,operation:'dispatch'},{'idempotency-key':'test-dispatch-1'})).status,403);
 assert.equal((await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['finance_admin']})).status,400);
 assert.ok((await owner.request(`/api/businesses/${b.id}/activity`)).data.events.length>=6);
 assert.equal((await staff.request('/api/international/bookings','POST',{})).status,423);
 const revoked=await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['inventory_officer']});
 assert.equal((await owner.request(`/api/businesses/${b.id}/invitations/${revoked.data.id}/revoke`,'POST',{})).status,200);
 assert.equal((await staff.request('/api/invitations/accept','POST',{token:revoked.data.token})).status,400);
 assert.equal((await owner.request(`/api/businesses/${b.id}/members/${b.facilityId}/staff`,'PUT',{roles:[]})).status,200);
 assert.equal((await staff.request(`/api/facilities/${b.facilityId}/records`,'POST',payload,{'idempotency-key':'after-revocation'})).status,403);
});
test('non-primary admin cannot unlock trade; fresh primary MFA is enforced and revision conflicts are rejected',async t=>{
 const f=await fixture(t),admin=await f.client().login('admin@example.test'),owner=await f.client().login('owner@example.test');
 assert.equal((await owner.request('/api/admin/trade','POST',{enabled:true,countries:['NG'],revision:0})).status,403);
 await enroll(admin,f);
 const unlock=await admin.request('/api/admin/trade','POST',{enabled:true,countries:['NG'],revision:0});assert.equal(unlock.status,200,JSON.stringify(unlock));
 assert.equal((await admin.request('/api/admin/trade','POST',{enabled:false,countries:[],revision:0})).status,409);
 f.advance(300001);assert.equal((await admin.request('/api/admin/trade','POST',{enabled:false,countries:[],revision:1})).status,403);
});
test('expired sessions are rejected and setup requires the correct password',async t=>{
 const f=await fixture(t),owner=await f.client().login('owner@example.test');
 assert.equal((await owner.request('/api/auth/mfa/setup','POST',{password:'wrong-password'})).status,401);
 f.advance(28800001);assert.equal((await owner.request('/api/businesses')).status,401);
});
test('persisted business and schema checksums survive a local database restart',async t=>{
 const {mkdtempSync,rmSync,readdirSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'den-persistence-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'local.sqlite');let db=openLocalDatabase(path);
 await db.prepare("INSERT INTO den_users(id,auth_subject,created_at) VALUES('persistent-user','persistent-subject',0)").run();
 await db.prepare("INSERT INTO den_warehouse_businesses(id,owner_id,legal_name,country,created_at) VALUES('persistent-business','persistent-user','Persisted business','NG',0)").run();db.close();
 db=openLocalDatabase(path);t.after(()=>db.close());assert.equal((await db.prepare("SELECT legal_name FROM den_warehouse_businesses WHERE id='persistent-business'").first()).legal_name,'Persisted business');
 assert.equal((await db.prepare('SELECT count(*) AS n FROM den_schema_migrations').first()).n,readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).length);
});

test('lesser super admin cannot change the master lock through the real API with fresh MFA',async t=>{
 const f=await fixture(t);await f.DB.prepare("INSERT INTO den_admin_accounts VALUES('other','lesser_super_admin','[]')").run();
 const lesser=await f.client().login('other@example.test');await enroll(lesser,f);
 assert.equal((await lesser.request('/api/admin/trade','POST',{enabled:true,countries:['NG'],revision:0})).status,403);
 assert.equal((await lesser.request('/api/trade')).data.enabled,false);
});
test('pending facilities cannot operate and expired or wrong-recipient invitations cannot be redeemed',async t=>{
 const f=await fixture(t),owner=await f.client().login('owner@example.test'),staff=await f.client().login('staff@example.test'),other=await f.client().login('other@example.test');const b=await business(owner);
 await f.DB.prepare("UPDATE den_warehouse_businesses SET status='approved',verification_key='test-only-verified',first_approved_at=? WHERE id=?").bind(f.now(),b.id).run();
 const invitation=await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['receiving_officer']});
 assert.equal((await other.request('/api/invitations/accept','POST',{token:invitation.data.token})).status,400);
 assert.equal((await staff.request('/api/invitations/accept','POST',{token:invitation.data.token})).status,200);
 assert.equal((await staff.request(`/api/facilities/${b.facilityId}/records`,'POST',{operation:'receive',packageReference:'pending-facility-test',notes:''},{'idempotency-key':'pending-facility-test'})).status,409);
 const expired=await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['inventory_officer']});
 await f.DB.prepare('UPDATE den_staff_invitations SET expires_at=? WHERE id=?').bind(f.now()-1,expired.data.id).run();
 assert.equal((await staff.request('/api/invitations/accept','POST',{token:expired.data.token})).status,400);
 await f.DB.prepare("UPDATE den_users SET status='suspended' WHERE id='staff'").run();
 assert.equal((await staff.request('/api/my-facilities')).status,401);
});
test('audit batches make concurrent invitation redemption single-use',async t=>{
 const f=await fixture(t),owner=await f.client().login('owner@example.test'),staff=await f.client().login('staff@example.test');const b=await business(owner);
 await f.DB.prepare("UPDATE den_warehouse_businesses SET status='approved',verification_key='concurrency-test-business',first_approved_at=? WHERE id=?").bind(f.now(),b.id).run();
 const invitation=await owner.request(`/api/businesses/${b.id}/invitations`,'POST',{email:'staff@example.test',facilityId:b.facilityId,roles:['receiving_officer']});
 const results=await Promise.all([staff.request('/api/invitations/accept','POST',{token:invitation.data.token}),staff.request('/api/invitations/accept','POST',{token:invitation.data.token})]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.ok([400,409].includes(results.find(r=>r.status!==200).status));
 assert.equal((await f.DB.prepare('SELECT count(*) AS n FROM den_facility_memberships WHERE facility_id=?').bind(b.facilityId).first()).n,1);
});

test('password whitespace is preserved rather than silently normalized',async t=>{
 const f=await fixture(t),client=f.client();
 assert.equal((await client.request('/api/auth/register','POST',{email:'spaces@example.test',name:'Spaces',password:'  a-long-password  '})).status,201);
 assert.equal((await client.request('/api/auth/login','POST',{email:'spaces@example.test',password:'a-long-password'})).status,401);
 assert.equal((await client.request('/api/auth/login','POST',{email:'spaces@example.test',password:'  a-long-password  '})).status,200);
});
