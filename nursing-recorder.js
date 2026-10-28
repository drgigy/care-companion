export class NursingRecorder {
 constructor({mediaDevices=globalThis.navigator?.mediaDevices,Recorder=globalThis.MediaRecorder,onTick=()=>{},maxSeconds=120}={}){
  Object.assign(this,{mediaDevices,Recorder,onTick,maxSeconds});this.generation=0;
 }
 async start(){
  const run=++this.generation;if(!this.Recorder||!this.mediaDevices)throw Error('Recording is unavailable in this browser. Use a supported browser with microphone access.');
  const stream=await this.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(run!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
  this.stream=stream;this.chunks=[];this.seconds=0;
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>this.Recorder.isTypeSupported(type));
  try{
   this.recorder=new this.Recorder(stream,mime?{mimeType:mime}:undefined);
   this.result=new Promise((resolve,reject)=>{
    this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
    this.recorder.onerror=()=>{this.cleanup();reject(Error('Recording failed. Please try again.'));};
    this.recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:this.recorder.mimeType||mime||'audio/webm'});this.cleanup();resolve(blob);};
   });
   this.result.catch(()=>{});this.recorder.start(250);this.onTick(0);
   this.timer=setInterval(()=>{this.onTick(++this.seconds);if(this.seconds>=this.maxSeconds)this.onLimit?.();},1000);
   return true;
  }catch(error){this.cleanup();throw error;}
 }
 async stop(){if(this.recorder?.state==='recording')this.recorder.stop();else throw Error('No recording is active.');return this.result;}
 cleanup(){clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 cancel(){++this.generation;if(this.recorder?.state==='recording')this.recorder.stop();this.cleanup();this.chunks=[];}
}
export async function audioPayload(blob){
 if(!blob.size)throw Error('No audio was recorded. Please try again.');
 if(blob.size>6*1024*1024)throw Error('Recording is too large. Record a shorter request.');
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {audio:btoa(binary),mimeType:blob.type.split(';')[0]};
}
export function validateDraft({room,category,summary},categories){
 if(!/^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/.test(room.trim()))throw Error('Enter the dictated room number.');
 if(!categories[category])throw Error('Select the department.');
 if(!summary.trim()||summary.trim().length>500)throw Error('Enter a request of up to 500 characters.');
}
