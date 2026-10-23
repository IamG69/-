import schema from './schema.json' with {type:'json'};
import seed from './seed.json' with {type:'json'};
import {exportWorkbook} from './export.js';

const DB_NAME='research-patient-cards';
const STORE='patients';

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'code'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function transaction(mode,action){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);let result;
    try{result=action(store);}catch(error){db.close();reject(error);return;}
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('Операция отменена.'));};
  });
}

const requestValue=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});

async function initialize(){
  const count=await transaction('readonly',store=>requestValue(store.count()));
  if(count)return;
  await transaction('readwrite',store=>{for(const card of Object.values(seed)){const code=card['Пациенты']?.[0]?.['Код пациента'];if(code)store.put({code,sections:card,updatedAt:new Date().toISOString()});}});
}

function cleanPayload(body){
  const code=String(body.code||'').trim();
  if(!code)throw new Error('Укажите код пациента.');
  if(code.length>100)throw new Error('Код пациента слишком длинный.');
  const sections={};
  for(const section of schema){
    const rows=body.sections?.[section.name];
    if(!Array.isArray(rows))throw new Error(`Некорректный раздел «${section.name}».`);
    sections[section.name]=rows.map(row=>{
      const allowed=new Set(section.fields.map(field=>field.name));
      for(const key of Object.keys(row))if(!allowed.has(key))throw new Error(`Неизвестное поле «${key}».`);
      return Object.fromEntries(section.fields.map(field=>[field.name,field.name==='Код пациента'?code:(row[field.name]??'')]));
    });
  }
  const mode=body.mode==='edit'?'edit':'create';
  return {code,mode,sections};
}

async function allCards(){
  await initialize();
  const rows=await transaction('readonly',store=>requestValue(store.getAll()));
  return rows.sort((a,b)=>a.code.localeCompare(b.code,'ru'));
}

window.api=async function api(url,options={}){
  const path=new URL(url,location.href).pathname;
  try{
    if(path.endsWith('/api/schema'))return schema;
    if(path.endsWith('/api/patients')&&(!options.method||options.method==='GET')){
      return (await allCards()).map(row=>row.sections['Пациенты']?.[0]||{'Код пациента':row.code});
    }
    const marker='/api/patients/';
    if(path.includes(marker)&&(!options.method||options.method==='GET')){
      const code=decodeURIComponent(path.slice(path.indexOf(marker)+marker.length));
      const row=await transaction('readonly',store=>requestValue(store.get(code)));
      if(!row)throw new Error('Запись не найдена.');
      return row.sections;
    }
    if(path.endsWith('/api/patients')&&options.method==='POST'){
      const body=cleanPayload(JSON.parse(options.body||'{}'));
      const existing=await transaction('readonly',store=>requestValue(store.get(body.code)));
      if(body.mode==='create'&&existing)throw new Error('Пациент с таким кодом уже существует.');
      if(body.mode==='edit'&&!existing)throw new Error('Запись не найдена.');
      await transaction('readwrite',store=>store.put({code:body.code,sections:body.sections,updatedAt:new Date().toISOString()}));
      return {ok:true};
    }
    throw new Error('Неизвестная операция приложения.');
  }catch(error){
    if(error?.name==='QuotaExceededError')throw new Error('В браузере закончилось место. Скачайте Excel и освободите хранилище сайта.');
    throw error;
  }
};

window.downloadResearchWorkbook=async function(){
  const cards=(await allCards()).map(row=>row.sections);
  const bytes=exportWorkbook(cards);
  const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='research-records.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
};

