// SVS Admin meeting editor: client-side drafts only; never writes to Google Sheets.
(()=>{
const $=id=>document.getElementById(id);
const state={agenda:[],seen:new Set(),incoming:[],date:"",dirty:false};
const months=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const currentDate=()=> $("date").value || "";
function notice(msg){$("editorNotice").textContent=msg}
function addButton(label,cb,disabled=false){const b=document.createElement("button");b.type="button";b.className="secondary";b.textContent=label;b.disabled=disabled;b.onclick=cb;return b}
function setDateFromData(){
 const date=currentDate();
 if(state.date!==date){
   state.date=date;state.agenda=[];state.seen=new Set();state.dirty=false;
   $("mergePanel").hidden=true;
   notice(date?"เลือกวันที่แล้ว กดตรวจสอบรายการใหม่เพื่อนำเข้าร่าง":"เลือกวันที่ประชุมก่อนเริ่มจัดวาระ");
 }
 render();
}
window.svsEditorDataUpdated=()=>{
 setDateFromData();
 if(state.date)notice("ข้อมูลจาก Google Sheets อัปเดตแล้ว กดตรวจสอบรายการใหม่เพื่อเทียบกับร่าง (ไม่เขียนทับ)");
};
function incoming(){
 const data=window.svsGetSnapshot?.();
 if(!data||!state.date)return [];
 const already=new Set(state.agenda.map(a=>a.source_id).filter(Boolean));
 return (data.agendas||[]).filter(a=>a.date===state.date && String(a.topic||"").trim() && !already.has(a.source_id) && !state.seen.has(a.source_id));
}
function review(){
 if(!state.date){notice("กรุณาเลือกวันที่ประชุมก่อน");return}
 state.incoming=incoming();
 $("mergeList").replaceChildren();
 for(const a of state.incoming){
   const label=document.createElement("label");label.className="merge-entry";
   const input=document.createElement("input");input.type="checkbox";input.checked=true;input.value=a.source_id;
   const span=document.createElement("span");span.textContent=a.topic+" — "+(a.presenter||"ไม่ระบุ Presenter")+" ("+a.minutes+" นาที)";
   label.append(input,span);$("mergeList").append(label);
 }
 $("mergePanel").hidden=false;
 $("mergeEmpty").textContent=state.incoming.length?"พบ "+state.incoming.length+" วาระใหม่":"ไม่พบวาระใหม่จาก Google Sheets สำหรับวันที่เลือก";
}
function merge(){
 const selected=new Set([...$("mergeList").querySelectorAll('input:checked')].map(i=>i.value));
 let n=0;
 for(const a of state.incoming){
   if(!selected.has(a.source_id))continue;
   state.agenda.push({source_id:a.source_id,topic:String(a.topic),presenter:String(a.presenter||""),minutes:Math.max(1,Number(a.minutes)||1)});
   state.seen.add(a.source_id);n++;
 }
 state.dirty=true;$("mergePanel").hidden=true;render();notice("เพิ่ม "+n+" หัวข้อแล้ว สามารถแก้ไขก่อนส่งออกได้");
}
function swap(i,j){if(j<0||j>=state.agenda.length)return;[state.agenda[i],state.agenda[j]]=[state.agenda[j],state.agenda[i]];state.dirty=true;render()}
function render(){
 const root=$("editableAgenda");root.replaceChildren();
 state.agenda.forEach((a,i)=>{
   const row=document.createElement("div");row.className="agenda-edit-row";
   const badge=document.createElement("strong");badge.textContent=String(i+1);
   const topic=document.createElement("input");topic.value=a.topic;topic.placeholder="ชื่อวาระ";topic.setAttribute("aria-label","หัวข้อวาระ "+(i+1));
   const presenter=document.createElement("input");presenter.value=a.presenter;presenter.placeholder="Presenter";presenter.setAttribute("aria-label","Presenter "+(i+1));
   const minutes=document.createElement("input");minutes.type="number";minutes.min="1";minutes.max="480";minutes.value=a.minutes;minutes.setAttribute("aria-label","ระยะเวลาวาระ "+(i+1));
   topic.oninput=()=>{a.topic=topic.value;state.dirty=true;renderSchedule()};
   presenter.oninput=()=>{a.presenter=presenter.value;state.dirty=true;renderSchedule()};
   minutes.onchange=()=>{a.minutes=Math.max(1,Math.min(480,Number(minutes.value)||1));state.dirty=true;renderSchedule()};
   const controls=document.createElement("div");controls.className="agenda-actions";
   controls.append(addButton("↑",()=>swap(i,i-1),i===0),addButton("↓",()=>swap(i,i+1),i===state.agenda.length-1),addButton("ลบ",()=>{state.agenda.splice(i,1);state.dirty=true;render()}));
   row.append(badge,topic,presenter,minutes,controls);root.append(row);
 });
 $("agendaTotal").textContent=state.agenda.length+" หัวข้อ / "+state.agenda.reduce((n,a)=>n+(Number(a.minutes)||0),0)+" นาที";
 renderSchedule();
}
function toMinutes(t){const [h,m]=String(t||"08:30").split(":").map(Number);return (h||0)*60+(m||0)}
function hm(n){return String(Math.floor(n/60)%24).padStart(2,"0")+":"+String(n%60).padStart(2,"0")}
function schedule(){
 let cursor=toMinutes($("meetingStart").value),warning=[];
 const output=[];
 function add(topic,presenter,duration){const begin=cursor;cursor+=duration;output.push({time:hm(begin)+"–"+hm(cursor),topic,presenter,duration})}
 const start=cursor;
 add("เปิดงาน / แจ้งสถานการณ์","Admin",45);
 const breaks=[{at:630,topic:"พักเบรกเช้า",duration:15},{at:720,topic:"พักรับประทานอาหารกลางวัน",duration:60},{at:885,topic:"พักเบรกบ่าย",duration:15}];
 if(start>630)warning.push("เวลาเริ่มประชุมหลังช่วงพักเช้าที่ตั้งไว้");
 for(const a of state.agenda){
   const d=Math.max(1,Number(a.minutes)||1);
   while(breaks.length && (cursor>=breaks[0].at || cursor+d>breaks[0].at)){
     const b=breaks.shift();if(cursor>b.at)warning.push("ช่วง "+b.topic+" เริ่มช้ากว่าเวลาที่กำหนด");
     if(cursor<b.at)cursor=b.at;
     add(b.topic,"—",b.duration);
   }
   add(a.topic||"(ยังไม่ระบุหัวข้อ)",a.presenter||"—",d);
 }
 while(breaks.length){const b=breaks.shift();if(cursor>b.at)warning.push("ช่วง "+b.topic+" เริ่มช้ากว่าเวลาที่กำหนด");cursor=Math.max(cursor,b.at);add(b.topic,"—",b.duration)}
 if(cursor<990)cursor=990;
 add("สรุปงาน / ปิดการประชุม","Admin",30);
 if(cursor>1020)warning.push("กำหนดการสิ้นสุดหลัง 17:00 น.");
 return {rows:output,warning,end:hm(cursor)};
}
function docInfo(){
 const date=state.date||new Date().toISOString().slice(0,10);
 const [year,month,day]=date.split("-").map(Number);const m=months[(month||1)-1]||months[0];
 return {title:"ประชุมทีมสัตวแพทย์ ประจำเดือน"+m+" ปี "+(year+543),subtitle:"วันที่ "+day+" เดือน "+m+" ณ "+($("meetingPlace").value.trim()||"................................"),date};
}
function renderSchedule(){
 const info=docInfo(),plan=schedule();
 $("printTitle").textContent=info.title;$("printSubtitle").textContent=info.subtitle;
 const body=$("scheduleRows");body.replaceChildren();
 for(const item of plan.rows){
   const row=document.createElement("tr");
   for(const value of [item.time,item.topic,item.presenter,item.duration]){
     const cell=document.createElement("td");cell.textContent=String(value);row.append(cell);
   }
   body.append(row);
 }
 $("scheduleWarning").textContent=plan.warning.length?"⚠ "+plan.warning.join(" · "):"โปรดตรวจสอบช่วงพัก เวลา และรายชื่อ Presenter ก่อนส่งออก";
}
function download(name,blob){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function csv(){const lines=[["เวลา","หัวข้อประชุม","Presenter","นาที"],...schedule().rows.map(r=>[r.time,r.topic,r.presenter,r.duration])];const quote=x=>'"'+String(x??"").replace(/"/g,'""')+'"';download("SVS_Meeting_"+docInfo().date+".csv",new Blob(["\ufeff"+lines.map(r=>r.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}))}
function b16(n){return [n&255,(n>>8)&255]}function b32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function zip(files){
 const encoder=new TextEncoder();const blocks=[],directory=[];let offset=0;
 for(const [path,content] of files){
   const name=encoder.encode(path),data=encoder.encode(content),crc=crc32(data);
   const header=new Uint8Array([...b32(0x04034b50),...b16(20),...b16(0x0800),...b16(0),...b16(0),...b16(0),...b32(crc),...b32(data.length),...b32(data.length),...b16(name.length),...b16(0),...name]);
   const central=new Uint8Array([...b32(0x02014b50),...b16(20),...b16(20),...b16(0x0800),...b16(0),...b16(0),...b16(0),...b32(crc),...b32(data.length),...b32(data.length),...b16(name.length),...b16(0),...b16(0),...b16(0),...b16(0),...b32(0),...b32(offset),...name]);
   blocks.push(header,data);directory.push(central);offset+=header.length+data.length;
 }
 const size=directory.reduce((n,b)=>n+b.length,0);
 const end=new Uint8Array([...b32(0x06054b50),...b16(0),...b16(0),...b16(files.length),...b16(files.length),...b32(size),...b32(offset),...b16(0)]);
 return new Blob([...blocks,...directory,end],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
function wParagraph(text,{bold=false,center=false}={}){
 return '<w:p><w:pPr><w:jc w:val="'+(center?"center":"left")+'"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Kanit" w:hAnsi="Kanit" w:eastAsia="'+(bold?"Kanit":"Noto Sans Thai")+'"/>'+(bold?'<w:b/>':'')+'</w:rPr><w:t xml:space="preserve">'+esc(text)+'</w:t></w:r></w:p>';
}
function wCell(text){return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'+wParagraph(text)+'</w:tc>'}
function exportWord(){
 const info=docInfo(),data=schedule().rows;
 const table='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:bottom w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>'+
 [["เวลา","หัวข้อประชุม","Presenter","นาที"],...data.map(x=>[x.time,x.topic,x.presenter,String(x.duration)])].map(row=>'<w:tr>'+row.map(wCell).join("")+'</w:tr>').join("")+'</w:tbl>';
 const signatures='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tr><w:tc>'+wParagraph("ลงชื่อ ......................................",{center:true})+wParagraph("ผู้เสนอ",{center:true})+'</w:tc><w:tc>'+wParagraph("ลงชื่อ ......................................",{center:true})+wParagraph("ผู้เห็นชอบ",{center:true})+'</w:tc></w:tr></w:tbl>';
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
 wParagraph(info.title,{bold:true,center:true})+wParagraph(info.subtitle,{center:true})+wParagraph("")+table+wParagraph("")+signatures+
 '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="850" w:right="850"/></w:sectPr></w:body></w:document>';
 const types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 download("SVS_Meeting_"+info.date+".docx",zip([["[Content_Types].xml",types],["_rels/.rels",rels],["word/document.xml",xml]]));
}
$("reviewAgenda").onclick=review;$("mergeAgenda").onclick=merge;
$("addAgenda").onclick=()=>{if(!state.date){notice("กรุณาเลือกวันที่ประชุมก่อน");return}state.agenda.push({source_id:"",topic:"",presenter:"",minutes:15});state.dirty=true;render()};
$("saveAgenda").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อน");return}try{sessionStorage.setItem("svs-admin-draft-"+state.date,JSON.stringify(state.agenda));notice("บันทึกร่างเฉพาะแท็บนี้แล้ว (ปิดแท็บ/เบราว์เซอร์อาจทำให้ข้อมูลหาย)") }catch{notice("บันทึกไม่ได้ กรุณาส่งออกเอกสารเก็บไว้")}};
$("restoreAgenda").onclick=()=>{try{const rows=JSON.parse(sessionStorage.getItem("svs-admin-draft-"+state.date));if(!Array.isArray(rows))throw Error();state.agenda=rows.filter(x=>x&&typeof x==="object").map(x=>({source_id:String(x.source_id||""),topic:String(x.topic||""),presenter:String(x.presenter||""),minutes:Math.max(1,Number(x.minutes)||1)}));state.seen=new Set(state.agenda.map(x=>x.source_id).filter(Boolean));render();notice("เรียกคืนร่างสำเร็จ") }catch{notice("ไม่พบร่างที่บันทึกไว้สำหรับวันที่นี้")}};
$("meetingStart").onchange=renderSchedule;$("meetingPlace").oninput=renderSchedule;
$("printMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}window.print()};
$("wordMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}exportWord()};
$("csvMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}csv()};
render();
})();