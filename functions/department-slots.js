import {HttpsError} from 'firebase-functions/v2/https';
export const departments=['food','housekeeping','engineering','ipBilling','insurance','it','guestRelations'];
// A slot is permanent even when its login is disabled. Replacement is an explicit owner operation.
export async function reserveDepartment(db,department,uid){
 if(!departments.includes(department))throw new HttpsError('invalid-argument','Select a valid department.');
 return db.runTransaction(async tx=>{
  const ref=db.doc('departmentAdmins/'+department),snapshot=await tx.get(ref);
  if(snapshot.exists&&snapshot.data().uid!==uid)throw new HttpsError('already-exists','This department already has an administrator. Edit or reset that account instead.');
  if(!snapshot.exists)tx.create(ref,{uid,department});
  return !snapshot.exists;
 });
}

export async function releaseUncreatedDepartment(db,department,uid){
 await db.runTransaction(async tx=>{
  const ref=db.doc('departmentAdmins/'+department),snapshot=await tx.get(ref);
  if(snapshot.exists&&snapshot.data().uid===uid)tx.delete(ref);
 });
}
