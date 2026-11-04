import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('Workers runtime executes scrypt auth and real D1-backed warehouse registration',async t=>{
 execFileSync(process.execPath,['scripts/build-worker.mjs']);
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.build/worker.mjs',compatibilityDate:'2026-11-04',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'warehouse-runtime-test'},bindings:{APP_ORIGIN:'http://localhost',MFA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),PRIMARY_ADMIN_ID:'not-provisioned'}}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 // Use SQLite's own parser to preserve trigger bodies, then execute each statement in D1.
 const parser=new DatabaseSync(':memory:');t.after(()=>parser.close());
 for(const filename of ['0001_foundation.sql','0002_warehouse_api.sql']) {
  let remaining=readFileSync(new URL(`../migrations/${filename}`,import.meta.url),'utf8');
  while(remaining.trim()) {const sql=parser.prepare(remaining).sourceSQL;parser.exec(sql);await db.prepare(sql).run();remaining=remaining.slice(sql.length);}
 }
 let cookie='',csrf='';
 async function request(path,method='GET',body) {
  const result=await mf.dispatchFetch('http://localhost'+path,{method,headers:{origin:'http://localhost','content-type':'application/json',cookie,'x-csrf-token':csrf},...(body?{body:JSON.stringify(body)}:{})});
  if(result.headers.has('set-cookie'))cookie=result.headers.get('set-cookie').split(';')[0];
  const data=await result.json();if(data.csrfToken)csrf=data.csrfToken;return {status:result.status,data};
 }
 assert.equal((await request('/api/businesses')).status,401);
 const registered=await request('/api/auth/register','POST',{email:'runtime@example.test',name:'Runtime test owner',password:'runtime-test-password-2026'});assert.equal(registered.status,201,JSON.stringify(registered));
 const signedIn=await request('/api/auth/login','POST',{email:'runtime@example.test',password:'runtime-test-password-2026'});assert.equal(signedIn.status,200,JSON.stringify(signedIn));
 const business=await request('/api/businesses','POST',{legalName:'Runtime test business',country:'NG',registeredAddress:'Local runtime test address'});assert.equal(business.status,201,JSON.stringify(business));
 assert.equal((await request('/api/businesses')).data.businesses.length,1);
 assert.equal((await request('/api/international/bookings','POST',{})).status,423);
});
