import { ensure, readJson, response, text, HttpError } from './http.js';
import { authorizeChannel, appendMessage } from '../vendor/chat/index.js';
import { recordLocation, latestLocation } from '../vendor/tracking/index.js';
import { pricingLab } from '../vendor/payments/commissions.js';
export async function handleServices(request, env, actor, h) {
 const url = new URL(request.url), path = url.pathname, method = request.method;
 if (!path.startsWith('/api/services/')) return null;
 const { first, all, q, nowOf, auditBatch } = h, db = env.DB, now = nowOf(env);
 ensure(actor?.id && actor.authenticated && actor.status === 'active',401,'SIGN_IN_REQUIRED');
 const current = { id: actor.id, active: true };
 let match;
 if(path==='/api/services/pricing-lab'&&method==='POST'){
  const body=await readJson(request);
  ensure(Array.isArray(body.tiers)&&body.tiers.length<=20,400,'INVALID_SIMULATION_TIERS');
  try{return response({...pricingLab({revenueMinor:body.revenueMinor,tiers:body.tiers,currency:body.currency}),notice:'Simulation only. These rates are not approved or applied to billing.'});}catch{throw new HttpError(400,'INVALID_COMMISSION_SIMULATION');}
 }
 if ((match = path.match(/^\/api\/services\/orders\/([^/]+)\/(messages|tracking)$/))) {
  const order = await first(db,'SELECT o.*, g.owner_id FROM den_orders o JOIN den_organizations g ON g.id=o.organization_id WHERE o.id=?',match[1]);
  ensure(order && [order.consumer_id,order.rider_id,order.owner_id].includes(actor.id),404,'ORDER_NOT_FOUND');
  const assignment = {id:order.id,riderId:order.rider_id,consumerId:order.consumer_id,organizationId:order.organization_id,status:({reserved:'assigned',picked_up:'in_transit'})[order.state]??order.state};
  current.role = actor.id === order.owner_id ? 'manager' : actor.id === order.rider_id ? 'rider' : 'consumer';
  current.organizationId = current.role === 'manager' ? order.organization_id : null;
  if (match[2] === 'messages') {
   const type = url.searchParams.get('channel') ?? 'rider_consumer';
   ensure(['rider_consumer','manager_rider'].includes(type),400,'INVALID_CHANNEL');
   const channel = { id:`${order.id}:${type}`,type,orderId:order.id };
   try { authorizeChannel(current,channel,assignment); } catch { throw new HttpError(403,'CHAT_ACCESS_DENIED'); }
   if (method === 'GET') return response({ contractVersion:'1.0.0',messages:await all(db,'SELECT id,sender_id AS senderId,body AS text,created_at AS createdAt FROM den_service_messages WHERE order_id=? AND channel=? ORDER BY created_at DESC,id DESC LIMIT 100',order.id,type) });
   if (method === 'POST') {
    const body=await readJson(request),id=text(body.idempotencyKey,'idempotency_key',120),message=text(body.text,'text',4000);
    const previous=await first(db,'SELECT * FROM den_service_messages WHERE id=?',id);
    if(previous){ensure(previous.order_id===order.id&&previous.channel===type&&previous.sender_id===actor.id&&previous.body===message,409,'IDEMPOTENCY_CONFLICT');return response({id,replayed:true});}
    appendMessage([],current,channel,assignment,{id,text:message,createdAt:now});
    await auditBatch(env,actor,'chat.message.created',{orderId:order.id,channel:type,messageId:id},[
     q(db,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,(SELECT rider_id IS ? AND state=? FROM den_orders WHERE id=?))',`message:${id}`,order.rider_id,order.state,order.id),
     q(db,'INSERT INTO den_service_messages(id,order_id,channel,sender_id,body,created_at) VALUES(?,?,?,?,?,?)',id,order.id,type,actor.id,message,now),q(db,'DELETE FROM den_transaction_guards WHERE id=?',`message:${id}`)
    ]);return response({id},201);
   }
  } else {
   ensure([order.consumer_id,order.rider_id].includes(actor.id),403,'TRACKING_ACCESS_DENIED');
   const rows=await all(db,'SELECT id,order_id AS assignmentId,rider_id AS riderId,latitude,longitude,accuracy_meters AS accuracyMeters,recorded_at AS recordedAt,received_at AS receivedAt,simulated FROM den_service_locations WHERE order_id=? ORDER BY recorded_at DESC LIMIT 1',order.id);
   const points=rows.map(point=>({...point,simulated:Boolean(point.simulated)}));
   if(method==='GET') {try{return response(latestLocation(points,current,assignment,now));}catch{throw new HttpError(403,'TRACKING_ACCESS_DENIED');}}
   if(method==='POST') {
    ensure(actor.id===order.rider_id,403,'TRACKING_WRITE_DENIED');
    ensure(await first(db,"SELECT user_id FROM den_riders WHERE user_id=? AND status='approved'",actor.id),403,'RIDER_APPROVAL_REQUIRED');
    const body=await readJson(request),input={id:text(body.idempotencyKey,'idempotency_key',120),latitude:body.latitude,longitude:body.longitude,accuracyMeters:body.accuracyMeters,recordedAt:body.recordedAt,simulated:body.simulated};
    ensure(typeof body.simulated==='boolean',400,'SIMULATION_LABEL_REQUIRED');
    const previous=await first(db,'SELECT id,order_id AS assignmentId,rider_id AS riderId,latitude,longitude,accuracy_meters AS accuracyMeters,recorded_at AS recordedAt,received_at AS receivedAt,simulated FROM den_service_locations WHERE id=?',input.id);
    try { recordLocation(previous?[{...previous,simulated:Boolean(previous.simulated)}]:points,current,assignment,input,now); } catch(error) {throw new HttpError(error.message.includes('idempotency')?409:400,'INVALID_LOCATION_OR_STATE');}
    if(previous)return response({id:input.id,replayed:true});
    await auditBatch(env,actor,'tracking.location.recorded',{orderId:order.id,locationId:input.id,simulated:input.simulated},[
     q(db,"INSERT INTO den_transaction_guards(id,valid) VALUES(?,(SELECT rider_id=? AND state=? FROM den_orders WHERE id=?) AND EXISTS(SELECT 1 FROM den_riders WHERE user_id=? AND status='approved') AND NOT EXISTS(SELECT 1 FROM den_service_locations WHERE order_id=? AND recorded_at>=?))",`location:${input.id}`,actor.id,order.state,order.id,actor.id,order.id,input.recordedAt),
     q(db,'INSERT INTO den_service_locations(id,order_id,rider_id,latitude,longitude,accuracy_meters,recorded_at,received_at,simulated) VALUES(?,?,?,?,?,?,?,?,?)',input.id,order.id,actor.id,input.latitude,input.longitude,input.accuracyMeters,input.recordedAt,now,Number(input.simulated)),q(db,'DELETE FROM den_transaction_guards WHERE id=?',`location:${input.id}`)
    ]);return response({id:input.id,simulated:input.simulated},201);
   }
  }
 }
 if(path==='/api/services/wallet'&&method==='GET') {
  const entries=await all(db,`SELECT id,currency,amount_minor AS "amountMinor",reference,created_at AS "createdAt" FROM den_service_wallet_entries WHERE user_id=? AND reference NOT LIKE 'DEN demo:%' ORDER BY created_at DESC,id DESC LIMIT 100`,actor.id);
  const balances=await all(db,`SELECT currency,SUM(amount_minor) AS "amountMinor" FROM den_service_wallet_entries WHERE user_id=? AND reference NOT LIKE 'DEN demo:%' GROUP BY currency`,actor.id);
  const demoEntries=await all(db,`SELECT id,currency,amount_minor AS "amountMinor",reference,created_at AS "createdAt" FROM den_service_wallet_entries WHERE user_id=? AND reference LIKE 'DEN demo:%' ORDER BY created_at DESC,id DESC LIMIT 100`,actor.id);
  const demoBalances=await all(db,`SELECT currency,SUM(amount_minor) AS "amountMinor" FROM den_service_wallet_entries WHERE user_id=? AND reference LIKE 'DEN demo:%' GROUP BY currency`,actor.id);
  return response({contractVersion:'1.0.0',balances,entries,demo:{enabled:true,balances:demoBalances,entries:demoEntries.map(e=>{const meta=JSON.parse(e.reference.slice(9));return {...e,reference:undefined,kind:meta.kind,peerId:meta.peerId,simulated:true};}),currencies:['NGN','GHS','USD','GBP','EUR','MAD','KES'],maxAmountMinor:10000000},liveMoneyEnabled:false,withdrawalsEnabled:false,notice:'Demo balances have no cash value. Live payments and bank withdrawals remain disabled.'});
 }
 if(path==='/api/services/wallet/demo'&&method==='POST'){
  const body=await readJson(request),kind=body.kind,currency=String(body.currency??'').toUpperCase(),amount=body.amountMinor,key=text(body.idempotencyKey,'idempotency_key',120);
  ensure(['deposit','transfer','withdraw'].includes(kind)&&['NGN','GHS','USD','GBP','EUR','MAD','KES'].includes(currency),400,'INVALID_DEMO_WALLET_OPERATION');
  ensure(Number.isSafeInteger(amount)&&amount>0&&amount<=10000000,400,'INVALID_DEMO_AMOUNT');ensure(/^[A-Za-z0-9_-]{8,120}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY');
  let recipient=null;if(kind==='transfer'){const address=text(body.recipientEmail,'recipient_email',254).trim().toLowerCase();recipient=await first(db,"SELECT u.id FROM den_users u JOIN den_credentials c ON c.user_id=u.id WHERE lower(c.email)=? AND u.status='active'",address);ensure(recipient,404,'DEMO_RECIPIENT_NOT_FOUND');ensure(recipient.id!==actor.id,400,'SELF_TRANSFER_NOT_ALLOWED');}
  const operation=`demo:${actor.id}:${key}`,sourceId=`${operation}:source`,signed=kind==='deposit'?amount:-amount,reference='DEN demo:'+JSON.stringify({kind,peerId:recipient?.id??null});
  const replay=async()=>{const previous=await first(db,'SELECT * FROM den_service_wallet_entries WHERE id=?',sourceId);if(!previous)return null;ensure(previous.user_id===actor.id&&previous.currency===currency&&Number(previous.amount_minor)===signed&&previous.reference===reference,409,'IDEMPOTENCY_CONFLICT');return response({id:operation,simulated:true,replayed:true});};
  const previous=await replay();if(previous)return previous;
  const balance=async()=>Number((await first(db,"SELECT COALESCE(SUM(amount_minor),0) AS amount FROM den_service_wallet_entries WHERE user_id=? AND currency=? AND reference LIKE 'DEN demo:%'",actor.id,currency)).amount);
  ensure(kind==='deposit'||await balance()>=amount,409,'INSUFFICIENT_DEMO_BALANCE');
  const statements=[...([actor.id,...(recipient?[recipient.id]:[])].sort().map(userId=>q(db,'UPDATE den_users SET status=status WHERE id=?',userId))),
   q(db,"INSERT INTO den_transaction_guards(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM den_users WHERE id=? AND status='active') AND (?='deposit' OR (SELECT COALESCE(SUM(amount_minor),0) FROM den_service_wallet_entries WHERE user_id=? AND currency=? AND reference LIKE 'DEN demo:%')>=?) THEN 1 ELSE 0 END)",operation,actor.id,kind,actor.id,currency,amount)];
  if(recipient)statements.push(q(db,"INSERT INTO den_transaction_guards(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM den_users WHERE id=? AND status='active') THEN 1 ELSE 0 END)",operation+':recipient',recipient.id));
  statements.push(q(db,'INSERT INTO den_service_wallet_entries(id,user_id,currency,amount_minor,reference,created_at) VALUES(?,?,?,?,?,?)',sourceId,actor.id,currency,signed,reference,now));
  if(recipient)statements.push(q(db,'INSERT INTO den_service_wallet_entries(id,user_id,currency,amount_minor,reference,created_at) VALUES(?,?,?,?,?,?)',operation+':recipient',recipient.id,currency,amount,'DEN demo:'+JSON.stringify({kind:'received',peerId:actor.id}),now));
  statements.push(q(db,'DELETE FROM den_transaction_guards WHERE id=? OR id=?',operation,operation+':recipient'));
  try{await auditBatch(env,actor,'wallet.demo.'+kind,{operation,currency,amountMinor:amount,recipientId:recipient?.id??null,simulated:true},statements);}catch(error){const repeated=await replay();if(repeated)return repeated;if(kind!=='deposit'&&await balance()<amount)throw new HttpError(409,'INSUFFICIENT_DEMO_BALANCE');throw new HttpError(409,'DEMO_WALLET_CHANGED_RETRY');}
  return response({id:operation,simulated:true},201);
 }
 if(path.startsWith('/api/services/wallet')&&method!=='GET')throw new HttpError(423,'LIVE_MONEY_DISABLED');
 if(path==='/api/services/notifications'&&method==='GET')return response({notifications:await all(db,'SELECT id,message,created_at AS createdAt,read_at AS readAt FROM den_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',actor.id),delivery:'in_app_only'});
 if((match=path.match(/^\/api\/services\/notifications\/([^/]+)\/read$/))&&method==='POST'){
  ensure(await first(db,'SELECT id FROM den_notifications WHERE id=? AND user_id=?',match[1],actor.id),404,'NOTIFICATION_NOT_FOUND');
  await auditBatch(env,actor,'notification.read',{notificationId:match[1]},[q(db,'UPDATE den_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',now,match[1],actor.id)]);return response({ok:true});
 }
 throw new HttpError(404,'SERVICE_ROUTE_NOT_FOUND');
}
