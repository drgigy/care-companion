import {connectAdmin} from './admin-client.js?v=admin-20261022';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client,users=[],nextPage=null,editing=null,operationId=null,busy=false,sessionVersion=0,assignmentTarget=null,roomChoices=[],selectedRoomUids=new Set(),assignmentLoadVersion=0;
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').hidden=!message;$('notice').classList.toggle('error',error);};
function errorText(error){return error.code?.includes('permission-denied')?'This login has no Master Admin access. Ask the project owner to authorise it.':error.message||'The operation failed. Please try again.';}
function render(){
  $('count-all').textContent=users.length;for(const role of ['room','staff'])$('count-'+role).textContent=users.filter(u=>u.role===role).length;
  $('count-disabled').textContent=users.filter(u=>u.disabled).length;
  const query=$('search').value.trim().toLowerCase(),role=$('role-filter').value,access=$('access-filter').value;
  const rows=users.filter(u=>(!query||[u.name,u.email,u.room].some(x=>x.toLowerCase().includes(query)))&&(!role||u.role===role)&&(!access||u.disabled===(access==='disabled')));
  $('account-rows').innerHTML=rows.map(u=>`<tr><td><strong>${escape(u.name||'Unnamed account')}</strong><small>${escape(u.email||'No email')}</small></td><td>${escape(u.role==='room'?'Room / tablet':u.role==='staff'?'Staff':u.role)}</td><td>${u.role==='staff'?`${u.assignedRoomUids?.length||0} rooms / tablets`:escape(u.room||'—')}</td><td><span class="tag${u.disabled?' disabled':''}">${u.disabled?'Disabled':'Enabled'}</span></td><td>${u.protected?'<span class="protected">Protected account</span>':`<div class="row-actions">${u.role==='staff'?`<button data-action="assign" data-uid="${escape(u.uid)}">Assign rooms / tablets</button>`:''}<button data-action="edit" data-uid="${escape(u.uid)}">Edit</button><button data-action="reset" data-uid="${escape(u.uid)}"${u.disabled?' disabled':''}>Password link</button>${['room','staff'].includes(u.role)?`<button data-action="disable" data-uid="${escape(u.uid)}">${u.disabled?'Enable':'Disable'}</button>`:''}</div>`}</td></tr>`).join('');
  $('empty').hidden=!!rows.length;$('load-more').hidden=!nextPage;$('loaded-note').textContent=`${users.length} accounts loaded${nextPage?' · More accounts available':''}. Filters apply to loaded accounts.`;
}
async function load(more=false){
  const version=sessionVersion;notice('Loading accounts…');
  const result=await client.call({action:'list',...(more&&nextPage?{pageToken:nextPage}:{})});if(version!==sessionVersion)return;
  users=more?[...users,...result.users.filter(u=>!users.some(old=>old.uid===u.uid))]:result.users;nextPage=result.nextPageToken;
  $('admin-panel').hidden=false;$('sign-in-panel').hidden=true;$('admin-identity').textContent='Signed in as '+result.actor.email;render();notice('');
}
function roleFields(){const room=$('user-role').value==='room';$('room-field').hidden=!room;$('user-room').required=room;$('account-help').textContent=room?'This tablet account can submit requests for its assigned room. Reassignments are controlled here.':'A staff account can use the dashboard and request log. After creation, share a password setup link and assign rooms/tablets. Staff see no requests until accounts are assigned.';}
function openAccount(user=null){editing=user;operationId=crypto.randomUUID();$('account-form').reset();$('user-name').value=user?.name||'';$('user-email').value=user?.email||'';$('user-email').readOnly=!!user;$('user-role').value=['staff','room'].includes(user?.role)?user.role:'staff';$('user-room').value=user?.room||'';$('account-title').textContent=user?'Edit account':'Create account';$('account-save').textContent=user?'Save changes':'Create account';$('account-error').textContent='';roleFields();$('account-dialog').showModal();$('user-name').focus();}
function renderAssignments(){
  const query=$('assign-search').value.trim().toLowerCase();
  const available=new Set(roomChoices.map(u=>u.uid));
  const choices=[...roomChoices,...[...selectedRoomUids].filter(uid=>!available.has(uid)).map(uid=>({uid,name:'Unavailable room/tablet account',room:'',email:'Remove this selection before saving.',unavailable:true}))];
  const shown=choices.filter(u=>!query||[u.name,u.room,u.email].some(value=>String(value||'').toLowerCase().includes(query)));
  $('assign-options').innerHTML=shown.map(u=>`<label class="assignment-option"><input type="checkbox" data-room-uid="${escape(u.uid)}"${selectedRoomUids.has(u.uid)?' checked':''}><span><strong>${escape(u.room?'Room '+u.room:u.name)}</strong><small>${escape(u.room?u.name:'')}${u.room&&u.name?' · ':''}${escape(u.email)}</small></span>${u.disabled?'<span class="tag disabled">Disabled</span>':''}</label>`).join('');
  $('assign-empty').hidden=!!shown.length;$('assign-count').textContent=`${selectedRoomUids.size} selected`;
}
async function openAssignments(user){
  assignmentTarget=user;selectedRoomUids=new Set(user.assignedRoomUids||[]);roomChoices=[];
  $('assign-search').value='';$('assign-identity').textContent=`${user.name||user.email} · ${user.email}`;$('assign-error').textContent='Loading all room/tablet accounts…';
  $('assign-options').replaceChildren();$('assign-empty').hidden=true;$('assign-count').textContent=`${selectedRoomUids.size} selected`;$('assign-save').disabled=true;$('assign-clear').disabled=true;
  $('assign-dialog').showModal();const version=sessionVersion,opening=++assignmentLoadVersion;let pageToken;
  try{
    do{
      const result=await client.call({action:'listRooms',...(pageToken?{pageToken}:{})});
      if(version!==sessionVersion||opening!==assignmentLoadVersion||!$('assign-dialog').open)return;
      roomChoices.push(...result.users.filter(u=>!roomChoices.some(old=>old.uid===u.uid)));pageToken=result.nextPageToken;
    }while(pageToken);
    roomChoices.sort((a,b)=>a.room.localeCompare(b.room,undefined,{numeric:true})||a.email.localeCompare(b.email));
    renderAssignments();$('assign-error').textContent='';$('assign-save').disabled=false;$('assign-clear').disabled=false;$('assign-search').focus();
  }catch(error){if(opening===assignmentLoadVersion)$('assign-error').textContent=errorText(error);}
}
$('assign-search').addEventListener('input',renderAssignments);
$('assign-options').addEventListener('change',event=>{
  const input=event.target.closest('input[data-room-uid]');if(!input)return;
  if(input.checked&&selectedRoomUids.size>=100){input.checked=false;$('assign-error').textContent='Select up to 100 accounts.';return;}
  if(input.checked)selectedRoomUids.add(input.dataset.roomUid);else selectedRoomUids.delete(input.dataset.roomUid);
  $('assign-count').textContent=`${selectedRoomUids.size} selected`;$('assign-error').textContent='';
});
$('assign-clear').onclick=()=>{selectedRoomUids.clear();renderAssignments();};
$('assign-cancel').onclick=()=>$('assign-dialog').close();
$('assign-dialog').addEventListener('close',()=>{++assignmentLoadVersion;});
$('assign-form').onsubmit=async event=>{
  event.preventDefault();if(busy||!assignmentTarget)return;
  busy=true;$('assign-save').disabled=true;$('assign-cancel').disabled=true;$('assign-error').textContent='';
  try{
    await client.call({action:'assignRooms',uid:assignmentTarget.uid,assignedRoomUids:[...selectedRoomUids]});
    $('assign-dialog').close();await load();notice('Assignments saved. Staff dashboards and request logs now show only requests from the selected room/tablet accounts.');
  }catch(error){if($('assign-dialog').open)$('assign-error').textContent=errorText(error);else notice('Refresh the account list to check the saved assignments. '+errorText(error),true);}
  finally{busy=false;$('assign-save').disabled=false;$('assign-cancel').disabled=false;}
};
async function resetLink(user){const result=await client.call({action:'resetLink',uid:user.uid});$('reset-email').textContent=result.email;$('reset-link').value=result.link;$('reset-copy').textContent='Copy link';$('reset-dialog').showModal();}
$('sign-in-form').onsubmit=async event=>{event.preventDefault();$('sign-in-submit').disabled=true;notice('Signing in…');try{await client.signIn($('admin-email').value.trim(),$('admin-password').value);$('admin-password').value='';}catch(error){notice(errorText(error),true);}finally{$('sign-in-submit').disabled=false;}};
$('sign-out').onclick=()=>client.signOut().catch(error=>notice(errorText(error),true));
$('new-user').onclick=()=>openAccount();$('account-cancel').onclick=()=>$('account-dialog').close();$('user-role').onchange=roleFields;
$('account-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;$('account-save').disabled=true;$('account-cancel').disabled=true;$('account-error').textContent='';
  const wasEditing=!!editing;
  try{
    const result=await client.call({action:wasEditing?'update':'create',uid:editing?.uid,operationId,name:$('user-name').value,email:$('user-email').value,role:$('user-role').value,room:$('user-room').value});
    $('account-dialog').close();await load();
    notice(wasEditing?'Account updated. Connected tablets receive the new room assignment.':'Account created. Share the password setup link. For staff, use Assign rooms / tablets to give access to requests.');
    if(!wasEditing){try{await resetLink({uid:result.uid});}catch(error){notice('Account created. Password link unavailable: '+errorText(error),true);}}
  }catch(error){if($('account-dialog').open)$('account-error').textContent=errorText(error);else notice('Refresh the account list to check the result. '+errorText(error),true);}finally{busy=false;$('account-save').disabled=false;$('account-cancel').disabled=false;}
};
$('account-rows').onclick=async event=>{
  const button=event.target.closest('button[data-uid]');if(!button||busy)return;const user=users.find(u=>u.uid===button.dataset.uid);if(!user||user.protected)return;
  if(button.dataset.action==='assign'){await openAssignments(user);return;}
  if(button.dataset.action==='edit'){openAccount(user);return;}
  if(button.dataset.action==='disable'&&!confirm(`${user.disabled?'Enable':'Disable'} access for ${user.email}? Request history will be kept.`))return;
  busy=true;button.disabled=true;
  try{if(button.dataset.action==='reset')await resetLink(user);else{await client.call({action:'setDisabled',uid:user.uid,disabled:!user.disabled});await load();notice(user.disabled?'Account enabled.':'Account disabled. Existing request history is preserved.');}}catch(error){notice(errorText(error),true);}finally{busy=false;button.disabled=false;}
};
$('reset-close').onclick=()=>$('reset-dialog').close();$('reset-dialog').addEventListener('close',()=>{$('reset-link').value='';});
$('reset-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('reset-link').value);$('reset-copy').textContent='Copied';}catch{$('reset-link').select();notice('Select and copy the password link manually.');}};
for(const id of ['search','role-filter','access-filter'])$(id).addEventListener('input',render);
for(const [id,more] of [['refresh',false],['load-more',true]])$(id).onclick=async()=>{$(id).disabled=true;try{await load(more);}catch(error){notice(errorText(error),true);}finally{$(id).disabled=false;}};
$('sign-in-submit').disabled=true;
connectAdmin(async(user,api)=>{
  sessionVersion++;client=api;users=[];nextPage=null;render();$('admin-panel').hidden=true;$('sign-in-panel').hidden=false;$('sign-out').hidden=!user;$('sign-in-submit').disabled=false;
  for(const id of ['account-dialog','reset-dialog','assign-dialog'])if($(id).open)$(id).close();
  if(!user){notice('');return;}
  try{await load();}catch(error){notice(errorText(error),true);}
}).catch(error=>notice('Unable to connect: '+errorText(error),true));
