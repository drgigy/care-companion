import assert from 'node:assert/strict';
import {config} from '../config.js';
import {CareStore,guessCategory,escapeHTML} from '../shared.js';
import {LiveCompanion} from '../voice.js';
config.mode='demo';
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};globalThis.window={addEventListener(){}};
const patient=new CareStore('patient'),staff=new CareStore('dashboard');await patient.init(()=>{});await staff.init(()=>{});
assert.equal(patient.profile.room,'201');
await patient.create('food','Glass of water','stable-id');await patient.create('food','Glass of water','stable-id');staff.readDemo();assert.equal(staff.items.length,1,'Retry must not duplicate request');
await assert.rejects(staff.create('food','Unauthorized request'),/room account/);
await assert.rejects(patient.update('stable-id','completed'),/Staff access/);
await assert.rejects(staff.update('stable-id','completed','EMP7'),/status already changed/);
await staff.update('stable-id','in-progress','EMP7');await assert.rejects(staff.update('stable-id','completed','EMP7'),/status already changed/);await patient.completeAtRoom('stable-id','Anu Mathew','EMP42');patient.readDemo();assert.equal(patient.items[0].status,'completed');assert.ok(patient.items[0].acknowledgedAt);assert.equal(patient.items[0].acknowledgedByEmployeeId,'EMP7');assert.ok(patient.items[0].completedAt);assert.equal(patient.items[0].completedByName,'Anu Mathew');assert.equal(patient.items[0].completedByEmployeeId,'EMP42');
await patient.login('','','305');await patient.create('housekeeping','Clean the spill','other-room');staff.readDemo();assert.equal(staff.items.find(r=>r.id==='other-room').room,'305');assert.equal(staff.items.find(r=>r.id==='stable-id').room,'201');
assert.equal(guessCategory('nurse please'),'nursing');assert.equal(guessCategory('clean the spilled drink'),'housekeeping');assert.equal(guessCategory('AC repair'),'engineering');assert.equal(guessCategory('a glass of water'),'food');assert.equal(guessCategory('IP billing estimate'),'ipBilling');assert.equal(guessCategory('insurance approval'),'insurance');assert.equal(guessCategory('wifi password'),'it');assert.equal(guessCategory('I want to register a complaint'),'guestRelations');assert.equal(guessCategory('something else'),null);assert.equal(escapeHTML('<img src=x>'),'&lt;img src=x&gt;');
let calls=0,responses=[];const live=new LiveCompanion(patient,{onText(){},onState(){},onRequest:async()=>{calls++;return {status:'sent'};}});live.session={sendToolResponse:value=>responses.push(value)};
const event={toolCall:{functionCalls:[{id:'one',name:'request_care',args:{category:'food',summary:'Water'}}]}};await live.handle(event);await live.handle(event);assert.equal(calls,1,'Repeated Live tool ID must not send twice');assert.equal(responses.length,2);
await live.handle({toolCall:{functionCalls:[{id:'invalid',name:'request_care',args:{category:'bad',summary:'Water'}}]}});assert.equal(calls,1);assert.ok(responses.at(-1).functionResponses[0].response.error);
let stopped=0;live.sources.add({stop(){stopped++;}});await live.handle({serverContent:{interrupted:true}});assert.equal(stopped,1);assert.equal(live.sources.size,0,'Barge-in must stop queued playback');
console.log('Passed: room assignment, request retry, role enforcement, forward status transitions, classification, escaping, Live tool deduplication and interruption cleanup.');


// Exercise startup with controlled devices/network; no credentials or live service.
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const originalPrepare=LiveCompanion.prepareToken;
let issued=0;
LiveCompanion.prepareToken=async()=>({createdAt:Date.now(),result:{data:{}},serial:++issued});
LiveCompanion.tokenStore=patient;LiveCompanion.tokenPromise=Promise.resolve({createdAt:Date.now()-51000});
assert.equal((await LiveCompanion.takeWarmToken(patient)).serial,1,'Expired warm tokens must be replaced');
LiveCompanion.tokenPromise=Promise.reject(Error('prefetch failed'));
assert.equal((await LiveCompanion.takeWarmToken(patient)).serial,2,'Failed prefetch must retry at Start');
await LiveCompanion.warm(patient);await LiveCompanion.takeWarmToken(patient);
assert.equal(issued,3,'Fresh prefetch must be consumed once');
await LiveCompanion.takeWarmToken(patient);assert.equal(issued,4,'One-use tokens must not be reused');

const devices={};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:devices}});
let contexts=[];
globalThis.AudioContext=class {
  constructor(){this.sampleRate=24000;this.currentTime=0;this.destination={};this.closed=false;this.audioWorklet={addModule:async()=>{}};contexts.push(this);}
  async resume(){} async close(){this.closed=true;}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
  createBuffer(channels,length){return {duration:length/24000,getChannelData:()=>new Float32Array(length)};}
  createBufferSource(){return {connect(){},start(){},stop(){}};}
};
globalThis.AudioWorkletNode=class {constructor(){this.port={};}connect(){}disconnect(){}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function mockStream(){const track={stopped:false,stop(){this.stopped=true;}};return {track,getTracks:()=>[track],getAudioTracks:()=>[track]};}
let connection,closedSessions=0,greetings=0,tokenStarted=false,stages=[],timings=[];
class FakeAI {constructor(){this.live={connect:()=>connection.promise};}}
function token(createdAt=Date.now()){return {GoogleGenAI:FakeAI,createdAt,result:{data:{token:'test-only',model:'unchanged',liveConfig:{}}}};}
const fakeSession=()=>({close(){closedSessions++;},sendClientContent(){greetings++;}});
LiveCompanion.tokenPromise=null;
LiveCompanion.prepareToken=async()=>{tokenStarted=true;return token();};
const callbacks={onStartup:stage=>stages.push(stage),onTiming:t=>timings.push(t),onState(){},onError:message=>{throw Error(message);}};
let permission=deferred();devices.getUserMedia=()=>permission.promise;connection=deferred();
let startup=new LiveCompanion(patient,callbacks);let pending=startup.start();
assert.equal(tokenStarted,true,'Token fetch must start without waiting for microphone permission');
startup.stop();const cancelledStream=mockStream();permission.resolve(cancelledStream);await pending;
assert.equal(cancelledStream.track.stopped,true,'Stop during permission must release a late microphone');
assert.ok(contexts.every(context=>context.closed),'Cancelled setup must close audio contexts');

// A token that aged while permission was open must be refreshed before connect.
let refreshed=0;LiveCompanion.tokenStore=patient;LiveCompanion.tokenPromise=Promise.resolve(token());
permission=deferred();startup=new LiveCompanion(patient,callbacks);pending=startup.start();
await flush(); // token consumed; permission still pending
// Control the prepared token clock without a real 50 second wait.
const realNow=Date.now;Date.now=()=>realNow()+60000;
LiveCompanion.prepareToken=async()=>{refreshed++;return token();};
const stream=mockStream();permission.resolve(stream);await flush();
assert.equal(refreshed,1,'Permission delay must trigger token refresh before connecting');
Date.now=realNow;
startup.stop();connection.resolve(fakeSession());await pending;
assert.equal(closedSessions,1,'Stop during connect must close a late session');
assert.equal(greetings,0,'Cancelled sessions must never send a greeting');
assert.equal(stream.track.stopped,true);

// A successful setup waits for greeting audio before showing speaking/listening.
stages=[];timings=[];connection=deferred();devices.getUserMedia=async()=>mockStream();
const states=[];startup=new LiveCompanion(patient,{...callbacks,onState:state=>states.push(state)});
pending=startup.start();await flush();connection.resolve(fakeSession());await pending;
assert.deepEqual(stages,['preparing','connecting','greeting']);assert.equal(greetings,1);assert.deepEqual(states,[]);
startup.play(btoa(String.fromCharCode(0,0)));
assert.equal(states.at(-1),'Companion is speaking');
assert.equal(timings.filter(t=>t.stage==='first_audio_scheduled').length,1);
startup.play(btoa(String.fromCharCode(0,0)));
assert.equal(timings.filter(t=>t.stage==='first_audio_scheduled').length,1,'Measure first audio only once');
startup.stop();

// Failure in a parallel startup branch also stops late-arriving microphone tracks.
permission=deferred();devices.getUserMedia=()=>permission.promise;
LiveCompanion.prepareToken=async()=>{throw Error('token unavailable');};
startup=new LiveCompanion(patient,callbacks);await assert.rejects(startup.start(),/token unavailable/);
const lateStream=mockStream();permission.resolve(lateStream);await flush();assert.equal(lateStream.track.stopped,true);
LiveCompanion.prepareToken=originalPrepare;LiveCompanion.tokenPromise=null;LiveCompanion.tokenStore=null;
console.log('Passed: concurrent startup, stale/failed/one-use tokens, permission-delay refresh, cancellation, failure cleanup and first-audio timing.');

// Avatar motion follows playback time and stops immediately on interruption.
let frameId=0;const frames=new Map(),audioLevels=[];
globalThis.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const audioAvatar=new LiveCompanion(patient,{onAudioLevel:level=>audioLevels.push(level),onState(){}});
audioAvatar.outputContext={currentTime:0};
const runFrame=()=>{const [id,callback]=frames.entries().next().value;frames.delete(id);callback();};
audioAvatar.queueAvatarAudio(new Float32Array(960).fill(.1),1);
runFrame();assert.equal(audioLevels.at(-1),0,'Queued future speech must not animate the mouth yet');
audioAvatar.outputContext.currentTime=1.005;runFrame();assert.ok(audioLevels.at(-1)>.6,'Playing speech must drive mouth movement');
audioAvatar.clearAudio();assert.equal(audioLevels.at(-1),0);assert.equal(frames.size,0,'Interruption cancels avatar frames');
audioAvatar.queueAvatarAudio(new Float32Array(480),2);audioAvatar.outputContext.currentTime=3;runFrame();
assert.equal(audioLevels.at(-1),0);assert.equal(frames.size,0,'Finished audio must leave no animation loop running');
console.log('Passed: avatar playback alignment, interruption reset and animation cleanup.');
const playbackStates=[];
const playbackAvatar=new LiveCompanion(patient,{onState:state=>playbackStates.push(state),onText(){}});
playbackAvatar.outputContext=new AudioContext();playbackAvatar.play(btoa(String.fromCharCode(0,0)));
await playbackAvatar.handle({serverContent:{turnComplete:true}});
assert.equal(playbackStates.at(-1),'Companion is speaking','Turn completion must not show listening while audio remains queued');
[...playbackAvatar.sources][0].onended();assert.equal(playbackStates.at(-1),'Listening to you','Listening resumes after playback drains');
playbackAvatar.stop();
console.log('Passed: speaking state persists until queued playback ends.');
