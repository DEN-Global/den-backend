import {ensure,text,readJson,response,HttpError} from './http.js';

const categories=['grooming','walking','boarding','sitting','training','daycare'];
const species=['dog','cat','bird','fish','small_animal','reptile','other'];
const contactDetails=/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d().\s-]{7,}\d/i;

export async function handlePets(request,env,actor,h){
 const path=new URL(request.url).pathname,method=request.method;
 if(!path.startsWith('/api/pets/'))return null;
 const db=env.DB,{q,first,all,auditBatch,nowOf}=h,now=nowOf(env),id=()=>crypto.randomUUID();
 const audit=(action,payload,statements)=>auditBatch(env,actor,action,payload,statements);
 const body=method==='GET'?{}:await readJson(request);

 if(path==='/api/pets/profiles'&&method==='GET'){
  return response({pets:await all(db,'SELECT id,name,species,breed,age_months AS ageMonths,created_at AS createdAt,updated_at AS updatedAt FROM den_pet_profiles WHERE owner_id=? ORDER BY created_at DESC',actor.id)});
 }
 if(path==='/api/pets/profiles'&&method==='POST'){
  const name=text(body.name,'name',80),kind=text(body.species,'species',20);
  ensure(species.includes(kind),400,'INVALID_SPECIES');
  const breed=body.breed===undefined?'':text(body.breed,'breed',100,0);
  const age=body.ageMonths===undefined||body.ageMonths===null||body.ageMonths===''?null:Number(body.ageMonths);
  ensure(age===null||(Number.isSafeInteger(age)&&age>=0&&age<=600),400,'INVALID_AGE');
  const petId=id();
  await audit('pet.profile.created',{petId},[q(db,'INSERT INTO den_pet_profiles(id,owner_id,name,species,breed,age_months,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',petId,actor.id,name,kind,breed,age,now,now)]);
  return response({id:petId},201);
 }
 let match=path.match(/^\/api\/pets\/profiles\/([^/]+)$/);
 if(match&&method==='PATCH'){
  const current=await first(db,'SELECT * FROM den_pet_profiles WHERE id=? AND owner_id=?',match[1],actor.id);ensure(current,404,'PET_PROFILE_NOT_FOUND');
  const name=body.name===undefined?current.name:text(body.name,'name',80),kind=body.species===undefined?current.species:text(body.species,'species',20);
  ensure(species.includes(kind),400,'INVALID_SPECIES');
  const breed=body.breed===undefined?current.breed:text(body.breed,'breed',100,0);
  const age=body.ageMonths===undefined?current.age_months:body.ageMonths===null||body.ageMonths===''?null:Number(body.ageMonths);
  ensure(age===null||(Number.isSafeInteger(age)&&age>=0&&age<=600),400,'INVALID_AGE');
  await audit('pet.profile.updated',{petId:current.id},[q(db,'UPDATE den_pet_profiles SET name=?,species=?,breed=?,age_months=?,updated_at=? WHERE id=? AND owner_id=?',name,kind,breed,age,now,current.id,actor.id)]);
  return response({ok:true});
 }
 if(path==='/api/pets/services'&&method==='GET'){
  const url=new URL(request.url),category=url.searchParams.get('category'),query=url.searchParams.get('q')?.trim();
  ensure(!category||categories.includes(category),400,'INVALID_CATEGORY');
  const clauses=["s.status='approved'","o.status='approved'"],args=[];
  if(category){clauses.push('s.category=?');args.push(category);}
  if(query){ensure(query.length<=80,400,'SEARCH_TOO_LONG');clauses.push("(s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\' OR s.area LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')");const term=`%${query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')}%`;args.push(term,term,term,term);}
  return response({services:await all(db,`SELECT s.id,s.category,s.title,s.description,s.area,o.id AS organizationId,o.name AS provider,o.country,s.updated_at AS updatedAt FROM den_pet_services s JOIN den_organizations o ON o.id=s.organization_id WHERE ${clauses.join(' AND ')} ORDER BY s.updated_at DESC LIMIT 100`,...args),bookingEnabled:false});
 }
 if(path==='/api/pets/services/mine'&&method==='GET'){
  return response({services:await all(db,'SELECT s.id,s.organization_id AS organizationId,o.name AS provider,s.category,s.title,s.description,s.area,s.status,s.created_at AS createdAt,s.updated_at AS updatedAt,s.review_reason AS reviewReason FROM den_pet_services s JOIN den_organizations o ON o.id=s.organization_id WHERE o.owner_id=? ORDER BY s.created_at DESC LIMIT 100',actor.id),organizations:await all(db,"SELECT id,name,country FROM den_organizations WHERE owner_id=? AND status='approved' ORDER BY name",actor.id)});
 }
 if(path==='/api/pets/services'&&method==='POST'){
  const organizationId=text(body.organizationId,'organization_id',100),organization=await first(db,"SELECT id FROM den_organizations WHERE id=? AND owner_id=? AND status='approved'",organizationId,actor.id);
  ensure(organization,403,'APPROVED_ORGANIZATION_REQUIRED');
  const category=text(body.category,'category',20);ensure(categories.includes(category),400,'INVALID_CATEGORY');
  const title=text(body.title,'title',120),description=text(body.description,'description',1200),area=text(body.area,'area',100);
  ensure(!contactDetails.test(`${title} ${description} ${area}`),400,'CONTACT_DETAILS_NOT_ALLOWED');
  const serviceId=id();
  const guard=id();
  await audit('pet.service.submitted',{serviceId,organizationId},[q(db,'INSERT INTO den_transaction_guards(id,valid) VALUES(?,EXISTS(SELECT 1 FROM den_organizations WHERE id=? AND owner_id=? AND status=\'approved\'))',guard,organizationId,actor.id),q(db,'INSERT INTO den_pet_services(id,organization_id,category,title,description,area,status,created_at,updated_at) VALUES(?,?,?,?,?,?,\'pending\',?,?)',serviceId,organizationId,category,title,description,area,now,now),q(db,'DELETE FROM den_transaction_guards WHERE id=?',guard)]);
  return response({id:serviceId,status:'pending'},201);
 }
 match=path.match(/^\/api\/pets\/services\/([^/]+)$/);
 if(match&&method==='PATCH'){
  const current=await first(db,'SELECT s.*,o.owner_id FROM den_pet_services s JOIN den_organizations o ON o.id=s.organization_id WHERE s.id=?',match[1]);ensure(current&&current.owner_id===actor.id,404,'SERVICE_NOT_FOUND');
  const category=body.category===undefined?current.category:text(body.category,'category',20);ensure(categories.includes(category),400,'INVALID_CATEGORY');
  const title=body.title===undefined?current.title:text(body.title,'title',120),description=body.description===undefined?current.description:text(body.description,'description',1200),area=body.area===undefined?current.area:text(body.area,'area',100);
  ensure(!contactDetails.test(`${title} ${description} ${area}`),400,'CONTACT_DETAILS_NOT_ALLOWED');
  await audit('pet.service.updated',{serviceId:current.id},[q(db,"UPDATE den_pet_services SET category=?,title=?,description=?,area=?,status='pending',reviewed_by=NULL,reviewed_at=NULL,review_reason='',updated_at=? WHERE id=?",category,title,description,area,now,current.id)]);
  return response({ok:true,status:'pending'});
 }
 throw new HttpError(404,'PET_ROUTE_NOT_FOUND');
}

export async function handleAdminPets(request,env,actor,h){
 const path=new URL(request.url).pathname,method=request.method;
 if(!path.startsWith('/api/admin/pets/'))return null;
 const db=env.DB,{q,first,all,auditBatch,nowOf,freshAdmin}=h,now=nowOf(env);
 freshAdmin(actor,env,'organization_verification_admin');
 if(path==='/api/admin/pets/services'&&method==='GET'){
  const status=new URL(request.url).searchParams.get('status')??'pending';
  ensure(['pending','approved','rejected','suspended'].includes(status),400,'INVALID_REVIEW_STATUS');
  return response({services:await all(db,'SELECT s.id,s.organization_id AS organizationId,o.name AS provider,o.owner_id AS ownerId,o.country,s.category,s.title,s.description,s.area,s.status,s.created_at AS createdAt FROM den_pet_services s JOIN den_organizations o ON o.id=s.organization_id WHERE s.status=? ORDER BY s.created_at ASC LIMIT 100',status)});
 }
 const match=path.match(/^\/api\/admin\/pets\/services\/([^/]+)\/review$/);
 if(match&&method==='POST'){
  const body=await readJson(request),decision=text(body.decision,'decision',20),reason=text(body.reason,'reason',1000,0);
  ensure(['approved','rejected'].includes(decision),400,'INVALID_DECISION');
  const service=await first(db,'SELECT s.id,s.status,o.owner_id FROM den_pet_services s JOIN den_organizations o ON o.id=s.organization_id WHERE s.id=?',match[1]);
  ensure(service,404,'SERVICE_NOT_FOUND');ensure(service.owner_id!==actor.id,403,'SELF_REVIEW_FORBIDDEN');ensure(service.status==='pending',409,'SERVICE_ALREADY_REVIEWED');
  const guard=crypto.randomUUID();
  await auditBatch(env,actor,`pet.service.${decision}`,{serviceId:service.id,reason},[q(db,"INSERT INTO den_transaction_guards(id,valid) VALUES(?,EXISTS(SELECT 1 FROM den_pet_services WHERE id=? AND status='pending'))",guard,service.id),q(db,"UPDATE den_pet_services SET status=?,reviewed_by=?,reviewed_at=?,review_reason=?,updated_at=? WHERE id=? AND status='pending'",decision,actor.id,now,reason,now,service.id),q(db,'DELETE FROM den_transaction_guards WHERE id=?',guard)]);
  return response({ok:true,status:decision});
 }
 throw new HttpError(404,'ADMIN_PET_ROUTE_NOT_FOUND');
}
