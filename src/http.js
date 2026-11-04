export class HttpError extends Error {
  constructor(status,code) {super(code);this.status=status;this.code=code;}
}
export function ensure(condition,status,code) {if(!condition) throw new HttpError(status,code);}
export function text(value,name,max=200,min=1) {
 ensure(typeof value==='string' && value.trim().length>=min && value.length<=max,400,`INVALID_${name.toUpperCase()}`);
 return value.trim();
}
export function password(value,min=1) {
 ensure(typeof value==='string' && value.length>=min && value.length<=128,400,'INVALID_PASSWORD');
 return value;
}
export function email(value) {
 const result=text(value,'email',254).toLowerCase();
 ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result),400,'INVALID_EMAIL');return result;
}
export async function readJson(request) {
 ensure(request.headers.get('content-type')?.split(';')[0]==='application/json',415,'JSON_REQUIRED');
 const reader=request.body?.getReader();ensure(reader,400,'BODY_REQUIRED');
 let size=0;const chunks=[];
 try {while(true) {const {done,value}=await reader.read();if(done) break;size+=value.length;ensure(size<=32768,413,'BODY_TOO_LARGE');chunks.push(value);}}
 finally {reader.releaseLock();}
 const combined=new Uint8Array(size);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.length;}
 try {const result=JSON.parse(new TextDecoder().decode(combined));ensure(result && typeof result==='object'&&!Array.isArray(result),400,'INVALID_JSON');return result;}
 catch(e){if(e instanceof HttpError) throw e;throw new HttpError(400,'INVALID_JSON');}
}
export function response(data,status=200,headers={}) {
 return Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin',...headers}});
}
