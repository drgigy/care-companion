export {audioPayload,validateDraft} from '/nursing-recorder-real.js';
export class NursingRecorder{
 constructor({onTick=()=>{}}={}){this.onTick=onTick;}
 async start(){this.seconds=0;this.onTick(0);this.timer=setInterval(()=>this.onTick(++this.seconds),1000);return true;}
 async stop(){clearInterval(this.timer);return new Blob(['invented mock audio'],{type:'audio/webm'});}
 cancel(){clearInterval(this.timer);}
}
