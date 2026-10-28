import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAdminHandler} from '../functions/admin.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
// Fixed demo project and loopback emulator only; never use production credentials.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';
const app=initializeApp({projectId:'demo-aster-admin'},'migration-review'),db=getFirestore(app);
const uid='migration-review-target',actor='migration-review-owner';
const auth={async getUser(id){return {uid:id,email:id+'@example.test',disabled:false};},async updateUser(){}};
const handler=createAdminHandler({db,auth,allowedOrigins:()=> 'https://mock.example'});
const update=department=>handler({auth:{uid:actor},rawRequest:{headers:{origin:'https://mock.example'}},data:{action:'update',uid,name:'Mock migration',role:'departmentAdmin',department}});
try{
 await db.doc('adminAccess/'+actor).set({enabled:true});
 await db.doc('profiles/'+uid).set({role:'staff',disabled:false});
 await Promise.all(['engineering','insurance'].map(d=>db.doc('departmentAdmins/'+d).delete()));
 const outcomes=await Promise.allSettled(['engineering','insurance'].map(update));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'failed-precondition');
 const profile=(await db.doc('profiles/'+uid).get()).data();
 const slots=await db.collection('departmentAdmins').where('uid','==',uid).get();
 assert.equal(slots.size,1);assert.equal(slots.docs[0].id,profile.department);
 // Failed profile write must roll back the newly reserved department too.
 const other='migration-review-failure';await db.doc('profiles/'+other).set({role:'staff'});
 const failingDb={doc:path=>db.doc(path),collection:path=>db.collection(path),runTransaction:fn=>db.runTransaction(tx=>fn({get:ref=>tx.get(ref),create:(ref,data)=>tx.create(ref,data),set(){throw Error('Simulated profile write failure');}}))};
 const failing=createAdminHandler({db:failingDb,auth,allowedOrigins:()=> 'https://mock.example'});
 await db.doc('departmentAdmins/it').delete();
 await assert.rejects(()=>failing({auth:{uid:actor},rawRequest:{headers:{origin:'https://mock.example'}},data:{action:'update',uid:other,name:'Failure',role:'departmentAdmin',department:'it'}}));
 assert.equal((await db.doc('departmentAdmins/it').get()).exists,false);
 assert.equal((await db.doc('profiles/'+other).get()).data().role,'staff');
 console.log('Passed emulator: concurrent migrations are atomic; failed profile writes leave no department reservation.');
}finally{await db.terminate();await deleteApp(app);}
