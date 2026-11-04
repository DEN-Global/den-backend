import {bindings,defineConfig} from 'cf/config';
export default defineConfig(({mode})=>{
 const development=mode==='development';
 if(!development && (!process.env.DEN_D1_DATABASE_ID || !process.env.DEN_APP_ORIGIN || !process.env.DEN_PRIMARY_ADMIN_ID)) {
  throw new Error('Set verified DEN_D1_DATABASE_ID, DEN_APP_ORIGIN and DEN_PRIMARY_ADMIN_ID for this environment. No remote resources are provisioned automatically. Use --mode development for local build validation.');
 }
 return {worker:{
  name:development?'den-backend-development':`den-backend-${mode}`,
  entrypoint:'./src/app.js',compatibilityDate:'2026-11-04',
  observability:{enabled:true,redactQueryString:true,logs:{enabled:true,headSamplingRate:1},traces:{enabled:true,headSamplingRate:0.01}},
  env:{DB:bindings.d1(development?{name:'den-development-local'}:{id:process.env.DEN_D1_DATABASE_ID}),
   MFA_ENCRYPTION_KEY:bindings.secret(),APP_ORIGIN:bindings.text(development?'http://localhost:8787':process.env.DEN_APP_ORIGIN),
   PRIMARY_ADMIN_ID:bindings.text(development?'not-provisioned':process.env.DEN_PRIMARY_ADMIN_ID)}
 }};
});
