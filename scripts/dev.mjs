import { createServer } from 'node:http';
import { mkdirSync,existsSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,extname,sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { handleRequest } from '../src/app.js';
import { openLocalDatabase } from '../src/local-database.js';
import {generateVapidKeys} from '@mmmike/web-push/vapid';
mkdirSync('.data',{recursive:true,mode:0o700});
const configPath=process.env.DEN_CONFIG_FILE??'.data/local-config.json';
if(!existsSync(configPath))writeFileSync(configPath,JSON.stringify({mfaKey:randomBytes(32).toString('base64'),primaryAdminId:''}),{mode:0o600});
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(!config.vapidPublicKey||!config.vapidPrivateKey){const keys=await generateVapidKeys();config.vapidPublicKey=keys.publicKey;config.vapidPrivateKey=keys.privateKey;writeFileSync(configPath,JSON.stringify(config),{mode:0o600});}
const DB=openLocalDatabase(process.env.DEN_DATABASE_FILE??'.data/den-local.sqlite'),port=Number(process.env.PORT??8787),origin=`http://localhost:${port}`;
const defaultAssets=resolve(process.env.DEN_UI_DIR??'../den-infrastructure/portal');
const appNames=new Set(['consumer','manager','rider','dispatch','admin','transport','shipment','warehouse','pets']);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  headers.set('x-forwarded-for','127.0.0.1');
  if(!url.pathname.startsWith('/api/')){
   const segments=decodeURIComponent(url.pathname).split('/').filter(Boolean),appName=segments[0];
   const named=appNames.has(appName),assets=named?resolve(`../den-${appName}/dist`):appName==='assets'?resolve('../den-warehouse/dist'):defaultAssets;
   const relative=named?'/'+segments.slice(1).join('/'):url.pathname;
   const requested=resolve(assets,'.'+relative);
   const file=requested.startsWith(assets+sep)&&existsSync(requested)&&extname(requested)?requested:resolve(assets,'index.html');
   if(!existsSync(file)){res.writeHead(503,{'content-type':'text/plain'});res.end('Build this DEN application before opening its workspace.');return;}
   res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://maps.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(readFileSync(file));return;
  }
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
  const result=await handleRequest(request,{DB,APP_ORIGIN:process.env.DEN_APP_ORIGIN??origin,MFA_ENCRYPTION_KEY:config.mfaKey,VAPID_PUBLIC_KEY:config.vapidPublicKey,VAPID_PRIVATE_KEY:config.vapidPrivateKey,VAPID_SUBJECT:process.env.DEN_VAPID_SUBJECT??'mailto:security@den.global',PRIMARY_ADMIN_ID:JSON.parse(readFileSync(configPath,'utf8')).primaryAdminId,DEN_SANDBOX_PAYMENTS:process.env.DEN_SANDBOX_PAYMENTS??'false',RESEND_API_KEY:process.env.RESEND_API_KEY,SIGNIN_EMAIL_FROM:process.env.SIGNIN_EMAIL_FROM});
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Request failed');}
});
server.listen(port,'127.0.0.1',()=>console.log(`DEN local workspace: ${origin}. Local test data only; no live payments or carrier services.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.close();process.exit(0);}));
