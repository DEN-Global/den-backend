import {randomInt} from 'node:crypto';
import {hashToken} from './security.js';
import {ensure} from './http.js';
// Email is ready once a sender exists: an injected sender for tests, Supabase Auth, or Resend.
// Until a domain is verified, Resend only accepts its own test sender, so that is the fallback.
const senderOf=env=>env.SIGNIN_EMAIL_FROM??'onboarding@resend.dev';
// Supabase Auth sends and verifies the one-time code; the platform keeps its own sessions,
// password hashing and account tables, so only the delivery step moves to Supabase.
const supabaseOf=env=>env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?{url:env.SUPABASE_URL.replace(/\/$/,''),key:env.SUPABASE_ANON_KEY}:null;
export const emailReady=env=>Boolean(env.SEND_SIGNIN_EMAIL||supabaseOf(env)||env.RESEND_API_KEY);
export async function requestSupabaseCode(env,address){
 const config=supabaseOf(env);
 const result=await fetch(`${config.url}/auth/v1/otp`,{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({email:address,create_user:true}),signal:AbortSignal.timeout(10000)});
 ensure(result.ok,503,'EMAIL_DELIVERY_UNAVAILABLE');
}
export async function verifySupabaseCode(env,address,code){
 ensure(typeof code==='string'&&/^\d{6}$/.test(code),401,'INVALID_EMAIL_CODE');
 const config=supabaseOf(env);
 const result=await fetch(`${config.url}/auth/v1/verify`,{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({type:'email',email:address,token:code}),signal:AbortSignal.timeout(10000)});
  // Rate limiting and upstream failures are retryable, a rejected token is not.
 ensure(!(result.status===429||result.status>=500),503,'EMAIL_DELIVERY_UNAVAILABLE');
 ensure(result.ok,401,'INVALID_EMAIL_CODE');
}
export async function sendSigninEmail(env,to,code){
 const message={from:senderOf(env),to:[to],subject:'Your DEN sign-in code',text:`Your DEN sign-in code is ${code}. It expires in 10 minutes and can be used once. If you did not request it, ignore this email. Never share this code.`};
 if(env.SEND_SIGNIN_EMAIL){await env.SEND_SIGNIN_EMAIL(message);return;}
 if(supabaseOf(env)){await requestSupabaseCode(env,to);return;}
 const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});ensure(result.ok,503,'EMAIL_DELIVERY_UNAVAILABLE');
}
export async function sendRegistrationEmail(env,to,code){
 const message={from:senderOf(env),to:[to],subject:'Verify your DEN Global email',text:`Your DEN Global verification code is ${code}. It expires in 10 minutes and can be used once. If you did not request it, ignore this email. Never share this code.`};
 if(env.SEND_SIGNIN_EMAIL){await env.SEND_SIGNIN_EMAIL(message);return;}
 if(supabaseOf(env)){await requestSupabaseCode(env,to);return;}
 const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});ensure(result.ok,503,'EMAIL_DELIVERY_UNAVAILABLE');
}
export async function issueRegistrationEmailCode(env,address,now){if(supabaseOf(env)){await requestSupabaseCode(env,address);return;}const id=crypto.randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');await env.DB.batch([env.DB.prepare('DELETE FROM den_registration_email_challenges WHERE email=? OR expires_at<=?').bind(address,now),env.DB.prepare('INSERT INTO den_registration_email_challenges(id,email,code_hash,expires_at) VALUES(?,?,?,?)').bind(id,address,await hashToken(`${id}:${code}`),now+600000)]);try{await sendRegistrationEmail(env,address,code);}catch(e){await env.DB.prepare('DELETE FROM den_registration_email_challenges WHERE id=?').bind(id).run();throw e;}}
export async function consumeRegistrationEmailCode(env,address,code,now){if(supabaseOf(env)){await verifySupabaseCode(env,address,code);return;}ensure(typeof code==='string'&&/^\d{6}$/.test(code),401,'INVALID_EMAIL_CODE');const challenge=await env.DB.prepare('SELECT * FROM den_registration_email_challenges WHERE email=? AND used_at IS NULL AND expires_at>? AND attempts<5 ORDER BY expires_at DESC LIMIT 1').bind(address,now).first();ensure(challenge,401,'INVALID_EMAIL_CODE');const hash=await hashToken(`${challenge.id}:${code}`);const result=await env.DB.prepare('UPDATE den_registration_email_challenges SET attempts=attempts+1,used_at=CASE WHEN code_hash=? THEN ? ELSE used_at END WHERE id=? AND used_at IS NULL AND expires_at>? AND attempts<5 RETURNING used_at').bind(hash,now,challenge.id,now).first();ensure(result?.used_at===now,401,'INVALID_EMAIL_CODE');}
export async function issueEmailCode(env,user,now){if(supabaseOf(env)){await requestSupabaseCode(env,user.email);return;}const id=crypto.randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');await env.DB.batch([env.DB.prepare('DELETE FROM den_email_signin_challenges WHERE user_id=? OR expires_at<=?').bind(user.user_id,now),env.DB.prepare('INSERT INTO den_email_signin_challenges(id,user_id,code_hash,expires_at) VALUES(?,?,?,?)').bind(id,user.user_id,await hashToken(`${id}:${code}`),now+600000)]);try{await sendSigninEmail(env,user.email,code);}catch(e){await env.DB.prepare('DELETE FROM den_email_signin_challenges WHERE id=?').bind(id).run();throw e;}}
export async function consumeEmailCode(env,user,code,now){if(supabaseOf(env)){await verifySupabaseCode(env,user.email,code);return;}ensure(typeof code==='string'&&/^\d{6}$/.test(code),401,'INVALID_EMAIL_CODE');const challenge=await env.DB.prepare('SELECT * FROM den_email_signin_challenges WHERE user_id=? AND used_at IS NULL AND expires_at>? AND attempts<5 ORDER BY expires_at DESC LIMIT 1').bind(user.user_id,now).first();ensure(challenge,401,'INVALID_EMAIL_CODE');const hash=await hashToken(`${challenge.id}:${code}`);const result=await env.DB.prepare('UPDATE den_email_signin_challenges SET attempts=attempts+1,used_at=CASE WHEN code_hash=? THEN ? ELSE used_at END WHERE id=? AND used_at IS NULL AND expires_at>? AND attempts<5 RETURNING used_at').bind(hash,now,challenge.id,now).first();ensure(result?.used_at===now,401,'INVALID_EMAIL_CODE');}
