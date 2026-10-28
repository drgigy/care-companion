import {categories,statuses,$,toast,escapeHTML} from './shared.js?v=assignments-20261022';
import {NursingStore,loadNursingSettings,saveNursingSettings} from './nursing-store.js?v=patch-20261029';
import {NursingRecorder,audioPayload,validateDraft} from './nursing-recorder.js';
const store=new NursingStore();let settings=loadNursingSettings(),live=null,active=false,starting=false,attempt=0,draftId=null,sendBusy=false,pendingAudio=null,sendPayload=null;
const copy={
  english:{help:'Say the room number, department and request. Stop, review the fields, then Send.',emergency:'For emergencies, use the hospital’s Nurse Call or emergency procedure.',preparing:'Getting ready… Please allow microphone access if asked.',connecting:'Connecting to your companion…',greeting:'Your companion will greet you shortly…'},
  malayalam:{help:'റൂം നമ്പർ, വിഭാഗം, ആവശ്യം എന്നിവ പറയുക. Stop അമർത്തിയ ശേഷം വിവരങ്ങൾ പരിശോധിച്ച് Send അമർത്തുക.',emergency:'അടിയന്തര സാഹചര്യങ്ങളിൽ Nurse Call അല്ലെങ്കിൽ ആശുപത്രിയുടെ അടിയന്തര സേവനം ഉപയോഗിക്കുക.',preparing:'തയ്യാറാകുന്നു… മൈക്രോഫോൺ അനുമതി ചോദിച്ചാൽ അനുവദിക്കുക.',connecting:'സഹായിയുമായി ബന്ധിപ്പിക്കുന്നു…',greeting:'സഹായി ഉടൻ സംസാരിക്കും…'},
  arabic:{help:'اذكر رقم الغرفة والقسم والطلب. أوقف التسجيل وراجع التفاصيل ثم أرسل.',emergency:'للحالات الطارئة، استخدم نداء التمريض أو إجراءات الطوارئ في المستشفى.',preparing:'جارٍ الاستعداد… يرجى السماح باستخدام الميكروفون.',connecting:'جارٍ الاتصال بمساعدك…',greeting:'سيتحدث مساعدك إليك بعد قليل…'}
};
function text(){return copy.malayalam;}
function clock(){const now=new Date(),h=now.getHours(),start=Number(settings.nightStart),end=Number(settings.nightEnd),night=settings.display==='night'||(settings.display==='auto'&&(start<end?h>=start&&h<end:h>=start||h<end));document.body.dataset.theme=night?'night':'day';const time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});$('patient-time').textContent=time.replace(/\s?[AP]M$/i,'');$('patient-period').textContent=time.match(/AM|PM/)?.[0]||'';$('patient-date').textContent=now.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function syncUI(){
  $('header-ward').textContent=settings.ward||'Ward / floor optional';$('tap-subtitle').textContent=text().help;$('emergency-note').textContent=text().emergency;$('helper-card').hidden=true;
  $('ward-unit').value=settings.ward;for(const key of ['display'])$('setting-'+key).value=settings[key];$('night-start').value=settings.nightStart;$('night-end').value=settings.nightEnd;
  const signed=!!store.profile;$('live-login').hidden=signed||store.demo;$('settings-grid').hidden=!signed;$('email').required=!signed&&!store.demo;$('password').required=!signed&&!store.demo;$('ward-unit').required=false;$('logout').hidden=!signed;$('settings-submit').textContent=signed?'Save settings':'Sign in';$('login-help').textContent=signed?'Submit requests for dictated rooms. Your dashboard room assignments do not restrict submissions.':'Use your existing staff account. Room/tablet accounts cannot use this page.';clock();
}
function status(message){$('voice-startup').hidden=false;$('voice-startup').textContent=message;}
function session(value){active=value;document.body.classList.toggle('conversation-active',value);$('discard-audio').hidden=!value;$('mic-action-label').textContent=value?'Stop':'Start';$('start').setAttribute('aria-label',value?'Stop recording':'Start recording');$('start').setAttribute('aria-pressed',String(value));document.body.dataset.voiceState=value?'listening':'idle';}
function end(){document.body.classList.remove('reviewing');$('discard-audio').hidden=true;$('retry-transcription').hidden=true;++attempt;starting=false;live?.cancel();live=null;session(false);$('start').disabled=false;pendingAudio=null;sendPayload=null;draftId=null;$('draft-form').hidden=true;$('processing').hidden=true;}
async function start(){
 if(active||starting||sendBusy)return;
 if(!store.profile){$('account').click();return;}
 const run=++attempt;starting=true;$('start').disabled=true;status('Allow microphone access…');
 live=new NursingRecorder({onTick:seconds=>status('Listening · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'))});
 live.onLimit=()=>void stopRecording();
 try{if(await live.start()&&run===attempt){session(true);status('Listening · 0:00');}}
 catch(error){if(run===attempt)status(error.message);}
 finally{if(run===attempt){starting=false;$('start').disabled=false;}}
}
async function transcribe(){
 const run=attempt;$('discard-audio').hidden=false;$('processing').hidden=false;$('retry-transcription').hidden=true;status('Processing recording…');$('start').disabled=true;
 try{
  const result=store.demo?{room:'1234',category:'housekeeping',summary:'Please clean the bathroom.',patientLanguage:'malayalam',transcript:'1234 റൂമിലെ ബാത്ത്റൂം വൃത്തിയാക്കണം.'}:(await store.call('nursingTranscribe',await audioPayload(pendingAudio))).data;
  if(run!==attempt)return;
  $('draft-room').value=result.room||'';$('draft-department').value=result.category||'';$('draft-request').value=result.summary||'';$('draft-transcript').textContent=result.transcript||'';$('draft-language').value=result.patientLanguage||'other';
  draftId=crypto.randomUUID();sendPayload=null;$('draft-form').hidden=false;document.body.classList.add('reviewing');$('discard-audio').hidden=true;status(store.demo?'MOCK transcription — review the sample fields.':'Review the room, department and request before sending.');$('draft-room').focus();pendingAudio=null;live?.cancel();live=null;
 }catch(error){if(run===attempt){status(error.message+' Your recording is kept for retry.');$('retry-transcription').hidden=false;}}
 finally{if(run===attempt){$('processing').hidden=true;$('start').disabled=false;}}
}
async function stopRecording(){
 if(!active)return;const run=attempt,recorder=live;session(false);$('start').disabled=true;
 try{const blob=await recorder.stop();if(run!==attempt)return;pendingAudio=blob;await transcribe();}catch(error){if(run===attempt){status(error.message);$('start').disabled=false;}}
}
$('start').onclick=()=>{if(active)void stopRecording();else if(!$('draft-form').hidden||pendingAudio)status('Send or discard the current draft first.');else void start();};
$('retry-transcription').onclick=()=>void transcribe();
$('discard').onclick=()=>{if(!sendBusy){end();status('Discarded. Ready to record.');}};
$('discard-audio').onclick=()=>{if(sendBusy)return;end();$('retry-transcription').hidden=true;status('Discarded. Ready to record.');};
$('draft-department').innerHTML='<option value="">Select department</option>'+Object.entries(categories).map(([key,value])=>`<option value="${key}">${escapeHTML(value.label)}</option>`).join('');
$('draft-form').onsubmit=async event=>{
 event.preventDefault();if(sendBusy)return;
 try{
  const payload={room:$('draft-room').value.trim(),category:$('draft-department').value,summary:$('draft-request').value.trim(),ward:settings.ward.trim(),patientLanguage:$('draft-language').value};
  validateDraft(payload,categories);
  if(sendPayload&&JSON.stringify(payload)!==JSON.stringify(sendPayload))throw Error('Retry the unchanged request first, or discard it. The previous send may already have succeeded.');
  sendPayload=payload;sendBusy=true;$('send').disabled=true;$('discard').disabled=true;
  await store.create(payload,draftId);end();status('Request sent. Ready to record.');toast('Request sent');
 }catch(error){status('Not confirmed as sent: '+error.message+' Draft retained.');}
 finally{sendBusy=false;$('send').disabled=false;$('discard').disabled=false;}
};
$('account').onclick=()=>{if(sendBusy)return;if(active)end();$('login-error').textContent='';syncUI();$('login-dialog').showModal();};$('close-login').onclick=()=>$('login-dialog').close();
$('login-form').onsubmit=async event=>{event.preventDefault();$('login-error').textContent='';$('settings-submit').disabled=true;try{
  if(!store.profile)await store.login($('email').value.trim(),$('password').value);
  else{const ward=$('ward-unit').value.trim();if(ward.length>40)throw Error('Enter a ward or floor of up to 40 characters.');settings=saveNursingSettings({...settings,ward,display:$('setting-display').value,nightStart:$('night-start').value,nightEnd:$('night-end').value});syncUI();$('login-dialog').close();toast('Nursing settings saved');}
  $('password').value='';
}catch(error){$('login-error').textContent=error.message;}finally{$('settings-submit').disabled=false;}};
$('logout').onclick=async()=>{if(sendBusy)return;end();try{await store.logout();}catch(error){toast(error.message);}};
$('staff').onclick=()=>{if(sendBusy)return;end();window.location.href='dashboard.html';};
$('requests-button').onclick=()=>$('requests-dialog').showModal();$('requests-close').onclick=()=>$('requests-dialog').close();
const hours=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')}:00</option>`).join('');$('night-start').innerHTML=hours;$('night-end').innerHTML=hours;
store.subscribe(rows=>{const today=new Date();today.setHours(0,0,0,0);const current=rows.filter(r=>r.createdAt>=today.getTime());$('requests-count').textContent=String(current.length);$('requests-count').hidden=!current.length;$('requests-empty').hidden=!!current.length;$('requests-empty').textContent='No requests submitted today.';$('patient-requests').innerHTML=current.map(r=>`<article class="patient-request-card"><b class="request-icon">${escapeHTML(categories[r.category]?.icon||'!')}</b><div><strong>Room ${escapeHTML(r.room)} · ${escapeHTML(r.summary)}</strong><small>${escapeHTML(r.ward||'')} · ${escapeHTML(categories[r.category]?.label||'Request')}</small></div><span class="status ${escapeHTML(r.status)}">${escapeHTML(statuses[r.status]||r.status)}</span></article>`).join('');});
syncUI();setInterval(clock,30000);
store.init((profile,error)=>{if(!profile)end();syncUI();if(error){$('login-error').textContent=error.message;toast(error.message);}if(!profile)$('login-dialog').showModal();else if(!error)$('login-dialog').close();}).catch(error=>toast(error.message));
window.addEventListener('pagehide',()=>{if(!sendBusy)end();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)void stopRecording();});
