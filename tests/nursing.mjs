import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNursingRequestHandler,authorizeNursing} from '../functions/nursing.js';
import {staffRequestQueries,mergeRequestResults} from '../shared.js';
import {NursingCompanion} from '../nursing-voice.js';
import {nursingRequestTool,nursingScript} from '../functions/nursing-script.js';
const profiles=new Map([['nurse',{role:'staff',assignedRoomUids:[]}],['tablet201',{role:'room',room:'201'}],['tablet205',{role:'room',room:'205'}]]);
const requests=new Map();let userDisabled=false;
const snap=path=>{const [collection,id]=path.split('/');const map=collection==='profiles'?profiles:requests;return {id,exists:map.has(id),data:()=>map.get(id)};};
const db={doc:path=>({path,get:async()=>snap(path)}),collection:name=>({where:(field,op,value)=>({name,field,value})}),runTransaction:async fn=>fn({get:async ref=>ref.path?snap(ref.path):{docs:[...profiles].filter(([id,p])=>p[ref.field]===ref.value).map(([id])=>snap('profiles/'+id))},create:(ref,data)=>{assert.ok(!requests.has(ref.path.split('/')[1]));requests.set(ref.path.split('/')[1],data);}})};
const deps={db,auth:{getUser:async()=>({disabled:userDisabled})},allowedOrigins:()=> 'https://carecompanion.woyz.in'};
const handler=createNursingRequestHandler(deps);
const input={requestId:'test-request-001',room:'205',ward:'Neuro Ward',category:'food',summary:'Breakfast requested.',patientLanguage:'malayalam'};
const req=(data=input,uid='nurse',origin='https://carecompanion.woyz.in')=>({data,auth:uid?{uid}:null,rawRequest:{headers:{origin}}});
const reject=(r,code)=>assert.rejects(()=>handler(r),e=>e.code===code);
await reject(req(input,null),'unauthenticated');await reject(req(input,'tablet201'),'permission-denied');await reject(req(input,'nurse','https://evil.test'),'permission-denied');
userDisabled=true;await reject(req(),'permission-denied');userDisabled=false;
profiles.get('nurse').disabled=true;await reject(req(),'permission-denied');profiles.get('nurse').disabled=false;
const result=await handler(req());assert.equal(result.status,'sent');assert.equal(requests.size,1,'staff with zero assigned rooms can submit');
const saved=requests.get(result.requestId);assert.equal(saved.ownerUid,'nursing:nurse');assert.equal(saved.room,'205');assert.equal(saved.submittedByUid,'nurse');assert.equal(saved.patientName,'');assert.equal(saved.uhid,'');assert.equal(saved.status,'new');
await handler(req());assert.equal(requests.size,1,'retry is idempotent');await reject(req({...input,summary:'Changed'}),'already-exists');
for(const update of [{room:''},{ward:'x'.repeat(41)},{category:'invalid'},{requestId:'../../other'},{summary:'x'.repeat(501)}])await reject(req({...input,...update}),'invalid-argument');
// No room-account query is permitted, even for missing, duplicate or disabled rooms.
db.collection=()=>{throw Error('Nursing submissions must not look up room accounts');};
for(const room of ['999','205']){
 const sent=await handler(req({...input,requestId:'unregistered-'+room,room,ward:''}));
 assert.equal(requests.get(sent.requestId).room,room);
 assert.equal(requests.get(sent.requestId).ward,'');
 assert.equal(requests.get(sent.requestId).submittedVia,'nursing-bot');
}
assert.ok(nursingRequestTool.parameters.required.includes('room'));
assert.ok(nursingScript.includes('Wait for an explicit confirmation'));
const querySDK={where:(...args)=>args,query:(ref,...filters)=>filters};
assert.deepEqual(staffRequestQueries(querySDK,'requests',{assignedRoomUids:[]}),[[['submittedVia','==','nursing-bot']]]);
const queries=staffRequestQueries(querySDK,'requests',{assignedRoomUids:['tablet201']});
assert.deepEqual(queries,[[['ownerUid','in',['tablet201']]],[['submittedVia','==','nursing-bot']]]);
const oldNursing={id:'old-nursing',createdAt:1},newNursing={id:'new-nursing',createdAt:2};
assert.deepEqual(mergeRequestResults(new Map([[0,[oldNursing]],[1,[oldNursing,newNursing]]])),[newNursing,oldNursing],'overlapping legacy nursing rows appear once');

const emptyNonClinical={role:'nonClinical',assignedRoomUids:[],assignedStaffUids:[]};
assert.deepEqual(staffRequestQueries(querySDK,'requests',emptyNonClinical),[],'unassigned non-clinical accounts cannot subscribe to global nursing requests');
assert.deepEqual(staffRequestQueries(querySDK,'requests',{...emptyNonClinical,assignedRoomUids:['tablet201'],assignedStaffUids:['nurse']}),[[['ownerUid','in',['tablet201']]],[['submittedByUid','in',['nurse']],['submittedVia','==','nursing-bot']]],'both sources are restricted to selected accounts');
profiles.set('housekeeping',{role:'nonClinical',assignedRoomUids:['tablet201'],assignedStaffUids:['nurse']});
await reject(req(input,'housekeeping'),'permission-denied');
// Exercise the real voice handler with fake audio and timers: no live patient data.
const timers=[];const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
globalThis.setTimeout=(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;};globalThis.clearTimeout=t=>{if(t)t.cancelled=true;};
try{
 let sent=0,ended=0;const track={enabled:true};
 const bot=new NursingCompanion({}, {onRequest:async()=>{sent++;return {status:'sent',room:'205'};},onState(){},onText(){},onEnd(){ended++;}});
 bot.stream={getAudioTracks:()=>[track]};bot.session={sendToolResponse(){},sendRealtimeInput(){},close(){}};bot.outputContext={currentTime:10};bot.nextPlay=12;
 bot.play=()=>{bot.nextPlay=12;};
 const call={id:'c1',name:'request_care',args:{category:'food',summary:'Breakfast',room:'205',patientLanguage:'english'}};
 await bot.handle({toolCall:{functionCalls:[call]}});assert.equal(sent,1);assert.equal(track.enabled,false);assert.equal(bot.muted,true,'no listening during thank-you');
 await bot.handle({serverContent:{turnComplete:true}});assert.equal(timers.length,0,'tool completion alone must not close before spoken thank-you');
 await bot.handle({toolCall:{functionCalls:[{...call,id:'c2'}]}});assert.equal(sent,1,'no duplicate second submission');
 await bot.handle({serverContent:{modelTurn:{parts:[{inlineData:{data:'AAAA',mimeType:'audio/pcm'}}]},outputTranscription:{text:'Thank you.'}}});assert.equal(timers.length,0,'wait for complete closing audio');
 await bot.handle({toolCall:{functionCalls:[{id:'end',name:'end_conversation',args:{reason:'sent'}}]}});assert.equal(timers.length,0);
 await bot.handle({serverContent:{turnComplete:true}});assert.equal(timers.at(-1).ms,3000,'two seconds queued audio plus one second');timers.at(-1).fn();assert.equal(ended,1);
 const failed=new NursingCompanion({}, {onRequest:async()=>({status:'failed'}),onState(){},onText(){}});failed.session={sendToolResponse(){}};failed.stream={getAudioTracks:()=>[{enabled:true}]};await failed.handle({toolCall:{functionCalls:[call]}});assert.equal(failed.requestSent,false);assert.equal(failed.muted,false,'failed save stays open for correction');assert.equal(failed.hasPatientEndConfirmation(),false);
}finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
const html=readFileSync(new URL('../nursing-bot.html',import.meta.url),'utf8');for(const id of ['demo-room','patient-name','patient-uhid'])assert.ok(!html.includes(`id="${id}"`));
console.log('Passed: nursing staff authorization without room assignments; dictated-room routing; no patient details copied; no room-account lookup or ward requirement; idempotent submission; failure stays open; microphone muted after success; closes one second after complete thank-you audio.');
