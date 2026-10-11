import {CareStore,categories,statuses,$,toast,escapeHTML,setupAccount} from './shared.js';
const store=new CareStore('log');let items=[];
const pad=value=>String(value).padStart(2,'0');
const dateKey=time=>{const date=new Date(time);return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;};
const dateLabel=time=>new Date(time).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const timeLabel=time=>new Date(time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
function duration(start,end){if(!start||!end)return '—';const seconds=Math.max(0,Math.round((end-start)/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),remaining=seconds%60;if(hours)return `${hours}h ${minutes}m`;if(minutes)return `${minutes}m ${remaining}s`;return `${remaining}s`;}
function requestTime(row){return `${dateLabel(row.createdAt)} ${timeLabel(row.createdAt)}`;}
function completedBy(row){return row.completedByName?`${row.completedByName}${row.completedByEmployeeId?' · '+row.completedByEmployeeId:''}`:'—';}
function filteredRows(){
  const selectedDate=$('log-date').value,status=$('log-status').value;
  return items.filter(row=>(!selectedDate||dateKey(row.createdAt)===selectedDate)&&(status==='all'||row.status===status));
}
function render(){
  const rows=filteredRows();
  $('log-total').textContent=rows.length;
  $('log-new').textContent=rows.filter(row=>row.status==='new').length;
  $('log-progress').textContent=rows.filter(row=>row.status==='in-progress').length;
  $('log-completed').textContent=rows.filter(row=>row.status==='completed').length;
  $('log-summary').textContent=`${rows.length} ${rows.length===1?'request':'requests'} ${$('log-date').value?'for '+dateLabel(new Date($('log-date').value+'T00:00:00').getTime()):'across all dates'}.`;
  $('log-rows').innerHTML=rows.length?rows.map((row,index)=>{const acknowledgedAt=row.acknowledgedAt||(row.status==='in-progress'?row.updatedAt:null);return `<tr><td>${index+1}</td><td>${dateLabel(row.createdAt)}</td><td>${timeLabel(row.createdAt)}</td><td>${escapeHTML(row.room)}</td><td>${escapeHTML(categories[row.category]?.label||'Request')}</td><td>${escapeHTML(row.summary)}</td><td><span class="status ${row.status}">${statuses[row.status]}</span></td><td>${requestTime(row)}</td><td>${duration(row.createdAt,acknowledgedAt)}</td><td>${duration(row.createdAt,row.completedAt)}</td><td>${escapeHTML(completedBy(row))}</td></tr>`;}).join(''):`<tr><td colspan="11" class="log-empty">${store.profile?'No requests found for this view.':'Staff sign-in required to view logs.'}</td></tr>`;
}
$('today').onclick=()=>{$('log-date').value=dateKey(Date.now());render();};
$('all-dates').onclick=()=>{$('log-date').value='';render();};
$('log-date').onchange=render;$('log-status').onchange=render;
$('log-date').value=dateKey(Date.now());
store.subscribe(rows=>{items=rows;render();});
const initialize=setupAccount(store,profile=>{if(!profile){items=[];render();}});
initialize().catch(error=>{toast(error.message);$('connection').textContent='Setup error';});
