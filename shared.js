import { config } from './config.js';
export const categories = {
  nursing: { label:'Nursing', icon:'♡', hint:'Help from your care team' },
  food: { label:'Food & beverage', icon:'♧', hint:'Meals, snacks & drinks' },
  housekeeping: { label:'Housekeeping', icon:'✧', hint:'Room cleaning & linens' },
  engineering: { label:'Engineering & maintenance', icon:'⚙', hint:'Room fixtures & utilities' },
  ipBilling: { label:'IP billing', icon:'₹', hint:'Current bill & estimates' },
  insurance: { label:'Insurance', icon:'□', hint:'Coverage & claim queries' },
  it: { label:'IT', icon:'⌁', hint:'Wi-Fi, TV & device support' },
  guestRelations: { label:'Guest relations', icon:'!', hint:'Feedback & concerns' }
};
export const statuses = {new:'Received','in-progress':'On the way',completed:'Completed'};
export const $ = id => document.getElementById(id);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
export function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,6000); }
export function guessCategory(text) {
  if (/\b(guest relation|complaint|complain|issue|problem|unhappy|rude|delay|feedback|concern|report|grievance|service)\b/i.test(text)) return 'guestRelations';
  if (/\b(insurance|claim|cashless|approval|preauth|pre-auth|tpa|policy|coverage)\b/i.test(text)) return 'insurance';
  if (/\b(bill|billing|estimate|advance|deposit|payment|charge|invoice|ip bill|ip billing)\b/i.test(text)) return 'ipBilling';
  if (/\b(wifi|wi-fi|internet|tv|television|phone|remote not working|password|network|it)\b/i.test(text)) return 'it';
  if (/\b(maintenance|repair|engineer|engineering|ac|a\/c|light|fan|plumber|electric|power|leak|tap|toilet flush)\b/i.test(text)) return 'engineering';
  if (/\b(nurse|pain|medicine|medication|dizzy|breath|bleed|doctor|sick|iv|injection|hurt)\b/i.test(text)) return 'nursing';
  if (/\b(clean|spill|dirty|trash|rubbish|mop|housekeep|housekeeping|vomit|bin|linen|bedsheet|towel)\b/i.test(text)) return 'housekeeping';
  if (/\b(food|water|drink|tea|coffee|meal|snack|hungry|juice|breakfast|lunch|dinner|thirsty)\b/i.test(text)) return 'food';
  return null;
}
const DEMO_KEY='care-companion-requests-v1';
const ROOM_KEY='care-companion-room-v1';
const SETTINGS_KEY='care-companion-tablet-settings-v1';
const defaultSettings={ward:'Neuro Ward',patientName:'',uhid:'',language:'malayalam',display:'auto',nightStart:'18',nightEnd:'7',pin:'1234'};
export function loadTabletSettings(){try{return {...defaultSettings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{return {...defaultSettings};}}
export function saveTabletSettings(settings){const clean={...defaultSettings,...settings};localStorage.setItem(SETTINGS_KEY,JSON.stringify(clean));return clean;}
export class CareStore {
  constructor(page) {this.page=page;this.demo=config.mode==='demo';this.profile=null;this.items=[];this.listeners=[];this.unsubscribe=null;this.authEpoch=0;this.context={};}
  setContext(context){this.context={...this.context,...context};}
  async init(onState) {
    this.onState=onState;
    if(this.demo){
      this.profile=this.page==='patient'?{role:'room',room:localStorage.getItem(ROOM_KEY)||'201'}:{role:'staff'};
      this.readDemo();window.addEventListener('storage',e=>{if(e.key===DEMO_KEY)this.readDemo();});
      this.onState(this.profile);return;
    }
    if(config.mode!=='firebase'||!config.firebase.projectId)throw Error('Firebase configuration is missing. Configure config.js or use demo mode.');
    const base='https://www.gstatic.com/firebasejs/12.4.0/';
    const [app,auth,db,functions]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js'),import(base+'firebase-functions.js')]);
    const appName=this.page==='patient'?'care-companion-room':'care-companion-staff';
    this.authSDK=auth;this.dbSDK=db;const firebaseApp=app.initializeApp(config.firebase,appName);
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
          this.unsubscribe=db.onSnapshot(q,snapshot=>{this.items=snapshot.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||Date.now(),updatedAt:d.data().updatedAt?.toMillis?.()||Date.now(),acknowledgedAt:d.data().acknowledgedAt?.toMillis?.()||null,completedAt:d.data().completedAt?.toMillis?.()||null})).sort((a,b)=>b.createdAt-a.createdAt);this.emit();},error=>{this.onState(this.profile,error);});
        }
        this.onState(this.profile);
      }catch(error){if(epoch===this.authEpoch)this.onState(null,error);}
    });
  }
  subscribe(fn){this.listeners.push(fn);fn(this.items);}
  emit(){this.listeners.forEach(fn=>fn(this.items));}
  readDemo(){const raw=JSON.parse(localStorage.getItem(DEMO_KEY)||'[]');this.items=Array.isArray(raw)?raw.filter(r=>r&&categories[r.category]&&statuses[r.status]&&typeof r.room==='string'&&typeof r.summary==='string'):[];this.items.sort((a,b)=>b.createdAt-a.createdAt);this.emit();}
  validateRoom(room){if(!/^[A-Za-z0-9 -]{1,12}$/.test(room||''))throw Error('Enter a valid room number.');return room.trim();}
  async changeRoom(room){
    room=this.validateRoom(room);
    if(this.page!=='patient'||this.profile?.role!=='room')throw Error('Connect a room account first.');
    if(this.demo){localStorage.setItem(ROOM_KEY,room);this.profile.room=room;this.onState(this.profile);this.emit();return;}
    const db=this.dbSDK;await db.updateDoc(db.doc(this.db,'profiles',this.profile.uid),{room});this.profile.room=room;this.onState(this.profile);this.emit();
  }
  async login(email,password,room){if(this.demo){if(this.page==='patient')await this.changeRoom(room);else this.onState(this.profile);return;}await this.authSDK.signInWithEmailAndPassword(this.auth,email,password);}
  async logout(){if(this.demo&&this.page==='patient'){this.onState(this.profile);return;}if(!this.demo)await this.authSDK.signOut(this.auth);}
  async create(category,summary,id=crypto.randomUUID(),patientLanguage='english'){
    if(!this.profile||this.profile.role!=='room')throw Error('Connect a room account first.');
    if(!categories[category]||typeof summary!=='string'||!summary.trim()||summary.length>500)throw Error('Choose a category and a request under 500 characters.');
    if(!['english','malayalam','arabic','other'].includes(patientLanguage))patientLanguage='english';
    const request={room:this.profile.room,ward:this.context.ward||'',patientName:this.context.patientName||'',uhid:this.context.uhid||'',category,summary:summary.trim(),patientLanguage,status:'new',ownerUid:this.profile.uid||'demo-room',createdAt:Date.now(),updatedAt:Date.now(),acknowledgedAt:null,acknowledgedByEmployeeId:null,completedAt:null,completedByName:null,completedByEmployeeId:null};
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
  async update(id,status,employeeId=''){
    if(this.profile?.role!=='staff')throw Error('Staff access is required.');
    employeeId=String(employeeId||'').trim();if(!employeeId)throw Error('Enter employee ID.');
    if(this.demo){this.readDemo();const row=this.items.find(r=>r.id===id);if(!row)throw Error('Request no longer exists.');if(!(row.status==='new'&&status==='in-progress'))throw Error('Request status already changed.');row.status=status;row.updatedAt=Date.now();row.acknowledgedAt=row.updatedAt;row.acknowledgedByEmployeeId=employeeId;localStorage.setItem(DEMO_KEY,JSON.stringify(this.items));this.readDemo();}
    else {if(status!=='in-progress')throw Error('Complete the request from the patient room.');const db=this.dbSDK;await db.updateDoc(db.doc(this.db,'requests',id),{status,updatedAt:db.serverTimestamp(),acknowledgedAt:db.serverTimestamp(),acknowledgedByEmployeeId:employeeId});}
  }
  async completeAtRoom(id,name,employeeId){
    if(this.profile?.role!=='room')throw Error('Connect a room account first.');
    name=String(name||'').trim();employeeId=String(employeeId||'').trim();
    if(!name||!employeeId)throw Error('Enter staff name and employee ID.');
    if(this.demo){this.readDemo();const row=this.items.find(r=>r.id===id&&r.ownerUid==='demo-room');if(!row)throw Error('Request no longer exists.');if(row.status!=='in-progress')throw Error('Only acknowledged requests can be completed.');row.status='completed';row.updatedAt=Date.now();row.completedAt=Date.now();row.completedByName=name;row.completedByEmployeeId=employeeId;localStorage.setItem(DEMO_KEY,JSON.stringify(this.items));this.readDemo();}
    else {const db=this.dbSDK;await db.updateDoc(db.doc(this.db,'requests',id),{status:'completed',updatedAt:db.serverTimestamp(),completedAt:db.serverTimestamp(),completedByName:name,completedByEmployeeId:employeeId});}
  }
}
export function setupAccount(store,onProfile) {
  let settingsUnlocked=false;
  const syncSettings=()=>{const roomInput=$('demo-room'),roomLabel=$('demo-room-label'),liveLogin=$('live-login'),submit=$('settings-submit')||$('login-form').querySelector('button.primary');
    if(roomInput&&store.profile?.room)roomInput.value=store.profile.room;
    if(store.page==='patient'){
      const signedIn=!!store.profile;
      if($('settings-pin-label'))$('settings-pin-label').hidden=!signedIn||settingsUnlocked;
      if($('settings-grid'))$('settings-grid').hidden=!signedIn||!settingsUnlocked;
      if(roomLabel){roomLabel.hidden=!signedIn||!settingsUnlocked;roomInput.required=signedIn&&settingsUnlocked;}
      if(liveLogin){liveLogin.hidden=store.demo||signedIn;$('email').required=!store.demo&&!signedIn;$('password').required=!store.demo&&!signedIn;}
      $('logout').hidden=store.demo||!store.profile||!settingsUnlocked;
      if(submit)submit.textContent=signedIn?(settingsUnlocked?'Save room':'Unlock'):'Sign in';
      $('login-help').textContent=signedIn?(settingsUnlocked?'Room selection and log out are available now.':'Enter the PIN to change this tablet’s room number or sign out.'):'Sign in once on this device. The room opens automatically after that.';
      return;
    }
    if(!store.demo&&liveLogin){const signedIn=!!store.profile;liveLogin.hidden=signedIn;$('email').required=!signedIn;$('password').required=!signedIn;if(submit){submit.hidden=signedIn;submit.textContent='Sign in';}if($('logout'))$('logout').hidden=!signedIn;$('login-help').textContent=signedIn?'You are signed in to this station.':'Sign in once on this device. The session stays signed in until staff sign out.';}
    else if(submit)submit.textContent=store.page==='patient'?'Save room':'Close';
  };
  $('account').onclick=()=>{if(store.page==='patient'){settingsUnlocked=false;if($('settings-pin'))$('settings-pin').value='';}$('login-error').textContent='';syncSettings();$('login-dialog').showModal();setTimeout(()=>((store.page==='patient'&&store.profile)?$('settings-pin'):$('email'))?.focus(),50);};$('close-login').onclick=()=>$('login-dialog').close();
  $('login-form').onsubmit=async e=>{e.preventDefault();$('login-error').textContent='';const submit=e.target.querySelector('button.primary');submit.disabled=true;try{
    if(store.page==='patient'&&store.profile&&!settingsUnlocked){if($('settings-pin').value!==(loadTabletSettings().pin||'1234'))throw Error('Incorrect PIN.');settingsUnlocked=true;syncSettings();setTimeout(()=>($('demo-room')||$('email'))?.focus(),50);return;}
    if(store.page==='patient'&&(store.demo||store.profile))await store.changeRoom($('demo-room')?.value.trim());
    else if(!store.demo&&!store.profile)await store.login($('email').value,$('password').value,$('demo-room')?.value.trim());
    $('login-dialog').close();if($('password'))$('password').value='';toast(store.page==='patient'?'Room settings saved':'Signed in');
  }catch(error){$('login-error').textContent=error.message;}finally{submit.disabled=false;syncSettings();}};
  $('logout').onclick=async()=>{try{await store.logout();$('login-dialog').close();}catch(error){toast(error.message);}};
  if(!store.demo){$('live-login').hidden=false;$('email').required=true;$('password').required=true;$('login-help').textContent='Sign in once on this device. You can change the room number after sign-in.';}
  return async()=>store.init((profile,error)=>{
    $('connection').textContent=store.demo?'Local demo':error?'Connection error':profile?'Firestore connected':'Sign-in required';
    syncSettings();
    if(error){$('login-error').textContent=error.message;toast(error.message);}
    if(!store.demo&&!profile)$('login-dialog').showModal();else if(profile)$('login-dialog').close();
    onProfile(profile,error);
  });
}
