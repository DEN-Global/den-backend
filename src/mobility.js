import {response,readJson,ensure,text} from './http.js';
const vehicles=['motorcycle','car','bus','van','truck','boat'];
export async function handleMobility(request,env,actor,h) {
 const {q,first,all,auditBatch,nowOf}=h,db=env.DB,url=new URL(request.url),path=url.pathname,method=request.method;
 if(!path.startsWith('/api/mobility/'))return null;
 if(path==='/api/mobility/driver'&&method==='GET')return response({driver:await first(db,'SELECT * FROM den_transport_profiles WHERE user_id=?',actor.id)});
 if(path==='/api/mobility/driver'&&method==='POST'){
  const b=await readJson(request);ensure(vehicles.includes(b.vehicleType),400,'INVALID_VEHICLE');
  ensure(await first(db,'SELECT code FROM den_countries WHERE code=?',b.country),400,'COUNTRY_NOT_CONFIGURED');
  ensure(!await first(db,'SELECT user_id FROM den_transport_profiles WHERE user_id=?',actor.id),409,'DRIVER_ALREADY_REGISTERED');
  await auditBatch(env,actor,'transport.driver.registered',{},[q(db,'INSERT INTO den_transport_profiles(user_id,vehicle_type,registration_reference,country,created_at) VALUES(?,?,?,?,?)',actor.id,b.vehicleType,text(b.registrationReference,'registration_reference',100),b.country,nowOf(env))]);
  return response({status:'pending',message:'Registration received. Vehicle-specific verification and service approval are required.'},201);
 }
 if(path==='/api/mobility/requests'&&method==='GET')return response({requests:await all(db,'SELECT * FROM den_mobility_requests WHERE user_id=? ORDER BY created_at DESC',actor.id)});
 if(path==='/api/mobility/requests'&&method==='POST'){
  const b=await readJson(request);ensure(['passenger','shipment'].includes(b.kind),400,'INVALID_REQUEST_KIND');
  for(const c of [b.originCountry,b.destinationCountry])ensure(await first(db,'SELECT code FROM den_countries WHERE code=?',c),400,'COUNTRY_NOT_CONFIGURED');
  if(b.originCountry!==b.destinationCountry){ensure((await first(db,'SELECT enabled FROM den_trade_state WHERE singleton=1')).enabled,423,'INTERNATIONAL_TRADE_LOCKED');return response({error:'CARRIER_AND_COMPLIANCE_INTEGRATION_REQUIRED'},503);}
  const mode=b.transportMode??'road';ensure(['road','air','sea'].includes(mode),400,'INVALID_TRANSPORT_MODE');
  ensure(vehicles.includes(b.vehicleType),400,'INVALID_VEHICLE');
  const weight=b.kind==='shipment'?Number(b.weightGrams):null;ensure(weight===null||(Number.isSafeInteger(weight)&&weight>0&&weight<=1e12),400,'INVALID_WEIGHT');
  const key=text(request.headers.get('idempotency-key'),'idempotency_key',100),pickup=text(b.pickup,'pickup',500),destination=text(b.destination,'destination',500);
  const existing=await first(db,'SELECT * FROM den_mobility_requests WHERE user_id=? AND idempotency_key=?',actor.id,key);
  if(existing){ensure(existing.kind===b.kind&&existing.pickup===pickup&&existing.destination===destination&&existing.vehicle_type===b.vehicleType&&existing.weight_grams===weight&&existing.origin_country===b.originCountry&&existing.destination_country===b.destinationCountry&&existing.transport_mode===mode,409,'IDEMPOTENCY_CONFLICT');return response({request:existing,replayed:true});}
  const id=crypto.randomUUID();await auditBatch(env,actor,'mobility.quote.requested',{requestId:id,kind:b.kind},[q(db,'INSERT INTO den_mobility_requests(id,user_id,kind,origin_country,destination_country,pickup,destination,vehicle_type,weight_grams,transport_mode,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,actor.id,b.kind,b.originCountry,b.destinationCountry,pickup,destination,b.vehicleType,weight,mode,nowOf(env),key)]);
  return response({request:await first(db,'SELECT * FROM den_mobility_requests WHERE id=?',id),quote:null,providerStatus:'not_configured'},201);
 }
 const match=path.match(/^\/api\/mobility\/requests\/([^/]+)\/cancel$/);
 if(match&&method==='POST'){
  const current=await first(db,'SELECT * FROM den_mobility_requests WHERE id=? AND user_id=?',match[1],actor.id);ensure(current,404,'REQUEST_NOT_FOUND');
  await auditBatch(env,actor,'mobility.request.cancelled',{requestId:current.id},[q(db,"UPDATE den_mobility_requests SET status='cancelled' WHERE id=? AND user_id=?",current.id,actor.id)]);return response({ok:true});
 }
 return response({error:'NOT_FOUND'},404);
}
