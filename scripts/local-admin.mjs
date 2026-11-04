// Explicit operator action against the local development database only.
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { openLocalDatabase } from '../src/local-database.js';
if(process.env.DEN_ALLOW_LOCAL_ADMIN_PROVISION!=='1')throw new Error('Set DEN_ALLOW_LOCAL_ADMIN_PROVISION=1 to confirm LOCAL development provisioning. Never use this for production.');
const address=process.argv[2]?.trim().toLowerCase();if(!address)throw new Error('Usage: node scripts/local-admin.mjs <registered-local-email>');
if(!existsSync('.data/local-config.json'))throw new Error('Start npm run dev once first.');
const config=JSON.parse(readFileSync('.data/local-config.json','utf8'));if(config.primaryAdminId)throw new Error('A local primary admin already exists. No account was changed.');
const DB=openLocalDatabase('.data/den-local.sqlite');
try {
 const user=await DB.prepare('SELECT user_id FROM den_credentials WHERE email=?').bind(address).first();if(!user)throw new Error('Register the local account first.');
 await DB.prepare("INSERT INTO den_admin_accounts(user_id,level,permissions) VALUES(?,'primary_super_admin','[]')").bind(user.user_id).run();
 config.primaryAdminId=user.user_id;writeFileSync('.data/local-config.json',JSON.stringify(config),{mode:0o600});
 console.log('Local Primary Super Admin provisioned. Restart dev server, sign in and enroll MFA. No production account was changed.');
} finally {DB.close();}
