import schema from './schema.json' with {type:'json'};
import seeds from './seed.json' with {type:'json'};
import html from './index.html';
import style from './style.css';
import application from './app.js?raw';
import clientApi from './api.js?raw';
import {exportWorkbook} from './export.js';
const byName=new Map(schema.map(s=>[s.name,s]));
function fail(status,message){throw Object.assign(new Error(message),{status});}
function dateValid(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>0&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validatePayload(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(422,'Ожидается объект записи');
 if(Object.keys(payload).some(k=>!['code','mode','sections'].includes(k)))fail(422,'Неизвестные параметры');
 const {mode,sections}=payload;let {code}=payload;
 if(typeof code!=='string'||!code.trim()||code.length>100||/[\/\\]/.test(code))fail(422,'Укажите код пациента (до 100 символов, без / и \\)');code=code.trim();
 if(!['create','edit'].includes(mode))fail(422,'Неизвестный режим');
 if(!sections||Array.isArray(sections)||typeof sections!=='object'||Object.keys(sections).length!==schema.length||Object.keys(sections).some(k=>!byName.has(k)))fail(422,'Неверный набор разделов');
 const clean={};
 for(const section of schema){const records=sections[section.name];
  if(!Array.isArray(records)||records.length>100)fail(422,'Не более 100 записей в разделе');
  if(!section.many&&records.length>1)fail(422,section.name+': допускается одна запись');
  if(section.name==='Пациенты'&&records.length!==1)fail(422,'Нужна одна запись пациента');
  clean[section.name]=records.map(record=>{
   if(!record||typeof record!=='object'||Array.isArray(record))fail(422,'Ожидается объект записи');
   if(Object.keys(record).some(k=>!section.fields.some(f=>f.name===k)))fail(422,section.name+': неизвестные поля');
   const row={};
   for(const field of section.fields){let v=record[field.name];
    if(field.name==='Код пациента'){if(v!==undefined&&v!==null&&v!==''&&v!==code)fail(422,'Несовпадение кода пациента');v=code;}
    if(v===undefined||v===null||v===''){if(field.required)fail(422,section.name+': заполните «'+field.name+'»');row[field.name]=null;continue;}
    let valid=true;
    if(field.type==='select'){const option=field.options.find(o=>String(o.value)===String(v));if(!option)valid=false;else v=option.value;}
    else if(field.type==='number'){if(!['string','number'].includes(typeof v))valid=false;else{const raw=String(v).replace(',','.');v=Number(raw);valid=raw.trim()!==''&&Number.isFinite(v)&&(!('exclusive_min'in field)||v>field.exclusive_min);}}
    else if(field.type==='date')valid=dateValid(v);
    else{valid=typeof v==='string'&&v.length<=32767&&!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v);if(valid){v=v.trim();if(!v&&field.required)valid=false;}}
    if(!valid)fail(422,section.name+': недопустимое значение «'+field.name+'»');row[field.name]=v;
   }
   return row;
  });
  if(section.many){const keys=clean[section.name].map(row=>JSON.stringify(section.fields.filter(f=>f.required).map(f=>row[f.name])));if(new Set(keys).size!==keys.length)fail(422,section.name+': повторяющиеся ключи');}
 }
 const p=clean['Пациенты'][0];if(p['Дата рождения']&&p['Индексная дата']&&p['Дата рождения']>p['Индексная дата'])fail(422,'Дата рождения позже индексной даты');
 return{code,mode,sections:clean};
}
let init;
async function initialize(db){
 if(!db)fail(503,'Хранилище временно недоступно');
 if(!init)init=(async()=>{
  const done=await db.prepare("SELECT value FROM app_meta WHERE key='seed_v1'").first();
  if(!done){const statements=Object.entries(seeds).map(([code,sections])=>db.prepare('INSERT OR IGNORE INTO patient_cards(code,sections) VALUES(?,?)').bind(code,JSON.stringify(sections)));
   statements.push(db.prepare("INSERT OR IGNORE INTO app_meta(key,value) VALUES('seed_v1','complete')"));await db.batch(statements);}
 })().catch(e=>{init=null;throw e;});
 await init;
}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
const assets=new Map([['/',[html,'text/html']],['/static/style.css',[style,'text/css']],['/static/app.js',[application,'application/javascript']],['/static/api.js',[clientApi,'application/javascript']]]);
export default {async fetch(request,env){try{
 const url=new URL(request.url);const path=url.pathname;
 if(request.method==='GET'&&assets.has(path)){const[body,type]=assets.get(path);return new Response(body,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});}
 if(request.method==='GET'&&path==='/api/schema')return json(schema);
 await initialize(env.DB);
 if(request.method==='GET'&&path==='/api/health'){await env.DB.prepare('SELECT 1').first();return json({status:'ok',storage:'cloud_database',test_only:true});}
 if(request.method==='GET'&&path==='/api/patients'){const{results}=await env.DB.prepare("SELECT sections FROM patient_cards ORDER BY rowid").all();return json(results.map(r=>JSON.parse(r.sections)['Пациенты'][0]));}
 if(request.method==='GET'&&path.startsWith('/api/patients/')){const code=decodeURIComponent(path.slice('/api/patients/'.length));const card=await env.DB.prepare('SELECT sections FROM patient_cards WHERE code=?').bind(code).first();if(!card)fail(404,'Пациент не найден');return json(JSON.parse(card.sections));}
 if(request.method==='POST'&&path==='/api/patients'){
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)fail(403,'Запрос должен быть отправлен из приложения');
  const text=await request.text();if(text.length>3_000_000)fail(413,'Слишком большой объём одной карты');let payload;try{payload=JSON.parse(text);}catch{fail(422,'Неверный формат JSON');}
  const card=validatePayload(payload);let result;
  if(card.mode==='create'){result=await env.DB.prepare('INSERT OR IGNORE INTO patient_cards(code,sections) VALUES(?,?)').bind(card.code,JSON.stringify(card.sections)).run();if(!result.meta.changes)fail(409,'Код уже существует. Откройте запись для редактирования.');}
  else{result=await env.DB.prepare('UPDATE patient_cards SET sections=?,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(JSON.stringify(card.sections),card.code).run();if(!result.meta.changes)fail(404,'Пациент не найден');}
  return json({code:card.code,message:'Сохранено в приложении'});
 }
 if(request.method==='GET'&&(path==='/api/export'||path==='/api/export.json')){const{results}=await env.DB.prepare('SELECT sections FROM patient_cards ORDER BY rowid').all();const cards=results.map(r=>JSON.parse(r.sections));
  if(path.endsWith('.json'))return new Response(JSON.stringify(cards,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename=research-records.json','Cache-Control':'no-store'}});
  return new Response(exportWorkbook(cards),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename=research-records.xlsx','Cache-Control':'no-store'}});
 }
 return json({detail:'Страница не найдена'},404);
 }catch(error){if(!error.status)console.error('Application request failed:',error.message);return json({detail:error.status?error.message:'Не удалось выполнить запрос. Запись не подтверждена; проверьте список перед повтором.'},error.status||500);}}
};
