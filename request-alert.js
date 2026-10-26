export const ALERT_INTERVAL_SECONDS=20;
export const ALERT_RING_SECONDS=3;

// The audio device repeats the buffer, so timing does not depend on a browser timer.
export class RequestAlert {
  constructor({createContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),onState=()=>{}}={}){
    this.createContext=createContext;this.onState=onState;this.context=null;this.buffer=null;this.source=null;this.enabled=false;this.pending=false;this.version=0;
  }
  get ready(){return this.context?.state==='running';}
  async setEnabled(enabled){
    this.enabled=enabled;const version=++this.version;
    if(!enabled){this.stop();this.onState();return;}
    try{
      if(!this.context||this.context.state==='closed'){
        this.stop();this.context=this.createContext();this.buffer=null;
        this.context.onstatechange=()=>{this.sync();this.onState();};
      }
      // Called from the Alert sound button to unlock browser audio on tablets.
      await this.context.resume();
      if(version!==this.version)return;
      if(!this.ready)throw Error('Tap Alert sound again to allow audio.');
      this.sync();this.onState();
    }catch(error){if(version!==this.version)return;this.enabled=false;this.stop();this.onState();throw error;}
  }
  setRequests(rows){this.pending=rows.some(row=>row.status==='new');this.sync();}
  async resume(){if(this.enabled&&!this.ready)await this.setEnabled(true);}
  makeBuffer(){
    const rate=this.context.sampleRate,buffer=this.context.createBuffer(1,rate*ALERT_INTERVAL_SECONDS,rate),samples=buffer.getChannelData(0);
    for(let i=0;i<rate*ALERT_RING_SECONDS;i++){
      const t=i/rate,fade=Math.min(1,t/.02,(ALERT_RING_SECONDS-t)/.02),pulse=.75+.25*Math.sin(2*Math.PI*18*t);
      samples[i]=.07*fade*pulse*(Math.sin(2*Math.PI*660*t)+Math.sin(2*Math.PI*880*t));
    }
    return buffer;
  }
  sync(){
    if(!this.enabled||!this.pending){this.stop();return;}
    if(!this.ready||this.source)return;
    this.buffer ||= this.makeBuffer();
    const source=this.context.createBufferSource();source.buffer=this.buffer;source.loop=true;
    source.loopStart=0;source.loopEnd=ALERT_INTERVAL_SECONDS;source.connect(this.context.destination);
    this.source=source;source.start();
  }
  stop(){if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
}
