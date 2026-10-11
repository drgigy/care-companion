import {CareStore,categories,statuses,$,toast,escapeHTML,guessCategory,setupAccount} from './shared.js';
import {LiveCompanion} from './voice.js';
const store=new CareStore('patient');let active=false,recognition=null,live=null,pending=null,pendingResolve=null,starting=false,autoEndTimer=null,requestLoaded=false,requestState=new Map(),staffUnlocked=false,selectedCompletionId=null;
const serviceLabels={nursing:'Nursing',food:'Food',housekeeping:'Housekeeping',engineering:'Maintenance',ipBilling:'Billing',insurance:'Insurance',it:'IT',guestRelations:'Relations'};
const categoryLabel=key=>categories[key]?.label||'Request';
function bubble(text,user=false){const div=document.createElement('div');div.className='bubble'+(user?' user':'');const label=document.createElement('small');label.textContent=user?'YOU':'COMPANION';div.append(label,document.createTextNode(text));$('chat').append(div);$('chat').scrollTop=$('chat').scrollHeight;return div;}
function detectLanguage(text){return /[\u0D00-\u0D7F]/.test(text)?'malayalam':'english';}
function speak(text,language='english',force=false){if((!force&&!store.demo)||!('speechSynthesis'in window))return;recognition?.abort();speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.rate=.92;utterance.lang=language==='malayalam'?'ml-IN':'en-IN';speechSynthesis.speak(utterance);}
function updatePatientTheme(){const now=new Date(),hour=now.getHours(),day=hour>=7&&hour<18,time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});$('patient-time').textContent=time.replace(/\s?[AP]M$/i,'');$('patient-period').textContent=time.match(/AM|PM/i)?.[0]||'';$('patient-date').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});document.body.dataset.theme=day?'ocean':'night';}
function setSession(value){active=value;$('start').hidden=value;$('session-controls').hidden=!value;$('chat').hidden=!value;$('message-form').hidden=true;document.querySelector('.avatar-zone').classList.toggle('active',value);$('companion-heading').textContent=value?'I’m here. What do you need?':'Hello, I’m your care companion.';$('companion-description').textContent=value?'Tell me in your own words, or choose a service.':'Tap below and tell me what you need. We’ll take it from there.';$('session-state').textContent=value?'Conversation started':'Ready when you are';}
function clearPending(result={cancelled:true}){pendingResolve?.(result);pendingResolve=null;pending=null;$('pending').hidden=true;$('pending').replaceChildren();}
function scheduleAutoEnd(delay=5000){clearTimeout(autoEndTimer);autoEndTimer=setTimeout(()=>{toast('Conversation ended. Press Start Conversation for a new request.');end();},delay);}
function end(){starting=false;clearTimeout(autoEndTimer);autoEndTimer=null;recognition?.abort();live?.stop();live=null;if('speechSynthesis'in window)speechSynthesis.cancel();clearPending();$('chat').replaceChildren();$('message').value='';setSession(false);$('mode-note').textContent=store.demo?'Local demo · voice uses your browser when available':'Secure voice assistant · microphone starts after you tap Start';$('start').disabled=!store.profile;$('start').innerHTML='<span>◉</span> Start a conversation <span>→</span>';}
function showConfirmation(category,summary,requestId,patientLanguage='english'){
  clearPending();pending={category,summary,id:requestId||crypto.randomUUID(),patientLanguage};$('pending').hidden=false;
  $('pending').innerHTML=`<h3>Send this request to your care team?</h3><p>${escapeHTML(summary)}</p><div class="category-options">${Object.entries(categories).map(([key,value])=>`<button type="button" data-category="${key}" class="${category===key?'selected':''}" aria-pressed="${category===key}">${value.label}</button>`).join('')}</div><button class="primary" id="confirm-request">Send request</button> <button class="text-button" id="cancel-request">Cancel</button>`;
  $('confirm-request').disabled=!category;
  $('pending').querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{pending.category=button.dataset.category;$('pending').querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});$('confirm-request').disabled=false;});
  $('confirm-request').onclick=async()=>{
    const current=pending;const button=$('confirm-request');button.disabled=true;button.textContent='Sending…';$('cancel-request').disabled=true;
    try{const id=await store.create(current.category,current.summary,current.id,current.patientLanguage);const message=`Your ${categoryLabel(current.category).toLowerCase()} request has been sent for Room ${store.profile.room}.`;bubble(message);speak(message,current.patientLanguage);toast('Request sent to the care team');clearPending({requestId:id,status:'sent'});}
    catch(error){toast('Request was not sent. '+error.message);button.disabled=false;button.textContent='Try again';$('cancel-request').disabled=false;}
  };
  $('cancel-request').onclick=()=>{clearPending();bubble('No problem. That request has not been sent.');};
}
function handleDemo(text,chosen){bubble(text,true);const patientLanguage=detectLanguage(text);const category=chosen||guessCategory(text);const message=category?`I can pass that to the ${categories[category].label.toLowerCase()} team. Please confirm your request below.`:'Please tell me what you need, and I will send it to the right team.';bubble(message);speak(message,patientLanguage);if(category)showConfirmation(category,text,null,patientLanguage);}
async function start(){
  if(active||starting)return;if(!store.profile){$('login-dialog').showModal();return;}
  starting=true;$('start').disabled=true;
  try{
    if(store.demo){setSession(true);const greeting='നമസ്കാരം. നിങ്ങൾക്ക് എന്ത് സഹായം വേണം? I can help with nursing, food, housekeeping, maintenance, billing, insurance, IT, or guest relations.';bubble(greeting);speak(greeting);}
    else{
      setSession(true);$('mic').textContent='Preparing microphone…';$('end').textContent='Stop conversation';
      live=new LiveCompanion(store,{onText:text=>{bubble(text);},onState:state=>{$('session-state').textContent=state;},onError:message=>{toast(message);end();},onEnd:()=>scheduleAutoEnd(1200),onRequest:async args=>{
        try{const id=await store.create(args.category,args.summary,crypto.randomUUID(),args.patientLanguage);toast(`Request sent · ${categoryLabel(args.category)}`);return {requestId:id,status:'sent'};}catch(error){toast('Request was not sent. '+error.message);return {status:'failed',error:'Request could not be saved. Tell the patient it was not sent.'};}
      }});
      await live.start();if(!live||live.stopped)throw Error('The voice session closed before it was ready. Please start again.');$('mic').textContent='Mute microphone';$('mode-note').textContent='Voice assistant · microphone is on during your conversation';
    }
  }catch(error){end();toast('Could not start: '+error.message);}finally{starting=false;$('start').disabled=!store.profile;}
}
$('start').onclick=start;$('end').onclick=end;
$('services').innerHTML=Object.entries(categories).map(([key,value])=>`<button class="service" data-category="${key}" aria-label="${value.label}"><span class="service-icon">${value.icon}</span><span><strong>${serviceLabels[key]||value.label}</strong><small>${value.hint}</small></span></button>`).join('');
$('services').querySelectorAll('button').forEach(button=>button.onclick=async()=>{await start();if(!active)return;const key=button.dataset.category;bubble(`I need help with ${categories[key].label.toLowerCase()}.`,true);bubble('Please describe what you need, then send your request.');$('pending').hidden=false;clearPending();$('message').placeholder=`Describe your ${categories[key].label.toLowerCase()} request…`;$('message').focus();$('message-form').dataset.category=key;});
$('message-form').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(!text||!active)return;const category=$('message-form').dataset.category;delete $('message-form').dataset.category;$('message').value='';$('message').placeholder='Or type what you need…';if(store.demo)handleDemo(text,category);else{bubble(text,true);live?.sendText((category?`Category requested: ${category}. `:'')+text);}};
$('mic').onclick=()=>{
  if(!store.demo){const muted=live?.toggleMute();$('mic').textContent=muted?'Unmute microphone':'Mute microphone';return;}
  const API=window.SpeechRecognition||window.webkitSpeechRecognition;if(!API){toast('Voice input is unavailable in this browser. You can type your request below.');return;}
  if(recognition){recognition.abort();recognition=null;return;}
  if('speechSynthesis'in window)speechSynthesis.cancel();recognition=new API();recognition.lang='en-IN';recognition.interimResults=false;
  recognition.onstart=()=>{$('mic').textContent='Listening… tap to stop';$('session-state').textContent='Listening to you';};
  recognition.onresult=e=>{const text=e.results[0][0].transcript;handleDemo(text,$('message-form').dataset.category);delete $('message-form').dataset.category;};
  recognition.onerror=e=>toast(e.error==='not-allowed'?'Microphone permission was denied. You can type your request.':'Voice input stopped. Try again or type your request.');
  recognition.onend=()=>{recognition=null;$('mic').textContent='Enable demo microphone';$('session-state').textContent='Ready to listen';};recognition.start();
};
function activeRoomRequests(){return store.items.filter(r=>r.room===store.profile?.room&&r.status==='in-progress');}
function renderStaffRequests(){const rows=activeRoomRequests();if(!rows.some(r=>r.id===selectedCompletionId))selectedCompletionId=rows[0]?.id||null;$('staff-request-list').innerHTML=rows.length?rows.map(r=>`<button type="button" data-complete-id="${escapeHTML(r.id)}" class="${r.id===selectedCompletionId?'selected':''}"><strong>${escapeHTML(categoryLabel(r.category))}</strong><span>${escapeHTML(r.summary)}</span></button>`).join(''):'<p>No acknowledged requests are waiting for bedside completion.</p>';$('staff-request-list').querySelectorAll('[data-complete-id]').forEach(button=>button.onclick=()=>{selectedCompletionId=button.dataset.completeId;renderStaffRequests();});$('staff-save').disabled=!selectedCompletionId;}
async function saveStaffCompletion(){await store.completeAtRoom(selectedCompletionId,'Staff',$('staff-employee-id').value);toast('Request completed');staffUnlocked=false;$('staff-dialog').close();$('staff-employee-id').value='';}
$('staff').onclick=()=>{if(active)end();staffUnlocked=true;selectedCompletionId=null;$('staff-error').textContent='';$('staff-employee-id').value='';$('staff-dialog').showModal();renderStaffRequests();setTimeout(()=>$('staff-employee-id').focus(),50);};
$('staff-close').onclick=()=>{staffUnlocked=false;$('staff-dialog').close();};
$('staff-form').onsubmit=async e=>{e.preventDefault();$('staff-error').textContent='';const submit=$('staff-save');submit.disabled=true;try{if(!selectedCompletionId)throw Error('Select an acknowledged request first.');await saveStaffCompletion();}catch(error){$('staff-error').textContent=error.message;}finally{submit.disabled=false;if(staffUnlocked)renderStaffRequests();}};
store.subscribe(items=>{const rows=items.filter(r=>r.room===store.profile?.room).slice(0,3);for(const r of rows){const previous=requestState.get(r.id);if(requestLoaded&&previous==='new'&&r.status==='in-progress'){const language=r.patientLanguage||'english';const message=language==='malayalam'?'നിങ്ങളുടെ അഭ്യർത്ഥന സ്റ്റാഫ് അംഗീകരിച്ചു.':'Your request has been acknowledged.';toast(message);speak(message,language,true);}}requestState=new Map(items.map(r=>[r.id,r.status]));requestLoaded=true;$('patient-requests').replaceChildren();if(staffUnlocked)renderStaffRequests();});
const initialize=setupAccount(store,(profile,error)=>{const roomText=profile?'Room '+profile.room:'Room not connected';$('room').textContent=roomText;$('header-room').textContent=roomText;$('start').disabled=!profile||!!error;$('account').textContent='Settings';if(profile&&!store.demo)LiveCompanion.preload();if(!active)$('mode-note').textContent=store.demo?'Local demo · voice uses your browser when available':'Secure voice assistant · microphone starts after you tap Start';if(active)end();store.emit();});
updatePatientTheme();setInterval(updatePatientTheme,30000);
initialize().catch(error=>{toast(error.message);$('connection').textContent='Setup error';$('start').disabled=true;});
window.addEventListener('pagehide',end);
