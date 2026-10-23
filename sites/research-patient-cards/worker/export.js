import {zipSync,strToU8} from 'fflate';
import schema from './schema.json' with {type:'json'};
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function letter(n){let out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}
function cell(value,row,col,type){const ref=letter(col)+row;if(value===null||value===undefined||value==='')return `<c r="${ref}"/>`;
 if(type==='date'){const day=(Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;return `<c r="${ref}" s="1"><v>${day}</v></c>`;}
 if(typeof value==='number')return `<c r="${ref}"><v>${value}</v></c>`;
 return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
export function exportWorkbook(cards){
 const files={};const sheets=[];const relations=[];const types=[];
 const contentTypes='http://schemas.openxmlformats.org/package/2006/content-types';
 const ss='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const textByCode=new Map(cards.flatMap(c=>(c['Текст рекомендаций врача']||[]).map(r=>[r['Код пациента'],r['Исходный текст рекомендаций врача']])));
 schema.forEach((section,index)=>{const id=index+1;const fields=[...section.fields];
  if(section.name==='Рекомендации врача')fields.push({name:'Исходный текст рекомендаций врача',column:4,type:'text'});
  const records=cards.flatMap(c=>c[section.name]||[]);let data='<row r="1">'+fields.map(f=>cell(f.name,1,f.column,'text')).join('')+'</row>';
  records.forEach((record,i)=>{data+=`<row r="${i+2}">`+fields.map(f=>cell(f.name==='Исходный текст рекомендаций врача'&&section.name==='Рекомендации врача'?textByCode.get(record['Код пациента']):record[f.name],i+2,f.column,f.type)).join('')+'</row>';});
  files[`xl/worksheets/sheet${id}.xml`]=strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ss}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${fields.map(f=>`<col min="${f.column}" max="${f.column}" width="24" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A1:${letter(fields.length)}${Math.max(1,records.length+1)}"/></worksheet>`);
  sheets.push(`<sheet name="${xml(section.name)}" sheetId="${id}" r:id="rId${id}"/>`);
  relations.push(`<Relationship Id="rId${id}" Type="${rel}/worksheet" Target="worksheets/sheet${id}.xml"/>`);
  types.push(`<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
 });
 files['[Content_Types].xml']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${contentTypes}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${types.join('')}</Types>`);
 files['_rels/.rels']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
 files['xl/workbook.xml']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ss}" xmlns:r="${rel}"><sheets>${sheets.join('')}</sheets></workbook>`);
 files['xl/_rels/workbook.xml.rels']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}<Relationship Id="rIdStyles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`);
 files['xl/styles.xml']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ss}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
 return zipSync(files,{level:6});
}
