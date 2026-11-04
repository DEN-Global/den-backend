import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../src/app.js';
import {openLocalDatabase} from '../src/local-database.js';
import {hashToken,randomToken} from '../src/security.js';
async function setup(t){
 const DB=openLocalDatabase();t.after(()=>DB.close());const now=Date.now(),env={DB,APP_ORIGIN:'http://test',PRIMARY_ADMIN_ID:'admin',DEN_SANDBOX_PAYMENTS:'true'};const clients={};
 for(const id of ['admin','manager','buyer','rider','outsider']){
  const token=randomToken(),csrf=randomToken();await DB.prepare('INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)').bind(id,id,now).run();
  await DB.prepare('INSERT INTO den_credentials(user_id,email,display_name,password_hash,totp_enabled) VALUES(?,?,?,?,?)').bind(id,`${id}@example.test`,id,'test-session-only',id==='admin'?1:0).run();
  await DB.prepare('INSERT INTO den_sessions VALUES(?,?,?,?,?,?,?)').bind(await hashToken(token),id,now,now+3600000,now,id==='admin'?now:null,csrf).run();
  clients[id]=async(path,method='GET',body={},headers={})=>{const r=await handleRequest(new Request('http://test/api/'+path,{method,headers:{origin:'http://test',cookie:`den_session=${token}`,'x-csrf-token':csrf,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env);return{...await r.json(),status:r.status};};
 }
 await DB.prepare("INSERT INTO den_admin_accounts VALUES('admin','primary_super_admin','[]')").run();return{env,DB,...clients};
}
test('authenticated unified API executes marketplace to verified sandbox delivery and protects service participants',async t=>{
 const f=await setup(t),{manager:m,buyer:b,admin:a,rider:r,outsider:x}=f;
 const org=await m('platform/organizations','POST',{name:'Integration Store',country:'NG'});assert.equal(org.status,201);
 assert.equal((await a('platform/admin/reviews','POST',{type:'organization',id:org.id,status:'approved',reason:'Synthetic integration review only'})).status,200);
 const product=await m(`platform/organizations/${org.id}/products`,'POST',{name:'Integration parcel',priceMinor:12500,currency:'NGN',stock:3});assert.equal(product.status,201);
 const addr=await b('platform/addresses','POST',{label:'Home',address:'Synthetic integration address',country:'NG'});await b('platform/cart','POST',{productId:product.id,quantity:1});
 const order=await b('platform/orders','POST',{addressId:addr.id,deliveryPayment:'cash'});assert.equal(order.status,201);const p=`platform/orders/${order.id}`;
 assert.equal((await r('platform/rider','POST',{vehicle:'bicycle'})).status,201);
 assert.equal((await r(p+'/reserve','POST')).status,403);await a('platform/admin/reviews','POST',{type:'rider',id:'rider',status:'approved',reason:'Synthetic integration review only'});
 assert.equal((await r(p+'/reserve','POST')).status,200);
 assert.equal((await x(p)).status,404);assert.equal((await r(p+'/pickup','POST')).status,409);
 const own=(await m(p)).order,customer=(await b(p)).order;
 assert.equal((await r(p+'/organization-scan','POST',{token:'incorrect'})).status,403);
 await m(p+'/ready','POST');await r(p+'/organization-scan','POST',{token:own.organizationQr});await m(p+'/handoff','POST');assert.equal((await r(p+'/pickup','POST')).status,200);
 assert.equal((await r(p+'/cash-confirm','POST',{code:'incorrect'})).status,403);await r(p+'/cash-confirm','POST',{code:customer.cashCode});
 assert.equal((await r(p+'/delivery-code','POST',{code:'incorrect'})).status,403);await r(p+'/delivery-code','POST',{code:customer.deliveryCode});const qr=(await r(p)).order.deliveryQr;
 assert.equal((await b(p+'/complete','POST',{token:'incorrect'})).status,403);assert.equal((await b(p+'/complete','POST',{token:qr})).status,200);
 const receipt=await b(p+'/receipt');assert.equal(receipt.status,200);assert.equal(receipt.receipt.deliveryPayment,'cash_confirmed');
 assert.equal((await b('services/wallet')).status,200);assert.equal((await x(`services/orders/${order.id}/tracking`)).status,404);
 assert.ok((await f.DB.prepare('SELECT COUNT(*) AS n FROM den_audit_events').first()).n>10);
});
test('domestic mobility requests persist privately, replay safely and never imply quotes or international bookings',async t=>{
 const f=await setup(t),headers={'idempotency-key':'mobility-test-1'},body={kind:'shipment',originCountry:'NG',destinationCountry:'NG',pickup:'Local test pickup',destination:'Local test destination',vehicleType:'van',transportMode:'road',weightGrams:2000};
 const saved=await f.buyer('mobility/requests','POST',body,headers);assert.equal(saved.status,201);assert.equal(saved.quote,null);assert.equal(saved.providerStatus,'not_configured');
 assert.equal((await f.buyer('mobility/requests','POST',body,headers)).replayed,true);assert.equal((await f.buyer('mobility/requests','POST',{...body,weightGrams:3},headers)).status,409);
 assert.equal((await f.outsider(`mobility/requests/${saved.request.id}/cancel`,'POST')).status,404);assert.equal((await f.outsider('mobility/requests')).requests.length,0);
 assert.equal((await f.buyer('mobility/requests','POST',{...body,destinationCountry:'GB'},{'idempotency-key':'international'})).status,423);
 assert.equal((await f.buyer('mobility/driver','POST',{vehicleType:'car',registrationReference:'QA reference',country:'NG'})).status,201);assert.equal((await f.buyer('mobility/driver')).driver.status,'pending');
 assert.equal((await f.buyer(`mobility/requests/${saved.request.id}/cancel`,'POST')).status,200);assert.equal((await f.buyer('mobility/requests')).requests[0].status,'cancelled');
});
