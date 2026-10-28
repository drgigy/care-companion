import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {NursingRecorder} from '../nursing-recorder.js';
// Execute the real patient list renderer: a remote completion must clear selection.
const patient=readFileSync('patient.js','utf8');
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',querySelectorAll(){return [];}});return nodes.get(id);};
const patientContext=vm.createContext({$:node,rows:[{id:'a',category:'food',summary:'Water',createdAt:0,status:'in-progress'},{id:'b',category:'food',summary:'Tea',createdAt:0,status:'in-progress'}],activeRoomRequests(){return this.rows;},categoryLabel:x=>x,escapeHTML:x=>x,statuses:{'in-progress':'On the way'}});
// Provide a lexical rows binding rather than relying on the VM global receiver.
vm.runInContext('let selectedCompletionId="a"; function activeRoomRequests(){return rows;}',patientContext);
vm.runInContext(patient.slice(patient.indexOf('function renderStaffRequests()'),patient.indexOf("$('staff').onclick=")),patientContext);
node('staff-employee-id').value='EMP42';patientContext.rows=patientContext.rows.slice(1);
vm.runInContext('renderStaffRequests()',patientContext);
assert.equal(vm.runInContext('selectedCompletionId',patientContext),null);assert.equal(node('staff-save').disabled,true);assert.equal(node('staff-employee-id').value,'');assert.match(node('staff-error').textContent,/changed/);
vm.runInContext('selectedCompletionId="b";renderStaffRequests()',patientContext);assert.equal(node('staff-save').disabled,false,'explicit reselection restores completion');
// Real recorder failure propagation + UI recovery with controlled browser adapters.
let stopped=0,errors=0;
class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>this.onstop());}}
const recording=new NursingRecorder({Recorder,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})},onError(){errors++;}});
await recording.start();recording.recorder.state='inactive';recording.recorder.onerror();
assert.equal(errors,1);assert.equal(stopped,1);assert.equal(recording.stream,null);
await assert.rejects(recording.result,/Recording failed/);
recording.cancel();recording.recorder.onerror();assert.equal(errors,1,'stale callbacks after cancellation ignored');
const nursing=readFileSync('nursing-bot.js','utf8');let cancelled=0;
const ui=vm.createContext({$:node,document:{body:{classList:{add(){},remove(){},toggle(){}},dataset:{}}},NursingRecorder:class{constructor(options){ui.options=options;}async start(){return true;}cancel(){cancelled++;}}});
for(const n of ['start']){node(n).setAttribute=()=>{};}
vm.runInContext('let active=false,starting=false,sendBusy=false,attempt=0,live=null,pendingAudio=null,sendPayload=null,draftId=null;const store={profile:{role:"staff"}};',ui);
vm.runInContext(nursing.slice(nursing.indexOf('function status('),nursing.indexOf('async function transcribe(')),ui);
await vm.runInContext('start()',ui);assert.equal(vm.runInContext('active',ui),true);
ui.options.onError(Error('Recording failed. Please record again.'));
assert.equal(vm.runInContext('active',ui),false);assert.equal(node('mic-action-label').textContent,'Start');assert.equal(node('start').disabled,false);assert.match(node('voice-startup').textContent,/Recording failed/);assert.equal(cancelled,1);
await vm.runInContext('start()',ui);assert.equal(vm.runInContext('active',ui),true,'can record again after failure');
vm.runInContext('end()',ui);
console.log('Passed: patient selection invalidation and explicit reselection; recorder error cleanup, UI reset and restart.');
