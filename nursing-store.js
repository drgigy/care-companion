import {config} from './config.js';
export const NURSING_SETTINGS_KEY='care-companion-nursing-settings-v1';
export function loadNursingSettings(){try{return {ward:'',display:'auto',nightStart:'18',nightEnd:'7',...JSON.parse(localStorage.getItem(NURSING_SETTINGS_KEY)||'{}'),language:'malayalam'};}catch{return {ward:'',language:'malayalam',display:'auto',nightStart:'18',nightEnd:'7'};}}
export function saveNursingSettings(settings){localStorage.setItem(NURSING_SETTINGS_KEY,JSON.stringify(settings));return settings;}
export class NursingStore {
  constructor(){this.demo=config.mode==='demo';this.profile=null;this.items=[];this.listeners=[];this.epoch=0;}
  subscribe(fn){this.listeners.push(fn);fn(this.items);}
  emit(){this.listeners.forEach(fn=>fn(this.items));}
  async init(onState){
    this.onState=onState;
    if(this.demo){this.profile={uid:'demo-nurse',role:'staff',assignedRoomUids:[]};onState(this.profile);return;}
    const base='https://www.gstatic.com/firebasejs/12.4.0/';
    const [app,auth,db,functions]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js'),import(base+'firebase-functions.js')]);
    const firebaseApp=app.initializeApp(config.firebase,'care-companion-staff');
    this.authSDK=auth;this.auth=auth.getAuth(firebaseApp);this.db=db.getFirestore(firebaseApp);
    const service=functions.getFunctions(firebaseApp,config.functionsRegion);
    this.call=(name,data)=>functions.httpsCallable(service,name==='liveToken'?'nursingLiveToken':name)(data);
    await auth.setPersistence(this.auth,auth.browserLocalPersistence);
    auth.onAuthStateChanged(this.auth,user=>{
      const epoch=++this.epoch;this.profileUnsubscribe?.();this.requestUnsubscribe?.();this.profile=null;this.items=[];this.emit();onState(null);
      if(!user)return;
      this.profileUnsubscribe=db.onSnapshot(db.doc(this.db,'profiles',user.uid),snapshot=>{
        if(epoch!==this.epoch)return;
        const profile=snapshot.exists()?snapshot.data():null;
        if(!profile||profile.role!=='staff'||profile.disabled===true){this.requestUnsubscribe?.();this.profile=null;this.items=[];this.emit();onState(null,Error('This page requires an enabled staff account.'));return;}
        const first=!this.profile;this.profile={...profile,uid:user.uid};onState(this.profile);
        if(first){
          const q=db.query(db.collection(this.db,'requests'),db.where('submittedByUid','==',user.uid));
          this.requestUnsubscribe=db.onSnapshot(q,snap=>{if(epoch!==this.epoch||!this.profile)return;this.items=snap.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||Date.now()})).sort((a,b)=>b.createdAt-a.createdAt);this.emit();},error=>{if(epoch===this.epoch){this.items=[];this.emit();onState(this.profile,error);}});
        }
      },error=>{if(epoch===this.epoch){this.requestUnsubscribe?.();this.profile=null;this.items=[];this.emit();onState(null,error);}});
    });
  }
  async login(email,password){if(!this.demo)await this.authSDK.signInWithEmailAndPassword(this.auth,email,password);}
  async logout(){if(this.demo){this.profile=null;this.items=[];this.emit();this.onState(null);}else await this.authSDK.signOut(this.auth);}
  async create(args,requestId){
    if(this.profile?.role!=='staff')throw Error('Sign in with a staff account.');
    if(this.demo){const row={id:requestId,...args,status:'new',createdAt:Date.now()};if(!this.items.some(r=>r.id===requestId))this.items.unshift(row);this.emit();return {requestId,room:args.room,status:'sent'};}
    return (await this.call('nursingRequest',{...args,requestId})).data;
  }
}
