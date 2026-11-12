import {randomInt} from 'node:crypto';
import {hashToken,hashPassword} from './security.js';
import {ensure} from './http.js';
export const passwordResetReady=env=>Boolean(env.SEND_SIGNIN_EMAIL||env.RESEND_API_KEY);
export async function issuePasswordReset(env,address,now){
 const user=await env.DB.prepare("SELECT c.user_id FROM den_credentials c JOIN den_users u ON u.id=c.user_id WHERE c.email=? AND u.status='active'").bind(address).first();
 if(!user)return;
 const id='reset:'+crypto.randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
 await env.DB.batch([env.DB.prepare("DELETE FROM den_registration_email_challenges WHERE email=? AND id LIKE 'reset:%'").bind(address),env.DB.prepare('INSERT INTO den_registration_email_challenges(id,email,code_hash,expires_at) VALUES(?,?,?,?)').bind(id,address,await hashToken(`${id}:${code}`),now+600000)]);
 const message={from:env.SIGNIN_EMAIL_FROM??'onboarding@resend.dev',to:[address],subject:'Reset your DEN Global password',text:`Your DEN password reset code is ${code}. It expires in 10 minutes and can be used once. If you did not request a reset, ignore this email. Never share this code.`};
 try{if(env.SEND_SIGNIN_EMAIL)await env.SEND_SIGNIN_EMAIL(message);else{const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});ensure(result.ok,503,'EMAIL_DELIVERY_UNAVAILABLE');}}catch(error){await env.DB.prepare('DELETE FROM den_registration_email_challenges WHERE id=?').bind(id).run();throw error;}
}
export async function resetPassword(env,address,code,password,now){
 ensure(typeof code==='string'&&/^\d{6}$/.test(code),401,'INVALID_RESET_CODE');
 const row=await env.DB.prepare("SELECT * FROM den_registration_email_challenges WHERE email=? AND id LIKE 'reset:%' AND used_at IS NULL AND expires_at>? AND attempts<5 ORDER BY expires_at DESC LIMIT 1").bind(address,now).first();ensure(row,401,'INVALID_RESET_CODE');
 const consumed=await env.DB.prepare('UPDATE den_registration_email_challenges SET attempts=attempts+1,used_at=CASE WHEN code_hash=? THEN ? ELSE used_at END WHERE id=? AND used_at IS NULL AND attempts<5 AND expires_at>? RETURNING used_at').bind(await hashToken(`${row.id}:${code}`),now,row.id,now).first();ensure(consumed?.used_at===now,401,'INVALID_RESET_CODE');
 const user=await env.DB.prepare("SELECT c.user_id FROM den_credentials c JOIN den_users u ON u.id=c.user_id WHERE c.email=? AND u.status='active'").bind(address).first();ensure(user,401,'INVALID_RESET_CODE');
 await env.DB.batch([env.DB.prepare('UPDATE den_credentials SET password_hash=? WHERE user_id=?').bind(await hashPassword(password),user.user_id),env.DB.prepare('DELETE FROM den_sessions WHERE user_id=?').bind(user.user_id),env.DB.prepare("DELETE FROM den_registration_email_challenges WHERE email=? AND id LIKE 'reset:%'").bind(address),env.DB.prepare('INSERT INTO den_notifications(id,user_id,message,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.user_id,'Security alert: your DEN password was reset. All sessions have been signed out.',now)]);
}
