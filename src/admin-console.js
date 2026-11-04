import {ensure,text,email,password,response,readJson} from './http.js';
import {hashPassword} from './security.js';
export const adminPages=Object.freeze(['overview','accounts','roles','verification','finance','audit','trade']);
export const adminPermissions=Object.freeze(['finance_admin','rider_verification_admin','organization_verification_admin','warehouse.review','community_moderation_admin','delivery_operations_admin','shipping_admin','support_admin','security_audit_admin','global_shipping_admin','international_trade_admin','warehouse_admin','roles.assign','trade.continue_locked']);
export function adminSection(path){
 if(path.startsWith('/api/platform/admin/reviews')||path.startsWith('/api/admin/businesses')||/^\/api\/admin\/(facilities|staff|records)/.test(path))return 'verification';
 if(path==='/api/admin/trade')return 'trade';
 if(path==='/api/platform/admin/accounts')return 'accounts';
 const section=path.match(/^\/api\/admin-console\/([^/]+)/)?.[1];
 return ({config:'config',overview:'overview',users:'overview',orders:'overview',accounts:'accounts',roles:'roles',locks:'locks',finance:'finance',audit:'audit'})[section]??null;
}
export async function enforceAdminPage(env,actor,page){
 const owner=actor.id===env.PRIMARY_ADMIN_ID&&actor.level==='primary_super_admin';
 ensure(actor.level,403,'ADMIN_REQUIRED');
 ensure(actor.level!=='primary_super_admin'||owner,403,'OWNER_IDENTITY_MISMATCH');
 if(page==='config')return;
 ensure(actor.mfaVerified&&freshTimestamp(actor,env),403,'FRESH_MFA_REQUIRED');
 if(owner)return;
 ensure(page!=='locks',403,'OWNER_ONLY');
 const lock=await env.DB.prepare('SELECT locked FROM den_admin_page_locks WHERE page=?').bind(page).first();
 ensure(!lock?.locked,403,'PAGE_LOCKED_BY_OWNER');
 if(actor.level==='lesser_super_admin')return;
 const allowed={overview:['security_audit_admin'],finance:['finance_admin'],audit:['security_audit_admin'],verification:['organization_verification_admin','rider_verification_admin','warehouse.review'],trade:['international_trade_admin']};
 ensure((allowed[page]??[]).some(p=>actor.permissions.includes(p)),403,'PERMISSION_DENIED');
}
// A future-dated authentication timestamp must never count as fresh.
const freshTimestamp=(actor,env)=>{const now=env.CLOCK?.now?.()??Date.now();return actor.authenticatedAt<=now&&now-actor.authenticatedAt<=300000;};
export async function handleAdminConsole(request,env,actor,h){
 const path=new URL(request.url).pathname;if(!path.startsWith('/api/admin-console/'))return null;
 const route=path.slice('/api/admin-console/'.length),method=request.method,{q,first,all,auditBatch,nowOf}=h,db=env.DB,now=nowOf(env);
 const owner=actor.id===env.PRIMARY_ADMIN_ID&&actor.level==='primary_super_admin';
 const body=method==='GET'?{}:await readJson(request);
 const audit=(action,payload,statements)=>auditBatch(env,actor,action,payload,statements);
 const guard=(condition,...args)=>q(db,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,('+condition+'))',crypto.randomUUID(),...args);
 const validatePermissions=value=>{ensure(Array.isArray(value)&&value.length<=adminPermissions.length&&value.every(p=>adminPermissions.includes(p)),400,'INVALID_PERMISSIONS');return [...new Set(value)];};
 if(route==='config'&&method==='GET')return response({owner,adminLevel:actor.level,permissions:actor.permissions,pages:adminPages,locks:await all(db,'SELECT * FROM den_admin_page_locks'),roleName:actor.roleName??(owner?'Owner Admin':actor.level==='lesser_super_admin'?'Sub Admin':'Administrator'),freshMfa:actor.mfaVerified});
 if(route==='overview'&&method==='GET')return response({counts:await first(db,"SELECT (SELECT COUNT(*) FROM den_users) AS users,(SELECT COUNT(*) FROM den_admin_accounts) AS administrators,(SELECT COUNT(*) FROM den_orders) AS orders,(SELECT COUNT(*) FROM den_organizations WHERE status='pending') AS pendingOrganizations,(SELECT COUNT(*) FROM den_riders WHERE status='pending') AS pendingRiders"),events:await all(db,'SELECT sequence,actor_id,action,occurred_at FROM den_audit_events ORDER BY sequence DESC LIMIT 12')});
 if(route==='users'){
  if(method==='GET')return response({users:await all(db,'SELECT u.id,u.status,u.created_at,c.email,c.display_name,c.totp_enabled,a.level FROM den_users u JOIN den_credentials c ON c.user_id=u.id LEFT JOIN den_admin_accounts a ON a.user_id=u.id ORDER BY u.created_at DESC LIMIT 200')});
  if(method==='POST'){
   ensure(owner||actor.level==='lesser_super_admin',403,'SUPER_ADMIN_REQUIRED');const userId=text(body.userId,'userId');ensure(userId!==env.PRIMARY_ADMIN_ID&&userId!==actor.id,403,'OWNER_OR_SELF_PROTECTED');ensure(['active','suspended'].includes(body.status),400,'INVALID_STATUS');
   ensure(await first(db,'SELECT id FROM den_users WHERE id=?',userId),404,'USER_NOT_FOUND');
   await audit('admin.user_status_changed',{userId,status:body.status,reason:text(body.reason,'reason',1000,10)},[q(db,'UPDATE den_users SET status=? WHERE id=?',body.status,userId),q(db,'DELETE FROM den_sessions WHERE user_id=?',userId)]);return response({ok:true});
  }
 }
 if(route==='orders'&&method==='GET')return response({orders:await all(db,'SELECT o.id,o.state,o.ready,o.handoff,o.product_total,o.currency,o.product_payment,o.delivery_payment,o.created_at,g.name AS organization_name FROM den_orders o JOIN den_organizations g ON g.id=o.organization_id ORDER BY o.created_at DESC LIMIT 200')});
 if(route==='audit'&&method==='GET')return response({events:await all(db,'SELECT sequence,actor_id,action,occurred_at,payload FROM den_audit_events ORDER BY sequence DESC LIMIT 100')});
 if(route==='finance'&&method==='GET')return response({totals:await all(db,'SELECT currency,COUNT(*) AS entries,SUM(amount_minor) AS net_minor FROM den_service_wallet_entries GROUP BY currency'),entries:await all(db,'SELECT id,user_id,currency,amount_minor,reference,created_at FROM den_service_wallet_entries ORDER BY created_at DESC LIMIT 100'),livePaymentsEnabled:false});
 if(route==='roles'){
  if(method==='GET')return response({roles:await all(db,'SELECT * FROM den_admin_role_templates'),permissions:adminPermissions});
  if(method==='POST'){
   ensure(owner||actor.level==='lesser_super_admin',403,'SUPER_ADMIN_REQUIRED');
   const roleId=body.id?text(body.id,'id'):crypto.randomUUID(),existing=await first(db,'SELECT * FROM den_admin_role_templates WHERE id=?',roleId);
   ensure(!['sub-admin','finance-admin','verification-admin'].includes(roleId),403,'BUILTIN_ROLE_PROTECTED');
   const permissions=validatePermissions(body.permissions),name=text(body.name,'name',80);
   // Custom names select existing capabilities; they never create a second owner.
   ensure(!/owner|primary|super/i.test(name),400,'RESERVED_ROLE_NAME');
   if(permissions.some(p=>['global_shipping_admin','international_trade_admin','warehouse_admin'].includes(p)))ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled===1,403,'TRADE_LOCKED');
   if(existing)ensure(body.revision===existing.revision,409,'REVISION_CONFLICT');
   const revision=(existing?.revision??0)+1,statements=[];
   if(existing)statements.push(guard('EXISTS(SELECT 1 FROM den_admin_role_templates WHERE id=? AND revision=?)',roleId,existing.revision));
   statements.push(q(db,"INSERT INTO den_admin_role_templates VALUES(?,?,'ordinary',?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions,revision=excluded.revision,updated_at=excluded.updated_at",roleId,name,JSON.stringify(permissions),revision,now));
   statements.push(q(db,'DELETE FROM den_sessions WHERE user_id IN (SELECT user_id FROM den_admin_role_assignments WHERE role_id=?)',roleId));
   await audit('admin.role_saved',{roleId,name,permissions,revision},statements);return response({id:roleId,revision},existing?200:201);
  }
 }
 if(route==='locks'){
  ensure(owner,403,'OWNER_ONLY');
  ensure(method==='POST'&&adminPages.includes(body.page)&&typeof body.locked==='boolean',400,'INVALID_PAGE_LOCK');
  const current=await first(db,'SELECT revision FROM den_admin_page_locks WHERE page=?',body.page);ensure(body.revision===(current?.revision??0),409,'REVISION_CONFLICT');
  await audit('admin.page_lock_changed',{page:body.page,locked:body.locked},[guard('COALESCE((SELECT revision FROM den_admin_page_locks WHERE page=?),0)=?',body.page,body.revision),q(db,'INSERT INTO den_admin_page_locks VALUES(?,?,?,?,?) ON CONFLICT(page) DO UPDATE SET locked=excluded.locked,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=excluded.changed_at',body.page,body.locked?1:0,body.revision+1,actor.id,now)]);return response({ok:true});
 }
 if(route==='accounts'){
  if(method==='GET')return response({accounts:await all(db,'SELECT a.user_id,a.level,c.email,c.display_name,r.role_id,t.name AS role_name FROM den_admin_accounts a JOIN den_credentials c ON c.user_id=a.user_id LEFT JOIN den_admin_role_assignments r ON r.user_id=a.user_id LEFT JOIN den_admin_role_templates t ON t.id=r.role_id')});
  if(method==='POST'){
   ensure(owner||actor.level==='lesser_super_admin',403,'SUPER_ADMIN_REQUIRED');
   const address=email(body.email),name=text(body.name,'name',100),roleId=text(body.roleId,'roleId'),role=await first(db,'SELECT * FROM den_admin_role_templates WHERE id=?',roleId);ensure(role,400,'UNKNOWN_ROLE');
   const existing=await first(db,'SELECT c.user_id,a.level FROM den_credentials c LEFT JOIN den_admin_accounts a ON a.user_id=c.user_id WHERE c.email=?',address);
   ensure(existing?.user_id!==env.PRIMARY_ADMIN_ID,403,'OWNER_ACCOUNT_PROTECTED');ensure(existing?.user_id!==actor.id,403,'SELF_MODIFICATION_FORBIDDEN');
   ensure(existing?.level!=='primary_super_admin',403,'OWNER_ACCOUNT_PROTECTED');
   const permissions=JSON.parse(role.permissions);if(permissions.some(p=>['global_shipping_admin','international_trade_admin','warehouse_admin'].includes(p)))ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled===1,403,'TRADE_LOCKED');
   const userId=existing?.user_id??crypto.randomUUID(),statements=[];
   if(!existing){const hash=await hashPassword(password(body.password,12));statements.push(q(db,'INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)',userId,`password:${userId}`,now),q(db,'INSERT INTO den_credentials(user_id,email,display_name,password_hash) VALUES(?,?,?,?)',userId,address,name,hash));}
   // Existing credentials are never overwritten by an admin role assignment.
   statements.push(guard('EXISTS(SELECT 1 FROM den_admin_role_templates WHERE id=? AND revision=?)',roleId,role.revision),q(db,'INSERT INTO den_admin_accounts VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level,permissions=excluded.permissions',userId,role.level,role.permissions),q(db,'INSERT INTO den_admin_role_assignments VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET role_id=excluded.role_id',userId,roleId),q(db,'DELETE FROM den_sessions WHERE user_id=?',userId));
   await audit('admin.account_provisioned',{userId,roleId,existing:Boolean(existing)},statements);return response({id:userId,existing:Boolean(existing)},existing?200:201);
  }
 }
 return response({error:'NOT_FOUND'},404);
}
