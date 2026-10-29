// Current Interactions REST schema; keep the existing patient Live SDK untouched.
export async function transcribeAudio({apiKey,model,audio,mimeType,prompt,fetcher=fetch}){
 const keys=['room','category','summary','transcript','patientLanguage'];
 const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions',{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey,'Api-Revision':'2026-05-20'},signal:AbortSignal.timeout(50000),
  body:JSON.stringify({model,store:false,system_instruction:prompt,input:[{type:'audio',mime_type:mimeType==='audio/mp4'?'audio/m4a':mimeType,data:audio}],response_format:{type:'text',mime_type:'application/json',schema:{type:'object',properties:Object.fromEntries(keys.map(key=>[key,{type:'string'}])),required:keys}}})
 });
 if(!response.ok)throw Error('Transcription service returned '+response.status);
 const result=await response.json();
 const text=(result.steps||[]).filter(step=>step.type==='model_output').flatMap(step=>step.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('');
 if(!text)throw Error('Transcription service returned no text');
 return text;
}
