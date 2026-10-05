import json
import math
import os
import threading
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

import openpyxl
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT=Path(__file__).resolve().parents[1]
PATH=Path(os.environ.get('RESEARCH_WORKBOOK',ROOT/'data/01_База_исследования_рабочая.xlsx'))
SCHEMA=json.loads((ROOT/'app/schema.json').read_text())
BY_NAME={s['name']:s for s in SCHEMA}
LOCK=threading.RLock()
book=None

@asynccontextmanager
async def lifespan(app):
 global book
 book=openpyxl.load_workbook(PATH)
 yield

app=FastAPI(title='База исследования · тестовая версия',lifespan=lifespan)
app.mount('/static',StaticFiles(directory=ROOT/'app/static'),name='static')

@app.get('/')
def home(): return FileResponse(ROOT/'app/static/index.html')

@app.get('/api/schema')
def schema(): return SCHEMA

def rows(name,code=None):
 s=book[name]; fields=BY_NAME[name]['fields']; result=[]
 for row in s.iter_rows(min_row=2,max_col=s.max_column):
  if row[0].value is None or (code is not None and str(row[0].value)!=code): continue
  record={}
  for f in fields:
   v=row[f['column']-1].value
   if isinstance(v,datetime): v=v.date().isoformat()
   if v is not None and f['type']=='select':
    for option in f['options']:
     if str(option['value'])==str(v): v=option['value']; break
   record[f['name']]=v
  result.append(record)
 return result

@app.get('/api/patients')
def patients():
 with LOCK: return rows('Пациенты')

@app.get('/api/patients/{code}')
def patient(code:str):
 with LOCK:
  found=rows('Пациенты',code)
  if not found: raise HTTPException(404,'Пациент не найден')
  return {s['name']:rows(s['name'],code) for s in SCHEMA}

def clean_row(section,record,code):
 if not isinstance(record,dict): raise HTTPException(422,'Ожидается объект записи')
 fields=BY_NAME[section]['fields']
 if set(record)-{f['name'] for f in fields}: raise HTTPException(422,f'{section}: неизвестные поля')
 result={}
 for f in fields:
  key=f['name']; v=record.get(key)
  if key=='Код пациента':
   if v not in (None,'',code): raise HTTPException(422,'Несовпадение кода пациента')
   v=code
  if v is None or v=='':
   if f['required']: raise HTTPException(422,f'{section}: заполните «{key}»')
   result[key]=None; continue
  try:
   if f['type']=='select':
    options={str(o['value']):o['value'] for o in f['options']}
    if str(v) not in options: raise ValueError()
    v=options[str(v)]
   elif f['type']=='number':
    if isinstance(v,bool): raise ValueError()
    v=float(str(v).replace(',','.'))
    if not math.isfinite(v): raise ValueError()
    if 'exclusive_min' in f and v<=f['exclusive_min']: raise ValueError()
   elif f['type']=='date': v=datetime.strptime(str(v),'%Y-%m-%d')
   else:
    if not isinstance(v,str) or len(v)>32767: raise ValueError()
    v=v.strip()
    if not v and f['required']: raise ValueError()
  except (ValueError,TypeError): raise HTTPException(422,f'{section}: недопустимое значение «{key}»')
  result[key]=v
 return result

@app.post('/api/patients')
def save(payload:dict):
 global book
 if set(payload)-{'code','mode','sections'}: raise HTTPException(422,'Неизвестные параметры')
 code=payload.get('code'); mode=payload.get('mode'); sections=payload.get('sections')
 if not isinstance(code,str) or not code.strip() or len(code)>100 or '/' in code or '\\' in code:
  raise HTTPException(422,'Укажите код пациента (до 100 символов, без / и \\)')
 code=code.strip()
 if mode not in ['create','edit']: raise HTTPException(422,'Неизвестный режим')
 if not isinstance(sections,dict) or set(sections)!=set(BY_NAME): raise HTTPException(422,'Неверный набор разделов')
 cleaned={}
 for name,records in sections.items():
  if not isinstance(records,list) or len(records)>100: raise HTTPException(422,'Не более 100 записей в разделе')
  if not BY_NAME[name]['many'] and len(records)>1: raise HTTPException(422,f'{name}: допускается одна запись')
  if name=='Пациенты' and len(records)!=1: raise HTTPException(422,'Нужна одна запись пациента')
  cleaned[name]=[clean_row(name,r,code) for r in records]
  if name in ['Диагнозы','Рекомендации врача','Второй этап']:
   keys=[tuple(r[f['name']] for f in BY_NAME[name]['fields'] if f['required']) for r in cleaned[name]]
   if len(keys)!=len(set(keys)): raise HTTPException(422,f'{name}: повторяющиеся ключи')
 p=cleaned['Пациенты'][0]
 if p['Дата рождения'] and p['Индексная дата'] and p['Дата рождения']>p['Индексная дата']:
  raise HTTPException(422,'Дата рождения позже индексной даты')
 with LOCK:
  exists=bool(rows('Пациенты',code))
  if mode=='create' and exists: raise HTTPException(409,'Код уже существует. Откройте запись для редактирования.')
  if mode=='edit' and not exists: raise HTTPException(404,'Пациент не найден')
  # Plan all writes before modifying a cell. Never write formula columns.
  changes=[]
  for name,records in cleaned.items():
   s=book[name]; fields=BY_NAME[name]['fields']
   existing=[r for r in range(2,s.max_row+1) if str(s.cell(r,1).value)==code]
   free=[r for r in range(2,s.max_row+1) if s.cell(r,1).value is None]
   available=existing+free
   if len(records)>len(available): raise HTTPException(422,f'{name}: в шаблоне закончились строки')
   for r in existing:
    for f in fields: changes.append((s.cell(r,f['column']),None))
   for r,record in zip(available,records):
    for f in fields: changes.append((s.cell(r,f['column']),record[f['name']]))
  # The supplied template defines the derived doctor-text formula in D2 only.
  # Extend that same structured-reference formula to newly used recommendation rows.
  recommendation_sheet=book['Рекомендации врача']
  reference=recommendation_sheet.cell(2,4)
  if reference.data_type=='f':
   used_rows={cell.row for cell,value in changes if cell.parent.title=='Рекомендации врача' and cell.column==1 and value is not None}
   for row_number in used_rows:
    derived=recommendation_sheet.cell(row_number,4)
    if derived.value is None: changes.append((derived,reference.value))
  undo={id(c):(c,c.value,c.data_type,c.number_format) for c,v in changes}
  temporary=PATH.with_suffix('.tmp')
  try:
   for cell,value in changes:
    cell.value=value
    if isinstance(value,str) and not (cell.parent.title=='Рекомендации врача' and cell.column==4): cell.data_type='s' # user text cannot become an Excel formula
    if isinstance(value,datetime): cell.number_format='yyyy-mm-dd'
   book.calculation=openpyxl.workbook.properties.CalcProperties(fullCalcOnLoad=True)
   book.save(temporary)
   os.replace(temporary,PATH)
  except Exception:
   for cell,value,data_type,fmt in undo.values():
    cell.value=value; cell.data_type=data_type; cell.number_format=fmt
   temporary.unlink(missing_ok=True)
   raise HTTPException(500,'Не удалось сохранить рабочую книгу. Повторите попытку.')
 return {'code':code,'message':'Сохранено в рабочую Excel-копию'}

@app.get('/api/export')
def export():
 with LOCK: content=PATH.read_bytes()
 return Response(content,media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':"attachment; filename=research-test.xlsx"})

@app.get('/api/health')
def health(): return {'status':'ok','storage':'xlsx','test_only':True}
