import {ensure,readJson,response,HttpError,text} from './http.js';
import {constantTimeEqual} from './security.js';
export const flutterwaveReady=env=>Boolean(env.FLUTTERWAVE_SECRET_KEY&&!env.FLUTTERWAVE_SECRET_KEY.includes('_TEST')&&env.FLUTTERWAVE_WEBHOOK_SECRET&&env.FLUTTERWAVE_FUNDING_ENABLED==='true');
const currencies=['NGN'];
async function provider(env,path,body){
 let result;try{result=await (env.FLUTTERWAVE_FETCH??fetch)(`https://api.flutterwave.com/v3/${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(503,'PAYMENT_PROVIDER_UNAVAILABLE');}
 let data;try{data=await result.json();}catch{throw new HttpError(503,'PAYMENT_PROVIDER_UNAVAILABLE');}ensure(result.ok&&data.status==='success',502,'PAYMENT_PROVIDER_REJECTED');return data.data;
}
const publicFunding=row=>({reference:row.tx_ref,amountMinor:Number(row.amount_minor),currency:row.currency,state:row.state,checkoutUrl:row.checkout_url||null,createdAt:Number(row.created_at),creditedAt:row.credited_at===null?null:Number(row.credited_at)});
function checkoutUrl(value){try{const url=new URL(value);ensure(url.protocol==='https:'&&url.hostname==='checkout.flutterwave.com'&&!url.username&&!url.password,502,'INVALID_CHECKOUT_URL');return url.href;}catch{throw new HttpError(502,'INVALID_CHECKOUT_URL');}}
export async function verifyFunding(env,intent,h){
 const {first,q,auditBatch,nowOf}=h,db=env.DB;
 if(intent.state==='credited')return {state:'credited',replayed:true};
 const tx=await provider(env,`transactions/verify_by_reference?tx_ref=${encodeURIComponent(intent.tx_ref)}`);
 ensure(tx.tx_ref===intent.tx_ref&&tx.currency===intent.currency&&String(tx.customer?.email??'').toLowerCase()===intent.customer_email.toLowerCase(),409,'PAYMENT_DETAILS_MISMATCH');
 if(tx.status!=='successful')return {state:'pending',providerStatus:String(tx.status)};
 const amount=Number(tx.amount)*100;ensure(Number.isFinite(amount)&&Math.abs(amount-Number(intent.amount_minor))<.000001&&Number.isSafeInteger(Number(tx.id))&&Number(tx.id)>0,409,'PAYMENT_DETAILS_MISMATCH');
 const transactionId=String(tx.id),entryId=`flutterwave:funding:${transactionId}`,now=nowOf(env);
 const statements=[q(db,'UPDATE den_wallet_funding SET state=state WHERE id=?',intent.id),q(db,"INSERT INTO den_transaction_guards(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM den_wallet_funding WHERE id=? AND state='pending') AND NOT EXISTS(SELECT 1 FROM den_service_wallet_entries WHERE id=?) THEN 1 ELSE 0 END)",`funding:${intent.id}`,intent.id,entryId),q(db,'INSERT INTO den_service_wallet_entries(id,user_id,currency,amount_minor,reference,created_at) VALUES(?,?,?,?,?,?)',entryId,intent.user_id,intent.currency,intent.amount_minor,`Flutterwave wallet funding · ${intent.tx_ref}`,now),q(db,"UPDATE den_wallet_funding SET state='credited',provider_transaction_id=?,credited_at=? WHERE id=?",transactionId,now,intent.id),q(db,'DELETE FROM den_transaction_guards WHERE id=?',`funding:${intent.id}`)];
 try{await auditBatch(env,{id:intent.user_id},'wallet.funding.verified',{reference:intent.tx_ref,transactionId,currency:intent.currency,amountMinor:Number(intent.amount_minor)},statements);}catch{const updated=await first(db,'SELECT * FROM den_wallet_funding WHERE id=?',intent.id);if(updated?.state==='credited'&&updated.provider_transaction_id===transactionId)return {state:'credited',replayed:true};throw new HttpError(409,'PAYMENT_VERIFICATION_RETRY');}
 return {state:'credited'};
}
export async function handleFlutterwaveWebhook(request,env,h){
 ensure(flutterwaveReady(env)&&env.FLUTTERWAVE_WEBHOOK_SECRET,503,'WEBHOOK_NOT_CONFIGURED');
 ensure(await constantTimeEqual(request.headers.get('verif-hash')??'',env.FLUTTERWAVE_WEBHOOK_SECRET),401,'INVALID_WEBHOOK_SIGNATURE');
 const body=await readJson(request);if(body.event!=='charge.completed'||!body.data?.tx_ref)return response({received:true});
 const row=await h.first(env.DB,'SELECT * FROM den_wallet_funding WHERE tx_ref=?',String(body.data.tx_ref));if(!row)return response({received:true});
 const verified=await verifyFunding(env,row,h);ensure(verified.state==='credited',503,'PAYMENT_NOT_SETTLED');return response({received:true});
}
export async function handleWalletFunding(request,env,actor,h){
 const path=new URL(request.url).pathname,method=request.method;if(!path.startsWith('/api/services/wallet/funding'))return null;
 ensure(actor?.authenticated&&actor.status==='active',401,'SIGN_IN_REQUIRED');const {first,all,q,auditBatch,nowOf}=h,db=env.DB;
 if(path==='/api/services/wallet/funding'&&method==='GET'&&!flutterwaveReady(env))return response({funding:[]});
 if(path==='/api/services/wallet/funding'&&method==='GET')return response({funding:await all(db,'SELECT * FROM den_wallet_funding WHERE user_id=? ORDER BY created_at DESC LIMIT 30',actor.id).then(rows=>rows.map(publicFunding))});
 ensure(flutterwaveReady(env),503,'WALLET_FUNDING_NOT_CONFIGURED');
 if(path==='/api/services/wallet/funding'&&method==='POST'){
  const body=await readJson(request),amount=body.amountMinor,key=text(body.idempotencyKey,'idempotency_key',120);
  ensure(currencies.includes(body.currency)&&Number.isSafeInteger(amount)&&amount>=10000&&amount<=10000000,400,'INVALID_FUNDING_AMOUNT');ensure(/^[a-zA-Z0-9_-]{8,120}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY');
  let row=await first(db,'SELECT * FROM den_wallet_funding WHERE user_id=? AND request_key=?',actor.id,key);
  if(row)ensure(Number(row.amount_minor)===amount&&row.currency===body.currency,409,'IDEMPOTENCY_CONFLICT');
  else{
   const credential=await first(db,'SELECT email,display_name FROM den_credentials WHERE user_id=?',actor.id);ensure(credential,401,'SIGN_IN_REQUIRED');const id=crypto.randomUUID(),reference=`den-wallet-${id}`;
   try{await auditBatch(env,actor,'wallet.funding.requested',{reference,amountMinor:amount,currency:body.currency},[q(db,"INSERT INTO den_wallet_funding(id,user_id,request_key,tx_ref,amount_minor,currency,customer_email,created_at) VALUES(?,?,?,?,?,?,?,?)",id,actor.id,key,reference,amount,body.currency,credential.email,nowOf(env))]);}catch{row=await first(db,'SELECT * FROM den_wallet_funding WHERE user_id=? AND request_key=?',actor.id,key);ensure(row&&Number(row.amount_minor)===amount&&row.currency===body.currency,409,'FUNDING_REQUEST_RETRY');}
   row??=await first(db,'SELECT * FROM den_wallet_funding WHERE user_id=? AND request_key=?',actor.id,key);
  }
  if(!row.checkout_url&&row.state==='pending'){
   const origin=new URL(env.APP_ORIGIN);ensure(origin.protocol==='https:'||origin.hostname==='localhost',503,'INVALID_APP_ORIGIN');
   const data=await provider(env,'payments',{tx_ref:row.tx_ref,amount:(Number(row.amount_minor)/100).toFixed(2),currency:row.currency,redirect_url:`${origin.origin}/consumer/?wallet_funding=${encodeURIComponent(row.tx_ref)}`,customer:{email:row.customer_email},customizations:{title:'DEN wallet funding'},meta:{wallet_reference:row.tx_ref},configuration:{session_duration:30}});
   const link=checkoutUrl(data.link);await q(db,"UPDATE den_wallet_funding SET checkout_url=? WHERE id=? AND state='pending'",link,row.id).run();row=await first(db,'SELECT * FROM den_wallet_funding WHERE id=?',row.id);
  }
  return response({funding:publicFunding(row)},201);
 }
 const match=path.match(/^\/api\/services\/wallet\/funding\/([^/]+)\/verify$/);if(match&&method==='POST'){const row=await first(db,'SELECT * FROM den_wallet_funding WHERE tx_ref=? AND user_id=?',match[1],actor.id);ensure(row,404,'FUNDING_NOT_FOUND');return response(await verifyFunding(env,row,h));}
 throw new HttpError(404,'WALLET_ROUTE_NOT_FOUND');
}
