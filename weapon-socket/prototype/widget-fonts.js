const documents=new WeakMap();
export function acquireWidgetFont(document,path,fileUrl=p=>p){
 let fonts=documents.get(document);if(!fonts){fonts=new Map();documents.set(document,fonts);}const url=fileUrl(path);let entry=fonts.get(url);
 if(!entry){const face=new document.defaultView.FontFace('hb_ui_'+document.defaultView.crypto.randomUUID().replaceAll('-',''),'url('+JSON.stringify(url)+')');entry={face,refs:0};fonts.set(url,entry);face.load().then(()=>{if(entry.refs>0)document.fonts.add(face);}).catch(()=>{});}
 entry.refs++;let released=false;return{face:entry.face,release(){if(released)return;released=true;if(--entry.refs===0){if(fonts.get(url)===entry)fonts.delete(url);document.fonts.delete(entry.face);}}};
}
