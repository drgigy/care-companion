import assert from 'node:assert/strict';
const project='demo-aster-admin',root=`http://127.0.0.1:8088/v1/projects/${project}/databases/(default)/documents`;
const token=uid=>[Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({iss:`https://securetoken.google.com/${project}`,aud:project,sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}})).toString('base64url'),''].join('.');
const field=x=>x===null?{nullValue:null}:typeof x==='boolean'?{booleanValue:x}:typeof x==='number'?{integerValue:String(x)}:{stringValue:x};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,field(v)]));
async function call(path,{uid='owner',method='GET',body}={}){const r=await fetch(root+path,{method,headers:{Authorization:'Bearer '+(uid==='owner'?'owner':token(uid)),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();return {status:r.status,text};}
async function seed(path,data){const r=await call('/'+path,{method:'PATCH',body:{fields:fields(data)}});assert.equal(r.status,200,r.text);}
async function read(path,uid,allowed){const r=await call('/'+path,{uid});assert.equal(r.status,allowed?200:403,r.text);}
await seed('profiles/room',{role:'room',room:'201'});await seed('profiles/staff',{role:'staff'});await seed('profiles/disabled',{role:'staff',disabled:true});await seed('requests/a',{ownerUid:'room',room:'201',status:'new',summary:'Water',category:'food'});await seed('adminAccess/staff',{enabled:true});
await read('requests/a','room',true);await read('requests/a','staff',true);await read('requests/a','disabled',false);await read('requests/a','other',false);await read('adminAccess/staff','staff',false);
for(const path of ['profiles/room','adminAccess/room']){const r=await call('/'+path,{uid:'room',method:'PATCH',body:{fields:fields({role:'staff',room:'999',enabled:true})}});assert.equal(r.status,403,r.text);}
async function query(uid,room){const filters=[{fieldFilter:{field:{fieldPath:'ownerUid'},op:'EQUAL',value:{stringValue:uid}}}];if(room)filters.push({fieldFilter:{field:{fieldPath:'room'},op:'EQUAL',value:{stringValue:room}}});return call(':runQuery',{uid,method:'POST',body:{structuredQuery:{from:[{collectionId:'requests'}],where:filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}}}}});}
assert.equal((await query('room','201')).status,200);assert.equal((await query('room')).status,403,'query must constrain the assigned room');
await seed('profiles/room',{role:'room',room:'305'});await read('requests/a','room',false);assert.equal((await query('room','305')).status,200);
await seed('profiles/room',{role:'room',room:'201',disabled:true});await read('requests/a','room',false);
async function commit(uid,path,data,create=false){const timestamps=['updatedAt',...(create?['createdAt']:[]),...(data.status==='in-progress'?['acknowledgedAt']:[]),...(data.status==='completed'?['completedAt']:[])];return call(':commit',{uid,method:'POST',body:{writes:[{update:{name:`projects/${project}/databases/(default)/documents/${path}`,fields:fields(data)},...(!create?{updateMask:{fieldPaths:Object.keys(data)}}:{}),updateTransforms:timestamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))}]}});}
const request={ownerUid:'room',room:'201',category:'food',summary:'Water',patientLanguage:'english',status:'new',acknowledgedAt:null,acknowledgedByEmployeeId:null,completedAt:null,completedByName:null,completedByEmployeeId:null};
assert.equal((await commit('room','requests/b',request,true)).status,403,'disabled room cannot create');
await seed('profiles/room',{role:'room',room:'201'});let r=await commit('room','requests/b',request,true);assert.equal(r.status,200,r.text);
r=await commit('disabled','requests/b',{status:'in-progress',acknowledgedByEmployeeId:'EMP1'});assert.equal(r.status,403,r.text);
r=await commit('staff','requests/b',{status:'in-progress',acknowledgedByEmployeeId:'EMP1'});assert.equal(r.status,200,r.text);
r=await commit('room','requests/b',{status:'completed',completedByName:'Staff',completedByEmployeeId:'EMP1'});assert.equal(r.status,200,r.text);
console.log('Passed emulator: legacy enabled profiles, owner/room queries, reassignment privacy, disabled access, protected admin records, forbidden client role/room edits, request creation, staff acknowledgement and bedside completion.');
