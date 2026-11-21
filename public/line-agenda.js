(()=>{
 const $=id=>document.getElementById(id);
 let last=null, requestId="",loading=false;
 const say=(id,message,error=false)=>{const x=$(id);x.textContent=message;x.style.color=error?"#b42318":"#46627f"};
 async function api(route,init={}){
  const r=await fetch("/api/admin/"+route,{credentials:"same-origin",cache:"no-store",...init});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||"HTTP "+r.status);
  return data;
 }
 function dates(){
  const snapshot=window.svsGetSnapshot?.();
  const active=snapshot?.active_dates||[];
  const select=$("lineDate"),old=select.value;
  select.replaceChildren();
  const first=document.createElement("option");first.value="";first.textContent="เลือกวันประชุม";select.append(first);
  for(const d of active){
   const option=document.createElement("option");option.value=d;option.textContent=d;select.append(option);
  }
  if(active.includes(old))select.value=old;
  else if(active.length===1)select.value=active[0];
 }
 function invalidate(){
  last=null;requestId="";$("lineSend").disabled=true;$("lineMessage").value="";
 }
 async function preview(){
  const date=$("lineDate").value;
  invalidate();
  if(!date){say("lineStatus","กรุณาเลือกวันที่ประชุม",true);return}
  if(loading)return;
  loading=true;$("linePreview").disabled=true;
  say("lineStatus","กำลังตรวจสอบข้อมูลวาระล่าสุด...");
  try{
   const data=await api("line-preview?date="+encodeURIComponent(date));
   last=data;requestId=crypto.randomUUID();$("lineMessage").value=data.text;
   $("lineCapacity").value=data.capacityMinutes??"";
   say("lineStatus","วาระ "+data.topicCount+" หัวข้อ / "+data.totalMinutes+" นาที · LINE "+(data.configured?"ตั้งค่า Token แล้ว":"ยังไม่มี Token")+" · กลุ่ม "+(data.connected?data.group:"ยังไม่เชื่อม"));
   $("lineSend").disabled=!(data.configured&&data.connected&&data.capacityMinutes!==null);
  }catch(e){say("lineStatus","ดูตัวอย่างไม่สำเร็จ: "+e.message,true)}
  finally{$("linePreview").disabled=false;loading=false}
 }
 async function send(){
  if(!last||!requestId||last.date!==$("lineDate").value)return;
  if(!window.confirm("ยืนยันส่งข้อความสรุปวาระวันที่ "+last.date+" เข้า LINE กลุ่มจริง?\n\nข้อมูลจะส่งถึงสมาชิกในกลุ่มทันที"))return;
  const button=$("lineSend");button.disabled=true;
  say("lineStatus","กำลังส่งข้อความไป LINE...");
  try{
   const result=await api("line-send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:last.date,expectedText:last.text,requestId})});
   say("lineStatus","✅ LINE รับคำขอส่งแล้ว: "+result.topicCount+" วาระ / "+result.totalMinutes+" นาที");
   invalidate();
  }catch(e){
   say("lineStatus","ส่งไม่สำเร็จหรือยังยืนยันผลไม่ได้: "+e.message+" กรุณาตรวจสอบใน LINE ก่อนกดส่งใหม่",true);
   // Avoid accidental duplicate sends after uncertain networking outcome.
   invalidate();
  }
 }
 async function saveCapacity(){
  const date=$("lineDate").value,raw=$("lineCapacity").value.trim(),minutes=Number(raw);
  if(!date){say("lineStatus","กรุณาเลือกวันที่ประชุมก่อน",true);return}
  if(!raw||!Number.isInteger(minutes)||minutes<1||minutes>1440){say("lineStatus","กรุณาระบุเวลานำเสนอทั้งหมด 1–1440 นาที",true);return}
  $("lineCapacitySave").disabled=true;
  invalidate();
  try{
   await api("line-capacity-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,minutes})});
   say("lineStatus","✅ บันทึกกรอบเวลานำเสนอ "+minutes+" นาทีแล้ว กรุณากดดูตัวอย่างข้อความล่าสุด");
  }catch(e){say("lineStatus","บันทึกกรอบเวลาไม่สำเร็จ: "+e.message,true)}
  finally{$("lineCapacitySave").disabled=false}
 }
 async function saveGroup(){
  const value=$("lineGroupId").value.trim();
  if(!/^C[0-9a-f]{32}$/i.test(value)){say("lineGroupStatus","Group ID ไม่ถูกต้อง (ขึ้นต้น C และอักษรฐานสิบหก 32 ตัว)",true);return}
  if(!window.confirm("ยืนยันผูก LINE Group ID นี้กับกลุ่มที่จะรับข้อความของ SVS?"))return;
  $("lineGroupSave").disabled=true;
  try{
   const result=await api("line-group-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId:value})});
   $("lineGroupId").value="";
   say("lineGroupStatus","✅ บันทึกกลุ่ม "+result.group+" แล้ว · ตรวจตัวอย่างใหม่ก่อนกดส่ง");
   invalidate();
  }catch(e){say("lineGroupStatus","บันทึกไม่สำเร็จ: "+e.message,true)}
  finally{$("lineGroupSave").disabled=false}
 }
 $("lineDate").addEventListener("change",()=>{invalidate();say("lineStatus","วันที่เปลี่ยนแล้ว กรุณาดูตัวอย่างใหม่")});
 $("linePreview").addEventListener("click",preview);
 $("lineCapacitySave").addEventListener("click",saveCapacity);
 $("lineCapacity").addEventListener("input",()=>{invalidate();say("lineStatus","กรอบเวลามีการเปลี่ยนแปลง กรุณาบันทึกแล้วดูตัวอย่างใหม่")});
 $("lineSend").addEventListener("click",send);
 $("lineGroupSave").addEventListener("click",saveGroup);

 let candidate="";
 async function checkGroup(){
  candidate="";$("lineApproveGroup").disabled=true;
  say("lineCandidateStatus","กำลังตรวจสอบกลุ่มที่รับจาก LINE...");
  try{
   const data=await api("line-status");
   if(data.candidate){
    candidate=data.candidate;
    $("lineApproveGroup").disabled=false;
    say("lineCandidateStatus","พบกลุ่มจาก LINE: "+candidate+" · กลุ่มที่ใช้อยู่: "+(data.group||"ยังไม่เชื่อม")+" · ตรวจสอบว่าเพิ่งเพิ่ม Bot ในกลุ่ม SVS จริงก่อนยืนยัน");
   }else say("lineCandidateStatus","ยังไม่พบกลุ่ม: โปรดตรวจสอบ Webhook URL และพิมพ์ /svs-connect ใน LINE กลุ่ม");
  }catch(e){say("lineCandidateStatus","ไม่สามารถตรวจสอบ LINE กลุ่ม: "+e.message,true)}
 }
 async function approveGroup(){
  if(!candidate)return;
  if(!window.confirm("ยืนยันเลือกกลุ่ม LINE "+candidate+" สำหรับรับข้อความสรุปวาระ SVS จริง?"))return;
  $("lineApproveGroup").disabled=true;
  try{
   const data=await api("line-group-approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmCandidate:candidate})});
   say("lineCandidateStatus","✅ เชื่อมกลุ่ม "+data.group+" แล้ว · กรุณาดูตัวอย่างข้อความใหม่");
   invalidate();
  }catch(e){say("lineCandidateStatus","เชื่อมกลุ่มไม่สำเร็จ: "+e.message,true)}
  finally{candidate=""}
 }
 $("lineCheckGroup").addEventListener("click",checkGroup);
 $("lineApproveGroup").addEventListener("click",approveGroup);

 const panel=$("lineAgendaPanel");panel.addEventListener("toggle",()=>{if(panel.open)dates()});
 window.svsLineDatesUpdated=()=>{if(panel.open){const current=$("lineDate").value;dates();if($("lineDate").value!==current)invalidate()}};
})();