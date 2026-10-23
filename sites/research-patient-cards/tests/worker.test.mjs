import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import worker,{validatePayload} from '../dist/server/index.js';
const schema=JSON.parse(readFileSync('worker/schema.json','utf8'));
const database=new DatabaseSync(':memory:');database.exec(readFileSync('drizzle/'+readdirSync('drizzle').find(n=>n.endsWith('.sql')),'utf8'));
const DB={prepare(sql){let args=[];const q={bind(...a){args=a;return q},async first(){return database.prepare(sql).get(...args)||null},async all(){return{results:database.prepare(sql).all(...args)}},async run(){const result=database.prepare(sql).run(...args);return{meta:{changes:result.changes}}}};return q},async batch(statements){database.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}};
const request=(path,options)=>worker.fetch(new Request('https://research.example'+path,options),{DB});
const data=()=>({code:'ТЕСТ_ОБЛАКО_001',mode:'create',sections:Object.fromEntries(schema.map(s=>[s.name,s.name==='Пациенты'?[{'Код пациента':'ТЕСТ_ОБЛАКО_001','Дата рождения':'1980-01-02','Индексная дата':'2026-10-23','Пол':'Женский','Рост см':'165,5','СС риск записанный':4,'Группа здоровья записанная':'3б','Статус курения':0}]:[]]))});
async function save(payload){return request('/api/patients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
test('existing fields and approved categories are preserved',()=>{assert.equal(createHash('sha256').update(readFileSync('worker/schema.json')).digest('hex'),'be0079ed278d7225542debf54a56e901ea0bf6b2ea31d48046f903bda2a6d3a1');const c=validatePayload(data());assert.equal(c.sections['Пациенты'][0]['Рост см'],165.5);assert.equal(c.sections['Пациенты'][0]['Масса тела кг'],null);});
test('reject invented fields, values, invalid dates, duplicate related keys',()=>{for(const change of [p=>p.sections['Пациенты'][0]['СС риск записанный']=5,p=>p.sections['Пациенты'][0]['Дата рождения']='2026-02-30',p=>p.sections['Пациенты'][0]['Новое поле']='x',p=>p.sections['Диагнозы']=[{'Код диагноза':'A','Статус диагноза':'new'},{'Код диагноза':'A','Статус диагноза':'new'}]]){const payload=data();change(payload);assert.throws(()=>validatePayload(payload),e=>e.status===422);}});
test('cloud create, duplicate protection, edit, reload and Excel export',async()=>{
 assert.equal((await request('/api/health')).status,200);
 let payload=data();payload.sections['Текст рекомендаций врача']=[{'Исходный текст рекомендаций врача':'ТЕСТ: =SUM(1,2) < > &'}];payload.sections['Рекомендации врача']=[{'Код рекомендации':'BP02','Рекомендовано врачом':1}];
 assert.equal((await save(payload)).status,200);assert.equal((await save(payload)).status,409);
 payload.mode='edit';payload.sections['Пациенты'][0]['СС риск записанный']=3;assert.equal((await save(payload)).status,200);
 const stored=await(await request('/api/patients/'+encodeURIComponent(payload.code))).json();assert.equal(stored['Пациенты'][0]['СС риск записанный'],3);
 assert.equal((await request('/api/patients')).headers.get('Cache-Control'),'no-store');
 const download=await request('/api/export');assert.equal(download.status,200);writeFileSync('/tmp/research-cloud-export.xlsx',Buffer.from(await download.arrayBuffer()));
 assert.equal((await request('/static/app.js')).status,200);assert.equal((await request('/static/api.js')).status,200);
 assert.equal((await request('/api/patients/missing')).status,404);
});
