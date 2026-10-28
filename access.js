export const departments=['food','housekeeping','engineering','ipBilling','insurance','it','guestRelations'];
export function canOpen(profile,category=null,page='dashboard'){
 if(!profile||profile.disabled)return false;
 if(profile.role==='administrator'||profile.role==='staff')return true;
 return profile.role==='departmentAdmin'&&departments.includes(profile.department)&&(page==='log'||category===profile.department);
}
export function canRead(profile,row){
 if(!profile||profile.disabled)return false;
 if(profile.role==='administrator')return true;
 if(profile.role==='departmentAdmin')return departments.includes(profile.department)&&row.category===profile.department;
 return profile.role==='staff'&&(row.submittedByUid===profile.uid||(profile.assignedRoomUids||[]).includes(row.ownerUid));
}
export function canAccept(profile,row){return canRead(profile,row)&&row.status==='new'&&(profile.role==='departmentAdmin'||profile.role==='administrator'||row.category==='nursing');}
export function canComplete(profile,row){return canRead(profile,row)&&row.status==='in-progress'&&['staff','administrator'].includes(profile.role);}
export function requestQueries(db,ref,profile){
 if(profile.role==='administrator')return [db.query(ref)];
 if(profile.role==='departmentAdmin')return departments.includes(profile.department)?[db.query(ref,db.where('category','==',profile.department))]:[];
 if(profile.role!=='staff')return [];
 const ids=[...new Set(profile.assignedRoomUids||[])],queries=[db.query(ref,db.where('submittedByUid','==',profile.uid))];
 for(let i=0;i<ids.length;i+=30)queries.push(db.query(ref,db.where('ownerUid','in',ids.slice(i,i+30))));
 return queries;
}
export function assertLocalSafe(config){
 if(typeof location!=='undefined'&&['localhost','127.0.0.1','::1'].includes(location.hostname)&&config.mode!=='demo')throw Error('Local safety guard: production Firebase is disabled. Use the mock preview server.');
}
