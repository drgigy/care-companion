import { config } from './config.js';
export const categories = {
  food: { label:'Food & beverage', icon:'♧', hint:'Meals, snacks & drinks' },
  utilities: { label:'Utilities', icon:'☼', hint:'Comfort & room essentials' },
  cleaning: { label:'Cleaning', icon:'✧', hint:'A fresh, tidy space' },
  nursing: { label:'Nursing', icon:'♡', hint:'Help from your care team' }
};
export const statuses = {new:'Awaiting attention','in-progress':'In progress',completed:'Completed'};
export const $ = id => document.getElementById(id);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
export function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,6000); }
export function guessCategory(text) {
  if (/\b(nurse|pain|medicine|medication|dizzy|breath|bleed|doctor|sick|iv|injection|hurt)\b/i.test(text)) return 'nursing';
  if (/\b(clean|spill|dirty|trash|rubbish|mop|housekeep|vomit|bin)\b/i.test(text)) return 'cleaning';
  if (/\b(food|water|drink|tea|coffee|meal|snack|hungry|juice|breakfast|lunch|dinner|thirsty)\b/i.test(text)) return 'food';
  if (/\b(blanket|pillow|light|tv|remote|temperature|cold|hot|air|fan|charger|towel)\b/i.test(text)) return 'utilities';
  return null;
}
const DEMO_KEY='care-companion-requests-v1';
const ROOM_KEY='care-companion-room-v1';
export class CareStore {
  constructor(page) {this.page=page;this.demo=config.mode==='demo';this.profile=null;this.items=[];this.listeners=[];this.unsubscribe=null;this.authEpoch=0;}
  async init(onState) {
    this.onState=onState;
    if(this.demo){
      this.profile=this.page==='patient'?{role:'room',room:localStorage.getItem(ROOM_KEY)||'204'}:{role:'staff'};
      this.readDemo();window.addEventListener('storage',e=>{if(e.key===DEMO_KEY)this.readDemo();});
      this.onState(this.profile);return;
    }
    if(config.mode!=='firebase'||!config.firebase.projectId)throw Error('Firebase configuration is missing. Configure config.js or use demo mode.');
    const base='https://www.gstatic.com/firebasejs/12.4.0/';
    const [app,auth,db,functions]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js'),import(base+'firebase-functions.js')]);
    this.authSDK=auth;this.dbSDK=db;const firebaseApp=app.initializeApp(config.firebase);
    this.auth=auth.getAuth(firebaseApp);this.db=db.getFirestore(firebaseApp);
    this.functions=functions.getFunctions(firebaseApp,config.functionsRegion);this.call=(name,data)=>functions.httpsCallable(this.functions,name)(data);
    await auth.setPersistence(this.auth,auth.browserLocalPersistence);
    auth.onAuthStateChanged(this.auth,async user=>{
      const epoch=++this.authEpoch;this.unsubscribe?.();this.profile=null;this.items=[];this.emit();
      try{
        if(user){
          const snapshot=await db.getDoc(db.doc(this.db,'profiles',user.uid));if(epoch!==this.authEpoch)return;
          if(!snapshot.exists())throw Error('This account has no room or staff assignment. Ask your administrator.');
          const profile=snapshot.data();const required=this.page==='patient'?'room':'staff';
          if(profile.role!==required)throw Error(`This page requires a ${required} account.`);
          if(required==='room'&&(!profile.room||typeof profile.room!=='string'))throw Error('The account needs a valid room assignment.');
          this.profile={...profile,uid:user.uid};
          const ref=db.collection(this.db,'requests');const q=required==='room'?db.query(ref,db.where('ownerUid','==',user.uid)):db.query(ref);
          this.unsubscribe=db.onSnapshot(q,snapshot=>{this.items=snapshot.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||Date.now(),completedAt:d.data().completedAt?.toMillis?.()||null})).sort((a,b)=>b.createdAt-a.createdAt);this.emit();},error=>{this.onState(this.profile,error);});
        }
        this.onState(this.profile);
      }catch(error){if(epoch===this.authEpoch)this.onState(null,error);}
    });
  }
  subscribe(fn){this.listeners.push(fn);fn(this.items);}
  emit(){this.listeners.forEach(fn=>fn(this.items));}
  readDemo(){const raw=JSON.parse(localStorage.getItem(DEMO_KEY)||'[]');this.items=Array.isArray(raw)?raw.filter(r=>r&&categories[r.category]&&statuses[r.status]&&typeof r.room==='string'&&typeof r.summary==='string'):[];this.items.sort((a,b)=>b.createdAt-a.createdAt);this.emit();}
  async login(email,password,room){if(this.demo){if(this.page==='patient'){if(!/^[A-Za-z0-9 -]{1,12}$/.test(room))throw Error('Enter a valid room number.');localStorage.setItem(ROOM_KEY,room);this.profile.room=room;}this.onState(this.profile);return;}await this.authSDK.signInWithEmailAndPassword(this.auth,email,password);}
  async logout(){if(!this.demo)await this.authSDK.signOut(this.auth);}
  async create(category,summary,id=crypto.randomUUID()){
    if(!this.profile||this.profile.role!=='room')throw Error('Connect a room account first.');
    if(!categories[category]||typeof summary!=='string'||!summary.trim()||summary.length>500)throw Error('Choose a category and a request under 500 characters.');
    const request={room:this.profile.room,category,summary:summary.trim(),status:'new',ownerUid:this.profile.uid||'demo-room',createdAt:Date.now(),updatedAt:Date.now(),completedAt:null};
    if(this.demo){this.readDemo();if(!this.items.some(r=>r.id===id)){this.items.push({id,...request});localStorage.setItem(DEMO_KEY,JSON.stringify(this.items));this.readDemo();}}
    else {const db=this.dbSDK;const ref=db.doc(this.db,'requests',id);
      try{await db.setDoc(ref,{...request,createdAt:db.serverTimestamp(),updatedAt:db.serverTimestamp()});}
      catch(error){
        // A retry uses the same ID. A successful prior write must not create a duplicate.
        const existing=await db.getDoc(ref).catch(()=>null);const prior=existing?.data();
        if(!existing?.exists()||prior.ownerUid!==this.profile.uid||prior.category!==category||prior.summary!==request.summary)throw error;
      }
    }
    return id;
  }
  async update(id,status){
    if(this.profile?.role!=='staff')throw Error('Staff access is required.');
    if(this.demo){this.readDemo();const row=this.items.find(r=>r.id===id);if(!row)throw Error('Request no longer exists.');if(!((row.status==='new'&&status==='in-progress')||(row.status==='in-progress'&&status==='completed')))throw Error('Request status already changed.');row.status=status;row.updatedAt=Date.now();if(status==='completed')row.completedAt=Date.now();localStorage.setItem(DEMO_KEY,JSON.stringify(this.items));this.readDemo();}
    else {const db=this.dbSDK;await db.updateDoc(db.doc(this.db,'requests',id),{status,updatedAt:db.serverTimestamp(),...(status==='completed'?{completedAt:db.serverTimestamp()}: {})});}
  }
}
export function setupAccount(store,onProfile) {
  $('account').onclick=()=>$('login-dialog').showModal();$('close-login').onclick=()=>$('login-dialog').close();
  $('login-form').onsubmit=async e=>{e.preventDefault();$('login-error').textContent='';const submit=e.target.querySelector('button.primary');submit.disabled=true;try{await store.login($('email').value,$('password').value,$('demo-room')?.value.trim());if(store.demo)$('login-dialog').close();$('password').value='';}catch(error){$('login-error').textContent=error.message;}finally{submit.disabled=false;}};
  $('logout').onclick=async()=>{try{await store.logout();}catch(error){toast(error.message);}};
  if(!store.demo){$('live-login').hidden=false;$('email').required=true;$('password').required=true;$('login-help').textContent='Sign in once on this device. The session stays signed in until staff sign out.';if($('demo-room-label')){$('demo-room-label').hidden=true;$('demo-room').required=false;}if($('login-submit'))$('login-submit').hidden=false;}
  return async()=>store.init((profile,error)=>{
    $('connection').textContent=store.demo?'Local demo':error?'Connection error':profile?'Firestore connected':'Sign-in required';
    $('logout').hidden=store.demo||!profile;
    if(error){$('login-error').textContent=error.message;toast(error.message);}
    if(!store.demo&&!profile)$('login-dialog').showModal();else if(profile)$('login-dialog').close();
    onProfile(profile,error);
  });
}
