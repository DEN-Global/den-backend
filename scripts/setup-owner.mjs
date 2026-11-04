// Run locally in a terminal. Never supply the password as a command-line argument.
import {openLocalDatabase} from '../src/local-database.js';
import {createAuditRecord,auditGenesis} from '../src/audit.js';
import {hashPassword} from '../src/security.js';
import {email,password} from '../src/http.js';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
if(!process.stdin.isTTY)throw new Error('Run owner setup in an interactive terminal.');
mkdirSync('.data',{recursive:true,mode:0o700});
const configPath='.data/local-config.json';
const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{mfaKey:randomBytes(32).toString('base64'),primaryAdminId:''};
const db=openLocalDatabase('.data/den-local.sqlite');
try{
 const previous=config.primaryAdminId?db.sqlite.prepare('SELECT c.email FROM den_admin_accounts a JOIN den_credentials c ON c.user_id=a.user_id WHERE a.user_id=?').get(config.primaryAdminId):null;
 if(previous&&!(process.argv.includes('--replace-test-owner')&&previous.email.endsWith('@example.test')))throw new Error('An owner is already configured. Owner transfer requires a separate explicit recovery process.');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 const address=email((await rl.question('Owner email [lekanay2005@gmail.com]: '))||'lekanay2005@gmail.com');rl.close();
 if(db.sqlite.prepare('SELECT user_id FROM den_credentials WHERE email=?').get(address))throw new Error('This email already has an account. Sign in and use an authorized owner transfer; setup does not overwrite existing credentials.');
 const secret=async(label)=>{process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';const read=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){finish();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){finish();resolve(value);return;}if(char==='\u007f'){value=value.slice(0,-1);}else if(char>=' ')value+=char;}};const finish=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('data',read);});};
 const value=password(await secret('Owner password (hidden, at least 11 characters): '),11);
 if(value!==await secret('Confirm owner password (hidden): '))throw new Error('Passwords do not match.');
 const hash=await hashPassword(value),id=crypto.randomUUID(),now=Date.now();
 const head=db.sqlite.prepare('SELECT sequence,event_hash FROM den_audit_events ORDER BY sequence DESC LIMIT 1').get();
 const record=await createAuditRecord({sequence:(head?.sequence??0)+1,actorId:id,action:'admin.owner_bootstrapped',occurredAt:now,payload:JSON.stringify({replacedLocalTestOwner:Boolean(previous)}),previousHash:head?.event_hash??auditGenesis});
 db.sqlite.exec('BEGIN IMMEDIATE');try{if(previous){db.sqlite.prepare('DELETE FROM den_admin_role_assignments WHERE user_id=?').run(config.primaryAdminId);db.sqlite.prepare('DELETE FROM den_admin_accounts WHERE user_id=?').run(config.primaryAdminId);db.sqlite.prepare('DELETE FROM den_sessions WHERE user_id=?').run(config.primaryAdminId);}
 db.sqlite.prepare('INSERT INTO den_users(id,auth_subject,created_at) VALUES(?,?,?)').run(id,`password:${id}`,now);db.sqlite.prepare('INSERT INTO den_credentials(user_id,email,display_name,password_hash) VALUES(?,?,?,?)').run(id,address,'Owner Admin',hash);db.sqlite.prepare('INSERT INTO den_admin_accounts VALUES(?,?,?)').run(id,'primary_super_admin','["roles.assign"]');db.sqlite.prepare('INSERT INTO den_audit_events(sequence,actor_id,action,occurred_at,payload,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?)').run(record.sequence,id,record.action,now,record.payload,record.previousHash,record.eventHash);db.sqlite.exec('COMMIT');}catch(e){db.sqlite.exec('ROLLBACK');throw e;}
 config.primaryAdminId=id;writeFileSync(configPath+'.next',JSON.stringify(config),{mode:0o600});renameSync(configPath+'.next',configPath);
 console.log('Owner Admin created locally. Sign in at /admin/ and enable MFA in Security. The updated local API reads the owner identity on each request. No cloud account was modified.');
}finally{db.close();}
