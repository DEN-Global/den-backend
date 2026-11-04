import {handleAdminConsole,enforceAdminPage,adminSection} from './admin-console.js';
import {handleCommunity} from './community.js';
import { handleServices } from './services-api.js';
import { handlePlatform } from './platform.js';
import { handleMobility } from './mobility.js';
import { response, readJson, ensure, text, email, password as passwordValue, HttpError } from './http.js';
import { randomToken, hashToken, hashPassword, verifyPassword, encryptSecret, decryptSecret, newTotp, checkTotp, constantTimeEqual } from './security.js';
import { createAuditRecord, auditGenesis } from './audit.js';
import { changeTradeState, authorizeFacility, PolicyError } from './policy.js';

const DUMMY_PASSWORD_HASH='scrypt:32768:8:3:00000000000000000000000000000000:fe9e18dc4b21500f22ff81ba92b7b2afafffdae5d8ff84ace233b05b455e79f3749106a05d521d1f9d94a01d978433ba3fb4ffee437ff518fb17aa0013741ac2';
const roles=['warehouse_manager','receiving_officer','inventory_officer','packing_officer','dispatch_officer','warehouse_auditor'];
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>q(db,sql,...args).first();
const all=async(db,sql,...args)=>(await q(db,sql,...args).all()).results;
const run=(db,sql,...args)=>q(db,sql,...args).run();
const nowOf=env=>env.CLOCK?.now?.() ?? Date.now();
const cookie=(request)=>request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('den_session='))?.slice(12);
const sessionCookie=(token,request,age=28800)=>`den_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
const publicUser=u=>({id:u.id,email:u.email,name:u.display_name,adminLevel:u.level??null,mfaEnabled:Boolean(u.totp_enabled),adminRole:u.roleName??null,permissions:u.permissions??[]});
async function rateLimit(env,key,limit,windowMs) {
 const now=nowOf(env), bucket=`${Math.floor(now/windowMs)}:${await hashToken(key)}`;
 const result=await first(env.DB,'INSERT INTO den_rate_buckets(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',bucket,now+windowMs);
 ensure(result.count<=limit,429,'RATE_LIMITED');
 await run(env.DB,'DELETE FROM den_rate_buckets WHERE expires_at < ?',now);
}
async function session(request,env) {
 const token=cookie(request);ensure(token,401,'SIGN_IN_REQUIRED');
 const s=await first(env.DB,`SELECT s.*,u.status,c.email,c.display_name,c.totp_enabled,c.totp_secret,c.last_totp_counter,a.level,a.permissions FROM den_sessions s JOIN den_users u ON u.id=s.user_id JOIN den_credentials c ON c.user_id=u.id LEFT JOIN den_admin_accounts a ON a.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`,await hashToken(token),nowOf(env));
 ensure(s?.status==='active',401,'SESSION_EXPIRED');
 const assignment=await first(env.DB,'SELECT t.name,t.permissions,t.revision,t.id FROM den_admin_role_assignments r JOIN den_admin_role_templates t ON t.id=r.role_id WHERE r.user_id=?',s.user_id);
 return {...s,roleName:assignment?.name??null,roleId:assignment?.id??null,roleRevision:assignment?.revision??null,id:s.user_id,authenticated:true,authenticatedAt:s.authenticated_at,mfaVerified:Boolean(s.mfa_at && nowOf(env)-s.mfa_at<=300000),adminLevel:s.level,permissions:JSON.parse(assignment?.permissions??s.permissions??'[]')};
}
async function auditBatch(env,actor,action,payload,statements) {
 if(actor.adminSection&&actor.id!==env.PRIMARY_ADMIN_ID){statements=[q(env.DB,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,NOT EXISTS(SELECT 1 FROM den_admin_page_locks WHERE page=? AND locked=1))',crypto.randomUUID(),actor.adminSection),q(env.DB,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,EXISTS(SELECT 1 FROM den_sessions WHERE token_hash=?))',crypto.randomUUID(),actor.token_hash),...statements];}
 const head=await first(env.DB,'SELECT sequence,event_hash FROM den_audit_events ORDER BY sequence DESC LIMIT 1');
 const record=await createAuditRecord({sequence:(head?.sequence??0)+1,actorId:actor.id,action,occurredAt:nowOf(env),payload:JSON.stringify(payload),previousHash:head?.event_hash??auditGenesis});
 // A duplicate sequence/hash from a concurrent append makes D1 roll back the entire batch.
 const guard=crypto.randomUUID();
 return env.DB.batch([q(env.DB,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,(SELECT COALESCE(MAX(sequence),0)=? FROM den_audit_events))',guard,head?.sequence??0),...statements,q(env.DB,'INSERT INTO den_audit_events(sequence,actor_id,action,occurred_at,payload,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?)',record.sequence,actor.id,action,record.occurredAt,record.payload,record.previousHash,record.eventHash),q(env.DB,'DELETE FROM den_transaction_guards')]);
}
async function ownBusiness(env,actor,id,approved=false) {
 const b=await first(env.DB,'SELECT * FROM den_warehouse_businesses WHERE id=? AND owner_id=?',id,actor.id);
 ensure(b,404,'BUSINESS_NOT_FOUND');if(approved)ensure(b.status==='approved',409,'BUSINESS_APPROVAL_REQUIRED');return b;
}
function freshAdmin(actor,env,permission) {
 ensure(actor.level,403,'ADMIN_REQUIRED');
 ensure(actor.mfaVerified && nowOf(env)-actor.authenticatedAt<=300000,403,'FRESH_MFA_REQUIRED');
 ensure(['primary_super_admin','lesser_super_admin'].includes(actor.level)||actor.permissions.includes(permission),403,'PERMISSION_DENIED');
}
function parseFacility(body) {
 const capacity=Number(body.capacityKg);ensure(Number.isSafeInteger(capacity)&&capacity>=0&&capacity<=1e12,400,'INVALID_CAPACITY');
 ensure(Array.isArray(body.services)&&body.services.length<=20&&body.services.every(x=>typeof x==='string'&&x.length<=80),400,'INVALID_SERVICES');
 return {name:text(body.name,'name',120),country:text(body.country,'country',2,2),address:text(body.address,'address',1000),capacity,services:JSON.stringify(body.services)};
}
function parseRoles(value,allowEmpty=false) {
 ensure(Array.isArray(value)&&(allowEmpty||value.length>0)&&value.length<=6&&value.every(r=>roles.includes(r)),400,'INVALID_FACILITY_ROLES');return [...new Set(value)];
}
async function country(env,code) {ensure(await first(env.DB,'SELECT code FROM den_countries WHERE code=?',code),400,'COUNTRY_NOT_CONFIGURED');}

export async function handleRequest(request,env) {
 const url=new URL(request.url),path=url.pathname,method=request.method,db=env.DB;
 try {
  ensure(db,503,'DATABASE_NOT_CONFIGURED');
  if(!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : response({error:'NOT_FOUND'},404);
  if(method!=='GET') {
   ensure(request.headers.get('origin')===(env.APP_ORIGIN??url.origin),403,'ORIGIN_REJECTED');
   const ip=request.headers.get('cf-connecting-ip')??'local';
   await rateLimit(env,`write:${ip}`,90,60000);
  }
  if(path==='/api/health'&&method==='GET') return response({status:'ok',service:'DEN shared platform API',contractVersion:'1.0.0'});
  if(path==='/api/auth/register'&&method==='POST') {
   const body=await readJson(request),address=email(body.email),name=text(body.name,'name',100),password=passwordValue(body.password,12);
   await rateLimit(env,`register:${request.headers.get('cf-connecting-ip')??'local'}`,5,3600000);
   const id=crypto.randomUUID(),hash=await hashPassword(password),now=nowOf(env);
   ensure(!await first(db,'SELECT user_id FROM den_credentials WHERE email=?',address),409,'ACCOUNT_EXISTS');
   await db.batch([q(db,"INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)",id,`password:${id}`,now),q(db,'INSERT INTO den_credentials(user_id,email,display_name,password_hash) VALUES(?,?,?,?)',id,address,name,hash)]);
   return response({id,message:'Account created. Sign in to continue.'},201);
  }
  if(path==='/api/auth/login'&&method==='POST') {
   const body=await readJson(request),address=email(body.email),password=passwordValue(body.password);
   await rateLimit(env,`login:${request.headers.get('cf-connecting-ip')??'local'}`,12,900000);
   const user=await first(db,'SELECT c.*,u.status FROM den_credentials c JOIN den_users u ON u.id=c.user_id WHERE c.email=?',address);
   // Equal-cost verification for unknown addresses avoids a cheap account enumeration path.
   const hash=user?.password_hash??DUMMY_PASSWORD_HASH;
   ensure(await verifyPassword(password,hash)&&user?.status==='active',401,'INVALID_CREDENTIALS');
   await rateLimit(env,`login-account:${address}`,12,900000);
   let counter=null;
   if(user.totp_enabled) {
    counter=checkTotp(decryptSecret(user.totp_secret,env.MFA_ENCRYPTION_KEY),body.code,nowOf(env));
    ensure(counter!==null&&counter>user.last_totp_counter,401,'MFA_CODE_REQUIRED_OR_REUSED');
   }
   const token=randomToken(),csrf=randomToken(),now=nowOf(env);
   await run(db,'DELETE FROM den_sessions WHERE expires_at<=?',now);
   const statements=[];
   if(counter!==null)statements.push(q(db,'UPDATE den_credentials SET last_totp_counter=? WHERE user_id=?',counter,user.user_id));
   statements.push(q(db,'INSERT INTO den_sessions(token_hash,user_id,created_at,expires_at,authenticated_at,mfa_at,csrf_token) VALUES(?,?,?,?,?,?,?)',await hashToken(token),user.user_id,now,now+28800000,now,counter!==null?now:null,csrf));
   await db.batch(statements);
   return response({csrfToken:csrf},200,{'set-cookie':sessionCookie(token,request)});
  }
  const actor=await session(request,env);
  if(method!=='GET') ensure(await constantTimeEqual(request.headers.get('x-csrf-token'),actor.csrf_token),403,'CSRF_REJECTED');
  const section=adminSection(path);if(section){await enforceAdminPage(env,actor,section);actor.adminSection=section;}
  if(path==='/api/auth/me'&&method==='GET')return response({user:publicUser(actor),csrfToken:actor.csrf_token,freshMfa:actor.mfaVerified});
  if(path==='/api/auth/logout'&&method==='POST'){await run(db,'DELETE FROM den_sessions WHERE token_hash=?',actor.token_hash);return response({ok:true},200,{'set-cookie':sessionCookie('',request,0)});}
  if(path==='/api/auth/mfa/setup'&&method==='POST') {
   ensure(!actor.totp_enabled,409,'MFA_ALREADY_ENABLED');
   const body=await readJson(request),credentials=await first(db,'SELECT password_hash FROM den_credentials WHERE user_id=?',actor.id);
   ensure(await verifyPassword(passwordValue(body.password),credentials.password_hash),401,'INVALID_CREDENTIALS');
   const totp=newTotp(actor.email);
   await run(db,'UPDATE den_credentials SET totp_secret=? WHERE user_id=? AND totp_enabled=0',encryptSecret(totp.secret,env.MFA_ENCRYPTION_KEY),actor.id);
   return response({secret:totp.secret,uri:totp.uri});
  }
  if(path==='/api/auth/mfa/confirm'&&method==='POST') {
   ensure(actor.totp_secret&&!actor.totp_enabled,409,'MFA_SETUP_REQUIRED');const body=await readJson(request);
   await rateLimit(env,`mfa-confirm:${actor.id}`,6,300000);
   const counter=checkTotp(decryptSecret(actor.totp_secret,env.MFA_ENCRYPTION_KEY),body.code,nowOf(env));ensure(counter!==null,400,'INVALID_MFA_CODE');
   await auditBatch(env,actor,'auth.mfa.enabled',{},[q(db,'UPDATE den_credentials SET totp_enabled=1,last_totp_counter=? WHERE user_id=?',counter,actor.id),q(db,'DELETE FROM den_sessions WHERE user_id=? AND token_hash!=?',actor.id,actor.token_hash),q(db,'UPDATE den_sessions SET mfa_at=?,authenticated_at=? WHERE token_hash=?',nowOf(env),nowOf(env),actor.token_hash)]);
   return response({ok:true});
  }
  if(path==='/api/auth/reauth'&&method==='POST') {
   const body=await readJson(request),credentials=await first(db,'SELECT * FROM den_credentials WHERE user_id=?',actor.id);
   await rateLimit(env,`reauth:${actor.id}`,8,900000);
   ensure(await verifyPassword(passwordValue(body.password),credentials.password_hash),401,'INVALID_CREDENTIALS');
   ensure(credentials.totp_enabled,403,'MFA_ENROLLMENT_REQUIRED');
   const counter=checkTotp(decryptSecret(credentials.totp_secret,env.MFA_ENCRYPTION_KEY),body.code,nowOf(env));ensure(counter!==null&&counter>credentials.last_totp_counter,401,'INVALID_OR_REUSED_MFA_CODE');
   await db.batch([q(db,'UPDATE den_credentials SET last_totp_counter=? WHERE user_id=?',counter,actor.id),q(db,'UPDATE den_sessions SET mfa_at=?,authenticated_at=? WHERE token_hash=?',nowOf(env),nowOf(env),actor.token_hash)]);
   return response({ok:true});
  }
  if(path==='/api/countries'&&method==='GET')return response({countries:await all(db,'SELECT * FROM den_countries ORDER BY code')});
  if(path==='/api/trade'&&method==='GET'){const s=await first(db,'SELECT * FROM den_trade_state WHERE singleton=1');return response({enabled:Boolean(s.enabled),revision:s.revision,countries:await all(db,'SELECT code FROM den_countries WHERE international_enabled=1 AND active=1')});}
  if(path==='/api/admin/trade'&&method==='POST') {
   const body=await readJson(request),current=await first(db,'SELECT * FROM den_trade_state WHERE singleton=1');
   const transition=changeTradeState({actor,primaryAdminId:env.PRIMARY_ADMIN_ID,current,enabled:body.enabled,countries:body.countries,now:nowOf(env),expectedRevision:body.revision});
   for(const code of transition.state.countries)await country(env,code);
   const tradeGuard=crypto.randomUUID();
   const statements=[q(db,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,(SELECT revision=? FROM den_trade_state WHERE singleton=1))',tradeGuard,current.revision),q(db,'DELETE FROM den_transaction_guards WHERE id=?',tradeGuard),q(db,'UPDATE den_trade_state SET enabled=?,revision=?,changed_at=?,changed_by=? WHERE singleton=1 AND revision=?',Number(body.enabled),transition.state.revision,nowOf(env),actor.id,current.revision),q(db,'UPDATE den_countries SET international_enabled=0')];
   for(const code of transition.state.countries)statements.push(q(db,'UPDATE den_countries SET international_enabled=1 WHERE code=?',code));
   await auditBatch(env,actor,transition.audit.action,{countries:body.countries,revision:transition.state.revision},statements);
   return response(transition.state);
  }
  const helpers={q,first,all,run,auditBatch,nowOf,freshAdmin};
  const consoleResult=await handleAdminConsole(request,env,actor,helpers);if(consoleResult)return consoleResult;
  const platformResult=await handlePlatform(request,env,actor,helpers);if(platformResult)return platformResult;
  const communityResult=await handleCommunity(request,env,actor,helpers);if(communityResult)return communityResult;
  const serviceResult=await handleServices(request,env,actor,helpers);if(serviceResult)return serviceResult;
  const mobilityResult=await handleMobility(request,env,actor,helpers);if(mobilityResult)return mobilityResult;
  if(path==='/api/businesses'&&method==='GET')return response({businesses:await all(db,'SELECT * FROM den_warehouse_businesses WHERE owner_id=? ORDER BY created_at DESC',actor.id)});
  if(path==='/api/businesses'&&method==='POST') {
   const body=await readJson(request),legalName=text(body.legalName,'legal_name',200),code=text(body.country,'country',2,2);await country(env,code);
   const id=crypto.randomUUID(),profile={registeredAddress:text(body.registeredAddress,'registered_address',1000)};
   await auditBatch(env,actor,'warehouse.business.registered',{businessId:id},[q(db,'INSERT INTO den_warehouse_businesses(id,owner_id,legal_name,country,created_at,profile) VALUES(?,?,?,?,?,?)',id,actor.id,legalName,code,nowOf(env),JSON.stringify(profile))]);
   return response({id},201);
  }
  let match=path.match(/^\/api\/businesses\/([^/]+)\/submit$/);
  if(match&&method==='POST') {
   const b=await ownBusiness(env,actor,match[1]);ensure(b.status==='pending',409,'INVALID_BUSINESS_STATE');
   ensure(await first(db,'SELECT id FROM den_warehouse_facilities WHERE business_id=?',b.id),400,'FACILITY_REQUIRED');
   await auditBatch(env,actor,'warehouse.business.submitted',{businessId:b.id},[q(db,'UPDATE den_warehouse_businesses SET submitted_at=? WHERE id=?',nowOf(env),b.id)]);return response({ok:true});
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/(facilities|team|activity)$/);
  if(match&&method==='GET') {
   const b=await ownBusiness(env,actor,match[1]);
   if(match[2]==='facilities')return response({facilities:await all(db,'SELECT * FROM den_warehouse_facilities WHERE business_id=? ORDER BY name',b.id)});
   if(match[2]==='team')return response({members:await all(db,'SELECT m.*,c.display_name,c.email,f.name AS facility_name FROM den_facility_memberships m JOIN den_credentials c ON c.user_id=m.user_id JOIN den_warehouse_facilities f ON f.id=m.facility_id WHERE m.business_id=?',b.id),invitations:await all(db,'SELECT id,email,roles,facility_id,expires_at,accepted_at,revoked_at FROM den_staff_invitations WHERE business_id=? ORDER BY created_at DESC',b.id)});
   return response({events:await all(db,"SELECT sequence,action,occurred_at,payload FROM den_audit_events WHERE json_extract(payload,'$.businessId')=? ORDER BY sequence DESC LIMIT 100",b.id)});
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/facilities$/);
  if(match&&method==='POST') {
   const b=await ownBusiness(env,actor,match[1]);ensure(['pending','approved'].includes(b.status),409,'BUSINESS_INACTIVE');
   const data=parseFacility(await readJson(request));await country(env,data.country);const id=crypto.randomUUID();
   await auditBatch(env,actor,'warehouse.facility.created',{businessId:b.id,facilityId:id},[q(db,'INSERT INTO den_warehouse_facilities(id,business_id,name,country,address,capacity_kg,services) VALUES(?,?,?,?,?,?,?)',id,b.id,data.name,data.country,data.address,data.capacity,data.services)]);return response({id},201);
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/facilities\/([^/]+)$/);
  if(match&&method==='PATCH') {
   const b=await ownBusiness(env,actor,match[1]),data=parseFacility(await readJson(request));await country(env,data.country);
   const facility=await first(db,'SELECT id FROM den_warehouse_facilities WHERE id=? AND business_id=?',match[2],b.id);ensure(facility,404,'FACILITY_NOT_FOUND');
   await auditBatch(env,actor,'warehouse.facility.updated',{businessId:b.id,facilityId:facility.id},[q(db,"UPDATE den_warehouse_facilities SET name=?,country=?,address=?,capacity_kg=?,services=?,status='pending' WHERE id=? AND business_id=?",data.name,data.country,data.address,data.capacity,data.services,facility.id,b.id)]);return response({ok:true});
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/invitations$/);
  if(match&&method==='POST') {
   const b=await ownBusiness(env,actor,match[1],true),body=await readJson(request),assigned=parseRoles(body.roles);
   const facility=await first(db,'SELECT id FROM den_warehouse_facilities WHERE id=? AND business_id=?',body.facilityId,b.id);ensure(facility,404,'FACILITY_NOT_FOUND');
   const token=randomToken(),id=crypto.randomUUID(),address=email(body.email);
   await auditBatch(env,actor,'warehouse.staff.invited',{businessId:b.id,facilityId:facility.id,invitationId:id,roles:assigned},[q(db,'INSERT INTO den_staff_invitations(id,business_id,facility_id,email,roles,token_hash,invited_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',id,b.id,facility.id,address,JSON.stringify(assigned),await hashToken(token),actor.id,nowOf(env),nowOf(env)+7*86400000)]);
   return response({id,token,message:'Share this single-use invitation privately with the intended employee. Email delivery is not configured.'},201);
  }
  if(path==='/api/invitations/accept'&&method==='POST') {
   const body=await readJson(request),inv=await first(db,'SELECT i.*,b.status AS business_status FROM den_staff_invitations i JOIN den_warehouse_businesses b ON b.id=i.business_id WHERE token_hash=?',await hashToken(text(body.token,'token',100)));
   ensure(inv&&inv.email===actor.email&&!inv.accepted_at&&!inv.revoked_at&&inv.expires_at>nowOf(env),400,'INVITATION_INVALID');ensure(inv.business_status==='approved',409,'BUSINESS_APPROVAL_REQUIRED');
   const assigned=parseRoles(JSON.parse(inv.roles));
   await auditBatch(env,actor,'warehouse.staff.joined',{businessId:inv.business_id,facilityId:inv.facility_id,invitationId:inv.id},[...assigned.map(r=>q(db,'INSERT INTO den_facility_memberships(user_id,facility_id,business_id,role) VALUES(?,?,?,?)',actor.id,inv.facility_id,inv.business_id,r)),q(db,'UPDATE den_staff_invitations SET accepted_by=?,accepted_at=? WHERE id=? AND accepted_at IS NULL',actor.id,nowOf(env),inv.id)]);
   return response({ok:true});
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/invitations\/([^/]+)\/revoke$/);
  if(match&&method==='POST') {
   const b=await ownBusiness(env,actor,match[1]);
   const invitation=await first(db,'SELECT id FROM den_staff_invitations WHERE id=? AND business_id=? AND accepted_at IS NULL AND revoked_at IS NULL',match[2],b.id);ensure(invitation,404,'INVITATION_NOT_FOUND');
   await auditBatch(env,actor,'warehouse.staff.invitation.revoked',{businessId:b.id,invitationId:invitation.id},[q(db,'UPDATE den_staff_invitations SET revoked_at=? WHERE id=?',nowOf(env),invitation.id)]);return response({ok:true});
  }
  match=path.match(/^\/api\/businesses\/([^/]+)\/members\/([^/]+)\/([^/]+)$/);
  if(match&&method==='PUT') {
   const b=await ownBusiness(env,actor,match[1],true),body=await readJson(request),assigned=parseRoles(body.roles,true);
   const existing=await first(db,'SELECT user_id FROM den_facility_memberships WHERE business_id=? AND facility_id=? AND user_id=?',b.id,match[2],match[3]);ensure(existing,404,'MEMBER_NOT_FOUND');
   const statements=[q(db,'UPDATE den_facility_memberships SET active=0 WHERE business_id=? AND facility_id=? AND user_id=?',b.id,match[2],match[3]),...assigned.map(r=>q(db,'INSERT INTO den_facility_memberships(user_id,facility_id,business_id,role,active) VALUES(?,?,?,?,1) ON CONFLICT(user_id,facility_id,role) DO UPDATE SET active=1',match[3],match[2],b.id,r))];
   await auditBatch(env,actor,'warehouse.staff.permissions.changed',{businessId:b.id,facilityId:match[2],userId:match[3],roles:assigned},statements);return response({ok:true});
  }
  if(path==='/api/my-facilities'&&method==='GET')return response({facilities:await all(db,"SELECT f.*,group_concat(m.role) AS assigned_roles FROM den_warehouse_facilities f JOIN den_facility_memberships m ON m.facility_id=f.id JOIN den_warehouse_businesses b ON b.id=f.business_id WHERE m.user_id=? AND m.active=1 AND b.status='approved' GROUP BY f.id",actor.id)});
  match=path.match(/^\/api\/facilities\/([^/]+)\/records$/);
  if(match&&['GET','POST'].includes(method)) {
   const f=await first(db,"SELECT f.* FROM den_warehouse_facilities f JOIN den_warehouse_businesses b ON b.id=f.business_id WHERE f.id=? AND b.status='approved'",match[1]);ensure(f,404,'FACILITY_NOT_FOUND');
   const memberships=await all(db,'SELECT user_id AS userId,facility_id AS facilityId,business_id AS tenantId,role,active FROM den_facility_memberships WHERE user_id=? AND facility_id=?',actor.id,f.id);
   const mapped=memberships.map(m=>({...m,active:Boolean(m.active)}));
   const body=method==='POST'?await readJson(request):null,action=body?.operation??'audit';
   authorizeFacility({actor:{...actor,tenantId:f.business_id},facility:{...f,tenantId:f.business_id},memberships:mapped,action});
   if(method==='GET')return response({records:await all(db,'SELECT * FROM den_warehouse_records WHERE facility_id=? ORDER BY created_at DESC LIMIT 100',f.id)});
   ensure(f.status==='approved',409,'FACILITY_APPROVAL_REQUIRED');
   const key=text(request.headers.get('idempotency-key'),'idempotency_key',100),ref=text(body.packageReference,'package_reference',100),notes=text(body.notes??'','notes',1000,0);
   const existing=await first(db,'SELECT * FROM den_warehouse_records WHERE facility_id=? AND idempotency_key=?',f.id,key);
   if(existing){ensure(existing.actor_id===actor.id&&existing.operation===action&&existing.package_reference===ref&&existing.notes===notes,409,'IDEMPOTENCY_CONFLICT');return response({id:existing.id,replayed:true});}
   const id=crypto.randomUUID();await auditBatch(env,actor,'warehouse.operation.recorded',{businessId:f.business_id,facilityId:f.id,recordId:id,operation:action},[q(db,'INSERT INTO den_warehouse_records VALUES(?,?,?,?,?,?,?,?,?)',id,f.business_id,f.id,actor.id,action,ref,notes,nowOf(env),key)]);return response({id},201);
  }
  if(path==='/api/admin/businesses'&&method==='GET') {
   freshAdmin(actor,env,'warehouse.review');
   if(actor.level==='ordinary')ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled,403,'TRADE_LOCKED');
   return response({businesses:await all(db,'SELECT b.*,c.email AS owner_email FROM den_warehouse_businesses b JOIN den_credentials c ON c.user_id=b.owner_id WHERE submitted_at IS NOT NULL ORDER BY created_at DESC')});
  }
  match=path.match(/^\/api\/admin\/businesses\/([^/]+)$/);
  if(match&&method==='GET') {
   freshAdmin(actor,env,'warehouse.review');if(actor.level==='ordinary')ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled,403,'TRADE_LOCKED');
   const business=await first(db,'SELECT * FROM den_warehouse_businesses WHERE id=?',match[1]);ensure(business,404,'BUSINESS_NOT_FOUND');return response({business,facilities:await all(db,'SELECT * FROM den_warehouse_facilities WHERE business_id=?',business.id)});
  }
  match=path.match(/^\/api\/admin\/businesses\/([^/]+)\/review$/);
  if(match&&method==='POST') {
   freshAdmin(actor,env,'warehouse.review');if(actor.level==='ordinary')ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled,403,'TRADE_LOCKED');
   const body=await readJson(request),b=await first(db,'SELECT * FROM den_warehouse_businesses WHERE id=?',match[1]);ensure(b&&b.submitted_at,404,'SUBMITTED_BUSINESS_NOT_FOUND');ensure(b.owner_id!==actor.id,403,'SELF_REVIEW_FORBIDDEN');ensure(b.status==='pending',409,'BUSINESS_ALREADY_REVIEWED');
   ensure(['approved','rejected'].includes(body.decision),400,'INVALID_DECISION');const reason=text(body.reason,'reason',1000);
   const verification=body.decision==='approved'?text(body.verificationKey,'verification_key',200):null;
   await auditBatch(env,actor,`warehouse.business.${body.decision}`,{businessId:b.id,reason},[q(db,'UPDATE den_warehouse_businesses SET status=?,verification_key=COALESCE(verification_key,?),first_approved_at=CASE WHEN ?=\'approved\' THEN COALESCE(first_approved_at,?) ELSE first_approved_at END,reviewed_by=?,review_reason=? WHERE id=?',body.decision,verification,body.decision,nowOf(env),actor.id,reason,b.id)]);
   return response({ok:true});
  }
  match=path.match(/^\/api\/admin\/facilities\/([^/]+)\/approve$/);
  if(match&&method==='POST') {
   freshAdmin(actor,env,'warehouse.review');if(actor.level==='ordinary')ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled,403,'TRADE_LOCKED');
   const f=await first(db,"SELECT f.*,b.owner_id FROM den_warehouse_facilities f JOIN den_warehouse_businesses b ON b.id=f.business_id WHERE f.id=? AND b.status='approved'",match[1]);ensure(f,404,'APPROVED_BUSINESS_REQUIRED');ensure(f.owner_id!==actor.id,403,'SELF_REVIEW_FORBIDDEN');
   const body=await readJson(request);text(body.reason,'reason',1000);
   await auditBatch(env,actor,'warehouse.facility.approved',{businessId:f.business_id,facilityId:f.id,reason:body.reason},[q(db,"UPDATE den_warehouse_facilities SET status='approved' WHERE id=?",f.id)]);return response({ok:true});
  }
  if(path==='/api/international/bookings'&&method==='POST') {
   const state=await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1');ensure(state.enabled,423,'INTERNATIONAL_TRADE_LOCKED');
   throw new HttpError(503,'CARRIER_AND_COMPLIANCE_INTEGRATION_REQUIRED');
  }
  return response({error:'NOT_FOUND'},404);
 } catch(error) {
  if(error instanceof HttpError)return response({error:error.code},error.status);
  if(error instanceof PolicyError)return response({error:error.code},error.code==='UNAUTHENTICATED'?401:error.code==='REVISION_CONFLICT'?409:403);
  const message=String(error?.message??error);
  if(/UNIQUE constraint|constraint failed|AUDIT|REVISION/i.test(message))return response({error:'CONCURRENT_OR_DUPLICATE_CHANGE'},409);
  if(message.includes('ENCRYPTION_KEY_REQUIRED'))return response({error:'MFA_NOT_CONFIGURED'},503);
  console.error(JSON.stringify({event:'request.failed',path,requestId:crypto.randomUUID()}));
  return response({error:'INTERNAL_ERROR'},500);
 }
}
export default {fetch:handleRequest};
