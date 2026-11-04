import {ensure,readJson,response} from './http.js';
export const selectableWorkspaces=Object.freeze(['manager','rider','dispatch','transport','shipment','warehouse']);
export function workspaceForPath(path){
 if(/^\/api\/(admin\/|admin-console\/|platform\/admin\/)/.test(path))return 'admin';
 if(/^\/api\/platform\/(organizations(?:\/[^/]+(?:\/products)?)?|products\/[^/]+)$/.test(path))return 'manager';
 if(path==='/api/platform/rider')return 'rider';
 if(/^\/api\/(businesses|my-facilities|facilities|invitations)(\/|$)/.test(path))return 'warehouse';
 if(path==='/api/mobility/driver')return 'transport';
 return null;
}
export async function workspaceChoice(db,id){return (await db.prepare('SELECT role FROM den_workspace_choices WHERE user_id=?').bind(id).first())?.role??null;}
export async function handleWorkspaceAccess(request,env,actor,h){
 const path=new URL(request.url).pathname;if(path!=='/api/workspace')return null;
 if(request.method==='GET')return response({selectedRole:actor.selectedRole,allowedWorkspaces:actor.level?['admin']:['consumer',...(actor.selectedRole?[actor.selectedRole]:[])],canChoose:!actor.level&&!actor.selectedRole});
 ensure(request.method==='POST',405,'METHOD_NOT_ALLOWED');ensure(!actor.level,403,'ADMIN_WORKSPACE_ONLY');const body=await readJson(request);ensure(selectableWorkspaces.includes(body.role),400,'INVALID_WORKSPACE');ensure(!actor.selectedRole,409,'WORKSPACE_ALREADY_SELECTED');
 await h.auditBatch(env,actor,'workspace.selected',{role:body.role},[h.q(env.DB,'INSERT INTO den_workspace_choices VALUES(?,?,?)',actor.id,body.role,h.nowOf(env))]);return response({selectedRole:body.role},201);
}
export async function enforceWorkspace(request,actor){
 const path=new URL(request.url).pathname,method=request.method;
 const required=workspaceForPath(path);
 // Public marketplace reads remain available to every consumer.
 if(required==='manager'&&method==='GET')return;
 if(required){if(required==='admin')ensure(actor.level,403,'ADMIN_REQUIRED');else ensure(!actor.level&&actor.selectedRole===required,403,'WORKSPACE_ACCESS_DENIED');}
 if(path.startsWith('/api/mobility/requests')){ensure(!actor.level&&['transport','shipment'].includes(actor.selectedRole),403,'WORKSPACE_ACCESS_DENIED');if(path==='/api/mobility/requests'&&method==='POST'){const body=await readJson(request.clone());ensure(body.kind===(actor.selectedRole==='transport'?'passenger':'shipment'),403,'WORKSPACE_ACCESS_DENIED');}}
 if(path.startsWith('/api/platform/orders')&&method==='POST'){
  const action=path.split('/')[5];
  if(['ready','handoff'].includes(action))ensure(['manager','dispatch'].includes(actor.selectedRole),403,'WORKSPACE_ACCESS_DENIED');
  if(['reserve','organization-scan','pickup','release','cash-confirm','delivery-code'].includes(action))ensure(actor.selectedRole==='rider',403,'WORKSPACE_ACCESS_DENIED');
 }
}
