import {canAccept,canComplete} from '../access.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {categories,statuses,escapeHTML} from '../shared.js';
import {categoryPages,dashboardCategory,scopeRequests} from '../dashboard-scope.js';
assert.deepEqual(Object.keys(categoryPages),Object.keys(categories),'every category has a page');
assert.throws(()=>dashboardCategory('invalid'),/Unknown/);
const source=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const rows=Object.keys(categories).flatMap((category,i)=>['new','in-progress','completed'].map((status,j)=>({id:`${category}-${status}`,category,status,room:String(200+i),summary:`${category} request ${j}`,createdAt:Date.now()-60000,acknowledgedAt:j?Date.now():null,completedAt:j===2?Date.now():null})));
for(const category of [null,...Object.keys(categories)]){
  const file=category?categoryPages[category]:'dashboard.html';
  const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  if(category)assert.ok(html.includes(`data-category="${category}"`));
  assert.ok(html.includes('id="login-form"')&&html.includes('id="sound"'));
  let subscribe,authState,alertRows=[],alerts=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',open:false,value:'',classList:{add(){},remove(){},contains(){return false;},toggle(){}},setAttribute(){},querySelectorAll(){return [];},querySelector(){return {textContent:''};},showModal(){this.open=true;},close(){this.open=false;},focus(){}});return nodes.get(id);};
  const context=vm.createContext({canAccept,canComplete,categories,statuses,escapeHTML,categoryPages,dashboardCategory,scopeRequests,$:node,toast:message=>alerts.push(message),CareStore:class{constructor(){this.profile={role:'administrator',uid:'admin',assignedRoomUids:['room']};}subscribe(fn){subscribe=fn;}},RequestAlert:class{setRequests(value){alertRows=value;}},setupAccount:(store,fn)=>{authState=fn;return async()=>{};},document:{body:{dataset:{category:category||''},classList:node('body').classList},addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){},location:{}},navigator:{},setTimeout(){},setInterval(){}});
  vm.runInContext(source,context);
  subscribe(rows);
  const expected=scopeRequests(rows,category);
  assert.deepEqual(alertRows,expected,`${file}: alert input is scoped`);
  assert.equal(node('new-count').textContent,category?1:8);
  assert.equal(node('progress-count').textContent,category?1:8);
  assert.equal(node('done-count').textContent,category?1:8);
  vm.runInContext("openAck('nursing-new')",context);
  for(const key of Object.keys(categories))assert.equal(node('ack-request-list').innerHTML.includes(`${key}-new`),!category||key===category,`${file}: acceptance choices scoped`);
  node('completed-filter').onclick();
  for(const key of Object.keys(categories))assert.equal(node('request-list').innerHTML.includes(`${key} request 2`),!category||key===category,`${file}: completed list scoped`);
  const other=category==='nursing'?'food':'nursing';
  subscribe([...rows,{...rows.find(r=>r.category===other),id:'other-arrival'}]);
  assert.equal(alerts.length,category?0:1,`${file}: other-category toast excluded`);
  const accepted=rows.map(r=>!category||r.category===category?{...r,status:'in-progress'}:r);
  subscribe(accepted);
  assert.ok(!alertRows.some(r=>r.status==='new'),`${file}: other categories cannot keep alarm ringing`);
  if(!category){
    for(const mode of ['accept','complete']){
      const initial=mode==='accept'?'new':'in-progress';
      subscribe(rows);vm.runInContext(`openAck('nursing-${initial}', '${mode}')`,context);
      node('ack-employee-id').value='EMP42';
      subscribe(rows.map(r=>r.id===`nursing-${initial}`?{...r,status:mode==='accept'?'in-progress':'completed'}:r));
      assert.equal(vm.runInContext('ackId',context),null,'must not silently select another request');
      assert.equal(node('ack-employee-id').value,'');assert.equal(node('ack-save').disabled,true);
      assert.match(node('ack-error').textContent,/changed/);
    }
  }
  authState({role:'departmentAdmin',department:'food'});
  assert.ok(!node('dashboard-select').innerHTML.includes('All departments'));
  authState(null);authState({role:'staff'});
  assert.ok(node('dashboard-select').innerHTML.includes('All departments'));
  assert.ok(node('dashboard-select').innerHTML.includes('Housekeeping'));
  authState(null);assert.equal(alertRows.length,0,'sign-out clears alarm');
}
console.log('Passed: all eight category pages and all-category dashboard; scoped counts, completed requests, acceptance choices, arrival notifications and alert inputs; sign-out cleanup.');
