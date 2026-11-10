import { response, readJson, ensure, text } from './http.js';

const API='https://1click.chaindefuser.com/v0';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>q(db,sql,...args).first();
const all=async(db,sql,...args)=>(await q(db,sql,...args).all()).results;
const now=()=>Date.now();
const parse=row=>({ ...JSON.parse(row.data_json), id:row.id });
const schedule=row=>({ ...JSON.parse(row.config_json), id:row.id, active:Boolean(row.active), createdAt:new Date(row.created_at).toISOString() });

async function upstream(path,init,env) {
 const headers=new Headers(init?.headers);
 if(init?.body)headers.set('content-type','application/json');
 if(env.NEAR_INTENTS_JWT)headers.set('authorization',`Bearer ${env.NEAR_INTENTS_JWT}`);
 let result;
 try { result=await fetch(`${API}${path}`,{...init,headers}); }
 catch { return response({error:'INTENTS_UNAVAILABLE'},502); }
 const body=await result.text();
 return new Response(body,{status:result.status,headers:{'content-type':result.headers.get('content-type')??'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export async function handleOrbit(request,env,actor,path,method) {
 const db=env.DB;
 if(path==='/api/orbit/tokens'&&method==='GET')return upstream('/tokens',undefined,env);
 if(path==='/api/orbit/quote'&&method==='POST') {
  const body=await readJson(request);
  for(const field of ['dry','originAsset','destinationAsset','amount','recipient','refundTo'])ensure(body[field]!==undefined&&body[field]!=='',400,'QUOTE_FIELDS_REQUIRED');
  ensure(typeof body.dry==='boolean'&&typeof body.amount==='string'&&/^\d+$/.test(body.amount),400,'INVALID_QUOTE');
  ensure(body.amount.length<=100,400,'INVALID_AMOUNT');
  return upstream('/quote',{method:'POST',body:JSON.stringify({...body,swapType:'EXACT_INPUT'})},env);
 }
 if(path==='/api/orbit/schedules'&&method==='GET')return response({schedules:await all(db,'SELECT * FROM den_orbit_schedules WHERE user_id=? ORDER BY created_at DESC LIMIT 100',actor.id).then(rows=>rows.map(schedule))});
 if(path==='/api/orbit/schedules'&&method==='POST') {
  const body=await readJson(request),id=crypto.randomUUID(),created=now();
  const config={label:text(body.label,'label',100),amount:text(body.amount,'amount',80),originAsset:text(body.originAsset,'origin_asset',300),originSymbol:text(body.originSymbol,'origin_symbol',30),originChain:text(body.originChain,'origin_chain',60),targetAsset:text(body.targetAsset,'target_asset',300),targetSymbol:text(body.targetSymbol,'target_symbol',30),recipient:text(body.recipient,'recipient',500),refundTo:text(body.refundTo,'refund_to',500),interval:body.interval,slippage:Number(body.slippage),nextRun:body.nextRun};
  ensure(['daily','weekly','monthly'].includes(config.interval)&&Number.isInteger(config.slippage)&&config.slippage>=1&&config.slippage<=5000&&Number.isFinite(Date.parse(config.nextRun)),400,'INVALID_SCHEDULE');
  await q(db,'INSERT INTO den_orbit_schedules(id,user_id,config_json,active,created_at,updated_at) VALUES(?,?,?,1,?,?)',id,actor.id,JSON.stringify(config),created,created).run();
  return response({schedule:{...config,id,active:true,createdAt:new Date(created).toISOString()}},201);
 }
 let match=path.match(/^\/api\/orbit\/schedules\/([^/]+)$/);
 if(match&&method==='PATCH') {
  const id=decodeURIComponent(match[1]),body=await readJson(request);ensure(typeof body.active==='boolean',400,'INVALID_ACTIVE');
  await q(db,'UPDATE den_orbit_schedules SET active=?,updated_at=? WHERE id=? AND user_id=?',Number(body.active),now(),id,actor.id).run();
  const row=await first(db,'SELECT * FROM den_orbit_schedules WHERE id=? AND user_id=?',id,actor.id);ensure(row,404,'SCHEDULE_NOT_FOUND');return response({schedule:schedule(row)});
 }
 if(path==='/api/orbit/swaps'&&method==='GET')return response({swaps:await all(db,'SELECT * FROM den_orbit_swaps WHERE user_id=? ORDER BY created_at DESC LIMIT 100',actor.id).then(rows=>rows.map(row=>parse(row)))});
 if(path==='/api/orbit/swaps'&&method==='POST') {
  const body=await readJson(request),id=text(body.id,'id',200),created=now(),scheduleId=body.scheduleId??null;
  ensure(typeof body.depositAddress==='string'&&body.depositAddress.length>0&&body.depositAddress.length<=500,400,'INVALID_DEPOSIT_ROUTE');
  if(scheduleId)ensure(await first(db,'SELECT id FROM den_orbit_schedules WHERE id=? AND user_id=?',scheduleId,actor.id),404,'SCHEDULE_NOT_FOUND');
  const data={...body,id};delete data.depositAddress;delete data.depositMemo;
  data.depositAddress=body.depositAddress;data.depositMemo=body.depositMemo??null;
  await q(db,'INSERT INTO den_orbit_swaps(id,user_id,schedule_id,data_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,actor.id,scheduleId,JSON.stringify(data),String(body.status??'PENDING_DEPOSIT'),created,created).run();
  return response({swap:{...data}},201);
 }
 match=path.match(/^\/api\/orbit\/swaps\/([^/]+)\/status$/);
 if(match&&method==='POST') {
  const id=decodeURIComponent(match[1]),row=await first(db,'SELECT * FROM den_orbit_swaps WHERE id=? AND user_id=?',id,actor.id);ensure(row,404,'SWAP_NOT_FOUND');
  const data=parse(row),query=new URLSearchParams({depositAddress:data.depositAddress});if(data.depositMemo)query.set('depositMemo',data.depositMemo);
  const result=await upstream(`/status?${query}`,undefined,env);if(!result.ok)return result;
  const resultBody=await result.clone().json();
  const status=String(resultBody.status??'UNKNOWN');
  const hashes=resultBody.swapDetails?.destinationChainTxHashes??resultBody.swapDetails?.originChainTxHashes??[];
  const next={...data,status,amountOut:resultBody.swapDetails?.amountOutFormatted??data.amountOut,explorerUrl:hashes[0]?.explorerUrl??data.explorerUrl};
  const updated=await q(db,"UPDATE den_orbit_swaps SET data_json=?,status=?,updated_at=? WHERE id=? AND user_id=? AND status!='SUCCESS'",JSON.stringify(next),status,now(),id,actor.id).run();
  if(status==='SUCCESS'&&row.schedule_id&&(updated.meta?.changes??0)>0) {
   const plan=await first(db,'SELECT config_json FROM den_orbit_schedules WHERE id=? AND user_id=?',row.schedule_id,actor.id);
   if(plan){const config=JSON.parse(plan.config_json),d=new Date();if(config.interval==='daily')d.setDate(d.getDate()+1);else if(config.interval==='weekly')d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+1);config.nextRun=d.toISOString();await q(db,'UPDATE den_orbit_schedules SET config_json=?,updated_at=? WHERE id=? AND user_id=?',JSON.stringify(config),now(),row.schedule_id,actor.id).run();}
  }
  return response({...resultBody,swap:next});
 }
 return null;
}
