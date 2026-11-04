import { scrypt, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import * as OTPAuth from 'otpauth';
const derive = promisify(scrypt);
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = async value => Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  return `scrypt:32768:8:3:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password,encoded) {
  const [algorithm,n,r,p,salt,value] = encoded.split(':');
  if (algorithm !== 'scrypt' || !value || Number(n)!==32768 || Number(r)!==8 || Number(p)!==3) return false;
  const actual = await derive(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024});
  const expected = Buffer.from(value,'hex');
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export function encryptSecret(value,key) {
  if(typeof key!=='string') throw new Error('ENCRYPTION_KEY_REQUIRED');
  const secret = Buffer.from(key,'base64');
  if (secret.length !== 32) throw new Error('ENCRYPTION_KEY_REQUIRED');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',secret,iv);
  return [iv.toString('base64'),Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),cipher.getAuthTag().toString('base64')].join('.');
}
export function decryptSecret(value,key) {
  const [iv,data,tag] = value.split('.');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
export function newTotp(email) {
  const totp=new OTPAuth.TOTP({issuer:'DEN',label:email,algorithm:'SHA1',digits:6,period:30,secret:new OTPAuth.Secret({size:20})});
  return {secret:totp.secret.base32,uri:totp.toString()};
}
export function checkTotp(secret,token,now) {
  if (!/^\d{6}$/.test(token ?? '')) return null;
  const totp=new OTPAuth.TOTP({issuer:'DEN',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)});
  const delta=totp.validate({token,timestamp:now,window:1});
  return delta === null ? null : Math.floor(now/30000)+delta;
}
export async function constantTimeEqual(left,right) {
 const [a,b]=await Promise.all([hashToken(String(left??'')),hashToken(String(right??''))]);
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
