import {LiveCompanion} from './voice.js?v=mic-20261019';
export class NursingCompanion extends LiveCompanion {
  constructor(store,callbacks){
    super(store,{...callbacks,onRequest:async args=>{
      if(this.requestSent)return {status:'failed',error:'The confirmed request was already sent. Thank the nurse and close.'};
      const response=await callbacks.onRequest(args);
      if(response?.status==='sent'){
        this.requestSent=true;
        // The confirmed request is saved: stop listening before the spoken closing.
        this.muted=true;this.stream?.getAudioTracks().forEach(track=>track.enabled=false);
      }
      return response;
    }});
    this.requestSent=false;this.closingTurnComplete=false;this.closingAudioSeen=false;this.cancelConfirmed=false;
  }
  languageInstruction(language){return `This is the nursing staff chatbot. Start with the usual Aster Medicity greeting in ${language==='auto'?'Malayalam':language}. ${language==='auto'?'Then follow the nurse main language.':'Keep every spoken reply in the selected language.'} Follow the nursing system workflow: get the dictated room and request, repeat room/request/department for confirmation, wait for yes, send once, thank the nurse and close. No anything-else question or get-well-soon wish. Never assume a room number. The request summary must be English.`;}
  isClosingText(){return false;}
  noteAssistantTurn(){if(!this.closingStarted)this.lastPatientText='';}
  hasPatientEndConfirmation(){return this.requestSent||this.cancelConfirmed||/\b(cancel|stop|nothing|no request)\b|വേണ്ട|നിർത്ത|റദ്ദ|إلغاء|توقف|أوقف/.test((this.lastPatientText||'').toLowerCase());}
  async handle(message){
    // Do not send or accept another request after the successful confirmed request.
    if(this.requestSent&&message.toolCall?.functionCalls){message={...message,toolCall:{...message.toolCall,functionCalls:message.toolCall.functionCalls.filter(call=>call.name==='end_conversation')}};}
    const content=message.serverContent;
    if(content?.inputTranscription?.text&&/^(stop|cancel|please stop|നിർത്തുക|വേണ്ട|توقف)[.! ]*$/i.test(content.inputTranscription.text.trim()))this.cancelConfirmed=true;
    if((this.requestSent||this.cancelConfirmed)&&content?.modelTurn?.parts?.some(p=>p.inlineData?.mimeType?.startsWith('audio/pcm')))this.closingAudioSeen=true;
    const finishing=!!content?.turnComplete;
    const wasSent=this.requestSent;
    await super.handle(message);
    if(finishing&&this.closingAudioSeen&&(wasSent||this.closingStarted)){
      this.closingTurnComplete=true;
      if(!this.closingStarted)this.beginClosingEnd();
      else this.scheduleCloseAfterAudio();
    }
  }
  scheduleCloseAfterAudio(){
    if(!this.closingTurnComplete||this.stopped)return;
    clearTimeout(this.closeTimer);
    // Wait for queued closing audio to finish, then precisely one second more.
    const remaining=Math.max(0,(this.nextPlay-(this.outputContext?.currentTime||0))*1000);
    this.closeTimer=setTimeout(()=>{if(this.stopped)return;this.stopped=true;try{this.session?.close();}catch{}this.callbacks.onEnd?.({reason:'closing'});},remaining+1000);
  }
}
