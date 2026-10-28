import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const base='4f78080591724996ef24ca49436df6adef443a63';
for(const path of ['index.html','patient.js','styles.css','shared.js','voice.js','mic-worklet.js','config.js','patient-notification.js','functions/script.js']){
 assert.equal(readFileSync(path,'utf8'),execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),path+' must remain unchanged');
}
const old=execFileSync('git',['show',base+':functions/index.js'],{encoding:'utf8'}),now=readFileSync('functions/index.js','utf8');
const patientFunction=s=>s.slice(s.indexOf('export const liveToken='),s.indexOf('export const masterAdmin='));
assert.equal(patientFunction(now),patientFunction(old),'patient voice backend stays unchanged');
console.log('Passed: patient HTML, styles, scripts, Firebase config and liveToken function are byte-for-byte unchanged.');
