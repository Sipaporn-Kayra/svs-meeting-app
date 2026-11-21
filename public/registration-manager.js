(()=>{
const $=id=>document.getElementById(id);
let groups=[],busy=false,loaded=false;
const notice=(message,error=false)=>{const n=$("registrationNotice");n.textContent=message;n.style.color=error?"#b42318":"#46627f"};
async function api(route,init={}){
 const res=await fetch("/api/admin/"+route,{credentials:"same-origin",cache:"no-store",...init});
 const obj=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(obj.error||("HTTP "+res.status));
 return obj;
}
function button(label,handler){
 const b=document.createElement("button");b.type="button";b.className="secondary";b.textContent=label;
 b.addEventListener("click",handler);return b;
}
function cell(row,text){
 const td=document.createElement("td");td.textContent=text??"";row.append(td);return td;
}
function filter(){
 const q=$("registrationSearch").value.trim().toLocaleLowerCase("th-TH");
 const date=$("registrationDate").value,status=$("registrationFilter").value;
 return groups.filter(g=>(!q||g.name.toLocaleLowerCase("th-TH").includes(q))&&(!date||g.date===date)&&
 (status==="all"||status==="duplicate"&&g.duplicate||status==="active"&&g.status==="ACTIVE"||status==="archived"&&g.status==="ARCHIVED"));
}
function render(){
 const rows=$("registrationRows");rows.replaceChildren();
 const visible=filter();
 const duplicates=groups.filter(g=>g.duplicate).length;
 $("registrationCount").textContent="แสดง "+visible.length+" / "+groups.length+" ชุด · พบรายการอาจซ้ำ "+duplicates+" ชุด";
 if(!visible.length){const tr=document.createElement("tr");cell(tr,"ไม่พบรายการตามเงื่อนไข").colSpan=7;rows.append(tr);return}
 for(const g of visible){
  const tr=document.createElement("tr");
  cell(tr,g.date);cell(tr,g.name);cell(tr,g.timestamp);
  cell(tr,g.status==="MIXED"?"ข้อมูลสถานะไม่ตรงกัน":g.status==="ARCHIVED"?"ยกเลิกแล้ว":g.duplicate?"⚠️ อาจซ้ำ":"ใช้งานอยู่");
  cell(tr,[g.food||"-",g.drink||"-"].join(" / "));
  cell(tr,(g.topics||[]).length?(g.topics||[]).slice(0,2).join(" · ")+(g.topics.length>2?" และอีก "+(g.topics.length-2)+" หัวข้อ":""):"-");
  const action=cell(tr,"");
  if(g.status==="ACTIVE")action.append(button("ยกเลิกชุดนี้",()=>change(g,"archive")));
  if(g.status==="ARCHIVED")action.append(button("กู้คืนชุดนี้",()=>change(g,"restore")));
  if(g.status==="MIXED")action.textContent="ต้องตรวจใน Google Sheets";
  rows.append(tr);
 }
}
async function change(group,action){
 if(busy)return;
 const isArchive=action==="archive";
 const description=(isArchive?"ยกเลิก":"กู้คืน")+"ชุดลงทะเบียนของ "+group.name+" วันที่ "+group.date+" ("+group.rowCount+" แถว)";
 const confirmed=window.confirm(description+"?\n\n"+(isArchive?"รายการจะไม่ถูกนับในยอดสรุป แต่ไม่ถูกลบถาวร":"รายการจะกลับมานับในยอดสรุป"));
 if(!confirmed)return;
 busy=true;
 notice("กำลังปรับสถานะชุดลงทะเบียน...");
 try{
  const result=await api("registration-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:group.id,date:group.date,action})});
  notice("✅ "+(isArchive?"ยกเลิก":"กู้คืน")+"สำเร็จ "+result.rows+" แถว");
  await load(true);
  if(typeof window.svsReloadAdmin==="function")await window.svsReloadAdmin();
 }catch(e){notice("ดำเนินการไม่สำเร็จ: "+e.message,true)}
 finally{busy=false}
}
async function load(keepNotice=false){
 if(!keepNotice)notice("กำลังโหลดชุดลงทะเบียน...");
 try{
  const response=await api("registration-groups");
  groups=response.groups||[];
  const select=$("registrationDate"),old=select.value;
  const dates=[...new Set(groups.map(g=>g.date))].sort();
  select.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent="ทุกวันที่";select.append(blank);
  for(const date of dates){const option=document.createElement("option");option.value=date;option.textContent=date;select.append(option)}
  select.value=dates.includes(old)?old:"";
  loaded=true;render();
  if(!keepNotice)notice("โหลดรายการล่าสุดแล้ว");
 }catch(e){notice("โหลดรายการไม่ได้: "+e.message,true)}
}
for(const id of ["registrationSearch","registrationDate","registrationFilter"]){$(id).addEventListener(id==="registrationSearch"?"input":"change",render)}
$("registrationReload").addEventListener("click",()=>load());
const pane=$("registrationManagement");
pane.addEventListener("toggle",()=>{if(pane.open&&!loaded)load()});
window.svsRegistrationManagementReload=()=>{if(pane.open)load(true);else loaded=false};
})();