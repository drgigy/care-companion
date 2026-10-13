import {CareStore,categories,statuses,$,toast,escapeHTML,guessCategory,setupAccount,loadTabletSettings,saveTabletSettings} from './shared.js';
import {LiveCompanion} from './voice.js';
const store=new CareStore('patient');let active=false,live=null,starting=false,autoEndTimer=null,requestLoaded=false,requestState=new Map(),selectedCompletionId=null,settings=loadTabletSettings(),notificationAudio=null;
const langText={
  auto:{tap:'സംസാരിക്കാൻ ഇവിടെ അമർത്തുക',sub:'നഴ്സിനെ വിളിക്കാനോ, ഭക്ഷണം, മുറി വൃത്തിയാക്കൽ, അക്കൗണ്ട്, പരാതികൾ അല്ലെങ്കിൽ അഭ്യർത്ഥനകൾ എന്നിവ അറിയിക്കാനോ ഇവിടെ പറയാം.',help:[],emergency:'അടിയന്തര സാഹചര്യങ്ങളിൽ Nurse Call ബട്ടൺ അമർത്തുക.',requests:'നിങ്ങളുടെ ആവശ്യങ്ങൾ'},
  english:{tap:'Tap here to speak',sub:'Speak here to call a nurse, request food, room cleaning, accounts, complaints, or other requests.',help:[],emergency:'For emergencies, press the Nurse Call button.',requests:'Your requests'},
  malayalam:{tap:'സംസാരിക്കാൻ ഇവിടെ അമർത്തുക',sub:'നഴ്സിനെ വിളിക്കാനോ, ഭക്ഷണം, മുറി വൃത്തിയാക്കൽ, അക്കൗണ്ട്, പരാതികൾ അല്ലെങ്കിൽ അഭ്യർത്ഥനകൾ എന്നിവ അറിയിക്കാനോ ഇവിടെ പറയാം.',help:[],emergency:'അടിയന്തര സാഹചര്യങ്ങളിൽ Nurse Call ബട്ടൺ അമർത്തുക.',requests:'നിങ്ങളുടെ ആവശ്യങ്ങൾ'},
  arabic:{tap:'اضغط هنا للتحدث',sub:'تحدث هنا لطلب ممرضة أو طعام أو تنظيف الغرفة أو الحسابات أو الشكاوى أو أي طلب آخر.',help:[],emergency:'في الحالات الطارئة، اضغط زر Nurse Call.',requests:'طلباتك'}
};
const languageName={auto:'Auto',english:'English',malayalam:'മലയാളം',arabic:'العربية'};
const categoryLabel=key=>categories[key]?.label||'Request';
const hourOptions=()=>Array.from({length:24},(_,hour)=>`<option value="${hour}">${new Date(2026,0,1,hour).toLocaleTimeString('en-US',{hour:'numeric',hour12:true})}</option>`).join('');
function language(){return settings.language||'auto';}
function displayLanguage(){return language()==='auto'?'auto':language();}
function detectLanguage(text){if(/[\u0600-\u06FF]/.test(text))return 'arabic';if(/[\u0D00-\u0D7F]/.test(text))return 'malayalam';return 'english';}
function requestLanguage(text){return language()==='auto'?detectLanguage(text):language();}
function bubble(text,user=false){const div=document.createElement('div');div.className='bubble'+(user?' user':'');div.textContent=text;$('chat').append(div);$('chat').scrollTop=$('chat').scrollHeight;}
function setVoiceState(label=''){
  const normalized=String(label).toLowerCase();
  document.body.dataset.voiceState=normalized.includes('speak')?'speaking':normalized.includes('listen')?'listening':active?'listening':'idle';
}
function normalizeSpeechLanguage(lang){lang=String(lang||'english').toLowerCase();if(lang==='ml'||lang==='malayalam')return 'malayalam';if(lang==='ar'||lang==='arabic')return 'arabic';return 'english';}
function unlockNotificationAudio(){try{notificationAudio ||= new AudioContext();notificationAudio.resume?.();}catch{} if('speechSynthesis'in window){speechSynthesis.getVoices();speechSynthesis.resume?.();}}
function speechVoice(lang){if(!('speechSynthesis'in window))return null;const voices=speechSynthesis.getVoices();if(lang==='english')return voices.find(v=>/^en-IN/i.test(v.lang)&&/female|woman|google/i.test(v.name))||voices.find(v=>/^en-IN/i.test(v.lang))||voices.find(v=>/^en-/i.test(v.lang)&&/female|woman|google/i.test(v.name))||voices.find(v=>/^en-/i.test(v.lang))||null;return voices.find(v=>lang==='malayalam'?/^ml/i.test(v.lang):/^ar/i.test(v.lang))||null;}
function speak(text,lang='english',force=false){if((!force&&!store.demo)||!('speechSynthesis'in window))return;lang=normalizeSpeechLanguage(lang);speechSynthesis.cancel();speechSynthesis.resume?.();const utterance=new SpeechSynthesisUtterance(text);const voice=speechVoice(lang);if(voice)utterance.voice=voice;utterance.rate=.9;utterance.volume=1;utterance.lang=voice?.lang||(lang==='malayalam'?'ml-IN':lang==='arabic'?'ar-SA':'en-US');utterance.onstart=()=>setVoiceState('speaking');utterance.onend=()=>setVoiceState(active?'listening':'idle');utterance.onerror=()=>setVoiceState(active?'listening':'idle');speechSynthesis.speak(utterance);setTimeout(()=>{if(!speechSynthesis.speaking&&!speechSynthesis.pending){speechSynthesis.cancel();speechSynthesis.speak(utterance);}},500);}
function acknowledgementMessage(){return 'The request has been accepted.';}
function playNotificationTone(){try{unlockNotificationAudio();if(!notificationAudio)return;const now=notificationAudio.currentTime;[660,880].forEach((frequency,index)=>{const oscillator=notificationAudio.createOscillator(),gain=notificationAudio.createGain();oscillator.connect(gain);gain.connect(notificationAudio.destination);oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.001,now+index*.16);gain.gain.exponentialRampToValueAtTime(.12,now+index*.16+.02);gain.gain.exponentialRampToValueAtTime(.001,now+index*.16+.18);oscillator.start(now+index*.16);oscillator.stop(now+index*.16+.2);});}catch{}}
function speakAcknowledgement(){unlockNotificationAudio();playNotificationTone();setTimeout(()=>speak(acknowledgementMessage(),'english',true),280);}
function isNightBySettings(){if(settings.display==='day')return false;if(settings.display==='night')return true;const hour=new Date().getHours(),start=Number(settings.nightStart??18),end=Number(settings.nightEnd??7);return start<end?hour>=start&&hour<end:hour>=start||hour<end;}
function updateTheme(){const now=new Date(),night=isNightBySettings(),time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});document.body.dataset.theme=night?'night':'day';$('patient-time').textContent=time.replace(/\s?[AP]M$/i,'');$('patient-period').textContent=time.match(/AM|PM/i)?.[0]||'';$('patient-date').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});$('display-mode').textContent=(settings.display==='auto'?'☼ Auto · ':'')+(night?'Night':'Day');}
function syncSettingsToUI(){
  $('header-room').textContent=store.profile?'Room '+store.profile.room:'Room';
  $('header-ward').textContent=settings.ward||'Ward';
  $('staff-room-label').textContent=store.profile?'Room '+store.profile.room:'Room';
  store.setContext({ward:settings.ward,patientName:settings.patientName,uhid:settings.uhid});
  document.querySelectorAll('#language-tabs button').forEach(button=>button.classList.toggle('selected',button.dataset.language===language()));
  $('mobile-language-label').textContent=languageName[language()]||'Auto';
  $('setting-language').value=language();$('setting-display').value=settings.display;$('ward-unit').value=settings.ward;$('patient-name').value=settings.patientName;$('patient-uhid').value=settings.uhid;$('night-start').value=settings.nightStart;$('night-end').value=settings.nightEnd;if(store.profile)$('demo-room').value=store.profile.room;
  const copy=langText[displayLanguage()]||langText.auto;$('tap-title').textContent=copy.tap;$('tap-subtitle').textContent=copy.sub;$('helper-card').innerHTML=copy.help.map(line=>`<p>${escapeHTML(line)}</p>`).join('');$('helper-card').hidden=!copy.help.length;$('emergency-note').textContent=copy.emergency;$('requests-title').textContent=copy.requests;updateTheme();
}
function setMobileMenu(open){
  document.body.classList.toggle('mobile-menu-open',open);
  $('mobile-menu-button').setAttribute('aria-expanded',String(open));
  $('mobile-menu-backdrop').hidden=!open;
}
function setSession(value){active=value;$('start').hidden=false;$('start').disabled=value||!store.profile;$('end').hidden=!value;$('chat').hidden=true;setVoiceState(value?'listening':'idle');document.body.classList.toggle('conversation-active',value);}
function warmVoice(){if(store.profile&&!store.demo)LiveCompanion.warm(store).catch(()=>{});}
function end(){starting=false;clearTimeout(autoEndTimer);autoEndTimer=null;live?.stop();live=null;if('speechSynthesis'in window)speechSynthesis.cancel();$('chat').replaceChildren();$('pending').hidden=true;setSession(false);$('start').disabled=!store.profile;warmVoice();}
function scheduleAutoEnd(delay=3500){clearTimeout(autoEndTimer);autoEndTimer=setTimeout(end,delay);}
async function start(){
  if(active||starting)return;if(!store.profile){$('login-dialog').showModal();return;}
  starting=true;$('start').disabled=true;
  try{
    setSession(true);const lang=language()==='auto'?'malayalam':language();const greeting=lang==='malayalam'?'ആസ്റ്റർ മെഡിസിറ്റിയിലേക്ക് സ്വാഗതം. ഞാൻ താങ്കളെ എങ്ങനെയാണ് സഹായിക്കേണ്ടത്?':lang==='arabic'?'مرحباً بكم في أستر ميديسيتي. كيف يمكنني مساعدتك؟':'Welcome to Aster Medicity. How can I assist you?';bubble(greeting);speak(greeting,lang);
    if(!store.demo){
      live=new LiveCompanion(store,{languageMode:language(),onText:text=>bubble(text),onState:setVoiceState,onError:message=>{toast(message);end();},onEnd:()=>scheduleAutoEnd(),onRequest:async args=>{
        const lang=args.patientLanguage&&args.patientLanguage!=='other'?args.patientLanguage:requestLanguage(args.summary);
        try{const id=await store.create(args.category,args.summary,crypto.randomUUID(),lang);toast(`Request sent · ${categoryLabel(args.category)}`);return {requestId:id,status:'sent'};}catch(error){toast('Request was not sent. '+error.message);return {status:'failed',error:'Request could not be saved.'};}
      }});
      await live.start();if(!live||live.stopped)throw Error('The voice session closed before it was ready. Please start again.');
    }
  }catch(error){end();toast('Could not start: '+error.message);}finally{starting=false;$('start').disabled=active||!store.profile;}
}
function showConfirmation(category,summary,id,patientLanguage){$('pending').hidden=false;$('pending').innerHTML=`<p>${escapeHTML(summary)}</p><button class="primary" id="confirm-request">Send request</button> <button class="text-button" id="cancel-request">Cancel</button>`;$('confirm-request').onclick=async()=>{try{await store.create(category,summary,id||crypto.randomUUID(),patientLanguage);$('pending').hidden=true;toast('Request sent');}catch(error){toast(error.message);}};$('cancel-request').onclick=()=>$('pending').hidden=true;}
function handleTyped(text){bubble(text,true);const lang=requestLanguage(text),category=guessCategory(text)||'guestRelations';showConfirmation(category,text,null,lang);}
$('start').onclick=start;$('end').onclick=end;$('mobile-menu-button').onclick=() => setMobileMenu(!document.body.classList.contains('mobile-menu-open'));$('mobile-language-pill').onclick=()=>setMobileMenu(true);$('mobile-menu-backdrop').onclick=()=>setMobileMenu(false);$('message-form').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();$('message').value='';if(text)handleTyped(text);};$('display-mode').onclick=()=>{settings.display=settings.display==='auto'?'day':settings.display==='day'?'night':'auto';settings=saveTabletSettings(settings);syncSettingsToUI();};
$('account').addEventListener('click',()=>setMobileMenu(false));
document.addEventListener('pointerdown',unlockNotificationAudio,{passive:true});
document.addEventListener('keydown',unlockNotificationAudio);
document.querySelectorAll('#language-tabs button').forEach(button=>button.onclick=()=>{settings.language=button.dataset.language;settings=saveTabletSettings(settings);syncSettingsToUI();setMobileMenu(false);if(live)live.sendText(`Language setting changed to ${language()}. Continue using this setting.`);});
$('night-start').innerHTML=hourOptions();$('night-end').innerHTML=hourOptions();
function rowStatus(row){return row.status==='new'?'received':row.status==='in-progress'?'way':'done';}
function statusLabel(row){return {received:'Received',way:'On the way',done:'Completed'}[rowStatus(row)]||'Received';}
function renderPatientRequests(){
  const today=new Date();today.setHours(0,0,0,0);const rows=store.items.filter(r=>r.room===store.profile?.room&&r.createdAt>=today.getTime()).sort((a,b)=>b.createdAt-a.createdAt);
  $('patient-requests').innerHTML=rows.map(r=>`<article class="patient-request-card ${rowStatus(r)}"><b class="request-icon">${escapeHTML(categories[r.category]?.icon||'!')}</b><div><strong>${escapeHTML(r.summary)}</strong><small>${escapeHTML(categoryLabel(r.category))} · ${new Date(r.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></div><div class="progress-bars"><i></i><i></i><i></i></div><span>${escapeHTML(statusLabel(r))}</span></article>`).join('');
}
function activeRoomRequests(){return store.items.filter(r=>r.room===store.profile?.room&&r.status==='in-progress');}
function renderStaffRequests(){const rows=activeRoomRequests();if(!rows.some(r=>r.id===selectedCompletionId))selectedCompletionId=rows[0]?.id||null;$('staff-request-list').innerHTML=rows.length?rows.map(r=>`<button type="button" data-complete-id="${escapeHTML(r.id)}" class="${r.id===selectedCompletionId?'selected':''}"><strong>${escapeHTML(categoryLabel(r.category))}</strong><span>${escapeHTML(r.summary)} · ${new Date(r.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}${r.acknowledgedByEmployeeId?' · ack '+escapeHTML(r.acknowledgedByEmployeeId):''}</span><em>${statuses[r.status]}</em></button>`).join(''):'<p>No acknowledged requests are waiting for bedside completion.</p>';$('staff-request-list').querySelectorAll('[data-complete-id]').forEach(button=>button.onclick=()=>{selectedCompletionId=button.dataset.completeId;renderStaffRequests();});$('staff-save').disabled=!selectedCompletionId;}
$('staff').onclick=()=>{setMobileMenu(false);if(active)end();selectedCompletionId=null;$('staff-error').textContent='';$('staff-employee-id').value='';$('staff-dialog').showModal();renderStaffRequests();setTimeout(()=>$('staff-employee-id').focus(),50);};$('staff-close').onclick=()=>$('staff-dialog').close();
$('staff-form').onsubmit=async e=>{e.preventDefault();$('staff-error').textContent='';try{if(!selectedCompletionId)throw Error('Select an acknowledged request first.');await store.completeAtRoom(selectedCompletionId,'Staff',$('staff-employee-id').value);toast('Request completed');$('staff-dialog').close();$('staff-employee-id').value='';}catch(error){$('staff-error').textContent=error.message;}};
store.subscribe(items=>{for(const r of items.filter(r=>r.room===store.profile?.room)){const previous=requestState.get(r.id);if(requestLoaded&&previous==='new'&&r.status==='in-progress'){toast(acknowledgementMessage());speakAcknowledgement();}}requestState=new Map(items.map(r=>[r.id,r.status]));requestLoaded=true;renderPatientRequests();if($('staff-dialog').open)renderStaffRequests();});
function fillSettings(){syncSettingsToUI();$('new-pin').value='';$('confirm-pin').value='';}
const initialize=setupAccount(store,(profile)=>{if(profile&&!store.demo)warmVoice();fillSettings();$('start').disabled=!profile;if(!profile)$('patient-requests').replaceChildren();else store.emit();});
$('login-form').addEventListener('submit',event=>{if(store.profile&&$('new-pin').value&&$('new-pin').value!==$('confirm-pin').value){event.preventDefault();event.stopImmediatePropagation();$('login-error').textContent='New PIN does not match.';return;}if(store.profile&&$('new-pin').value)settings.pin=$('new-pin').value;settings={...settings,ward:$('ward-unit').value.trim()||'Ward',patientName:$('patient-name').value.trim(),uhid:$('patient-uhid').value.trim(),language:$('setting-language').value,display:$('setting-display').value,nightStart:$('night-start').value,nightEnd:$('night-end').value};settings=saveTabletSettings(settings);syncSettingsToUI();},true);
updateTheme();setInterval(updateTheme,30000);
initialize().catch(error=>{toast(error.message);$('connection').textContent='Setup error';$('start').disabled=true;});
window.addEventListener('pagehide',end);
