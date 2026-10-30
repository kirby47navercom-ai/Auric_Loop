const text=(s,max=10000)=>typeof s==='string'&&s.length<=max;
export function validCulture(v){try{return text(v,80)&&v.length>0&&Intl.getCanonicalLocales(v).length===1;}catch{return false;}}
export const presentationAssetTypes={stringtable:{label:'지역화 문자열 테이블',prefix:'ST_',group:'UI'},uistyle:{label:'위젯 스타일',prefix:'US_',group:'UI'}};
export const presentationAssetSuffix={stringtable:'.hbstrings.json',uistyle:'.hbuistyle.json'};
export function createPresentationAsset(kind,name){return kind==='stringtable'?{version:1,name,fallback:'ko',entries:[{key:'Example',translations:[{culture:'ko',text:'예시',one:'',other:''},{culture:'en',text:'Example',one:'',other:''}]}]}:{version:1,name,styles:[{name:'Default',fontSize:24,color:'#e4e9ef',background:'#263443',accent:'#589ad6',radius:4,padding:8,font:''}]};}
export function validPresentationAsset(kind,d){if(d?.version!==1||!text(d.name,80)||!d.name)return false;
  if(kind==='stringtable')return validCulture(d.fallback)&&Array.isArray(d.entries)&&d.entries.length<=100000&&new Set(d.entries.map(e=>e?.key)).size===d.entries.length&&d.entries.every(e=>text(e?.key,120)&&e.key&&Array.isArray(e.translations)&&e.translations.length<=128&&new Set(e.translations.map(t=>t?.culture)).size===e.translations.length&&e.translations.every(t=>validCulture(t?.culture)&&[t.text,t.one,t.other].every(v=>text(v))));
  return kind==='uistyle'&&Array.isArray(d.styles)&&d.styles.length<=256&&new Set(d.styles.map(s=>s?.name)).size===d.styles.length&&d.styles.every(s=>text(s?.name,80)&&s.name&&Number.isFinite(s.fontSize)&&s.fontSize>=6&&s.fontSize<=256&&['color','background','accent'].every(k=>/^#[\da-f]{6}([\da-f]{2})?$/i.test(s[k]))&&Number.isFinite(s.radius)&&s.radius>=0&&s.radius<=512&&Number.isFinite(s.padding)&&s.padding>=0&&s.padding<=512&&text(s.font,500)&&(!s.font||/^Assets\//.test(s.font)&&!s.font.includes('..')));
}
export class LocalizationSystem {
  constructor(read,culture='ko'){this.read=read;this.culture=culture;this.tables=new Map();this.pending=new Map();this.revision=0;}
  setCulture(value){if(!validCulture(value))throw Error('문화권 이름을 확인하세요.');const next=Intl.getCanonicalLocales(value)[0];if(this.culture!==next){this.culture=next;this.revision++;}}
  async load(path){if(!path||this.tables.has(path))return;if(!this.pending.has(path))this.pending.set(path,(async()=>{const table=await this.read(path);if(!validPresentationAsset('stringtable',table))throw Error('문자열 테이블 오류: '+path);this.tables.set(path,{...table,index:new Map(table.entries.map(e=>[e.key,e]))});this.revision++;})().finally(()=>this.pending.delete(path)));await this.pending.get(path);}
  format(table,key,args={},fallback=''){const d=this.tables.get(table),entry=d?.index.get(key);if(!entry)return fallback||key;const culture=this.culture,language=culture.split('-')[0],value=entry.translations.find(t=>t.culture===culture)||entry.translations.find(t=>t.culture===language)||entry.translations.find(t=>t.culture===d.fallback)||entry.translations[0];if(!value)return fallback||key;
    let template=value.text;if(Number.isFinite(args.count)){const plural=new Intl.PluralRules(culture).select(args.count);template=(plural==='one'?value.one:value.other)||template;}
    return template.replace(/\{([\w가-힣]+)(?::(number|percent|date))?\}/g,(_,name,type)=>{const v=Object.hasOwn(args,name)?args[name]:undefined;if(v===undefined)return '{'+name+'}';if(type==='date')return Number.isFinite(v)?new Intl.DateTimeFormat(culture).format(v):String(v);if(typeof v==='number')return new Intl.NumberFormat(culture,type==='percent'?{style:'percent'}:{}).format(v);return String(v);}).slice(0,10000);
  }
  direction(){return ['ar','he','fa','ur'].includes(this.culture.split('-')[0])?'rtl':'ltr';}
  dispose(){this.tables.clear();this.pending.clear();}
}
