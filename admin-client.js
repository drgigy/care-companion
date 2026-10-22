import {config} from './config.js';

export async function connectAdmin(onSession){
  const base='https://www.gstatic.com/firebasejs/12.4.0/';
  const [app,auth,functions]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-functions.js')]);
  const instance=app.initializeApp(config.firebase,'care-companion-master-admin');
  const session=auth.getAuth(instance),backend=functions.httpsCallable(functions.getFunctions(instance,config.functionsRegion),'masterAdmin');
  let epoch=0;
  await auth.setPersistence(session,auth.browserSessionPersistence);
  const client={
    signIn:(email,password)=>auth.signInWithEmailAndPassword(session,email,password),
    signOut:()=>auth.signOut(session),
    async call(data){const started=epoch;const result=await backend(data);if(started!==epoch||!session.currentUser)throw Error('Your session changed. Please sign in again.');return result.data;}
  };
  auth.onAuthStateChanged(session,user=>{epoch++;onSession(user?{uid:user.uid,email:user.email}:null,client);});
  return client;
}
