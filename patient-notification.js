// A bundled recording avoids dependence on Android's installed TTS engines/voices.
export class PatientNotification {
  constructor({createContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),load=()=>fetch(new URL('./assets/request-accepted.wav',import.meta.url)),onError=()=>{}}={}){
    this.createContext=createContext;this.load=load;this.onError=onError;
    this.context=null;this.buffer=null;this.loading=null;this.source=null;this.pending=false;
  }
  async unlock(){
    try{
      if(!this.context||this.context.state==='closed'){this.context=this.createContext();this.buffer=null;this.loading=null;}
      // Call resume synchronously from the pointer/keyboard gesture before fetching.
      const resumed=this.context.resume();
      if(!this.loading)this.loading=this.load().then(response=>{if(!response.ok)throw Error('Voice recording unavailable');return response.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{this.buffer=buffer;}).catch(error=>{this.loading=null;throw error;});
      await Promise.all([resumed,this.loading]);
      this.flush();
    }catch{if(this.pending)this.onError();}
  }
  play(){this.pending=true;void this.unlock();}
  flush(){
    if(!this.pending||!this.buffer||this.context.state!=='running'||this.source)return;
    this.pending=false;
    const source=this.context.createBufferSource();source.buffer=this.buffer;source.connect(this.context.destination);this.source=source;
    source.onended=()=>{source.disconnect();if(this.source===source)this.source=null;this.flush();};
    source.start();
  }
  stop(){this.pending=false;if(this.source){this.source.onended=null;try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}}
}
