import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from 'firebase-admin/firestore';
import {randomBytes} from 'node:crypto';

const fail=(code,message)=>{throw new HttpsError(code,message);};
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
export function accountInput(data){
  const name=text(data.name,80),email=text(data.email,254).toLowerCase(),role=data.role,room=text(data.room,12);
  if(!name||name.length>80)fail('invalid-argument','Enter a name of up to 80 characters.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('invalid-argument','Enter a valid email address.');
  if(!['room','staff','nonClinical'].includes(role))fail('invalid-argument','Choose a room, staff or non-clinical staff account.');
  if(role==='room'&&!/^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/.test(room))fail('invalid-argument','Enter a room of up to 12 letters, numbers, spaces or hyphens.');
  return {name,email,role,room:role==='room'?room:''};
}
export function createAdminHandler({db,auth,allowedOrigins}){
  return async request=>{
    if(!request.auth)fail('unauthenticated','Sign in as Master Admin.');
    const origin=request.rawRequest?.headers?.origin;
    if(!origin||!allowedOrigins().split(',').map(s=>s.trim()).includes(origin))fail('permission-denied','This frontend origin is not allowed.');
    // Private server-managed access record: never writable by client SDKs.
    const [access,actor]=await Promise.all([db.doc(`adminAccess/${request.auth.uid}`).get(),auth.getUser(request.auth.uid)]);
    if(!access.exists||access.data().enabled!==true||actor.disabled)fail('permission-denied','Master Admin access is required.');
    const data=request.data||{},action=data.action;
    const audit=async(target,details)=>db.collection('adminAudit').add({actorUid:request.auth.uid,targetUid:target,action,...details,createdAt:FieldValue.serverTimestamp()});
    const targetUser=async()=>{
      const uid=text(data.uid,128);if(!uid||uid.length>128||uid.includes('/'))fail('invalid-argument','Select a valid account.');
      const [user,admin,profile]=await Promise.all([auth.getUser(uid),db.doc(`adminAccess/${uid}`).get(),db.doc(`profiles/${uid}`).get()]);
      if(uid===actor.uid||(admin.exists&&admin.data().enabled===true)||user.customClaims?.masterAdmin||user.customClaims?.admin)fail('permission-denied','Master Admin accounts must be managed by the project owner.');
      if(profile.exists&&profile.data().role&&!['room','staff','nonClinical'].includes(profile.data().role))fail('permission-denied','This account is outside room/staff management.');
      return {uid,user,profile};
    };
    try{
      if(action==='list'||action==='listRooms'){
        if(data.pageToken!==undefined&&(typeof data.pageToken!=='string'||data.pageToken.length>2048))fail('invalid-argument','Invalid page token.');
        const result=await auth.listUsers(50,data.pageToken||undefined);
        const profiles=result.users.length?await db.getAll(...result.users.map(u=>db.doc(`profiles/${u.uid}`))):[];
        const admins=result.users.length?await db.getAll(...result.users.map(u=>db.doc(`adminAccess/${u.uid}`))):[];
        return {actor:{uid:actor.uid,email:actor.email},users:result.users.map((u,i)=>{
          const p=profiles[i].exists?profiles[i].data():{};
          return {uid:u.uid,email:u.email||'',name:u.displayName||p.name||'',role:p.role||'unassigned',room:p.room||'',disabled:!!u.disabled||p.disabled===true,assignedRoomUids:Array.isArray(p.assignedRoomUids)?p.assignedRoomUids:[],assignedStaffUids:Array.isArray(p.assignedStaffUids)?p.assignedStaffUids:[],protected:u.uid===actor.uid||(admins[i].exists&&admins[i].data().enabled===true)||!!u.customClaims?.masterAdmin||!!u.customClaims?.admin||!!(p.role&&!['room','staff','nonClinical'].includes(p.role)),lastSignIn:u.metadata.lastSignInTime||null};
        }).filter(u=>action!=='listRooms'||u.role==='room'),nextPageToken:result.pageToken||null};
      }
      if(action==='create'){
        const input=accountInput(data);
        const operation=text(data.operationId,36);if(!/^[a-f0-9-]{36}$/i.test(operation))fail('invalid-argument','Missing account operation ID.');
        const uid='managed-'+operation;
        let existing;
        try{existing=await auth.getUser(uid);}catch(error){if(error.code!=='auth/user-not-found')throw error;}
        if(existing){
          const profile=await db.doc(`profiles/${uid}`).get();
          if(existing.email!==input.email||!profile.exists||profile.data().createdBy!==actor.uid)fail('already-exists','That operation is already in use. Refresh and try again.');
          return {uid,email:existing.email,retried:true};
        }
        // Generate an unknown password. The user sets their own password via a private password setup link.
        await auth.createUser({uid,email:input.email,displayName:input.name,password:randomBytes(32).toString('base64url'),disabled:true});
        try{
          const batch=db.batch();
          batch.create(db.doc(`profiles/${uid}`),{...input,assignedRoomUids:[],assignedStaffUids:[],disabled:false,createdBy:actor.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
          batch.set(db.collection('adminAudit').doc(),{actorUid:actor.uid,targetUid:uid,action:'create',role:input.role,room:input.room,createdAt:FieldValue.serverTimestamp()});
          await batch.commit();
          await auth.updateUser(uid,{disabled:false});
        }catch(error){
          // Fail closed: an incomplete Auth account remains disabled and is visible for repair.
          await db.doc(`profiles/${uid}`).set({...input,createdBy:actor.uid,disabled:true},{merge:true}).catch(()=>{});
          throw error;
        }
        return {uid,email:input.email};
      }
      if(action==='update'){
        const target=await targetUser();const input=accountInput({...data,email:target.user.email});
        await db.doc(`profiles/${target.uid}`).set({name:input.name,role:input.role,room:input.room,...(['staff','nonClinical'].includes(input.role)&&target.profile.data()?.role===input.role?{}:{assignedRoomUids:[],assignedStaffUids:[]}),disabled:!!target.user.disabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
        await auth.updateUser(target.uid,{displayName:input.name});
        await audit(target.uid,{role:input.role,room:input.room});
        return {uid:target.uid};
      }
      if(action==='assignRooms'){
        const target=await targetUser();
        if(!target.profile.exists||!['staff','nonClinical'].includes(target.profile.data().role))fail('failed-precondition','Room/tablet assignments are available for staff accounts only.');
        const ids=data.assignedRoomUids;
        if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!id||id.length>128||id.includes('/')||id.trim()!==id)||new Set(ids).size!==ids.length)fail('invalid-argument','Select up to 100 different room/tablet accounts.');
        if(ids.length){
          const [profiles,logins]=await Promise.all([db.getAll(...ids.map(id=>db.doc(`profiles/${id}`))),auth.getUsers(ids.map(uid=>({uid})))]);
          if(profiles.some(p=>!p.exists||p.data().role!=='room')||logins.notFound.length)fail('failed-precondition','A selected room/tablet account is no longer available. Reload the list.');
        }
        const staffIds=data.assignedStaffUids===undefined?[]:data.assignedStaffUids;
        if(!Array.isArray(staffIds)||ids.length+staffIds.length>100||staffIds.some(id=>typeof id!=='string'||!id||id.length>128||id.includes('/')||id.trim()!==id)||new Set(staffIds).size!==staffIds.length)fail('invalid-argument','Select up to 100 different accounts.');
        if(staffIds.length&&target.profile.data().role!=='nonClinical')fail('failed-precondition','Staff assignments require a non-clinical staff account.');
        if(staffIds.length){
          const [profiles,logins]=await Promise.all([db.getAll(...staffIds.map(id=>db.doc(`profiles/${id}`))),auth.getUsers(staffIds.map(uid=>({uid})))]);
          if(profiles.some(p=>!p.exists||p.data().role!=='staff')||logins.notFound.length)fail('failed-precondition','A selected staff account is no longer available. Reload the list.');
        }
        const assignedStaffUids=[...staffIds].sort();
        const assignedRoomUids=[...ids].sort(),batch=db.batch();
        batch.set(db.doc(`profiles/${target.uid}`),{assignedRoomUids,assignedStaffUids,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid},{merge:true});
        batch.set(db.collection('adminAudit').doc(),{actorUid:actor.uid,targetUid:target.uid,action,assignedRoomUids,assignedStaffUids,createdAt:FieldValue.serverTimestamp()});
        await batch.commit();return {uid:target.uid,assignedRoomUids,assignedStaffUids};
      }
      if(action==='setDisabled'){
        if(typeof data.disabled!=='boolean')fail('invalid-argument','Choose enable or disable.');
        const target=await targetUser();
        if(!target.profile.exists||!['room','staff','nonClinical'].includes(target.profile.data().role))fail('failed-precondition','Assign a room/staff role before enabling or disabling this account.');
        if(data.disabled){
          // Rules deny access immediately, even while an old ID token remains valid.
          await db.doc(`profiles/${target.uid}`).update({disabled:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid});
          await auth.updateUser(target.uid,{disabled:true});await auth.revokeRefreshTokens(target.uid);
        }else{
          await auth.updateUser(target.uid,{disabled:false});
          await db.doc(`profiles/${target.uid}`).update({disabled:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.uid});
        }
        await audit(target.uid,{disabled:data.disabled});return {uid:target.uid};
      }
      if(action==='resetLink'){
        const target=await targetUser();if(target.user.disabled)fail('failed-precondition','Enable the account before resetting its password.');
        const link=await auth.generatePasswordResetLink(target.user.email);
        await audit(target.uid,{});return {email:target.user.email,link};
      }
      fail('invalid-argument','Unknown admin action.');
    }catch(error){
      if(error instanceof HttpsError)throw error;
      const messages={'auth/email-already-exists':['already-exists','That email already has an account. Edit the existing account instead.'],'auth/user-not-found':['not-found','Account not found. Refresh the list.'],'auth/invalid-email':['invalid-argument','Enter a valid email address.']};
      if(messages[error.code])fail(...messages[error.code]);
      // Never expose raw Auth/Firestore errors or credential-bearing links.
      fail('internal','The operation could not be completed. Refresh the account list before retrying.');
    }
  };
}
