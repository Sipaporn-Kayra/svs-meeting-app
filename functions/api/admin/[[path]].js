// Cloudflare Pages Functions: same-origin protected admin API.
// Required encrypted environment secrets: ADMIN_PASSWORD, SESSION_SECRET,
// GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID.
// Recommended: Cloudflare WAF rate limiting on /api/admin/login.
const encoder = new TextEncoder();
const secureHeaders = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{...secureHeaders,"Content-Type":"application/json; charset=utf-8",...headers}});
}
function b64url(bytes) {
  let s="";for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function fromB64url(s) {
  const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function digest(text) {return new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(text)))}
function constantEqual(a,b){if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a[i]^b[i];return v===0}
async function sign(secret,message){
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(message))));
}
function cookies(request){return Object.fromEntries((request.headers.get("Cookie")||"").split(";").map(x=>x.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x.length===2))}
async function authenticated(request,env){
 const token=cookies(request).svs_admin;
 if(!token||!env.SESSION_SECRET)return false;
 const parts=token.split(".");if(parts.length!==2)return false;
 try {
   const expected=await sign(env.SESSION_SECRET,parts[0]);
   if(!constantEqual(fromB64url(parts[1]),fromB64url(expected)))return false;
   const data=JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
   return data.role==="admin"&&Number.isFinite(data.exp)&&data.exp>Date.now();
 }catch{return false}
}
function cookie(value,maxAge){return "svs_admin="+value+"; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge}
async function googleToken(env,write=false){
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"{}");
 if(!sa.private_key||!sa.client_email)throw new Error("Google service account is not configured");
 const now=Math.floor(Date.now()/1000);
 const head=b64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=b64url(encoder.encode(JSON.stringify({iss:sa.client_email,scope:write?"https://www.googleapis.com/auth/spreadsheets":"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3300})));
 const pk=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(pk),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const assertion=head+"."+body+"."+b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(head+"."+body))));
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
 if(!response.ok)throw new Error("Google OAuth token request failed");
 const result=await response.json();if(!result.access_token)throw new Error("Google OAuth token missing");return result.access_token;
}
async function readSheets(env){
 if(!env.GOOGLE_SHEET_ID)throw new Error("Sheet id not configured");
 const token=await googleToken(env);
 const ranges=["A:O","'Settings'!A:B"];
 // A:J reads the first worksheet, matching Streamlit db.sheet1 without assuming its title.
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.GOOGLE_SHEET_ID)+"/values:batchGet?"+ranges.map(r=>"ranges="+encodeURIComponent(r)).join("&");
 const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});
 if(!response.ok){
   console.error("SVS Google Sheets API HTTP status:",response.status);
   throw new Error("Google Sheets read failed (HTTP "+response.status+")");
 }
 const payload=await response.json();
 return payload.valueRanges||[];
}
function records(values){
 const [headers=[],...rows]=values||[];
 return rows.filter(r=>r.some(v=>String(v||"").trim())).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])));
}
function stableKey(s){
 // Stable across refreshes without exposing raw row content in keys.
 return s;
}
function parseData(data,date){
 const users=records(data[0]?.values||[]);
 const settings=records(data[1]?.values||[]);
 const globalDates=(settings.find(r=>r.Key==="Global_Dates")?.Value||"").split(",").map(s=>s.trim()).filter(Boolean);
 const historicalDates=users.map(r=>r.Date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
 const allDates=[...new Set([...globalDates,...historicalDates])].sort();
 const filtered=users.filter(r=>r.RecordStatus!=="ARCHIVED"&&r.Attendance==="เข้าร่วม"&&(!date||r.Date===date));
 const agendas=[],people=new Set(),food=new Map(),drinks=new Map();
 const occurrences=new Map();
 for(const r of filtered){
   if(r.Name)people.add(r.Name);
   if(r.Lunch&&r.Lunch!=="-"&&r.Lunch!=="ไม่ได้ระบุ")for(const item of r.Lunch.split(",").map(s=>s.trim()).filter(Boolean))food.set(item,(food.get(item)||0)+1);
   if(r.Drink&&r.Drink!=="-"&&r.Drink!=="ไม่ได้ระบุ")drinks.set(r.Drink,(drinks.get(r.Drink)||0)+1);
   if(r.Topic&&r.Topic.trim()!=="-"&&r.Topic.trim()){
     const identity=[r.Timestamp,r.Name,r.Date,r.Topic,r.Time].join("|");
     const count=(occurrences.get(identity)||0)+1;occurrences.set(identity,count);
     agendas.push({source_id:stableKey(identity+"|"+count),date:r.Date,presenter:r.Name||"",topic:r.Topic,minutes:Math.max(0,Number(r.Time)||0),category:r.Category||"อื่น ๆ"});
   }
 }
 return {dates:allDates,active_dates:globalDates,selected_date:date||null,participants:people.size,agendas,food:[...food].map(([name,count])=>({name,count})),drinks:[...drinks].map(([name,count])=>({name,count})),fetched_at:new Date().toISOString()};
}

const imageKinds=new Set(["food","drink"]);
function validImageUrl(url){
 if(url==="")return true;
 if(typeof url!=="string"||url.length>1800)return false;
 if(/^\/api\/menu-image\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(url))return true;
 try{const u=new URL(url);return u.protocol==="https:"&&!u.username&&!u.password}catch{return false}
}
async function sheetCall(env,token,method,path,payload){
 const target="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.GOOGLE_SHEET_ID)+path;
 const resp=await fetch(target,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:payload===undefined?undefined:JSON.stringify(payload)});
 if(!resp.ok){console.error("SVS menu Sheets HTTP:",resp.status);throw Error("Menu sheet operation failed")}
 return resp.json();
}
async function menuSettings(env,token){
 const data=await sheetCall(env,token,"GET","/values/"+encodeURIComponent("'Settings'!A:B"));
 const raw=data.values||[];
 const byKey=new Map(raw.slice(1).filter(r=>r[0]).map(r=>[r[0],r[1]||""]));
 const split=t=>String(t||"").split(",").map(v=>v.trim()).filter(Boolean);
 const dates=split(byKey.get("Global_Dates")),days={};
 // Keep previous meeting menus visible in Admin even after Global_Dates changes.
 // Never reopen an archived date: only 'dates' is used for active registration.
 const historyDates=[...new Set([...dates,...[...byKey.keys()].map(k=>/^(?:Lunch|Drink|LunchImage|DrinkImage|LunchBanner|DrinkBanner)_(\d{4}-\d{2}-\d{2})$/.exec(k)?.[1]).filter(Boolean)])].sort();
 for(const day of historyDates){
  const getMap=kind=>{try{const o=JSON.parse(byKey.get((kind==="food"?"LunchImage_":"DrinkImage_")+day)||"{}");return o&&typeof o==="object"&&!Array.isArray(o)?o:{}}catch{return {}}};
  days[day]={food:split(byKey.get("Lunch_"+day)),drink:split(byKey.get("Drink_"+day)),foodImages:getMap("food"),drinkImages:getMap("drink"),foodBanner:byKey.get("LunchBanner_"+day)||"",drinkBanner:byKey.get("DrinkBanner_"+day)||""};
 }
 return {raw,dates,historyDates,days};
}
async function saveImageMapping(env,input){
 const date=String(input.date||""),kind=String(input.kind||""),menu=String(input.menu||""),url=String(input.url??"");
 if(!(date==="-"||/^\d{4}-\d{2}-\d{2}$/.test(date))||!imageKinds.has(kind)||menu.length>160||!validImageUrl(url))return {status:400,error:"วันที่/เมนู/URL รูปภาพไม่ถูกต้อง"};
 const token=await googleToken(env,true),settings=await menuSettings(env,token);
 if(!settings.days[date]?.[kind]?.includes(menu))return {status:400,error:"ไม่พบชื่อเมนูสำหรับวันที่เลือก"};
 const key=(kind==="food"?"LunchImage_":"DrinkImage_")+date;
 const index=settings.raw.findIndex((r,i)=>i>0&&r[0]===key);
 let images={};
 if(index>=0){try{images=JSON.parse(settings.raw[index][1]||"{}")}catch{}}
 if(!images||typeof images!=="object"||Array.isArray(images))images={};
 if(url)images[menu]=url;else delete images[menu];
 const serial=JSON.stringify(images);
 if(index>=0){
  const range="'Settings'!B"+(index+1);
  await sheetCall(env,token,"PUT","/values/"+encodeURIComponent(range)+"?valueInputOption=RAW",{range,majorDimension:"ROWS",values:[[serial]]});
 }else{
  await sheetCall(env,token,"POST","/values/"+encodeURIComponent("'Settings'!A:B")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{majorDimension:"ROWS",values:[[key,serial]]});
 }
 return {ok:true,date,kind,menu,url};
}

async function writeSettings(env,token,current,updates){
 const records=current.raw||[],entries=Object.entries(updates),changes=[],newRows=[];
 for(const [key,value] of entries){
  const index=records.findIndex((row,i)=>i>0&&row[0]===key);
  if(index>=0)changes.push({range:"'Settings'!B"+(index+1),majorDimension:"ROWS",values:[[value]]});
  else newRows.push([key,value]);
 }
 if(changes.length)await sheetCall(env,token,"POST","/values:batchUpdate",{valueInputOption:"RAW",data:changes});
 if(newRows.length)await sheetCall(env,token,"POST","/values/"+encodeURIComponent("'Settings'!A:B")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{majorDimension:"ROWS",values:newRows});
}
function validDate(s){
 return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"))&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
}
function validMenus(v){
 return Array.isArray(v)&&v.length<=40&&v.every(x=>typeof x==="string"&&x.trim().length>0&&x.trim().length<=120&&!x.includes(",")&&!x.includes("\n"))&&new Set(v.map(x=>x.trim())).size===v.length;
}
async function saveMeetingRound(env,input){
 const date=String(input.date||""),mode=String(input.mode||""),food=input.food,drink=input.drink;
 if(!validDate(date)||!["replace","add"].includes(mode)||!validMenus(food)||!validMenus(drink)||!food.length||!drink.length)return {status:400,error:"กรุณากรอกวันที่และรายการอาหาร/เครื่องดื่มให้ถูกต้อง (ห้ามมีเครื่องหมายจุลภาคในชื่อเมนู)"};
 const token=await googleToken(env,true),current=await menuSettings(env,token);
 const dates=mode==="replace"?[date]:[...new Set([...current.dates,date])].sort();
 if(dates.length>10)return {status:400,error:"เปิดลงทะเบียนได้สูงสุด 10 วันต่อครั้ง"};
 // Preserve per-day image maps and all historical registration rows. Only update active dates and menus.
 const updates={Global_Dates:dates.join(","),["Lunch_"+date]:food.map(x=>x.trim()).join(","),["Drink_"+date]:drink.map(x=>x.trim()).join(",")};
 await writeSettings(env,token,current,updates);
 return {ok:true,date,dates};
}
async function saveBanner(env,input){
 const date=String(input.date||""),kind=String(input.kind||""),url=String(input.url??"");
 if(!validDate(date)||!imageKinds.has(kind)||!validImageUrl(url))return {status:400,error:"วันที่หรือ URL รูปรวมไม่ถูกต้อง"};
 const token=await googleToken(env,true),current=await menuSettings(env,token);
 if(!current.dates.includes(date))return {status:400,error:"กรุณาเลือกวันที่เปิดลงทะเบียนอยู่"};
 const key=(kind==="food"?"LunchBanner_":"DrinkBanner_")+date;
 await writeSettings(env,token,current,{[key]:url});
 return {ok:true,date,kind,url};
}
async function uploadMenuImage(request,env){
 if(!env.MENU_IMAGES||typeof env.MENU_IMAGES.put!=="function")return {status:503,error:"ยังไม่ได้เชื่อม R2 Bucket ที่ชื่อ MENU_IMAGES"};
 const length=Number(request.headers.get("content-length")||0);
 if(length>2.15*1024*1024)return {status:413,error:"ไฟล์ใหญ่เกิน 2 MB"};
 const body=await request.formData(),file=body.get("file");
 if(!file||typeof file.arrayBuffer!=="function"||file.size<10||file.size>2*1024*1024)return {status:400,error:"กรุณาเลือกภาพที่มีขนาดไม่เกิน 2 MB"};
 const format={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
 if(!format)return {status:400,error:"รองรับเฉพาะ JPG, PNG, WEBP"};
 const bytes=new Uint8Array(await file.arrayBuffer());
 const match=format==="jpg"&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255 ||
  format==="png"&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b) ||
  format==="webp"&&new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
 if(!match)return {status:400,error:"ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง"};
 const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("")+"."+format;
 await env.MENU_IMAGES.put(id,bytes,{httpMetadata:{contentType:file.type,cacheControl:"public,max-age=31536000,immutable"}});
 return {ok:true,url:"/api/menu-image/"+id};
}

const archiveFlag=row=>String(row[14]||"").trim()==="ARCHIVED";
function recordGroupKey(row){
 return row[11]?"id:"+row[11]+"|"+row[3]:"legacy:"+JSON.stringify([row[0],row[1],row[3],row[2]]);
}
function registrationGroups(values){
 const groups=new Map();
 for(const [i,row] of (values||[]).slice(1).entries()){
  if(!row[1])continue;
  const key=recordGroupKey(row);
  let g=groups.get(key);
  if(!g){g={id:key,name:row[1],date:row[3],attendance:row[2],timestamp:row[0],rows:[],statuses:new Set(),topics:[],food:"",drink:""};groups.set(key,g)}
  g.rows.push(i+2);g.statuses.add(archiveFlag(row)?"ARCHIVED":"ACTIVE");
  if(row[4]&&row[4]!=="-")g.food=row[4];
  if(row[5]&&row[5]!=="-")g.drink=row[5];
  if(row[7]&&row[7]!=="-")g.topics.push(row[7]);
 }
 const all=[...groups.values()].map(g=>({id:g.id,name:g.name,date:g.date,attendance:g.attendance,timestamp:g.timestamp,food:g.food,drink:g.drink,topics:g.topics,rowCount:g.rows.length,status:g.statuses.size>1?"MIXED":[...g.statuses][0],duplicate:false}));
 const active=new Map();
 for(const g of all.filter(g=>g.status==="ACTIVE")){
  const key=JSON.stringify([g.name.trim(),g.date]);
  active.set(key,(active.get(key)||0)+1);
 }
 for(const g of all)g.duplicate=g.status==="ACTIVE"&&(active.get(JSON.stringify([g.name.trim(),g.date]))||0)>1;
 return all.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
}
async function registrationSheet(env,token){
 const result=await sheetCall(env,token,"GET","/values/A1%3AO");
 const values=result.values||[],header=values[0]||[];
 if(header[14]&&header[14]!=="RecordStatus")throw Error("Column O already in use");
 return {values,header};
}
async function changeRegistrationStatus(env,body){
 const id=typeof body.id==="string"?body.id:"",date=String(body.date||"");
 const target=body.action==="archive"?"ARCHIVED":body.action==="restore"?"ACTIVE":"";
 if(!id||id.length>500||!target||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {http:400,error:"Invalid registration selection"};
 const token=await googleToken(env,true),sheet=await registrationSheet(env,token);
 const match=[];
 for(const [i,row] of sheet.values.slice(1).entries()){
  if(recordGroupKey(row)===id&&row[3]===date)match.push({row,rowNumber:i+2});
 }
 if(!match.length)return {http:409,error:"ไม่พบรายการนี้ กรุณา Refresh"};
 const statuses=new Set(match.map(r=>archiveFlag(r.row)?"ARCHIVED":"ACTIVE"));
 if(statuses.size!==1)return {http:409,error:"รายการมีสถานะไม่สอดคล้อง กรุณาติดต่อ Admin"};
 if([...statuses][0]===target)return {http:409,error:"รายการถูกเปลี่ยนสถานะแล้ว กรุณา Refresh"};
 if(target==="ACTIVE"){
  // Never restore a duplicate into the live summaries: require archiving
  // the other group first, or manual reconciliation by Admin.
  const peers=registrationGroups(sheet.values).filter(g=>g.status==="ACTIVE"&&g.id!==id&&g.date===date&&g.name===match[0].row[1]);
  if(peers.length)return {http:409,error:"ชื่อและวันนี้มีรายการที่ใช้งานอยู่แล้ว กรุณาจัดการรายการซ้ำก่อนกู้คืน"};
 }
 if(!sheet.header[14])await sheetCall(env,token,"PUT","/values/O1?valueInputOption=RAW",{range:"O1",majorDimension:"ROWS",values:[["RecordStatus"]]});
 const updates=match.map(r=>({range:"O"+r.rowNumber,majorDimension:"ROWS",values:[[target==="ARCHIVED"?"ARCHIVED":""]]}));
 await sheetCall(env,token,"POST","/values:batchUpdate",{valueInputOption:"RAW",data:updates});
 return {ok:true,status:target,rows:match.length};
}

const lineCats=["สถานการณ์โรคระบาด/Case study","งานทดลองเวชภัณฑ์/คัดเลือกเวชภัณฑ์","Project","อื่นๆ"];
function makeLineSummary(date,agendas){
 const topics=agendas.filter(a=>a.date===date);
 const groups=lineCats.map((name,i)=>({name,count:topics.filter(a=>(lineCats.includes(a.category)?a.category:lineCats[3])===name).length}));
 const totalMinutes=topics.reduce((n,a)=>n+Math.max(0,Number(a.minutes)||0),0);
 const lines=["📋 SVS Meeting | อัปเดตวาระที่เสนอ","วันประชุม: "+date.split("-").reverse().join("/"),"จำนวนวาระ: "+topics.length+" หัวข้อ","เวลานำเสนอรวม: "+totalMinutes+" นาที","","แยกตามประเภท:",...groups.map(g=>"• "+g.name+": "+g.count+" หัวข้อ"),"","หมายเหตุ: เป็นวาระที่เสนอ ยังไม่ใช่ตารางที่ Admin อนุมัติแล้ว","สมาชิกสามารถเพิ่มหรือแก้ไขวาระผ่าน SVS Meeting Portal"];
 return {text:lines.join("\n"),topicCount:topics.length,totalMinutes,categories:groups};
}
async function lineSettings(env){
 const token=await googleToken(env);
 const settings=await menuSettings(env,token);
 const values=Object.fromEntries(settings.raw.slice(1).filter(r=>r[0]).map(r=>[r[0],r[1]||""]));
 return {groupId:values.LINE_GroupId||"",candidate:values.LINE_CandidateGroupId||"",settings};
}
function maskGroup(value){return value?value.slice(0,4)+"••••"+value.slice(-5):""}
async function linePreview(env,date){
 if(!validDate(date))return {http:400,error:"กรุณาเลือกวันที่ประชุม"};
 const result=parseData(await readSheets(env),date);
 if(!result.active_dates.includes(date))return {http:409,error:"สามารถแจ้ง LINE ได้เฉพาะรอบประชุมที่เปิดลงทะเบียนอยู่"};
 const summary=makeLineSummary(date,result.agendas);
 const linked=await lineSettings(env);
 return {ok:true,date,...summary,configured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),connected:/^C[0-9a-f]{32}$/i.test(linked.groupId),group:maskGroup(linked.groupId)};
}
async function lineApproveCandidate(env,body){
 const current=await lineSettings(env);
 if(!/^C[0-9a-f]{32}$/i.test(current.candidate))return {http:409,error:"ยังไม่พบคำขอเชื่อม LINE กลุ่ม"};
 if(body.confirmCandidate!==maskGroup(current.candidate))return {http:409,error:"กลุ่ม LINE เปลี่ยนแล้ว กรุณาโหลดอีกครั้ง"};
 const token=await googleToken(env,true);
 await writeSettings(env,token,current.settings,{LINE_GroupId:current.candidate});
 return {ok:true,connected:true,group:maskGroup(current.candidate)};
}
async function lineSaveGroup(env,body){
 const groupId=String(body.groupId||"").trim();
 if(!/^C[0-9a-f]{32}$/i.test(groupId))return {http:400,error:"Group ID ต้องขึ้นต้นด้วย C และตามด้วยอักษรฐานสิบหก 32 ตัว"};
 const token=await googleToken(env,true);
 const current=await menuSettings(env,token);
 await writeSettings(env,token,current,{LINE_GroupId:groupId});
 return {ok:true,connected:true,group:maskGroup(groupId)};
}
async function sendLineSummary(env,body){
 const date=String(body.date||""),text=String(body.expectedText||""),requestId=String(body.requestId||"");
 if(!/^[0-9a-f-]{36}$/i.test(requestId)||!text||text.length>4000)return {http:400,error:"กรุณาดูตัวอย่างก่อนกดส่ง"};
 if(!env.LINE_CHANNEL_ACCESS_TOKEN)return {http:503,error:"ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Cloudflare Secrets"};
 const group=(await lineSettings(env)).groupId;
 if(!/^C[0-9a-f]{32}$/i.test(group))return {http:503,error:"ยังไม่ได้เชื่อม Group ID"};
 const summary=await linePreview(env,date);
 if(!summary.ok)return summary;
 if(text!==summary.text)return {http:409,error:"วาระมีการเปลี่ยนแปลง กรุณาโหลดตัวอย่างใหม่"};
 const response=await fetch("https://api.line.me/v2/bot/message/push",{
  method:"POST",
  headers:{"Authorization":"Bearer "+env.LINE_CHANNEL_ACCESS_TOKEN,"Content-Type":"application/json","X-Line-Retry-Key":requestId},
  body:JSON.stringify({to:group,messages:[{type:"text",text:summary.text}]})
 });
 if(!response.ok){console.error("LINE push HTTP",response.status);return {http:response.status===429?429:502,error:"LINE ส่งข้อความไม่สำเร็จ (HTTP "+response.status+")"}}
 return {ok:true,sent:true,date,topicCount:summary.topicCount,totalMinutes:summary.totalMinutes};
}
export async function onRequest({request,env,params}){
 const route=(params.path||[]).join("/");
 if(request.method==="POST"&&request.headers.get("Origin")!==new URL(request.url).origin)return json({error:"Invalid request origin"},403);
 try {
   if(route==="login"&&request.method==="POST"){
     if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return json({error:"Admin authentication is not configured"},503);
     const body=await request.json().catch(()=>({}));
     const submitted=typeof body.password==="string"?body.password:"";
     if(!submitted||submitted.length>256)return json({error:"Invalid credentials"},401);
     const a=await digest(submitted),b=await digest(env.ADMIN_PASSWORD);
     if(!constantEqual(a,b))return json({error:"Invalid credentials"},401);
     const payload=b64url(encoder.encode(JSON.stringify({role:"admin",exp:Date.now()+8*60*60*1000})));
     const token=payload+"."+await sign(env.SESSION_SECRET,payload);
     return json({ok:true},200,{"Set-Cookie":cookie(token,8*60*60)});
   }
   if(route==="logout"&&request.method==="POST")return json({ok:true},200,{"Set-Cookie":cookie("",0)});
   if(!await authenticated(request,env))return json({error:"Unauthorized"},401);
   if(route==="session"&&request.method==="GET")return json({authenticated:true});
   if(route==="round-save"&&request.method==="POST"){
     const data=await request.json().catch(()=>({}));
     const result=await saveMeetingRound(env,data);
     return json(result,result.status||200);
   }
   if(route==="banner-save"&&request.method==="POST"){
     const data=await request.json().catch(()=>({}));
     const result=await saveBanner(env,data);
     return json(result,result.status||200);
   }
   if(route==="menu-config"&&request.method==="GET"){
     const token=await googleToken(env);
     const data=await menuSettings(env,token);
     return json({dates:data.dates,historyDates:data.historyDates,days:data.days});
   }
   if(route==="menu-save"&&request.method==="POST"){
     const body=await request.json().catch(()=>({}));
     const result=await saveImageMapping(env,body);
     return json(result,result.status||200);
   }
   if(route==="menu-upload"&&request.method==="POST"){
     const result=await uploadMenuImage(request,env);
     return json(result,result.status||200);
   }
   if(route==="registration-groups"&&request.method==="GET"){
     const token=await googleToken(env);
     const data=await registrationSheet(env,token);
     const groups=registrationGroups(data.values);
     const date=new URL(request.url).searchParams.get("date")||"";
     if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Invalid date"},400);
     return json({groups:date?groups.filter(g=>g.date===date):groups,duplicateGroups:groups.filter(g=>g.duplicate).length});
   }
   if(route==="registration-status"&&request.method==="POST"){
     const body=await request.json().catch(()=>({}));
     const result=await changeRegistrationStatus(env,body);
     return json(result,result.http||200);
   }
   if(route==="line-preview"&&request.method==="GET"){
     const result=await linePreview(env,new URL(request.url).searchParams.get("date")||"");
     return json(result,result.http||200);
   }
   if(route==="line-status"&&request.method==="GET"){
     const group=await lineSettings(env);
     return json({configured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),connected:Boolean(group.groupId),group:maskGroup(group.groupId),candidate:maskGroup(group.candidate)});
   }
   if(route==="line-group-approve"&&request.method==="POST"){
     const result=await lineApproveCandidate(env,await request.json().catch(()=>({})));
     return json(result,result.http||200);
   }
   if(route==="line-group-save"&&request.method==="POST"){
     const result=await lineSaveGroup(env,await request.json().catch(()=>({})));
     return json(result,result.http||200);
   }
   if(route==="line-send"&&request.method==="POST"){
     const result=await sendLineSummary(env,await request.json().catch(()=>({})));
     return json(result,result.http||200);
   }
   if(route==="registrations"&&request.method==="GET"){
     const date=new URL(request.url).searchParams.get("date")||"";
     if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Invalid date"},400);
     const data=await readSheets(env);
     return json(parseData(data,date));
   }
   return json({error:"Not found"},404);
 } catch(err){
   console.error("SVS admin API error:",err.message);
   return json({error:"Unable to complete request. Check backend configuration and logs."},503);
 }
}
