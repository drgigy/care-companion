import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from 'firebase-admin/firestore';
const fail=(code,message)=>{throw new HttpsError(code,message);};
export async function authorizeNursing({db,auth,allowedOrigins},request){
  if(!request.auth)fail('unauthenticated','Sign in with a staff account.');
  const origin=request.rawRequest?.headers?.origin;
  if(!origin||!allowedOrigins().split(',').map(s=>s.trim()).includes(origin))fail('permission-denied','This frontend origin is not allowed.');
  const [profile,user]=await Promise.all([db.doc(`profiles/${request.auth.uid}`).get(),auth.getUser(request.auth.uid)]);
  if(!profile.exists||profile.data().role!=='staff'||profile.data().disabled===true||user.disabled)fail('permission-denied','An enabled staff account is required.');
  // Assigned-room restrictions apply to dashboard viewing, not nursing submissions.
  return request.auth.uid;
}
export function nursingInput(data={}){
  const room=typeof data.room==='string'?data.room.trim():'',ward=typeof data.ward==='string'?data.ward.trim():'';
  const summary=typeof data.summary==='string'?data.summary.trim():'';
  if(!/^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/.test(room))fail('invalid-argument','Please dictate a valid room number.');
  if(ward.length>40)fail('invalid-argument','Set a ward or floor of up to 40 characters.');
  if(!['nursing','food','housekeeping','engineering','ipBilling','insurance','it','guestRelations'].includes(data.category)||!summary||summary.length>500)fail('invalid-argument','A valid department and request are required.');
  if(!['english','malayalam','arabic','other'].includes(data.patientLanguage))fail('invalid-argument','A valid conversation language is required.');
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId||''))fail('invalid-argument','A valid request identifier is required.');
  return {room,ward,summary,category:data.category,patientLanguage:data.patientLanguage,requestId:data.requestId};
}
export function createNursingRequestHandler(deps){
  return async request=>{
    const uid=await authorizeNursing(deps,request),input=nursingInput(request.data),{db}=deps;
    const id=`nurse_${uid}_${input.requestId}`,ref=db.doc(`requests/${id}`);
    return db.runTransaction(async tx=>{
      const [existing,actor]=await Promise.all([tx.get(ref),tx.get(db.doc(`profiles/${uid}`))]);
      if(!actor.exists||actor.data().role!=='staff'||actor.data().disabled===true)fail('permission-denied','Staff access changed. Sign in again.');
      if(existing.exists){
        const old=existing.data();
        if(old.submittedByUid!==uid||['room','ward','category','summary','patientLanguage'].some(k=>old[k]!==input[k]))fail('already-exists','This request identifier was already used with different details.');
        return {requestId:id,room:old.room,status:'sent'};
      }
      tx.create(ref,{room:input.room,ward:input.ward,category:input.category,summary:input.summary,patientLanguage:input.patientLanguage,
        ownerUid:`nursing:${uid}`,submittedByUid:uid,submittedVia:'nursing-bot',patientName:'',uhid:'',status:'new',
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),acknowledgedAt:null,acknowledgedByEmployeeId:null,completedAt:null,completedByName:null,completedByEmployeeId:null});
      return {requestId:id,room:input.room,status:'sent'};
    });
  };
}
