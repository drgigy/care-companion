// Continuous live voice audio: microphone streams while model audio plays.
// Echo cancellation and server-side activity detection allow natural interruption.
let genaiModulePromise;
function loadGenAI(){
  genaiModulePromise ||= import('https://esm.sh/@google/genai@1.45.0').catch(error=>{genaiModulePromise=null;throw error;});
  return genaiModulePromise;
}
export class LiveCompanion {
  static preload(){loadGenAI().catch(()=>{});}
  static warm(store){
    if(this.tokenPromise)return this.tokenPromise;
    this.tokenPromise=Promise.all([loadGenAI(),store.call('liveToken',{})])
      .then(([module,result])=>({GoogleGenAI:module.GoogleGenAI,result,createdAt:Date.now()}))
      .catch(error=>{this.tokenPromise=null;throw error;});
    return this.tokenPromise;
  }
  static async takeWarmToken(store){
    const warm=this.tokenPromise;
    if(warm){
      this.tokenPromise=null;
      try{
        const prepared=await warm;
        if(Date.now()-prepared.createdAt<50000)return prepared;
      }catch{}
    }
    const [module,result]=await Promise.all([loadGenAI(),store.call('liveToken',{})]);
    return {GoogleGenAI:module.GoogleGenAI,result,createdAt:Date.now()};
  }
  constructor(store,callbacks){this.store=store;this.callbacks=callbacks;this.session=null;this.stream=null;this.inputContext=null;this.outputContext=null;this.sources=new Set();this.nextPlay=0;this.muted=false;this.stopped=false;this.processed=new Map();this.generation=0;this.lastPatientText='';this.endConfirmationAsked=false;this.closingStarted=false;this.closeTimer=null;}
  languageInstruction(languageMode){
    const greetings={
      english:'Welcome to Aster Medicity. How can I assist you?',
      malayalam:'ആസ്റ്റർ മെഡിസിറ്റിയിലേക്ക് സ്വാഗതം. ഞാൻ താങ്കളെ എങ്ങനെയാണ് സഹായിക്കേണ്ടത്?',
      arabic:'مرحباً بكم في أستر ميديسيتي. كيف يمكنني مساعدتك؟'
    };
    const guestRelations='For guest relations complaints, concerns, delays, rude behavior, feedback, or service experience issues only, first respond empathetically in the conversation language with the meaning of: "I am really sorry that this happened. Don’t worry, we will help you. Should I inform Guest Relations about this?" Do not add this extra apology for other categories.';
    if(languageMode==='auto')return `The patient pressed Start. The tablet language is auto. Start in Malayalam with exactly: "${greetings.malayalam}" Then use the patient's main language. Use the configured voice and keep the tone consistent. ${guestRelations} The request_care summary must stay in English.`;
    return `The patient pressed Start. The tablet language is ${languageMode}. Start with exactly this ${languageMode} greeting and do not translate or replace it: "${greetings[languageMode]||greetings.malayalam}" Every spoken reply must be only ${languageMode}. Do not say any English words or English sentences when ${languageMode} is selected, except the English request_care summary that staff will read. In Malayalam mode, never say English fragments such as "Your request", "request sent", "food delivery", or "department"; use Malayalam equivalents. Keep the Aster Medicity welcome, department confirmation, anything-else question, and final thank-you/get-well-soon message in ${languageMode} only, even if the patient uses words from another language. Use the configured female voice and keep the tone consistently calm, empathetic, and hospital-appropriate. Follow the scripted flow exactly: listen, clarify only if needed, ask whether to inform the correct department, wait for confirmation, send the request, ask if anything else is needed, and end only after the patient says no. ${guestRelations} Direct food requests like "എനിക്ക് ചിക്കൻ ബിരിയാണി വേണം" are clear food requests; ask whether to inform the food department, then send category "food" after confirmation. Say the final thank-you/get-well-soon closing only once, immediately before ending. The request_care summary must stay in English.`;
  }
  async start(){
    const generation=++this.generation;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access requires HTTPS or localhost.');
      // Create/resume playback from the Start button gesture before asynchronous setup.
      this.outputContext=new AudioContext({sampleRate:24000});await this.outputContext.resume();
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(this.stopped||generation!==this.generation){this.stream.getTracks().forEach(t=>t.stop());return;}
      const {GoogleGenAI,result}=await LiveCompanion.takeWarmToken(this.store);
      if(this.stopped)return;
      const {token,model,liveConfig}=result.data;const ai=new GoogleGenAI({apiKey:token,httpOptions:{apiVersion:'v1beta'}});
      this.session=await ai.live.connect({model,config:liveConfig,callbacks:{
        onmessage:message=>{this.handle(message).catch(error=>this.callbacks.onError('Conversation error: '+error.message));},
        onerror:()=>{if(!this.stopped)this.callbacks.onError('The voice connection failed. Please start again.');},
        onclose:()=>{if(!this.stopped)this.callbacks.onError('The voice session ended. Start a new conversation to reconnect.');}
      }});
      if(this.stopped){this.session.close();return;}
      this.inputContext=new AudioContext();await this.inputContext.audioWorklet.addModule('mic-worklet.js');await this.inputContext.resume();
      this.microphone=this.inputContext.createMediaStreamSource(this.stream);this.processor=new AudioWorkletNode(this.inputContext,'pcm-capture');
      this.processor.port.onmessage=event=>{
        if(this.stopped||this.muted||!this.session)return;
        const pcm=new Int16Array(event.data.length);for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(Math.max(-1,Math.min(1,event.data[i]))*32767);
        const bytes=new Uint8Array(pcm.buffer);let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
        this.session.sendRealtimeInput({audio:{data:btoa(binary),mimeType:`audio/pcm;rate=${this.inputContext.sampleRate}`}});
      };
      this.microphone.connect(this.processor);this.processor.connect(this.inputContext.destination);
      const languageMode=this.callbacks.languageMode||'auto';
      const instruction=this.languageInstruction(languageMode);
      this.session.sendClientContent({turns:[{role:'user',parts:[{text:instruction}]}],turnComplete:true});
      this.timeout=setTimeout(()=>{if(!this.stopped)this.callbacks.onError('This conversation has reached its session limit. Please start again.');},9*60*1000);
      this.callbacks.onState('Listening to you');
    }catch(error){this.stop();throw error;}
  }
  async handle(message){
    if(this.stopped)return;
    if(message.goAway){this.callbacks.onError('The voice session is ending. Please start again.');return;}
    const content=message.serverContent;
    if(content?.interrupted){this.clearAudio();if(!this.closingStarted)this.callbacks.onState('Listening to you');}
    if(content?.outputTranscription?.text){
      const text=content.outputTranscription.text;this.transcript=(this.transcript||'')+text;
      if(this.isClosingText(this.transcript))this.beginClosingEnd();
    }
    if(content?.inputTranscription?.text&&!this.closingStarted)this.lastPatientText=((this.lastPatientText||'')+' '+content.inputTranscription.text).slice(-320);
    for(const part of content?.modelTurn?.parts||[])if(part.inlineData?.data&&part.inlineData.mimeType?.startsWith('audio/pcm'))this.play(part.inlineData.data);
    if(content?.turnComplete){if(this.transcript){this.noteAssistantTurn(this.transcript);this.callbacks.onText(this.transcript);this.transcript='';}if(!this.closingStarted)this.callbacks.onState('Listening to you');}
    const calls=message.toolCall?.functionCalls||[];
    for(const call of calls){
      if(this.stopped)return;let response;
      if(call.name==='end_conversation'){
        if(this.closingStarted)return;
        if(this.hasPatientEndConfirmation()){response={status:'ending'};this.beginClosingEnd();}
        else {response={status:'needs_patient_confirmation',message:'Do not end yet. Ask whether the patient needs anything else and wait for a clear answer before calling end_conversation.'};this.endConfirmationAsked=true;}
      }
      else if(call.name!=='request_care')response={error:'Unknown tool'};
      else if(this.processed.has(call.id))response=await this.processed.get(call.id);
      else {
        const args=call.args||{};
        if(!['nursing','food','housekeeping','engineering','ipBilling','insurance','it','guestRelations'].includes(args.category)||typeof args.summary!=='string'||!args.summary.trim()||args.summary.length>500||(args.patientLanguage&&!['english','malayalam','arabic','other'].includes(args.patientLanguage)))response={error:'Invalid category, summary, or language. Ask the patient to clarify.'};
        else {const work=this.callbacks.onRequest(args);this.processed.set(call.id,work);response=await work;}
      }
      if(!this.stopped)this.session.sendToolResponse({functionResponses:[{id:call.id,name:call.name,response}]});
    }
  }
  noteAssistantTurn(text){
    const normalized=text.toLowerCase();
    if(this.isClosingText(normalized))this.beginClosingEnd();
    if(/anything else|need anything|okay to stop|ok to stop|stop now|end now|close now|മറ്റെന്തെങ്കിലും|ഇനി എന്തെങ്കിലും|നിർത്തട്ടെ|അവസാനിപ്പിക്കട്ടെ|أي شيء آخر|هل تحتاج|يمكنني الإنهاء|أنهي الآن/.test(normalized))this.endConfirmationAsked=true;
  }
  isClosingText(text){
    const normalized=String(text||'').toLowerCase();
    return /thank you[\s,.!]*get well soon/.test(normalized)||(/നന്ദി/.test(normalized)&&/സുഖ/.test(normalized))||(/شكر|شكراً|شكرًا/.test(normalized)&&/شفاء|العافية|سلامتك/.test(normalized));
  }
  beginClosingEnd(){
    if(this.closingStarted||this.stopped)return;
    this.closingStarted=true;this.muted=true;
    this.stream?.getAudioTracks().forEach(track=>track.enabled=false);
    try{this.session?.sendRealtimeInput({audioStreamEnd:true});}catch{}
    this.callbacks.onState('Conversation ending');
    this.scheduleCloseAfterAudio();
  }
  scheduleCloseAfterAudio(){
    const remaining=this.outputContext?Math.max(1000,(this.nextPlay-this.outputContext.currentTime)*1000+1000):2500;
    clearTimeout(this.closeTimer);
    this.closeTimer=setTimeout(()=>{
      if(this.stopped)return;
      try{this.session?.close();}catch{}
      this.callbacks.onEnd?.({reason:'closing'});
    },Math.min(Math.max(remaining,1000),6500));
  }
  hasPatientEndConfirmation(){
    const text=(this.lastPatientText||'').toLowerCase().trim();
    if(!text)return false;
    if(/(nothing else|no nothing|no thank|that's all|that is all|stop now|end now|close now|you can stop|please stop|മതി|വേണ്ട|ഇല്ല|നിർത്താം|അവസാനിപ്പിക്കാം|لا شكرا|لا شكرًا|خلاص|انتهى|أوقف|اوقف|يمكنك الإنهاء)/.test(text))return true;
    return this.endConfirmationAsked&&/\b(yes|yeah|yep|ok|okay|sure|correct)\b|അതെ|ശരി|نعم|تمام|حسنا|حسنًا/.test(text);
  }
  play(base64){
    if(this.stopped)return;const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const view=new DataView(bytes.buffer),buffer=this.outputContext.createBuffer(1,bytes.length/2,24000),channel=buffer.getChannelData(0);
    for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;
    const source=this.outputContext.createBufferSource();source.buffer=buffer;source.connect(this.outputContext.destination);const time=Math.max(this.outputContext.currentTime,this.nextPlay);this.nextPlay=time+buffer.duration;this.sources.add(source);source.onended=()=>this.sources.delete(source);source.start(time);if(this.closingStarted)this.scheduleCloseAfterAudio();else this.callbacks.onState('Companion is speaking');
  }
  clearAudio(){this.sources.forEach(source=>{try{source.stop();}catch{}});this.sources.clear();this.nextPlay=0;}
  sendText(text){this.session?.sendClientContent({turns:[{role:'user',parts:[{text}]}],turnComplete:true});}
  toggleMute(){this.muted=!this.muted;this.stream?.getAudioTracks().forEach(track=>track.enabled=!this.muted);if(this.muted)this.session?.sendRealtimeInput({audioStreamEnd:true});this.callbacks.onState(this.muted?'Microphone muted':'Listening to you');return this.muted;}
  stop(){this.stopped=true;++this.generation;clearTimeout(this.timeout);clearTimeout(this.closeTimer);this.clearAudio();this.stream?.getTracks().forEach(t=>t.stop());this.microphone?.disconnect();this.processor?.disconnect();this.session?.close();this.inputContext?.close().catch(()=>{});this.outputContext?.close().catch(()=>{});this.session=null;}
}
