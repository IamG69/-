import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';

globalThis.indexedDB=indexedDB;
globalThis.window=globalThis;
globalThis.location=new URL('https://example.github.io/-/');
await import('../worker/local-api.js');

test('browser-local storage seeds, creates, edits and reloads records',async()=>{
  const initial=await api('/api/patients');
  assert.equal(initial.length,4);
  const schema=await api('/api/schema');
  const code='ТЕСТ_GITHUB_001';
  const sections=Object.fromEntries(schema.map(section=>[section.name,section.name==='Пациенты'?[{'Код пациента':code,'Пол':'Женский','Дата рождения':'1980-02-03'}]:[]]));
  assert.deepEqual(await api('/api/patients',{method:'POST',body:JSON.stringify({code,mode:'create',sections})}),{ok:true});
  await assert.rejects(()=>api('/api/patients',{method:'POST',body:JSON.stringify({code,mode:'create',sections})}),/уже существует/);
  sections['Пациенты'][0]['Пол']='Мужской';
  await api('/api/patients',{method:'POST',body:JSON.stringify({code,mode:'edit',sections})});
  const stored=await api('/api/patients/'+encodeURIComponent(code));
  assert.equal(stored['Пациенты'][0]['Пол'],'Мужской');
});

