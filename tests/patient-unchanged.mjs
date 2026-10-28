import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const base='4f78080591724996ef24ca49436df6adef443a63';
for(const path of ['voice.js','mic-worklet.js','config.js','patient-notification.js','functions/script.js']){
 assert.equal(readFileSync(path,'utf8'),execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),path+' must remain unchanged');
}
const old=execFileSync('git',['show',base+':functions/index.js'],{encoding:'utf8'}),now=readFileSync('functions/index.js','utf8');
const patientFunction=s=>s.slice(s.indexOf('export const liveToken='),s.indexOf('export const masterAdmin='));
assert.equal(patientFunction(now),patientFunction(old),'patient voice backend stays unchanged');
const before=p=>execFileSync('git',['show',base+':'+p],{encoding:'utf8'});
const patient=readFileSync('patient.js','utf8');
const flow=s=>s.slice(s.indexOf('const store='),s.indexOf('const initialize=setupAccount'));
assert.equal(flow(patient),flow(before('patient.js')),'patient conversation and request flow unchanged');
const shared=readFileSync('shared.js','utf8');
assert.equal(shared.split('export function setupAccount')[0],before('shared.js').split('export function setupAccount')[0],'patient storage and request operations unchanged');
assert.ok(readFileSync('styles.css','utf8').startsWith(before('styles.css')),'existing styles unchanged; signout override appended');
console.log('Passed: patient conversation, requests, backend and config unchanged; authorised settings-only changes allowed.');
