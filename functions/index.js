import {createTranscriptionHandler} from './transcription.js';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret,defineString} from 'firebase-functions/params';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createAdminHandler} from './admin.js';
import {authorizeNursing,createNursingRequestHandler} from './nursing.js';
import {nursingScript,nursingRequestTool,nursingEndTool} from './nursing-script.js';
import {GoogleGenAI} from '@google/genai';
import {conversationScript,requestTool,endConversationTool} from './script.js';
initializeApp();const db=getFirestore();const geminiKey=defineSecret('GEMINI_API_KEY');
const liveModel='gemini-3.8-live';
const liveVoice='Aoede';
// Set ALLOWED_ORIGINS to the exact production frontend origin at deployment.
const origins=defineString('ALLOWED_ORIGINS',{default:'http://localhost:8765'});
export const liveToken=onCall({secrets:[geminiKey],region:'asia-south1',maxInstances:10},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to the room tablet first.');
  const origin=request.rawRequest.headers.origin;
  if(!origin||!origins.value().split(',').map(s=>s.trim()).includes(origin))throw new HttpsError('permission-denied','This frontend origin is not allowed.');
  const uid=request.auth.uid;const profile=await db.doc(`profiles/${uid}`).get();
  if(!profile.exists||profile.data().role!=='room'||profile.data().disabled===true||!profile.data().room)throw new HttpsError('permission-denied','A configured room account is required.');
  const liveConfig={
    responseModalities:['AUDIO'],
    speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:liveVoice}}},
    // Finish short replies even when TV or nearby speech triggers activity detection.
    realtimeInputConfig:{
      activityHandling:'NO_INTERRUPTION',
      automaticActivityDetection:{
        disabled:false,
        startOfSpeechSensitivity:'START_SENSITIVITY_LOW',
        endOfSpeechSensitivity:'END_SENSITIVITY_LOW',
        prefixPaddingMs:200,
        silenceDurationMs:700
      }
    },
    inputAudioTranscription:{},outputAudioTranscription:{},
    systemInstruction:conversationScript,
    tools:[{functionDeclarations:[requestTool,endConversationTool]}]
  };
  try{
    const ai=new GoogleGenAI({apiKey:geminiKey.value(),httpOptions:{apiVersion:'v1beta'}});
    const token=await ai.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+10*60000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),liveConnectConstraints:{model:liveModel,config:liveConfig}}});
    return {token:token.name,model:liveModel,liveConfig};
  }catch{throw new HttpsError('unavailable','The voice service is unavailable. Please try again or use a direct request.');}
});

export const masterAdmin=onCall({region:'asia-south1',maxInstances:3},createAdminHandler({db,auth:getAuth(),allowedOrigins:()=>origins.value()}));

const nursingDeps={db,auth:getAuth(),allowedOrigins:()=>origins.value()};
export const nursingRequest=onCall({region:'asia-south1',maxInstances:10},createNursingRequestHandler(nursingDeps));
export const nursingLiveToken=onCall({secrets:[geminiKey],region:'asia-south1',maxInstances:10},async request=>{
  await authorizeNursing(nursingDeps,request);
  const liveConfig={responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:liveVoice}}},
    realtimeInputConfig:{activityHandling:'NO_INTERRUPTION',automaticActivityDetection:{disabled:false,startOfSpeechSensitivity:'START_SENSITIVITY_LOW',endOfSpeechSensitivity:'END_SENSITIVITY_LOW',prefixPaddingMs:200,silenceDurationMs:700}},
    inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:nursingScript,
    tools:[{functionDeclarations:[nursingRequestTool,nursingEndTool]}]};
  try{
    const ai=new GoogleGenAI({apiKey:geminiKey.value(),httpOptions:{apiVersion:'v1beta'}});
    const token=await ai.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+10*60000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),liveConnectConstraints:{model:liveModel,config:liveConfig}}});
    return {token:token.name,model:liveModel,liveConfig};
  }catch{throw new HttpsError('unavailable','The nursing voice service is unavailable. Please try again.');}
});

const transcriptionModel=defineString('NURSING_TRANSCRIPTION_MODEL',{default:'gemini-3.8-flash'});
export const nursingTranscribe=onCall({secrets:[geminiKey],region:'asia-south1',maxInstances:5,timeoutSeconds:60},createTranscriptionHandler({...nursingDeps,transcribe:async({audio,mimeType,prompt})=>{
 const ai=new GoogleGenAI({apiKey:geminiKey.value()});
 const result=await ai.interactions.create({model:transcriptionModel.value(),store:false,system_instruction:prompt,input:[{type:'audio',mime_type:mimeType==='audio/mp4'?'audio/m4a':mimeType,data:audio}],response_mime_type:'application/json',response_format:{type:'object',properties:Object.fromEntries(['room','category','summary','transcript','patientLanguage'].map(key=>[key,{type:'string'}])),required:['room','category','summary','transcript','patientLanguage']}});
 return result.output_text||(result.outputs||[]).filter(part=>part.type==='text').map(part=>part.text).join('');
}}));
