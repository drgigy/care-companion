import {canAccept,canComplete} from './access.js';
import {CareStore,categories,statuses,$,toast,escapeHTML,setupAccount} from './staff-store.js?v=patch-20261029';
import {RequestAlert} from './request-alert.js?v=ring-20261026';
import {categoryPages,dashboardCategory,scopeRequests} from './dashboard-scope.js?v=categories-20261027';
const fixedCategory=dashboardCategory(document.body.dataset.category);
const store=new CareStore('dashboard');let selected=fixedCategory||'all',view='active',items=[],seen=new Set(),loaded=false,ackId=null,actionMode='accept';
function setSidebarCollapsed(value){
  document.body.classList.toggle('sidebar-collapsed',value);
  localStorage.setItem('dashboardSidebarCollapsed',value?'1':'0');
  const toggle=$('sidebar-toggle');
  toggle.textContent=value?'›':'‹';
  toggle.setAttribute('aria-expanded',String(!value));
  toggle.setAttribute('aria-label',value?'Expand departments':'Collapse departments');
}
setSidebarCollapsed(localStorage.getItem('dashboardSidebarCollapsed')==='1');
$('sidebar-toggle').onclick=()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
const age=time=>{const mins=Math.max(0,Math.floor((Date.now()-time)/60000));return mins===0?'just now':mins<60?`${mins} min`:mins<1440?`${Math.floor(mins/60)} hr ${mins%60} min`:`${Math.floor(mins/1440)} d`;};
function clock(){const target=$('clock');if(target)target.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}clock();setInterval(clock,30000);
const requestAlert=new RequestAlert({onState:()=>{
  $('sound').textContent=requestAlert.enabled?(requestAlert.ready?'Alert sound: on':'Alert sound: paused · tap to resume'):'Alert sound: off';
  $('sound').setAttribute('aria-pressed',String(requestAlert.enabled));
}});
let alertWakeLock=null,wakeLockVersion=0;
async function syncAlertWakeLock(){
  const version=++wakeLockVersion;
  if(!requestAlert.enabled||document.hidden){const lock=alertWakeLock;alertWakeLock=null;await lock?.release().catch(()=>{});return;}
  if(alertWakeLock||!navigator.wakeLock)return;
  try{
    const lock=await navigator.wakeLock.request('screen');
    if(version!==wakeLockVersion||!requestAlert.enabled||document.hidden){await lock.release();return;}
    alertWakeLock=lock;lock.addEventListener('release',()=>{if(alertWakeLock===lock)alertWakeLock=null;});
  }catch{/* Audio still works when screen wake lock is unavailable. */}
}
$('sound').onclick=async()=>{
  try{await requestAlert.setEnabled(!requestAlert.enabled||!requestAlert.ready);}
  catch{toast('Audio could not start. Tap Alert sound again and check the device volume.');}
  await syncAlertWakeLock();
};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)syncAlertWakeLock();
  else requestAlert.resume().catch(()=>toast('Tap Alert sound to resume audio.')).finally(syncAlertWakeLock);
});
window.addEventListener('pagehide',()=>{requestAlert.setEnabled(false);syncAlertWakeLock();});

function todayStart(){const today=new Date();today.setHours(0,0,0,0);return today.getTime();}
function ackTime(row){return row.acknowledgedAt||(row.status!=='new'?row.updatedAt:null);}
function avgResponse(){const rows=items.filter(r=>ackTime(r));if(!rows.length)return '—';const mins=Math.round(rows.reduce((sum,row)=>sum+Math.max(0,ackTime(row)-row.createdAt),0)/rows.length/60000);return `${mins} min`;}
function departmentRows(){return items.filter(r=>(selected==='all'||r.category===selected)&&(view==='completed'?r.status==='completed':r.status!=='completed')).sort((a,b)=>{const order={new:0,'in-progress':1,completed:2};return order[a.status]-order[b.status]||a.createdAt-b.createdAt;});}
const dashboardSelect=$('dashboard-select');
const allDashboardOptions='<option value="dashboard.html">All departments</option>'+Object.entries(categoryPages).map(([key,path])=>`<option value="${escapeHTML(path)}">${escapeHTML(categories[key].label)}</option>`).join('');
dashboardSelect.innerHTML=allDashboardOptions;
dashboardSelect.value=fixedCategory?categoryPages[fixedCategory]:'dashboard.html';
dashboardSelect.onchange=()=>{window.location.href=dashboardSelect.value;};
function renderTabs(){
  if(fixedCategory){$('category-tabs').innerHTML=`<button class="selected" aria-current="page"><span>${escapeHTML(categories[fixedCategory].label)}</span><b>${items.filter(r=>r.status!=='completed').length}</b></button>`;return;}
  const active=items.filter(r=>r.status!=='completed');
  const allCount=active.length;
  $('category-tabs').innerHTML=`<button data-category="all" class="${selected==='all'?'selected':''}"><span>All departments</span><b>${allCount}</b></button>`+Object.entries(categories).map(([key,value])=>`<button data-category="${key}" class="${selected===key?'selected':''}${items.some(r=>r.category===key&&r.status==='new')?' has-new':''}"><span>${escapeHTML(value.label)}</span><b>${active.filter(r=>r.category===key).length}</b></button>`).join('');
  $('category-tabs').querySelectorAll('button').forEach(button=>button.onclick=()=>{selected=button.dataset.category;render();});
}
function render(){
  $('new-count').textContent=items.filter(r=>r.status==='new').length;$('progress-count').textContent=items.filter(r=>r.status==='in-progress').length;$('done-count').textContent=items.filter(r=>r.status==='completed'&&r.completedAt>=todayStart()).length;$('avg-response').textContent=avgResponse();
  renderTabs();const rows=departmentRows(),title=selected==='all'?'All departments':categories[selected].label;$('queue-title').textContent=title;$('queue-summary').textContent=`${rows.length} ${view==='completed'?'completed':'active'} requests · updates automatically`;
  $('request-list').innerHTML=`<div class="staff-table-head"><span>Room</span><span>Request</span><span>Department</span><span>Received</span><span>Status</span><span></span></div>`+(rows.length?rows.map(r=>{const urgent=r.status==='new'&&Date.now()-r.createdAt>10*60000;const action=canAccept(store.profile,r)?`<button class="primary" data-accept="${escapeHTML(r.id)}">Accept</button>`:canComplete(store.profile,r)?`<button class="primary" data-complete="${escapeHTML(r.id)}">Complete</button>`:`<span class="muted-action">${r.status==='new'?'Waiting for department acceptance':r.status==='in-progress'?'Awaiting nursing-station completion':'Closed'}</span>`;return `<article class="staff-row ${urgent?'urgent':''}"><div class="staff-room"><strong>${escapeHTML(r.room)}</strong>${r.patientName?`<small>${escapeHTML(r.patientName)}</small>`:''}${r.uhid?`<small>UHID ${escapeHTML(r.uhid)}</small>`:''}</div><div><strong>${escapeHTML(r.summary)}</strong><small>${r.patientLanguage==='malayalam'?'ML':r.patientLanguage==='arabic'?'AR':''}</small></div><div>${escapeHTML(categoryLabel(r.category))}</div><div><strong>${age(r.createdAt)}</strong><small>${new Date(r.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></div><div><span class="status ${r.status}">${statuses[r.status]}</span></div><div>${action}</div></article>`;}).join(''):`<div class="empty"><h3>${store.profile?('No requests found'):'Staff sign-in required'}</h3><p>${store.profile?(store.profile.role==='nonClinical'?'Requests from your assigned rooms/tablets and staff accounts will appear here automatically.':'Requests permitted for your account will appear here automatically.'):'Connect your staff account to view requests.'}</p></div>`);
  $('request-list').querySelectorAll('[data-complete]').forEach(button=>button.onclick=()=>openAck(button.dataset.complete,'complete'));
  $('request-list').querySelectorAll('[data-accept]').forEach(button=>button.onclick=()=>openAck(button.dataset.accept));
}
const categoryLabel=key=>categories[key]?.label||'Request';
function openAck(id,mode='accept'){actionMode=mode;$('ack-dialog').querySelector('.eyebrow').textContent=mode==='complete'?'COMPLETE REQUEST':'ACCEPT REQUEST';$('ack-dialog').querySelector('h2').textContent=mode==='complete'?'Complete request':'Accept request';$('ack-save').textContent=mode==='complete'?'Complete':'Accept';ackId=id;$('ack-error').textContent='';$('ack-employee-id').value='';renderAckList();$('ack-dialog').showModal();setTimeout(()=>$('ack-employee-id').focus(),50);}
function renderAckList(){const rows=items.filter(r=>actionMode==='complete'?canComplete(store.profile,r):canAccept(store.profile,r));if(ackId&&!rows.some(r=>r.id===ackId)){ackId=null;$('ack-employee-id').value='';$('ack-error').textContent='That request has changed. Select a request again before continuing.';}$('ack-request-list').innerHTML=rows.length?rows.map(r=>`<button type="button" data-ack-id="${escapeHTML(r.id)}" class="${r.id===ackId?'selected':''}"><strong>${escapeHTML(categoryLabel(r.category))} · Room ${escapeHTML(r.room)}</strong><span>${escapeHTML(r.summary)} · ${age(r.createdAt)} ago</span></button>`).join(''):'<p>No new requests are waiting for acknowledgement.</p>';$('ack-request-list').querySelectorAll('[data-ack-id]').forEach(button=>button.onclick=()=>{ackId=button.dataset.ackId;renderAckList();});$('ack-save').disabled=!ackId;}
$('ack-close').onclick=()=>$('ack-dialog').close();$('ack-form').onsubmit=async e=>{e.preventDefault();$('ack-error').textContent='';const submit=$('ack-save');submit.disabled=true;try{if(!ackId)throw Error('Select a request first.');await store.update(ackId,actionMode==='complete'?'completed':'in-progress',$('ack-employee-id').value);toast(actionMode==='complete'?'Request completed':'Request accepted');$('ack-dialog').close();}catch(error){$('ack-error').textContent=error.message;}finally{submit.disabled=false;renderAckList();}};
$('active-filter').onclick=()=>{view='active';$('active-filter').classList.add('selected');$('completed-filter').classList.remove('selected');render();};$('completed-filter').onclick=()=>{view='completed';$('completed-filter').classList.add('selected');$('active-filter').classList.remove('selected');render();};
store.subscribe(allRows=>{const rows=scopeRequests(allRows,fixedCategory);const arrivals=rows.filter(r=>!seen.has(r.id)&&r.status==='new');if(loaded&&arrivals.length){const first=arrivals[0];toast(`New request · Room ${first.room} · ${categoryLabel(first.category)}`);}seen=new Set(rows.map(r=>r.id));loaded=true;items=rows;requestAlert.setRequests(rows);render();if($('ack-dialog').open)renderAckList();});setInterval(render,30000);
const initialize=setupAccount(store,(profile,error)=>{dashboardSelect.innerHTML=allDashboardOptions;dashboardSelect.value=fixedCategory?categoryPages[fixedCategory]:'dashboard.html';if(profile?.role==='departmentAdmin'){dashboardSelect.innerHTML=`<option value="${categoryPages[profile.department]}">${categories[profile.department].label}</option>`;}if(error)toast('Live updates are interrupted. Check your connection and account access.');if(!profile){items=[];loaded=false;requestAlert.setRequests([]);render();}});
initialize().catch(error=>{toast(error.message);$('connection').textContent='Setup error';});
