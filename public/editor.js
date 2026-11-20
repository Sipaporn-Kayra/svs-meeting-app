// SVS Admin meeting editor: client-side drafts only; never writes to Google Sheets.
(()=>{
const $=id=>document.getElementById(id);
const state={agenda:[],seen:new Set(),incoming:[],date:"",dirty:false};
const categories=["สถานการณ์โรคระบาด/Case study","งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์","Project","อื่นๆ"];
const guessCategory=t=>/ASF|PRRS|CSF|FMD|PED|โรค|ระบาด|case study|case|สถานการณ์|สุขภาพสัตว์/i.test(t)?"สถานการณ์โรคระบาด/Case study":/ทดลอง|วิจัย|คัดเลือก|เวชภัณฑ์|วัคซีน|ELISA|ผลตรวจ/i.test(t)?"งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์":/project|โครงการ|ฟาร์ม|ระบบ|พัฒนา/i.test(t)?"Project":"อื่นๆ";
const normalizeCategory=(category,topic)=>({"โรคระบาด / สุขภาพสัตว์":"สถานการณ์โรคระบาด/Case study","งานทดลอง / วิชาการ":"งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์","งานฟาร์ม / ปฏิบัติการ":"Project","งานบริหาร / ทั่วไป":"อื่นๆ","อื่น ๆ":"อื่นๆ"}[category]|| (categories.includes(category)?category:guessCategory(topic)));
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
   state.agenda.push({source_id:a.source_id,topic:String(a.topic),presenter:String(a.presenter||""),minutes:Math.max(1,Number(a.minutes)||1),category:normalizeCategory(a.category,a.topic)});
   state.seen.add(a.source_id);n++;
 }
 state.dirty=true;$("mergePanel").hidden=true;render();notice("เพิ่ม "+n+" หัวข้อแล้ว สามารถแก้ไขก่อนส่งออกได้");
}
function swap(i,j){if(j<0||j>=state.agenda.length)return;[state.agenda[i],state.agenda[j]]=[state.agenda[j],state.agenda[i]];state.dirty=true;render()}
function render(){
 const root=$("editableAgenda");root.replaceChildren();
 state.agenda.forEach((a,i)=>{
   const row=document.createElement("div");row.className="agenda-edit-row";
   const badge=document.createElement("strong");badge.textContent="⠿ "+String(i+1);badge.title="จับเพื่อเลื่อนลำดับวาระ";badge.className="drag-handle";row.draggable=true;row.dataset.index=String(i);row.addEventListener("dragstart",ev=>{ev.dataTransfer.setData("text/plain",String(i));ev.dataTransfer.effectAllowed="move";row.classList.add("dragging")});row.addEventListener("dragend",()=>row.classList.remove("dragging"));row.addEventListener("dragover",ev=>{ev.preventDefault();ev.dataTransfer.dropEffect="move"});row.addEventListener("drop",ev=>{ev.preventDefault();const from=Number(ev.dataTransfer.getData("text/plain"));swap(from,i)});
   const topic=document.createElement("input");topic.value=a.topic;topic.placeholder="ชื่อวาระ";topic.setAttribute("aria-label","หัวข้อวาระ "+(i+1));
   const presenter=document.createElement("input");presenter.value=a.presenter;presenter.placeholder="Presenter";presenter.setAttribute("aria-label","Presenter "+(i+1));
   const minutes=document.createElement("input");minutes.type="number";minutes.min="1";minutes.max="480";minutes.value=a.minutes;minutes.setAttribute("aria-label","ระยะเวลาวาระ "+(i+1));
   topic.oninput=()=>{a.topic=topic.value;state.dirty=true;renderSchedule()};
   presenter.oninput=()=>{a.presenter=presenter.value;state.dirty=true;renderSchedule()};
   minutes.onchange=()=>{a.minutes=Math.max(1,Math.min(480,Number(minutes.value)||1));state.dirty=true;renderSchedule()};
   const cat=document.createElement("select");cat.className="category-picker";cat.setAttribute("aria-label","หมวดหมู่ "+(i+1));for(const name of categories){const option=document.createElement("option");option.value=name;option.textContent=name;cat.append(option)}cat.value=normalizeCategory(a.category,a.topic);a.category=cat.value;cat.onchange=()=>{a.category=cat.value;state.dirty=true;renderSchedule()};
   const controls=document.createElement("div");controls.className="agenda-actions";
   controls.append(addButton("↑",()=>swap(i,i-1),i===0),addButton("↓",()=>swap(i,i+1),i===state.agenda.length-1),addButton("ลบ",()=>{state.agenda.splice(i,1);state.dirty=true;render()}));
   row.append(badge,topic,presenter,minutes,cat,controls);root.append(row);
 });
 $("agendaTotal").textContent=state.agenda.length+" หัวข้อ / "+state.agenda.reduce((n,a)=>n+(Number(a.minutes)||0),0)+" นาที";
 renderSchedule();
}
function toMinutes(t){const [h,m]=String(t||"08:30").split(":").map(Number);return (h||0)*60+(m||0)}
function hm(n){return String(Math.floor(n/60)%24).padStart(2,"0")+":"+String(n%60).padStart(2,"0")}
function schedule(){
 let cursor=toMinutes($("meetingStart").value);
 const warning=[],output=[],early=$("breakMode").value==="early",autoFill=$("autoFill").checked;
 const breaks=[{at:630,topic:"พักเบรกเช้า",duration:15,flexible:true},{at:720,topic:"พักรับประทานอาหารกลางวัน",duration:60,flexible:false},{at:885,topic:"พักเบรกบ่าย",duration:15,flexible:true}];
 function add(topic,presenter,duration,category=""){const from=cursor;cursor+=duration;output.push({time:hm(from)+"–"+hm(cursor),topic,presenter,duration,category})}
 const queue=state.agenda.map((a,i)=>({topic:a.topic||"(ยังไม่ระบุหัวข้อ)",presenter:a.presenter||"—",duration:Math.max(1,Number(a.minutes)||1),category:a.category||"อื่นๆ",index:i}));
 add("เปิดงาน / แจ้งสถานการณ์","Admin",45);
 let moved=0,guard=0;
 while(queue.length && guard++<500){
  // Insert a short future agenda item if it fits entirely before the next break.
  const br=breaks[0],free=br?br.at-cursor:Infinity;
  if(br&&cursor>=br.at){breaks.shift();add(br.topic,"—",br.duration);continue}
  if(br && queue[0].duration>free && free>0 && autoFill){
    const index=queue.findIndex((t,j)=>j>0&&t.duration<=free);
    if(index>0){const [fit]=queue.splice(index,1);add(fit.topic,fit.presenter,fit.duration,fit.category);moved++;continue}
  }
  if(br && queue[0].duration>free){
    breaks.shift();
    if(br.flexible && early && free>=0 && free<=15) {
      add(br.topic,"—",br.duration);
    } else {
      if(cursor<br.at)cursor=br.at;
      add(br.topic,"—",br.duration);
    }
    continue;
  }
  const t=queue.shift();add(t.topic,t.presenter,t.duration,t.category);
 }
 if(moved)warning.push("เติมช่องว่างก่อนพักด้วย "+moved+" วาระจากลำดับถัดไป (ตรวจทานลำดับอีกครั้ง)");
 // Only include breaks reached during the substantive meeting; no future breaks
 // added solely to fill the afternoon after agenda work has ended.
 add("สรุปงาน / ปิดการประชุม","Admin",30);
 const over=Math.max(0,cursor-1020);
 if(over)warning.unshift("เวลาสิ้นสุด "+hm(cursor)+" น. เกิน 17:00 น. "+over+" นาที · ลดเวลา/ย้ายวาระก่อนส่งออก");
 return {rows:output,warning,end:hm(cursor),overMinutes:over,autoMoved:moved};
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
 $("scheduleWarning").textContent=(plan.overMinutes?"⚠ เกินเวลา 17:00 น. — ":"")+("สิ้นสุด "+plan.end+" น. · ")+(plan.warning.length?plan.warning.join(" · "):"โปรดตรวจสอบช่วงพัก เวลา และรายชื่อ Presenter ก่อนส่งออก");
 $("scheduleWarning").classList.toggle("time-overrun",plan.overMinutes>0);
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
function wParagraph(text,{bold=false,center=false,size=20}={}){
 const font=bold?"Kanit":"Noto Sans Thai";
 return '<w:p><w:pPr><w:jc w:val="'+(center?"center":"left")+'"/><w:spacing w:after="90"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="'+font+'" w:hAnsi="'+font+'" w:eastAsia="'+font+'"/><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/>'+(bold?'<w:b/>':'')+'</w:rPr><w:t xml:space="preserve">'+esc(text)+'</w:t></w:r></w:p>';
}
function wCell(text,{header=false}={}){
 const content=wParagraph(text,{bold:header,size:19});
 return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:vAlign w:val="center"/></w:tcPr>'+content+'</w:tc>';
}
function exportWord(){
 const info=docInfo(),data=schedule().rows;
 const colWidths=[1900,5300,2400,900];
 const headerRow='<w:tr><w:trPr><w:tblHeader w:val="true"/></w:trPr>'+["เวลา","หัวข้อประชุม","Presenter","นาที"].map(x=>wCell(x,{header:true})).join("")+'</w:tr>';
 const contentRows=data.map(x=>'<w:tr><w:trPr><w:cantSplit/></w:trPr>'+[x.time,x.topic,x.presenter,String(x.duration)].map(v=>wCell(v)).join("")+'</w:tr>').join("");
 const table='<w:tbl><w:tblPr><w:tblW w:w="10500" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders><w:tblCellMar><w:top w:w="75" w:type="dxa"/><w:bottom w:w="75" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+colWidths.map(w=>'<w:gridCol w:w="'+w+'"/>').join("")+'</w:tblGrid>'+headerRow+contentRows+'</w:tbl>';
 const signatureCell=label=>'<w:tc><w:tcPr><w:tcW w:w="5250" w:type="dxa"/></w:tcPr>'+wParagraph("ลงชื่อ ......................................",{center:true})+wParagraph(label,{center:true})+'</w:tc>';
 const signatures='<w:tbl><w:tblPr><w:tblW w:w="10500" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="5250"/><w:gridCol w:w="5250"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>'+signatureCell("ผู้เสนอ")+signatureCell("ผู้เห็นชอบ")+'</w:tr></w:tbl>';
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
 wParagraph(info.title,{bold:true,center:true,size:28})+wParagraph(info.subtitle,{center:true,size:21})+wParagraph("")+table+wParagraph("")+signatures+
 '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="700" w:right="700"/></w:sectPr></w:body></w:document>';
 const types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 const rels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 download("SVS_Meeting_"+info.date+".docx",zip([["[Content_Types].xml",types],["_rels/.rels",rels],["word/document.xml",xml]]));
}
$("reviewAgenda").onclick=review;$("mergeAgenda").onclick=merge;
$("groupAgenda").onclick=()=>{state.agenda=state.agenda.map((a,index)=>({...a,_prior:index})).sort((a,b)=>categories.indexOf(a.category||"อื่นๆ")-categories.indexOf(b.category||"อื่น ๆ")||a._prior-b._prior).map(({_prior,...a})=>a);state.dirty=true;render();notice("จัดวาระตามหมวดหมู่แล้ว · ตรวจสอบเวลาพักและลำดับก่อนส่งออก")};
$("addAgenda").onclick=()=>{if(!state.date){notice("กรุณาเลือกวันที่ประชุมก่อน");return}state.agenda.push({source_id:"",topic:"",presenter:"",minutes:15,category:"อื่นๆ"});state.dirty=true;render()};
$("saveAgenda").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อน");return}try{sessionStorage.setItem("svs-admin-draft-"+state.date,JSON.stringify(state.agenda));notice("บันทึกร่างเฉพาะแท็บนี้แล้ว (ปิดแท็บ/เบราว์เซอร์อาจทำให้ข้อมูลหาย)") }catch{notice("บันทึกไม่ได้ กรุณาส่งออกเอกสารเก็บไว้")}};
$("restoreAgenda").onclick=()=>{try{const rows=JSON.parse(sessionStorage.getItem("svs-admin-draft-"+state.date));if(!Array.isArray(rows))throw Error();state.agenda=rows.filter(x=>x&&typeof x==="object").map(x=>({source_id:String(x.source_id||""),topic:String(x.topic||""),presenter:String(x.presenter||""),minutes:Math.max(1,Number(x.minutes)||1),category:normalizeCategory(x.category,x.topic)}));state.seen=new Set(state.agenda.map(x=>x.source_id).filter(Boolean));render();notice("เรียกคืนร่างสำเร็จ") }catch{notice("ไม่พบร่างที่บันทึกไว้สำหรับวันที่นี้")}};
$("meetingStart").onchange=renderSchedule;$("breakMode").onchange=renderSchedule;$("autoFill").onchange=renderSchedule;$("meetingPlace").oninput=renderSchedule;
$("printMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}if(schedule().overMinutes)notice("⚠ ตารางสิ้นสุด "+schedule().end+" น. เกิน 17:00 น. "+schedule().overMinutes+" นาที — Admin เลือกส่งออกเอกสารได้ โปรดตรวจสอบก่อนนำไปใช้จริง");window.print()};
$("wordMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}if(schedule().overMinutes)notice("⚠ ตารางสิ้นสุด "+schedule().end+" น. เกิน 17:00 น. "+schedule().overMinutes+" นาที — Admin เลือกส่งออกเอกสารได้ โปรดตรวจสอบก่อนนำไปใช้จริง");exportWord()};
$("csvMeeting").onclick=()=>{if(!state.date){notice("เลือกวันที่ประชุมก่อนส่งออก");return}if(schedule().overMinutes)notice("⚠ ตารางสิ้นสุด "+schedule().end+" น. เกิน 17:00 น. "+schedule().overMinutes+" นาที — Admin เลือกส่งออกเอกสารได้ โปรดตรวจสอบก่อนนำไปใช้จริง");csv()};
render();
})();