import { createServer } from 'node:http';
import { mkdirSync,existsSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,extname,sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { handleRequest } from '../src/app.js';
import { openLocalDatabase } from '../src/local-database.js';
mkdirSync('.data',{recursive:true,mode:0o700});
const configPath='.data/local-config.json';
if(!existsSync(configPath))writeFileSync(configPath,JSON.stringify({mfaKey:randomBytes(32).toString('base64'),primaryAdminId:''}),{mode:0o600});
const config=JSON.parse(readFileSync(configPath,'utf8'));
const DB=openLocalDatabase('.data/den-local.sqlite'),port=Number(process.env.PORT??8787),origin=`http://localhost:${port}`;
const assets=resolve(process.env.DEN_UI_DIR??'../den-warehouse/dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  headers.set('cf-connecting-ip','127.0.0.1');
  if(!url.pathname.startsWith('/api/')){
   const requested=resolve(assets,'.'+decodeURIComponent(url.pathname));
   const file=requested.startsWith(assets+sep)&&existsSync(requested)&&extname(requested)?requested:resolve(assets,'index.html');
   if(!existsSync(file)){res.writeHead(503,{'content-type':'text/plain'});res.end('Build den-warehouse before starting the UI.');return;}
   res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(readFileSync(file));return;
  }
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
  const result=await handleRequest(request,{DB,APP_ORIGIN:process.env.DEN_APP_ORIGIN??origin,MFA_ENCRYPTION_KEY:config.mfaKey,PRIMARY_ADMIN_ID:config.primaryAdminId});
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Request failed');}
});
server.listen(port,'127.0.0.1',()=>console.log(`DEN local workspace: ${origin}. Local test data only; no live payments or carrier services.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.close();process.exit(0);}));
