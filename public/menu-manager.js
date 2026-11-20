(()=>{
 const $=id=>document.getElementById(id);
 let config=null;
 const msg=(text,error=false)=>{const el=$("imageNotice");el.textContent=text;el.style.color=error?"#a73527":"#46627f"};
 async function request(path,init={}){
  const r=await fetch("/api/admin/"+path,{credentials:"same-origin",cache:"no-store",...init});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(j.error||("API ตอบ HTTP "+r.status));
  return j;
 }
 const post=(path,payload)=>request(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 function fill(select,values,placeholder){
  const old=select.value;select.replaceChildren();
  const first=document.createElement("option");first.value="";first.textContent=placeholder;select.append(first);
  values.forEach(value=>{const option=document.createElement("option");option.value=value;option.textContent=value;select.append(option)});
  if(values.includes(old))select.value=old;
 }
 function menuData(){
  const day=$("imageDate").value,type=$("imageKind").value;
  const data=config?.days?.[day];return {day,type,data,items:data?.[type]||[],images:type==="food"?data?.foodImages:data?.drinkImages};
 }
 function updatePreview(){
  const {images}=menuData(),name=$("imageMenu").value,url=images?.[name]||"";
  $("imageUrl").value=url;
  const img=$("menuImagePreview");
  if(url){img.src=url;img.hidden=false;img.onerror=()=>{img.hidden=true;msg("URL ที่บันทึกไว้เปิดรูปไม่ได้ กรุณาตรวจสอบ",true)}}
  else{img.removeAttribute("src");img.hidden=true}
  $("imageFile").value="";
 }
 function updateMenus(){
  fill($("imageMenu"),menuData().items,"เลือกเมนู");
  updatePreview();
 }
 async function loadConfig(){
  try{
   config=await request("menu-config");
   fill($("imageDate"),config.dates||[],"เลือกวันที่");
   updateMenus();
   msg("ข้อมูลเมนูล่าสุดพร้อมแล้ว เลือกวันที่และเมนู");
  }catch(e){msg("โหลดเมนูไม่สำเร็จ: "+e.message,true)}
 }
 $("imageDate").onchange=updateMenus;
 $("imageKind").onchange=updateMenus;
 $("imageMenu").onchange=updatePreview;
 async function saveUrl(url){
  const {day,type,items}=menuData(),menu=$("imageMenu").value;
  if(!day||!items.includes(menu))throw Error("กรุณาเลือกวันที่และชื่อเมนูก่อน");
  const out=await post("menu-save",{date:day,kind:type,menu,url});
  const images=type==="food"?config.days[day].foodImages:config.days[day].drinkImages;
  if(url)images[menu]=out.url;else delete images[menu];
  updatePreview();
 }
 $("imageUrlSave").onclick=async()=>{
  const btn=$("imageUrlSave");btn.disabled=true;
  try{
   const url=$("imageUrl").value.trim();
   if(!url)throw Error("กรุณาวาง URL รูปภาพ หรือใช้ปุ่มลบรูป");
   await saveUrl(url);msg("✅ บันทึก URL ให้เมนูแล้ว ผู้กรอกจะเห็นรูปเมื่อเปิดฟอร์มใหม่");
  }catch(e){msg(e.message,true)}finally{btn.disabled=false}
 };
 $("imageRemove").onclick=async()=>{
  const btn=$("imageRemove");btn.disabled=true;
  try{await saveUrl("");msg("ลบการเชื่อมรูปเมนูแล้ว (รูปต้นฉบับใน R2 ยังไม่ถูกลบ)")}
  catch(e){msg(e.message,true)}finally{btn.disabled=false}
 };
 $("imageUploadSave").onclick=async()=>{
  const btn=$("imageUploadSave"),file=$("imageFile").files?.[0];
  if(!file){msg("กรุณาเลือกรูปภาพจากเครื่องก่อน",true);return}
  if(file.size>2*1024*1024){msg("รูปใหญ่เกิน 2 MB",true);return}
  const {day,items}=menuData();
  if(!day||!items.includes($("imageMenu").value)){msg("กรุณาเลือกวันที่และเมนูก่อน",true);return}
  btn.disabled=true;msg("กำลังอัปโหลดรูปภาพ...");
  try{
   const data=new FormData();data.append("file",file);
   const uploaded=await request("menu-upload",{method:"POST",body:data});
   await saveUrl(uploaded.url);
   msg("✅ อัปโหลดรูปและบันทึกให้เมนูสำเร็จแล้ว");
  }catch(e){msg("บันทึกรูปไม่สำเร็จ: "+e.message,true)}
  finally{btn.disabled=false}
 };
 // Initialize only after an authenticated admin session. Keep the setup hidden inside #dashboard.
 const originalShow=window.svsMenuManagerLoaded;
 window.svsMenuManagerLoaded=()=>{originalShow?.();loadConfig()};
 // Observe auth-only dashboard visibility without exposing a new endpoint.
 const observer=new MutationObserver(()=>{
   if(!$("dashboard").classList.contains("hidden")&&!config)loadConfig();
   if($("dashboard").classList.contains("hidden"))config=null;
 });
 observer.observe($("dashboard"),{attributes:true,attributeFilter:["class"]});
 if(!$("dashboard").classList.contains("hidden"))loadConfig();
})();