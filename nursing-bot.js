import {categories,statuses,$,toast,escapeHTML} from './shared.js?v=assignments-20261022';
import {NursingStore,loadNursingSettings,saveNursingSettings} from './nursing-store.js?v=nursing-20261028';
import {NursingCompanion} from './nursing-voice.js?v=nursing-20261028';
const store=new NursingStore();let settings=loadNursingSettings(),live=null,active=false,starting=false,attempt=0;
const copy={
  english:{help:'Say the room number and request. I will confirm the details before sending to the department.',emergency:'For emergencies, use the hospital’s Nurse Call or emergency procedure.',preparing:'Getting ready… Please allow microphone access if asked.',connecting:'Connecting to your companion…',greeting:'Your companion will greet you shortly…'},
  malayalam:{help:'റൂം നമ്പറും ആവശ്യവും പറയുക. ബന്ധപ്പെട്ട വിഭാഗത്തിലേക്ക് അയയ്ക്കുന്നതിന് മുമ്പ് വിവരങ്ങൾ സ്ഥിരീകരിക്കും.',emergency:'അടിയന്തര സാഹചര്യങ്ങളിൽ Nurse Call അല്ലെങ്കിൽ ആശുപത്രിയുടെ അടിയന്തര സേവനം ഉപയോഗിക്കുക.',preparing:'തയ്യാറാകുന്നു… മൈക്രോഫോൺ അനുമതി ചോദിച്ചാൽ അനുവദിക്കുക.',connecting:'സഹായിയുമായി ബന്ധിപ്പിക്കുന്നു…',greeting:'സഹായി ഉടൻ സംസാരിക്കും…'},
  arabic:{help:'اذكر رقم الغرفة والطلب. سأؤكد التفاصيل قبل إرسالها إلى القسم المختص.',emergency:'للحالات الطارئة، استخدم نداء التمريض أو إجراءات الطوارئ في المستشفى.',preparing:'جارٍ الاستعداد… يرجى السماح باستخدام الميكروفون.',connecting:'جارٍ الاتصال بمساعدك…',greeting:'سيتحدث مساعدك إليك بعد قليل…'}
};
function text(){return copy[settings.language]||copy.malayalam;}
function clock(){const now=new Date(),h=now.getHours(),start=Number(settings.nightStart),end=Number(settings.nightEnd),night=settings.display==='night'||(settings.display==='auto'&&(start<end?h>=start&&h<end:h>=start||h<end));document.body.dataset.theme=night?'night':'day';const time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});$('patient-time').textContent=time.replace(/\s?[AP]M$/i,'');$('patient-period').textContent=time.match(/AM|PM/)?.[0]||'';$('patient-date').textContent=now.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function syncUI(){
  $('header-ward').textContent=settings.ward||'Set ward / floor';$('tap-subtitle').textContent=text().help;$('emergency-note').textContent=text().emergency;$('helper-card').hidden=true;
  document.querySelectorAll('#language-tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.language===settings.language));
  $('ward-unit').value=settings.ward;for(const key of ['language','display'])$('setting-'+key).value=settings[key];$('night-start').value=settings.nightStart;$('night-end').value=settings.nightEnd;
  const signed=!!store.profile;$('live-login').hidden=signed||store.demo;$('settings-grid').hidden=!signed;$('email').required=!signed&&!store.demo;$('password').required=!signed&&!store.demo;$('ward-unit').required=signed;$('logout').hidden=!signed;$('settings-submit').textContent=signed?'Save settings':'Sign in';$('login-help').textContent=signed?'Submit requests for dictated rooms. Your dashboard room assignments do not restrict submissions.':'Use your existing staff account. Room/tablet accounts cannot use this page.';clock();
}
function state(value){const label=String(value).toLowerCase();if(active&&document.body.dataset.voiceState==='connecting'&&!/speak|listen|ending/.test(label))return;$('voice-startup').hidden=true;document.body.dataset.voiceState=label.includes('speak')?'speaking':label.includes('ending')?'ending':active?'listening':'idle';if(!label.includes('speak'))$('start').style.setProperty('--voice-level','0');}
function startup(stage){document.body.dataset.voiceState='connecting';$('voice-startup').hidden=false;$('voice-startup').textContent=text()[stage]||text().preparing;}
function session(value){active=value;$('mic-action-label').textContent=value?'Stop':'Start';$('start').setAttribute('aria-label',value?'Stop conversation':'Start conversation');$('start').setAttribute('aria-pressed',String(value));document.body.classList.toggle('conversation-active',value);state(value?'listening':'idle');}
function end(){++attempt;starting=false;live?.stop();live=null;session(false);$('start').disabled=false;}
async function start(){
  if(active||starting)return;
  if(!store.profile||!settings.ward.trim()){$('account').click();if(store.profile)$('login-error').textContent='Set your ward or floor before starting.';return;}
  if(store.demo){toast('Demo preview: voice and real request submission require staff sign-in on the live site.');return;}
  const run=++attempt;starting=true;session(true);startup('preparing');
  const requestIds=new Map();
  live=new NursingCompanion(store,{languageMode:settings.language,
    onStartup:value=>{if(run===attempt)startup(value);},onState:value=>{if(run===attempt)state(value);},onText:()=>{},
    onAudioLevel:level=>{if(run===attempt)$('start').style.setProperty('--voice-level',String(level));},
    onError:message=>{if(run===attempt){toast(message);end();}},onEnd:()=>{if(run===attempt)end();},
    onRequest:async args=>{
      const payload={room:typeof args.room==='string'?args.room.trim():'',ward:typeof args.ward==='string'&&args.ward.trim()?args.ward.trim():settings.ward.trim(),category:args.category,summary:args.summary,patientLanguage:args.patientLanguage||'english'};
      if(!payload.room)return {status:'failed',error:'Room number is missing. Ask the nurse for the room and confirm all details before sending.'};
      const key=JSON.stringify(payload);if(!requestIds.has(key))requestIds.set(key,crypto.randomUUID());
      try{const result=await store.create(payload,requestIds.get(key));toast(`Sent · Room ${result.room} · ${categories[args.category]?.label||'Department'}`);return result;}
      catch(error){toast('Request was not sent. '+error.message);return {status:'failed',error:error.message};}
    }});
  try{await live.start();}catch(error){if(run===attempt){toast('Could not start: '+error.message);end();}}finally{if(run===attempt)starting=false;}
}
$('start').onclick=()=>{if(active||starting)end();else void start();};
$('account').onclick=()=>{if(active)end();$('login-error').textContent='';syncUI();$('login-dialog').showModal();};$('close-login').onclick=()=>$('login-dialog').close();
$('login-form').onsubmit=async event=>{event.preventDefault();$('login-error').textContent='';$('settings-submit').disabled=true;try{
  if(!store.profile)await store.login($('email').value.trim(),$('password').value);
  else{const ward=$('ward-unit').value.trim();if(!ward||ward.length>40)throw Error('Enter a ward or floor of up to 40 characters.');settings=saveNursingSettings({...settings,ward,language:$('setting-language').value,display:$('setting-display').value,nightStart:$('night-start').value,nightEnd:$('night-end').value});syncUI();$('login-dialog').close();toast('Nursing settings saved');}
  $('password').value='';
}catch(error){$('login-error').textContent=error.message;}finally{$('settings-submit').disabled=false;}};
$('logout').onclick=async()=>{end();try{await store.logout();}catch(error){toast(error.message);}};
document.querySelectorAll('#language-tabs button').forEach(b=>b.onclick=()=>{settings=saveNursingSettings({...settings,language:b.dataset.language});syncUI();if(live)live.sendText(`Conversation language changed to ${settings.language}. Continue the nursing staff confirmation workflow in this language.`);});
$('staff').onclick=()=>{end();window.location.href='dashboard.html';};
$('requests-button').onclick=()=>$('requests-dialog').showModal();$('requests-close').onclick=()=>$('requests-dialog').close();
const hours=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')}:00</option>`).join('');$('night-start').innerHTML=hours;$('night-end').innerHTML=hours;
store.subscribe(rows=>{const today=new Date();today.setHours(0,0,0,0);const current=rows.filter(r=>r.createdAt>=today.getTime());$('requests-count').textContent=String(current.length);$('requests-count').hidden=!current.length;$('requests-empty').hidden=!!current.length;$('requests-empty').textContent='No requests submitted today.';$('patient-requests').innerHTML=current.map(r=>`<article class="patient-request-card"><b class="request-icon">${escapeHTML(categories[r.category]?.icon||'!')}</b><div><strong>Room ${escapeHTML(r.room)} · ${escapeHTML(r.summary)}</strong><small>${escapeHTML(r.ward||'')} · ${escapeHTML(categories[r.category]?.label||'Request')}</small></div><span class="status ${escapeHTML(r.status)}">${escapeHTML(statuses[r.status]||r.status)}</span></article>`).join('');});
syncUI();setInterval(clock,30000);
store.init((profile,error)=>{if(!profile)end();syncUI();if(error){$('login-error').textContent=error.message;toast(error.message);}if(!profile||!settings.ward)$('login-dialog').showModal();else if(!error)$('login-dialog').close();}).catch(error=>toast(error.message));
window.addEventListener('pagehide',end);
document.addEventListener('touchmove',event=>{if(event.touches.length>1&&event.cancelable)event.preventDefault();},{passive:false});document.addEventListener('gesturestart',event=>{if(event.cancelable)event.preventDefault();},{passive:false});
