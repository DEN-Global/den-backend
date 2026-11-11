import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handleRequest} from '../src/app.js';
import {openLocalDatabase} from '../src/local-database.js';

// End-to-end runtime check: the real request handler backed by the local SQLite adapter.
// The same handler runs on PostgreSQL in production through src/postgres-database.js.
test('Platform runtime executes scrypt auth and real SQLite-backed warehouse registration',async t=>{
 const DB=openLocalDatabase(':memory:');
 t.after(()=>DB.close());
 const env={DB,APP_ORIGIN:'http://localhost',MFA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),PRIMARY_ADMIN_ID:'not-provisioned'};
 let cookie='',csrf='';
 async function request(path,method='GET',body) {
  const result=await handleRequest(new Request('http://localhost'+path,{method,headers:{origin:'http://localhost','content-type':'application/json',cookie,'x-csrf-token':csrf},...(body?{body:JSON.stringify(body)}:{})}),env);
  if(result.headers.has('set-cookie'))cookie=result.headers.get('set-cookie').split(';')[0];
  const data=await result.json();if(data.csrfToken)csrf=data.csrfToken;return {status:result.status,data};
 }
 assert.equal((await request('/api/businesses')).status,401);
 const registered=await request('/api/auth/register','POST',{email:'runtime@example.test',name:'Runtime test owner',password:'runtime-test-password-2026'});assert.equal(registered.status,201,JSON.stringify(registered));
 const signedIn=await request('/api/auth/login','POST',{email:'runtime@example.test',password:'runtime-test-password-2026'});assert.equal(signedIn.status,200,JSON.stringify(signedIn));
 assert.equal((await request('/api/workspace','POST',{role:'warehouse'})).status,201);
 const business=await request('/api/businesses','POST',{legalName:'Runtime test business',country:'NG',registeredAddress:'Local runtime test address'});assert.equal(business.status,201,JSON.stringify(business));
 assert.equal((await request('/api/businesses')).data.businesses.length,1);
 assert.equal((await request('/api/platform/addresses','POST',{label:'Home',address:'Runtime address',country:'NG'})).status,201);
 assert.equal((await request('/api/platform/rider','POST',{vehicle:'bicycle'})).status,403);
 assert.equal((await request('/api/services/wallet')).data.liveMoneyEnabled,false);
 assert.equal((await request('/api/mobility/requests')).status,403);
 assert.equal((await request('/api/international/bookings','POST',{})).status,423);
});
