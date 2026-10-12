import {CareStore,categories,statuses,$,toast,escapeHTML,setupAccount} from './shared.js';
const store=new CareStore('log');let items=[];
const pad=value=>String(value).padStart(2,'0');
const dateKey=time=>{const date=new Date(time);return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;};
const dateLabel=time=>new Date(time).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const timeLabel=time=>new Date(time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
function duration(start,end){if(!start||!end)return '—';const seconds=Math.max(0,Math.round((end-start)/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),remaining=seconds%60;if(hours)return `${hours}h ${minutes}m`;if(minutes)return `${minutes}m ${remaining}s`;return `${remaining}s`;}
function requestTime(row){return `${dateLabel(row.createdAt)} ${timeLabel(row.createdAt)}`;}
function employeeId(row){return row.completedByEmployeeId||'—';}
function ackEmployeeId(row){return row.acknowledgedByEmployeeId||'—';}
function acknowledgedAt(row){return row.acknowledgedAt||(row.status!=='new'?row.updatedAt:null);}
function elapsedSeconds(start,end,now){return start?Math.max(0,Math.round(((end||now)-start)/1000)):0;}
function delayClass(start,end,now){const seconds=elapsedSeconds(start,end,now);if(seconds>=600)return 'duration-danger';if(seconds>=300)return 'duration-warning';return '';}
function delayScore(row,now){
  const ackEnd=acknowledgedAt(row),completionEnd=row.completedAt;
  const ackSeconds=elapsedSeconds(row.createdAt,ackEnd,now);
  const completionSeconds=elapsedSeconds(row.createdAt,completionEnd,now);
  const openPenalty=row.status==='new'?2000000:row.status==='in-progress'?1000000:0;
  return openPenalty+Math.max(ackSeconds,completionSeconds);
}
function filteredRows(){
  const selectedDate=$('log-date').value,status=$('log-status').value,category=$('log-category').value;
  return items.filter(row=>(!selectedDate||dateKey(row.createdAt)===selectedDate)&&(status==='all'||row.status===status)&&(category==='all'||row.category===category));
}
function render(){
  const now=Date.now();
  const rows=filteredRows().sort((a,b)=>delayScore(b,now)-delayScore(a,now));
  $('log-total').textContent=rows.length;
  $('log-new').textContent=rows.filter(row=>row.status==='new').length;
  $('log-progress').textContent=rows.filter(row=>row.status==='in-progress').length;
  $('log-completed').textContent=rows.filter(row=>row.status==='completed').length;
  $('log-summary').textContent=`${rows.length} ${rows.length===1?'request':'requests'} ${$('log-date').value?'for '+dateLabel(new Date($('log-date').value+'T00:00:00').getTime()):'across all dates'}.`;
  $('log-rows').innerHTML=rows.length?rows.map((row,index)=>{const ackEnd=acknowledgedAt(row),completionEnd=row.completedAt;return `<tr><td>${index+1}</td><td>${dateLabel(row.createdAt)}</td><td>${timeLabel(row.createdAt)}</td><td>${escapeHTML(row.room)}</td><td>${escapeHTML(row.ward||'—')}</td><td>${escapeHTML(row.patientName||'—')}</td><td>${escapeHTML(row.uhid||'—')}</td><td>${escapeHTML(categories[row.category]?.label||'Request')}</td><td>${escapeHTML(row.summary)}</td><td><span class="status ${row.status}">${statuses[row.status]}</span></td><td>${requestTime(row)}</td><td class="duration-cell ${delayClass(row.createdAt,ackEnd,now)}">${duration(row.createdAt,ackEnd||now)}</td><td>${escapeHTML(ackEmployeeId(row))}</td><td class="duration-cell ${delayClass(row.createdAt,completionEnd,now)}">${duration(row.createdAt,completionEnd||now)}</td><td>${escapeHTML(employeeId(row))}</td></tr>`;}).join(''):`<tr><td colspan="15" class="log-empty">${store.profile?'No requests found for this view.':'Staff sign-in required to view logs.'}</td></tr>`;
}
$('log-category').innerHTML='<option value="all">All categories</option>'+Object.entries(categories).map(([key,value])=>`<option value="${key}">${escapeHTML(value.label)}</option>`).join('');
$('today').onclick=()=>{$('log-date').value=dateKey(Date.now());render();};
$('all-dates').onclick=()=>{$('log-date').value='';render();};
$('log-date').onchange=render;$('log-status').onchange=render;$('log-category').onchange=render;
$('log-date').value=dateKey(Date.now());
store.subscribe(rows=>{items=rows;render();});
const initialize=setupAccount(store,profile=>{if(!profile){items=[];render();}});
initialize().catch(error=>{toast(error.message);$('connection').textContent='Setup error';});
