import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret,defineString} from 'firebase-functions/params';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {GoogleGenAI} from '@google/genai';
import {conversationScript,requestTool} from './script.js';
initializeApp();const db=getFirestore();const geminiKey=defineSecret('GEMINI_API_KEY');
const model=defineString('GEMINI_LIVE_MODEL',{default:'gemini-3.8-live'});
// Set ALLOWED_ORIGINS to the exact production frontend origin at deployment.
const origins=defineString('ALLOWED_ORIGINS',{default:'http://localhost:8765'});
export const liveToken=onCall({secrets:[geminiKey],region:'us-central1',maxInstances:10},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to the room tablet first.');
  const origin=request.rawRequest.headers.origin;
  if(!origin||!origins.value().split(',').map(s=>s.trim()).includes(origin))throw new HttpsError('permission-denied','This frontend origin is not allowed.');
  const uid=request.auth.uid;const profile=await db.doc(`profiles/${uid}`).get();
  if(!profile.exists||profile.data().role!=='room'||!profile.data().room)throw new HttpsError('permission-denied','A configured room account is required.');
  const limitRef=db.doc(`voiceLimits/${uid}`);
  await db.runTransaction(async tx=>{const entry=await tx.get(limitRef);const now=Date.now();if(entry.exists&&now-entry.data().lastIssued.toMillis()<15000)throw new HttpsError('resource-exhausted','Please wait 15 seconds before starting another voice session.');tx.set(limitRef,{lastIssued:Timestamp.fromMillis(now)});});
  const liveConfig={responseModalities:['AUDIO'],inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:conversationScript,tools:[{functionDeclarations:[requestTool]}]};
  try{
    const ai=new GoogleGenAI({apiKey:geminiKey.value(),httpOptions:{apiVersion:'v1beta'}});
    const token=await ai.authTokens.create({config:{uses:1,expireTime:new Date(Date.now()+10*60000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString(),liveConnectConstraints:{model:model.value(),config:liveConfig}}});
    return {token:token.name,model:model.value(),liveConfig};
  }catch{throw new HttpsError('unavailable','The voice service is unavailable. Please try again or use a direct request.');}
});
