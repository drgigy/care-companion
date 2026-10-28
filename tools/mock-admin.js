let users=[{uid:'mock-room',name:'Mock room',email:'room@example.test',role:'room',room:'1200',assignedRoomUids:[],assignedStaffUids:[]},{uid:'mock-staff',name:'Mock nurse',email:'nurse@example.test',role:'staff',room:'',assignedRoomUids:['mock-room'],assignedStaffUids:[]},{uid:'mock-food',name:'Mock F&B',email:'food@example.test',role:'departmentAdmin',department:'food',room:'',assignedRoomUids:[]}];
const slots={food:'mock-food'};
export async function connectAdmin(onSession){
 const client={signIn:async()=>onSession({uid:'mock-master'},client),signOut:async()=>onSession(null,client),call:async data=>{
  if(data.action==='list'||data.action==='listRooms')return {actor:{email:'master@example.test'},users:users.filter(u=>data.action!=='listRooms'||u.role==='room')};
  if(data.action==='resetLink')return {email:'mock@example.test',link:'MOCK ONLY — no password link created'};
  if(data.action==='assignRooms'){Object.assign(users.find(u=>u.uid===data.uid),{assignedRoomUids:data.assignedRoomUids});return {};}
  if(data.action==='setDisabled'){users.find(u=>u.uid===data.uid).disabled=data.disabled;return {};}
  const uid=data.uid||crypto.randomUUID();
  if(data.role==='departmentAdmin'&&slots[data.department]&&slots[data.department]!==uid)throw Error('This department already has an administrator.');
  if(data.role==='departmentAdmin')slots[data.department]=uid;
  const old=users.find(u=>u.uid===uid);if(old)Object.assign(old,data);else users.push({...data,uid,room:data.room||'',assignedRoomUids:[]});return {uid};
 }};
 await onSession({uid:'mock-master'},client);return client;
}
