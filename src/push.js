import {isPushServiceEndpoint,sendPushBatch} from '@mmmike/web-push/send';
import {decryptSecret,encryptSecret,hashToken} from './security.js';
import {ensure,response,HttpError} from './http.js';

export const pushAvailable=env=>Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY);

export async function handlePushSubscription(request,env,actor,h,body){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==='/api/platform/push/config'&&method==='GET')return response({enabled:pushAvailable(env),publicKey:env.VAPID_PUBLIC_KEY??''});
 if(path!=='/api/platform/push/subscriptions')return null;
 const {q,first,auditBatch,nowOf}=h,db=env.DB,now=nowOf(env);
 if(method==='GET')return response({enabled:Boolean(await first(db,'SELECT id FROM den_push_subscriptions WHERE user_id=? LIMIT 1',actor.id))});
 if(method==='POST'){
  ensure(pushAvailable(env),503,'PUSH_NOT_CONFIGURED');
  const subscription=body;
  ensure(subscription&&typeof subscription.endpoint==='string'&&isPushServiceEndpoint(subscription.endpoint),400,'INVALID_PUSH_ENDPOINT');
  ensure(subscription.keys&&typeof subscription.keys.p256dh==='string'&&typeof subscription.keys.auth==='string'&&subscription.keys.p256dh.length<=160&&subscription.keys.auth.length<=100,400,'INVALID_PUSH_KEYS');
  const endpointHash=await hashToken(subscription.endpoint),encrypted=encryptSecret(JSON.stringify({endpoint:subscription.endpoint,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}}),env.MFA_ENCRYPTION_KEY),id=crypto.randomUUID();
  await auditBatch(env,actor,'push.subscription_saved',{},[q(db,'INSERT INTO den_push_subscriptions(id,user_id,endpoint_hash,subscription_encrypted,created_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,subscription_encrypted=excluded.subscription_encrypted,created_at=excluded.created_at',id,actor.id,endpointHash,encrypted,now)]);
  return response({ok:true},201);
 }
 if(method==='DELETE'){
  ensure(typeof body.endpoint==='string'&&isPushServiceEndpoint(body.endpoint),400,'INVALID_PUSH_ENDPOINT');
  const endpointHash=await hashToken(body.endpoint);
  await auditBatch(env,actor,'push.subscription_removed',{},[q(db,'DELETE FROM den_push_subscriptions WHERE user_id=? AND endpoint_hash=?',actor.id,endpointHash)]);
  return response({ok:true});
 }
 throw new HttpError(405,'METHOD_NOT_ALLOWED');
}

export async function sendPushToUsers(env,h,userIds,payload){
 if(!pushAvailable(env)||!userIds.length)return;
 const ids=[...new Set(userIds)],{all,q}=h,subscriptions=[];
 for(let offset=0;offset<ids.length;offset+=200){
  const chunk=ids.slice(offset,offset+200),placeholders=chunk.map(()=>'?').join(',');
  const rows=await all(env.DB,`SELECT id,endpoint_hash,subscription_encrypted FROM den_push_subscriptions WHERE user_id IN (${placeholders})`,...chunk);
  for(const row of rows){try{const subscription=JSON.parse(decryptSecret(row.subscription_encrypted,env.MFA_ENCRYPTION_KEY));if(isPushServiceEndpoint(subscription.endpoint))subscriptions.push({id:row.id,endpoint:subscription.endpoint,hash:row.endpoint_hash,subscription});}catch{}}
 }
 if(!subscriptions.length)return;
 const result=await sendPushBatch(subscriptions.map(row=>row.subscription),payload,{publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT??'mailto:security@den.global'},{ttl:3600,concurrency:25});
 const goneHashes=[];for(const endpoint of result.gone)goneHashes.push(await hashToken(endpoint));
 if(goneHashes.length){const statements=[];for(const hash of goneHashes)statements.push(q(env.DB,'DELETE FROM den_push_subscriptions WHERE endpoint_hash=?',hash));await env.DB.batch(statements);}
 if(result.failed.length)console.warn(JSON.stringify({event:'den.push.delivery_failed',count:result.failed.length}));
}
