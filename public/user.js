(()=>{
const $=id=>document.getElementById(id);
const cats=["สถานการณ์โรคระบาด/Case study","งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์","Project","อื่นๆ"];
let conf=null,submitted=false,editingReceipt="",editingRevision="",requestId=crypto.randomUUID();
function el(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x}
function select(options){const x=el("select");for(const v of options){const o=el("option","",v);o.value=v;x.append(o)}return x}
function label(name,control){const l=el("label");l.append(document.createTextNode(name),control);return l}
function status(id,msg,error=false){const x=$(id);x.textContent=msg;x.className=error?"notice error":"notice good"}
async function call(route,payload){let r;try{r=await fetch("/api/user/"+route,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify(payload)})}catch{throw Error("เชื่อมต่อ API ไม่สำเร็จ (Network) กรุณาตรวจสอบอินเทอร์เน็ต")}const contentType=r.headers.get("content-type")||"";if(!contentType.includes("application/json"))throw Error("User API ตอบกลับ HTTP "+r.status+" โดยไม่ใช่ JSON — กรุณาตรวจสอบ Cloudflare Deployment และ Functions");const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||("User API HTTP "+r.status));return j}
function selectedDates(){return [...$("dates").querySelectorAll("input:checked")].map(x=>x.value)}
function attending(){return document.querySelector('input[name="attendance"]:checked')?.value==="เข้าร่วม"}
function cardChoice(name,group,mode,imgSrc){
 const l=el("label","option"),inp=el("input");inp.type=mode;inp.name=group;inp.value=name;
 const imageUrl=typeof imgSrc==="string"&&(/^https:\/\//.test(imgSrc)||/^\/api\/menu-image\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(imgSrc))?imgSrc:"";
 if(imageUrl){const img=el("img");img.src=imageUrl;img.alt="รูปเมนู "+name;img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>{img.replaceWith(el("div","image-fallback",group.includes("food")?"🍱":"🥤"))};l.append(img)}
 else l.append(el("div","image-fallback",group.includes("food")?"🍱":"🥤"));
 l.append(inp,el("span","option-name",name));return l;
}
function bannerView(url,description){
 if(typeof url!=="string"||!(url.startsWith("https://")||/^\/api\/menu-image\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(url)))return null;
 const holder=el("div","menu-banner"),image=el("img");image.src=url;image.alt=description;image.loading="lazy";image.referrerPolicy="no-referrer";
 image.onerror=()=>holder.remove();holder.append(image);return holder;
}
function menuFields(day){
 const c=conf.days[day],box=el("div","date-card");box.dataset.day=day;box.append(el("div","date-heading","📅 "+day));
 box.append(el("h3","","🍱 อาหาร"));
 const foodBanner=bannerView(c.foodBanner,"รูปรวมอาหารสำหรับวันที่ "+day);if(foodBanner)box.append(foodBanner);
 const foods=el("div","options");if(!c.food.length)foods.append(el("p","muted","ยังไม่มีเมนูอาหารสำหรับวันนี้"));
 for(const name of c.food)foods.append(cardChoice(name,"food-"+day,"checkbox",c.foodImages[name]));
 box.append(foods,el("h3","","🥤 เครื่องดื่ม"));
 const drinkBanner=bannerView(c.drinkBanner,"รูปรวมเครื่องดื่มสำหรับวันที่ "+day);if(drinkBanner)box.append(drinkBanner);
 const drinks=el("div","options");if(!c.drinks.length)drinks.append(el("p","muted","ยังไม่มีเมนูเครื่องดื่มสำหรับวันนี้"));
 for(const name of c.drinks)drinks.append(cardChoice(name,"drink-"+day,"radio",c.drinkImages[name]));
 box.append(drinks);
 const options=el("div","row");
 const temperature=select(conf.temperature),roast=select(conf.roast),sweetness=select(conf.sweetness),sport=select(conf.sport);
 temperature.dataset.field="temperature";roast.dataset.field="roast";sweetness.dataset.field="sweetness";sport.dataset.field="sport";
 options.append(label("รูปแบบเครื่องดื่ม",temperature),label("ชนิดเมล็ดกาแฟ",roast),label("ระดับความหวาน",sweetness));
 box.append(options,label("กิจกรรมกีฬา",sport));
 return box;
}
function refreshDays(){
 const selected=selectedDates(),parent=$("menuDays"),existing=new Map([...parent.children].map(x=>[x.dataset.day,x]));
 parent.replaceChildren();for(const day of selected)parent.append(existing.get(day)||menuFields(day));
 document.querySelectorAll(".agenda-day").forEach(s=>{const value=s.value;s.replaceChildren(...selected.map(d=>{const o=el("option","",d);o.value=d;return o}));if(selected.includes(value))s.value=value});
}
function agendaItem(data={}){
 const wrapper=el("div","agenda-item");
 const top=el("div","agenda-top");top.append(el("h3","","📋 วาระประชุม"));
 const remove=el("button","secondary","ลบวาระ");remove.type="button";remove.onclick=()=>wrapper.remove();top.append(remove);wrapper.append(top);
 const topic=el("input");topic.placeholder="เช่น อัปเดตสถานการณ์ PRRS ในพื้นที่";topic.maxLength=250;topic.value=data.topic||"";topic.className="agenda-topic";wrapper.append(label("หัวข้อประชุม",topic));
 const row=el("div","row"),day=select(selectedDates()),category=select(cats),minutes=el("input");
 day.className="agenda-day";category.className="agenda-category";if(data.date&&selectedDates().includes(data.date))day.value=data.date;if(data.category&&cats.includes(data.category))category.value=data.category;minutes.type="number";minutes.min=1;minutes.max=240;minutes.value=data.minutes||15;minutes.className="agenda-minutes";
 row.append(label("วันที่นำเสนอ",day),label("หมวดหมู่วาระ",category),label("ระยะเวลา (นาที)",minutes));wrapper.append(row);
 $("agendaItems").append(wrapper);
}
function updateAttendance(){const flag=attending();$("participantFields").classList.toggle("hidden",!flag);$("dateBlock").classList.toggle("hidden",!flag)}
function setup(data){
 conf=data;
 $("employee").replaceChildren(...data.employees.map(v=>{const o=el("option","",v);o.value=v;return o}));
 $("dates").replaceChildren(...data.dates.map(day=>{const l=el("label","date-choice"),i=el("input");i.type="checkbox";i.value=day;i.onchange=refreshDays;l.append(i,document.createTextNode(day));return l}));
 $("userForm").classList.remove("hidden");$("loadStatus").classList.add("hidden");updateAttendance();
}
async function init(){try{const data=await call("config",{});setup(data)}catch(e){const notice=$("loadStatus");notice.textContent="โหลดแบบฟอร์มไม่สำเร็จ: "+e.message;notice.className="notice error"}}
init();
document.querySelectorAll('input[name="attendance"]').forEach(x=>x.onchange=updateAttendance);
$("addAgenda").onclick=()=>{if(!selectedDates().length){status("submitStatus","กรุณาเลือกวันที่เข้าร่วมก่อนเพิ่มวาระ",true);return}agendaItem()};

function restoreForm(saved){
 const name=$("employee");name.value=saved.name;
 document.querySelectorAll('input[name="attendance"]').forEach(el=>el.checked=el.value===saved.attendance);
 updateAttendance();
 $("dates").querySelectorAll('input[type="checkbox"]').forEach(el=>el.checked=saved.dates.includes(el.value));
 refreshDays();
 for(const panel of $("menuDays").children){
  const date=panel.dataset.day,c=saved.choices[date]||{};
  panel.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(el=>el.checked=el.type==="checkbox"?(c.food||[]).includes(el.value):el.value===c.drink);
  for(const field of ["temperature","roast","sweetness","sport"]){
   const control=panel.querySelector('[data-field="'+field+'"]');
   if(control&&[...control.options].some(o=>o.value===c[field]))control.value=c[field];
  }
 }
 $("agendaItems").replaceChildren();
 for(const agenda of saved.agenda)agendaItem(agenda);
}
$("restoreRegistration").onclick=async()=>{
 const name=$("employee").value,receipt=$("editReceipt").value.trim(),btn=$("restoreRegistration");
 if(!/^[a-f0-9]{48}$/.test(receipt)){status("editStatus","กรุณากรอกรหัสแก้ไขส่วนตัวให้ครบ",true);return}
 btn.disabled=true;
 try{
  const result=await call("restore",{name,receipt});
  editingReceipt=receipt;editingRevision=result.revision;submitted=false;requestId=crypto.randomUUID();
  restoreForm(result.registration);
  $("submit").disabled=false;$("submit").textContent="บันทึกการแก้ไข";
  $("receiptResult").classList.add("hidden");
  status("editStatus","✅ โหลดข้อมูลเดิมแล้ว แก้ไขรายการได้และกดบันทึก");
 }catch(e){status("editStatus",e.message,true)}
 finally{btn.disabled=false}
};
$("newRegistration").onclick=()=>{
 editingReceipt="";editingRevision="";submitted=false;requestId=crypto.randomUUID();
 $("editReceipt").value="";$("receiptResult").classList.add("hidden");
 $("submit").disabled=false;$("submit").textContent="ยืนยันการลงทะเบียน";
 $("agendaItems").replaceChildren();
 $("dates").querySelectorAll("input").forEach(input=>input.checked=false);
 $("menuDays").replaceChildren();
 document.querySelectorAll('input[name="attendance"]').forEach(el=>el.checked=el.value==="เข้าร่วม");
 updateAttendance();
 status("editStatus","เริ่มกรอกข้อมูลใหม่ได้แล้ว");
};
$("copyReceipt").onclick=async()=>{
 const receipt=$("receiptOutput").value;
 try{await navigator.clipboard.writeText(receipt);status("submitStatus","✅ คัดลอกรหัสแก้ไขแล้ว โปรดเก็บไว้เป็นส่วนตัว")}
 catch{const node=$("receiptOutput");node.focus();node.select();status("submitStatus","เลือกข้อความรหัสแล้ว กรุณาคัดลอกด้วย Ctrl+C")}
};
$("submit").onclick=async()=>{
 if(submitted)return;
 const name=$("employee").value,attendance=attending()?"เข้าร่วม":"ไม่เข้าร่วม",dates=attending()?selectedDates():[];
 if(attending()&&!dates.length){status("submitStatus","กรุณาเลือกวันที่เข้าร่วมอย่างน้อย 1 วัน",true);return}
 const choices={};
 for(const panel of $("menuDays").children){
  const day=panel.dataset.day;choices[day]={
   food:[...panel.querySelectorAll('input[name="food-'+CSS.escape(day)+'"]:checked')].map(x=>x.value),
   drink:panel.querySelector('input[name="drink-'+CSS.escape(day)+'"]:checked')?.value||"",
   temperature:panel.querySelector('[data-field="temperature"]').value,
   roast:panel.querySelector('[data-field="roast"]').value,
   sweetness:panel.querySelector('[data-field="sweetness"]').value,
   sport:panel.querySelector('[data-field="sport"]').value
  };
 }
 const agenda=[...$("agendaItems").children].map(item=>({
  topic:item.querySelector(".agenda-topic").value.trim(),
  date:item.querySelector(".agenda-day").value,
  category:item.querySelector(".agenda-category").value,
  minutes:Number(item.querySelector(".agenda-minutes").value)
 })).filter(a=>a.topic);
 $("submit").disabled=true;status("submitStatus","กำลังบันทึกข้อมูล...");
 try{const res=await call("submit",{name,attendance,dates,choices,agenda,receipt:editingReceipt,revision:editingRevision,requestId});submitted=true;editingReceipt=res.receipt||editingReceipt;editingRevision=res.revision||editingRevision;status("submitStatus",res.updated?"✅ บันทึกการแก้ไขสำเร็จแล้ว":"✅ ลงทะเบียนสำเร็จ "+res.rows+" แถว · กรุณาเก็บรหัสแก้ไขด้านล่างไว้");$("submit").textContent="บันทึกแล้ว";if(res.receipt){$("receiptOutput").value=res.receipt;$("editReceipt").value=res.receipt;$("receiptResult").classList.remove("hidden")}}catch(e){status("submitStatus",e.message,true);$("submit").disabled=false}
};
})();