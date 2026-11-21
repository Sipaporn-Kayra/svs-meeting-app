(()=>{
 const $=id=>document.getElementById(id);
 let data=null, loading=false;
 const notice=(id,message,error=false)=>{const node=$(id);node.textContent=message;node.style.color=error?"#b13632":"#45627f"};
 async function api(route,options={}){
  const res=await fetch("/api/admin/"+route,{credentials:"same-origin",cache:"no-store",...options});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(payload.error||("HTTP "+res.status));
  return payload;
 }
 const post=(route,data)=>api(route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 const items=id=>$(id).value.split("\n").map(x=>x.trim()).filter(Boolean);
 const fill=(id,choices,placeholder)=>{const select=$(id),old=select.value;select.replaceChildren();const blank=document.createElement("option");blank.value="";blank.textContent=placeholder;select.append(blank);for(const value of choices){const opt=document.createElement("option");opt.value=value;opt.textContent=value;select.append(opt)}if(choices.includes(old))select.value=old};
 function updateRound(){
  const date=$("roundDate").value,day=data?.days?.[date];
  $("roundHistory").value=(data?.historyDates||[]).includes(date)?date:"";
  $("roundFood").value=(day?.food||[]).join("\n");
  $("roundDrink").value=(day?.drink||[]).join("\n");
  notice("roundNotice",day?(data.dates.includes(date)?"กำลังแสดงเมนูของรอบที่เปิดลงทะเบียน":"กำลังดูเมนูย้อนหลัง (ยังไม่ได้เปิดรอบเก่าให้ลงทะเบียน)"):"วันใหม่: กรุณากรอกรายการอาหารและเครื่องดื่ม");
 }
 function bannerInfo(){const date=$("bannerDate").value,kind=$("bannerKind").value,day=data?.days?.[date];return {date,kind,url:kind==="food"?(day?.foodBanner||""):(day?.drinkBanner||"")}}
 function showBanner(){
  const url=bannerInfo().url;
  $("bannerUrl").value=url;
  const img=$("bannerPreview");img.hidden=!url;
  if(url){img.src=url;img.onerror=()=>{img.hidden=true;notice("bannerNotice","URL นี้เปิดรูปไม่ได้",true)}}else img.removeAttribute("src");
  $("bannerFile").value="";
 }
 async function reload(){
  if(loading)return;
  loading=true;
  try{
   data=await api("menu-config");
   const dates=data.dates||[];
   fill("bannerDate",dates,"เลือกวันประชุม");
   fill("roundHistory",data.historyDates||dates,"เลือกรอบเก่าหรือปัจจุบัน");
   const roundDate=$("roundDate");
   if(!roundDate.value&&dates.length)roundDate.value=dates[0];
   updateRound();showBanner();
   notice("roundNotice","โหลดข้อมูลรอบประชุมสำเร็จ");
   window.dispatchEvent(new CustomEvent("svs-menu-settings-updated"));
  }catch(e){notice("roundNotice","ไม่สามารถโหลดค่ารอบประชุม: "+e.message,true)}
  finally{loading=false}
 }
 $("roundDate").addEventListener("change",updateRound);
 $("roundHistory").addEventListener("change",()=>{if($("roundHistory").value){$("roundDate").value=$("roundHistory").value;updateRound()}});
 $("bannerDate").addEventListener("change",showBanner);
 $("bannerKind").addEventListener("change",showBanner);
 $("roundReload").onclick=reload;
 $("roundSave").onclick=async()=>{
  const date=$("roundDate").value,food=items("roundFood"),drink=items("roundDrink"),mode=$("roundMode").value;
  if(!date||!food.length||!drink.length){notice("roundNotice","กรุณากรอกวันที่ อาหาร และเครื่องดื่ม",true);return}
  const existing=data?.dates||[];
  const replacing=mode==="replace"&&existing.some(d=>d!==date);
  if(replacing&&!confirm("การบันทึกจะปิดวันเดิมจากฟอร์มผู้กรอก และเปิดวันที่ "+date+" แทน ข้อมูลย้อนหลังยังอยู่ใน Google Sheets ต้องการดำเนินการต่อหรือไม่?"))return;
  const btn=$("roundSave");btn.disabled=true;
  try{
   const result=await post("round-save",{date,food,drink,mode});
   await reload();
   notice("roundNotice","✅ บันทึกรอบประชุมแล้ว เปิดรับลงทะเบียนวันที่: "+result.dates.join(", "));
  }catch(e){notice("roundNotice",e.message,true)}
  finally{btn.disabled=false}
 };
 async function saveBanner(url){
  const {date,kind}=bannerInfo();
  if(!date)throw Error("กรุณาเลือกวันที่ก่อน");
  await post("banner-save",{date,kind,url});
  if(kind==="food")data.days[date].foodBanner=url;else data.days[date].drinkBanner=url;
  showBanner();
 }
 $("bannerSaveUrl").onclick=async()=>{
  const btn=$("bannerSaveUrl"),url=$("bannerUrl").value.trim();
  btn.disabled=true;
  try{if(!url)throw Error("กรุณาวาง HTTPS URL");await saveBanner(url);notice("bannerNotice","✅ บันทึกรูปรวมสำเร็จ")}
  catch(e){notice("bannerNotice",e.message,true)}finally{btn.disabled=false}
 };
 $("bannerRemove").onclick=async()=>{
  const btn=$("bannerRemove");btn.disabled=true;
  try{await saveBanner("");notice("bannerNotice","✅ นำรูปรวมออกแล้ว รูปเฉพาะเมนูยังอยู่")}
  catch(e){notice("bannerNotice",e.message,true)}finally{btn.disabled=false}
 };
 $("bannerUpload").onclick=async()=>{
  const file=$("bannerFile").files?.[0];if(!file){notice("bannerNotice","กรุณาเลือกไฟล์รูปรวม",true);return}
  if(file.size>2*1024*1024){notice("bannerNotice","รูปต้องไม่เกิน 2 MB",true);return}
  if(!bannerInfo().date){notice("bannerNotice","กรุณาเลือกวันประชุมก่อน",true);return}
  const btn=$("bannerUpload");btn.disabled=true;
  try{
   const form=new FormData();form.append("file",file);
   const uploaded=await api("menu-upload",{method:"POST",body:form});
   await saveBanner(uploaded.url);
   notice("bannerNotice","✅ อัปโหลดรูปรวมและบันทึกให้วันประชุมสำเร็จ");
  }catch(e){notice("bannerNotice",e.message,true)}finally{btn.disabled=false}
 };
 const dashboard=$("dashboard");
 const observer=new MutationObserver(()=>{
  if(!dashboard.classList.contains("hidden")&&!data)reload();
  if(dashboard.classList.contains("hidden"))data=null;
 });
 observer.observe(dashboard,{attributes:true,attributeFilter:["class"]});
 if(!dashboard.classList.contains("hidden"))reload();
})();